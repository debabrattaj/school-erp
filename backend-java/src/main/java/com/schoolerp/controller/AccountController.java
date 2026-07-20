package com.schoolerp.controller;

import com.schoolerp.central.entity.SchoolAccount;
import com.schoolerp.central.entity.SchoolFeature;
import com.schoolerp.central.repository.SchoolAccountRepository;
import com.schoolerp.central.repository.SchoolFeatureRepository;
import com.schoolerp.config.SchoolErpProperties;
import com.schoolerp.dto.accounts.SchoolAccountCreate;
import com.schoolerp.dto.accounts.SchoolFeatureUpdate;
import com.schoolerp.entity.User;
import com.schoolerp.exception.ApiException;
import com.schoolerp.repository.UserRepository;
import com.schoolerp.security.PasswordService;
import com.schoolerp.security.PermissionService;
import com.schoolerp.service.PlatformAuthService;
import com.schoolerp.tenant.DatabaseUrls;
import com.schoolerp.tenant.TenantAccountService;
import com.schoolerp.tenant.TenantContext;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Direct port of backend/app/routes/accounts.py: the tenant-facing companion
 * to PlatformController (backend/app/routes/platform.py). GET /accounts/me
 * uses the regular tenant JWT (PermissionService.getCurrentUser); every
 * other endpoint here is gated by the platform-owner token, matching
 * Python's require_platform_owner dependency.
 */
@RestController
@RequestMapping("/accounts")
public class AccountController {

    private final SchoolAccountRepository schoolAccountRepository;
    private final SchoolFeatureRepository schoolFeatureRepository;
    private final UserRepository userRepository;
    private final SchoolErpProperties properties;
    private final PasswordService passwordService;
    private final PermissionService permissionService;
    private final PlatformAuthService platformAuthService;
    private final TenantAccountService tenantAccountService;

    public AccountController(
            SchoolAccountRepository schoolAccountRepository,
            SchoolFeatureRepository schoolFeatureRepository,
            UserRepository userRepository,
            SchoolErpProperties properties,
            PasswordService passwordService,
            PermissionService permissionService,
            PlatformAuthService platformAuthService,
            TenantAccountService tenantAccountService
    ) {
        this.schoolAccountRepository = schoolAccountRepository;
        this.schoolFeatureRepository = schoolFeatureRepository;
        this.userRepository = userRepository;
        this.properties = properties;
        this.passwordService = passwordService;
        this.permissionService = permissionService;
        this.platformAuthService = platformAuthService;
        this.tenantAccountService = tenantAccountService;
    }

