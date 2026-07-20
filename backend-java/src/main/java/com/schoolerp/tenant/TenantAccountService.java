package com.schoolerp.tenant;

import com.schoolerp.central.entity.SchoolAccount;
import com.schoolerp.central.entity.SchoolFeature;
import com.schoolerp.central.repository.SchoolAccountRepository;
import com.schoolerp.central.repository.SchoolFeatureRepository;
import com.schoolerp.config.SchoolErpProperties;
import com.schoolerp.security.JwtService;
import io.jsonwebtoken.Claims;
import jakarta.annotation.PostConstruct;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.stereotype.Service;

import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Optional;

/**
 * Tenant registry lookups & bootstrap, direct port of backend/app/tenant.py
 * (get_account, get_feature_map, get_account_code_from_request,
 * init_tenant_registry, DEFAULT_FEATURES).
 */
@Service
public class TenantAccountService {

    /** Default feature flags for a newly-created school account. */
    public static final Map<String, Boolean> DEFAULT_FEATURES = new LinkedHashMap<>();
    static {
        DEFAULT_FEATURES.put("dashboard", true);
        DEFAULT_FEATURES.put("students", true);
        DEFAULT_FEATURES.put("teachers", true);
        DEFAULT_FEATURES.put("classes", true);
        DEFAULT_FEATURES.put("attendance", true);
        DEFAULT_FEATURES.put("fees", true);
        DEFAULT_FEATURES.put("accounting", true);
        DEFAULT_FEATURES.put("exams", true);
        DEFAULT_FEATURES.put("marks", true);
        DEFAULT_FEATURES.put("reports", true);
        DEFAULT_FEATURES.put("users", true);
        DEFAULT_FEATURES.put("settings", true);
        DEFAULT_FEATURES.put("master_data", true);
        DEFAULT_FEATURES.put("student_layout", true);
        DEFAULT_FEATURES.put("report_card", true);
        DEFAULT_FEATURES.put("student_enrollments", true);
        DEFAULT_FEATURES.put("admissions", true);
        DEFAULT_FEATURES.put("admission_assessments", true);
        DEFAULT_FEATURES.put("parent_communication", true);
        DEFAULT_FEATURES.put("student_services", true);
        DEFAULT_FEATURES.put("alumni_withdrawals", true);
        DEFAULT_FEATURES.put("counseling", true);
        DEFAULT_FEATURES.put("enrichment", true);
        DEFAULT_FEATURES.put("compliance", true);
        DEFAULT_FEATURES.put("hostel", false);
        DEFAULT_FEATURES.put("transport", false);
        DEFAULT_FEATURES.put("international_documents", true);
        DEFAULT_FEATURES.put("health_infirmary", false);
        DEFAULT_FEATURES.put("mess_management", false);
        DEFAULT_FEATURES.put("library", false);
        DEFAULT_FEATURES.put("inventory", false);
        DEFAULT_FEATURES.put("house_system", true);
        DEFAULT_FEATURES.put("multi_curriculum", true);
        DEFAULT_FEATURES.put("academic_years", true);
        DEFAULT_FEATURES.put("parent_portal", true);
        DEFAULT_FEATURES.put("timetable", true);
    }

    private final SchoolAccountRepository schoolAccountRepository;
    private final SchoolFeatureRepository schoolFeatureRepository;
    private final SchoolErpProperties properties;
    private final JwtService jwtService;

    public TenantAccountService(
            SchoolAccountRepository schoolAccountRepository,
            SchoolFeatureRepository schoolFeatureRepository,
            SchoolErpProperties properties,
            JwtService jwtService
    ) {
        this.schoolAccountRepository = schoolAccountRepository;
        this.schoolFeatureRepository = schoolFeatureRepository;
        this.properties = properties;
        this.jwtService = jwtService;
    }

    @PostConstruct
    public void initTenantRegistry() {
        String defaultCode = properties.getTenant().getDefaultAccountCode();
        SchoolAccount account = schoolAccountRepository.findByAccountCode(defaultCode).orElseGet(() -> {
            SchoolAccount created = new SchoolAccount();
            created.setSchoolName("Default School");
            created.setAccountCode(defaultCode);
            created.setSchoolType("English Medium");
            created.setCurriculum("CBSE");
            created.setCountry("India");
            created.setTimezone("Asia/Calcutta");
            created.setDatabaseUrl(properties.getTenant().getDefaultSchoolDatabaseUrl());
            created.setStatus("Active");
            return schoolAccountRepository.save(created);
        });

        for (Map.Entry<String, Boolean> entry : DEFAULT_FEATURES.entrySet()) {
            schoolFeatureRepository.findByAccountIdAndFeatureKey(account.getId(), entry.getKey())
                    .orElseGet(() -> {
                        SchoolFeature feature = new SchoolFeature();
                        feature.setAccountId(account.getId());
                        feature.setFeatureKey(entry.getKey());
                        feature.setEnabled(entry.getValue());
                        return schoolFeatureRepository.save(feature);
                    });
        }
    }

    public SchoolAccount getAccount(String accountCode) {
        String code = (accountCode == null || accountCode.isBlank())
                ? properties.getTenant().getDefaultAccountCode()
                : accountCode;
        SchoolAccount account = schoolAccountRepository.findByAccountCode(code)
                .orElseThrow(() -> new TenantDataSourceManager.TenantNotFoundException("School account not found"));
        if (!"Active".equals(account.getStatus())) {
            throw new TenantDataSourceManager.TenantNotFoundException("School account not found");
        }
        return account;
    }

    public Map<String, Boolean> getFeatureMap(Long accountId) {
        Map<String, Boolean> result = new LinkedHashMap<>();
        for (SchoolFeature feature : schoolFeatureRepository.findByAccountId(accountId)) {
            result.put(feature.getFeatureKey(), feature.isEnabled());
        }
        return result;
    }

    /**
     * Resolve which tenant database a request should use.
     *
     * Security-critical: a signed, verifiable bearer token's own account_code
     * claim is authoritative and always wins over the client-supplied
     * X-School-Code header. Without this, a user could take their own valid
     * token (issued for their real school) and replay it with a different
     * school's header, getting routed to that other tenant's database. The
     * header is only trusted when there is no valid token yet, i.e. for
     * pre-auth flows (login, forgot-password) that must pick a tenant before
     * a token exists.
     */
    public String resolveAccountCode(HttpServletRequest request) {
        String authHeader = request.getHeader("Authorization");
        if (authHeader != null && authHeader.toLowerCase().startsWith("bearer ")) {
            String token = authHeader.substring(7);
            Optional<Claims> claims = jwtService.parseClaims(token);
            if (claims.isPresent()) {
                Object accountCode = claims.get().get("account_code");
                if (accountCode != null && !accountCode.toString().isBlank()) {
                    return accountCode.toString();
                }
            }
        }

        String headerCode = request.getHeader("x-school-code");
        if (headerCode != null && !headerCode.isBlank()) {
            return headerCode;
        }

        return properties.getTenant().getDefaultAccountCode();
    }
}