    private Map<String, Object> accountToResponse(SchoolAccount account) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", account.getId());
        body.put("school_name", account.getSchoolName());
        body.put("account_code", account.getAccountCode());
        body.put("domain", account.getDomain());
        body.put("school_type", account.getSchoolType());
        body.put("curriculum", account.getCurriculum());
        body.put("country", account.getCountry());
        body.put("timezone", account.getTimezone());
        body.put("database_url", account.getDatabaseUrl());
        body.put("status", account.getStatus());
        body.put("features", tenantAccountService.getFeatureMap(account.getId()));
        return body;
    }

    @GetMapping("/me")
    public Map<String, Object> getCurrentAccount(HttpServletRequest request) {
        User currentUser = permissionService.getCurrentUser();
        SchoolAccount account = tenantAccountService.getAccount(TenantContext.getTenant());

        Map<String, Object> accountBody = new LinkedHashMap<>();
        accountBody.put("id", account.getId());
        accountBody.put("school_name", account.getSchoolName());
        accountBody.put("account_code", account.getAccountCode());
        accountBody.put("domain", account.getDomain());
        accountBody.put("school_type", account.getSchoolType());
        accountBody.put("curriculum", account.getCurriculum());
        accountBody.put("country", account.getCountry());
        accountBody.put("timezone", account.getTimezone());
        accountBody.put("status", account.getStatus());

        Map<String, Object> userBody = new LinkedHashMap<>();
        userBody.put("id", currentUser.getId());
        userBody.put("name", currentUser.getName());
        userBody.put("email", currentUser.getEmail());
        userBody.put("role", currentUser.getRole());

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("account", accountBody);
        body.put("features", tenantAccountService.getFeatureMap(account.getId()));
        body.put("user", userBody);
        return body;
    }

    @GetMapping("")
    public List<Map<String, Object>> listAccounts(HttpServletRequest request) {
        platformAuthService.requirePlatformOwner(request);
        return schoolAccountRepository.findAll(org.springframework.data.domain.Sort.by(
                        org.springframework.data.domain.Sort.Direction.DESC, "id"))
                .stream().map(this::accountToResponse).toList();
    }

    @PostMapping("")
    public Map<String, Object> createAccount(@Valid @RequestBody SchoolAccountCreate payload, HttpServletRequest request) {
        platformAuthService.requirePlatformOwner(request);
        passwordService.validate(payload.getAdminPassword());

        String databaseUrl = payload.getDatabaseUrl();
        if (databaseUrl == null || databaseUrl.isBlank()) {
            StringBuilder safeCode = new StringBuilder();
            for (char c : payload.getAccountCode().toCharArray()) {
                safeCode.append(Character.isLetterOrDigit(c) ? Character.toLowerCase(c) : '_');
            }
            String safeCodeTrimmed = safeCode.toString().replaceAll("^_+|_+$", "");
            databaseUrl = DatabaseUrls.buildTenantDatabaseUrl(properties.getTenant().getDefaultSchoolDatabaseUrl(), safeCodeTrimmed);
        }

        SchoolAccount account = new SchoolAccount();
        account.setSchoolName(payload.getSchoolName());
        account.setAccountCode(payload.getAccountCode());
        account.setDomain(payload.getDomain());
        account.setSchoolType(payload.getSchoolType());
        account.setCurriculum(payload.getCurriculum());
        account.setCountry(payload.getCountry());
        account.setTimezone(payload.getTimezone());
        account.setDatabaseUrl(databaseUrl);
        account.setStatus(payload.getStatus());

        try {
            account = schoolAccountRepository.save(account);
        } catch (DataIntegrityViolationException e) {
            throw ApiException.badRequest("Account code or domain already exists");
        }

        for (Map.Entry<String, Boolean> entry : TenantAccountService.DEFAULT_FEATURES.entrySet()) {
            boolean enabled = payload.getFeatures() != null && payload.getFeatures().containsKey(entry.getKey())
                    ? payload.getFeatures().get(entry.getKey())
                    : entry.getValue();
            SchoolFeature feature = new SchoolFeature();
            feature.setAccountId(account.getId());
            feature.setFeatureKey(entry.getKey());
            feature.setEnabled(enabled);
            schoolFeatureRepository.save(feature);
        }

        // Provision the tenant database (lazily, via TenantContext) and seed its first Admin user.
        String previousTenant = TenantContext.getTenant();
        try {
            TenantContext.setTenant(account.getAccountCode());
            User existingAdmin = userRepository.findByEmail(payload.getAdminEmail()).orElse(null);
            if (existingAdmin == null) {
                User admin = new User();
                admin.setName(payload.getAdminName());
                admin.setEmail(payload.getAdminEmail());
                admin.setPasswordHash(passwordService.hash(payload.getAdminPassword()));
                admin.setRole("Admin");
                userRepository.save(admin);
            }
        } finally {
            TenantContext.setTenant(previousTenant);
        }

        return accountToResponse(account);
    }

    @PutMapping("/{accountCode}/features")
    public Map<String, Object> updateAccountFeatures(
            @PathVariable String accountCode,
            @Valid @RequestBody SchoolFeatureUpdate payload,
            HttpServletRequest request
    ) {
        platformAuthService.requirePlatformOwner(request);

        SchoolAccount account = schoolAccountRepository.findByAccountCode(accountCode).orElse(null);
        if (account == null) {
            throw ApiException.notFound("School account not found");
        }

        Map<String, SchoolFeature> existing = new LinkedHashMap<>();
        for (SchoolFeature feature : schoolFeatureRepository.findByAccountId(account.getId())) {
            existing.put(feature.getFeatureKey(), feature);
        }
        for (Map.Entry<String, Boolean> entry : payload.getFeatures().entrySet()) {
            SchoolFeature feature = existing.get(entry.getKey());
            if (feature != null) {
                feature.setEnabled(entry.getValue());
                schoolFeatureRepository.save(feature);
            } else {
                SchoolFeature fresh = new SchoolFeature();
                fresh.setAccountId(account.getId());
                fresh.setFeatureKey(entry.getKey());
                fresh.setEnabled(entry.getValue());
                schoolFeatureRepository.save(fresh);
            }
        }

        return Map.of("features", tenantAccountService.getFeatureMap(account.getId()));
    }
}
