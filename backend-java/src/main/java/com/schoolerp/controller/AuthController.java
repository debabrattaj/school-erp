package com.schoolerp.controller;

import com.schoolerp.central.entity.PasswordResetToken;
import com.schoolerp.central.entity.SchoolAccount;
import com.schoolerp.central.repository.PasswordResetTokenRepository;
import com.schoolerp.config.SchoolErpProperties;
import com.schoolerp.dto.auth.*;
import com.schoolerp.entity.Role;
import com.schoolerp.entity.User;
import com.schoolerp.exception.ApiException;
import com.schoolerp.repository.RoleRepository;
import com.schoolerp.repository.UserRepository;
import com.schoolerp.security.LoginRateLimiter;
import com.schoolerp.security.JwtService;
import com.schoolerp.security.PasswordService;
import com.schoolerp.security.PermissionCatalog;
import com.schoolerp.security.PermissionService;
import com.schoolerp.security.TotpService;
import com.schoolerp.service.MailerService;
import com.schoolerp.tenant.TenantAccountService;
import com.schoolerp.tenant.TenantContext;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.time.LocalDateTime;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Direct port of backend/app/routes/auth.py. */
@RestController
@RequestMapping("/auth")
public class AuthController {

    private final UserRepository userRepository;
    private final RoleRepository roleRepository;
    private final PasswordResetTokenRepository passwordResetTokenRepository;
    private final TenantAccountService tenantAccountService;
    private final JwtService jwtService;
    private final PasswordService passwordService;
    private final TotpService totpService;
    private final PermissionService permissionService;
    private final LoginRateLimiter rateLimiter;
    private final MailerService mailerService;
    private final SchoolErpProperties properties;
    private static final SecureRandom SECURE_RANDOM = new SecureRandom();

    public AuthController(
            UserRepository userRepository,
            RoleRepository roleRepository,
            PasswordResetTokenRepository passwordResetTokenRepository,
            TenantAccountService tenantAccountService,
            JwtService jwtService,
            PasswordService passwordService,
            TotpService totpService,
            PermissionService permissionService,
            LoginRateLimiter rateLimiter,
            MailerService mailerService,
            SchoolErpProperties properties
    ) {
        this.userRepository = userRepository;
        this.roleRepository = roleRepository;
        this.passwordResetTokenRepository = passwordResetTokenRepository;
        this.tenantAccountService = tenantAccountService;
        this.jwtService = jwtService;
        this.passwordService = passwordService;
        this.totpService = totpService;
        this.permissionService = permissionService;
        this.rateLimiter = rateLimiter;
        this.mailerService = mailerService;
        this.properties = properties;
    }

    @PostMapping("/login")
    public ResponseEntity<Map<String, Object>> login(@Valid @RequestBody LoginRequest loginData, HttpServletRequest request) {
        List<String> keys = rateLimiter.loginKeys(request.getRemoteAddr(), loginData.getEmail());
        Integer retryAfter = rateLimiter.checkLoginAllowed(keys);
        if (retryAfter != null) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS,
                    "Too many failed login attempts. Please try again later.",
                    "Retry-After", String.valueOf(retryAfter));
        }

        SchoolAccount account = tenantAccountService.getAccount(loginData.getAccountCode());

        return withTenant(account.getAccountCode(), () -> {
            User user = userRepository.findByEmail(loginData.getEmail()).orElse(null);
            if (user == null || !passwordService.verify(loginData.getPassword(), user.getPasswordHash())) {
                rateLimiter.recordLoginFailure(keys);
                throw ApiException.unauthorized("Invalid email or password");
            }

            if (user.isMfaEnabled()) {
                if (loginData.getMfaCode() == null || loginData.getMfaCode().isBlank()) {
                    throw ApiException.unauthorized("MFA_REQUIRED");
                }
                if (!totpService.verifyTotp(user.getMfaSecret(), loginData.getMfaCode())) {
                    rateLimiter.recordLoginFailure(keys);
                    throw ApiException.unauthorized("Invalid authentication code.");
                }
            }

            rateLimiter.clearLoginFailures(keys);

            Map<String, Object> claims = new LinkedHashMap<>();
            claims.put("sub", user.getEmail());
            claims.put("role", user.getRole());
            claims.put("account_code", account.getAccountCode());
            claims.put("account_id", account.getId());
            String accessToken = jwtService.createAccessToken(claims);

            Map<String, String> permissions = resolvePermissions(user.getRole());
            Map<String, Boolean> features = tenantAccountService.getFeatureMap(account.getId());

            Map<String, Object> accountBody = new LinkedHashMap<>();
            accountBody.put("id", account.getId());
            accountBody.put("school_name", account.getSchoolName());
            accountBody.put("account_code", account.getAccountCode());
            accountBody.put("school_type", account.getSchoolType());
            accountBody.put("curriculum", account.getCurriculum());
            accountBody.put("country", account.getCountry());
            accountBody.put("timezone", account.getTimezone());

            Map<String, Object> userBody = new LinkedHashMap<>();
            userBody.put("id", user.getId());
            userBody.put("name", user.getName());
            userBody.put("email", user.getEmail());
            userBody.put("role", user.getRole());
            userBody.put("mfa_enabled", user.isMfaEnabled());
            userBody.put("permissions", permissions);
            userBody.put("account", accountBody);
            userBody.put("features", features);

            Map<String, Object> body = new LinkedHashMap<>();
            body.put("access_token", accessToken);
            body.put("token_type", "bearer");
            body.put("user", userBody);
            return ResponseEntity.ok(body);
        });
    }

    @GetMapping("/me")
    public UserResponse me() {
        return UserResponse.from(permissionService.getCurrentUser());
    }

    @GetMapping("/mfa/status")
    public Map<String, Object> mfaStatus() {
        return Map.of("mfa_enabled", permissionService.getCurrentUser().isMfaEnabled());
    }

    @PostMapping("/mfa/setup")
    public Map<String, Object> mfaSetup() {
        User currentUser = permissionService.getCurrentUser();
        if (currentUser.isMfaEnabled()) {
            throw ApiException.badRequest("MFA is already enabled.");
        }
        String secret = totpService.generateSecret();
        currentUser.setMfaSecret(secret);
        userRepository.save(currentUser);

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("secret", secret);
        body.put("otpauth_uri", totpService.provisioningUri(secret, currentUser.getEmail()));
        return body;
    }

    @PostMapping("/mfa/verify")
    public Map<String, String> mfaVerify(@Valid @RequestBody MfaCodeRequest payload, HttpServletRequest request) {
        User currentUser = permissionService.getCurrentUser();
        if (currentUser.isMfaEnabled()) {
            throw ApiException.badRequest("MFA is already enabled.");
        }
        if (currentUser.getMfaSecret() == null || currentUser.getMfaSecret().isBlank()) {
            throw ApiException.badRequest("Start MFA setup first.");
        }

        List<String> keys = mfaKeys(request, currentUser.getEmail());
        Integer retryAfter = rateLimiter.checkLoginAllowed(keys);
        if (retryAfter != null) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS,
                    "Too many failed codes. Please try again later.", "Retry-After", String.valueOf(retryAfter));
        }

        if (!totpService.verifyTotp(currentUser.getMfaSecret(), payload.getCode())) {
            rateLimiter.recordLoginFailure(keys);
            throw ApiException.badRequest("Invalid authentication code.");
        }

        rateLimiter.clearLoginFailures(keys);
        currentUser.setMfaEnabled(true);
        userRepository.save(currentUser);
        return Map.of("message", "Multi-factor authentication is now enabled.");
    }

    @PostMapping("/mfa/disable")
    public Map<String, String> mfaDisable(@Valid @RequestBody MfaCodeRequest payload, HttpServletRequest request) {
        User currentUser = permissionService.getCurrentUser();
        if (!currentUser.isMfaEnabled()) {
            throw ApiException.badRequest("MFA is not enabled.");
        }

        List<String> keys = mfaKeys(request, currentUser.getEmail());
        Integer retryAfter = rateLimiter.checkLoginAllowed(keys);
        if (retryAfter != null) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS,
                    "Too many failed codes. Please try again later.", "Retry-After", String.valueOf(retryAfter));
        }

        if (!totpService.verifyTotp(currentUser.getMfaSecret(), payload.getCode())) {
            rateLimiter.recordLoginFailure(keys);
            throw ApiException.badRequest("Invalid authentication code.");
        }

        rateLimiter.clearLoginFailures(keys);
        currentUser.setMfaEnabled(false);
        currentUser.setMfaSecret(null);
        userRepository.save(currentUser);
        return Map.of("message", "Multi-factor authentication has been disabled.");
    }

    @PostMapping("/forgot-password")
    public Map<String, String> forgotPassword(@Valid @RequestBody ForgotPasswordRequest payload, HttpServletRequest request) {
        List<String> keys = rateLimiter.loginKeys(request.getRemoteAddr(), payload.getEmail());
        Integer retryAfter = rateLimiter.checkLoginAllowed(keys);
        if (retryAfter != null) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS,
                    "Too many requests. Please try again later.", "Retry-After", String.valueOf(retryAfter));
        }
        rateLimiter.recordLoginFailure(keys);

        Map<String, String> generic = Map.of("message", "If that account exists, a password reset link has been sent.");

        SchoolAccount account;
        try {
            account = tenantAccountService.getAccount(payload.getAccountCode());
        } catch (Exception e) {
            return generic;
        }

        User user = withTenant(account.getAccountCode(), () -> userRepository.findByEmail(payload.getEmail()).orElse(null));
        if (user == null) {
            return generic;
        }

        String rawToken = generateUrlSafeToken(32);
        try {
            passwordResetTokenRepository.findByAccountCodeAndEmailAndUsedFalse(account.getAccountCode(), payload.getEmail())
                    .forEach(t -> { t.setUsed(true); passwordResetTokenRepository.save(t); });

            PasswordResetToken token = new PasswordResetToken();
            token.setTokenHash(hashToken(rawToken));
            token.setAccountCode(account.getAccountCode());
            token.setEmail(payload.getEmail());
            token.setExpiresAt(LocalDateTime.now().plusMinutes(properties.getReset().getTokenTtlMinutes()));
            token.setUsed(false);
            passwordResetTokenRepository.save(token);
        } catch (Exception e) {
            return generic;
        }

        String resetLink = properties.getReset().getFrontendBaseUrl() + "/reset-password?token=" + rawToken
                + "&account_code=" + account.getAccountCode();
        String subject = "Reset your School ERP password";
        String body = "We received a request to reset your School ERP password.\n\n"
                + "Use the link below within " + properties.getReset().getTokenTtlMinutes()
                + " minutes to choose a new password:\n\n" + resetLink + "\n\n"
                + "If you did not request this, you can safely ignore this email.";
        mailerService.sendEmail(payload.getEmail(), subject, body);

        if (properties.getReset().isDebugReturnToken()) {
            Map<String, String> withDebug = new LinkedHashMap<>(generic);
            withDebug.put("debug_token", rawToken);
            withDebug.put("debug_reset_link", resetLink);
            return withDebug;
        }
        return generic;
    }

    @PostMapping("/reset-password")
    public Map<String, String> resetPasswordWithToken(@Valid @RequestBody ResetPasswordConfirm payload) {
        passwordService.validate(payload.getNewPassword());

        String tokenHash = hashToken(payload.getToken());
        PasswordResetToken record = passwordResetTokenRepository.findByTokenHash(tokenHash).orElse(null);
        if (record == null || record.isUsed() || record.getExpiresAt().isBefore(LocalDateTime.now())) {
            throw ApiException.badRequest("This reset link is invalid or has expired.");
        }

        String accountCode = record.getAccountCode();
        String email = record.getEmail();

        SchoolAccount account = tenantAccountService.getAccount(accountCode);
        withTenant(account.getAccountCode(), () -> {
            User user = userRepository.findByEmail(email).orElse(null);
            if (user == null) {
                throw ApiException.badRequest("This reset link is invalid or has expired.");
            }
            user.setPasswordHash(passwordService.hash(payload.getNewPassword()));
            userRepository.save(user);
            return null;
        });

        record.setUsed(true);
        passwordResetTokenRepository.save(record);

        return Map.of("message", "Your password has been reset. You can now sign in.");
    }

    /** Effective permission map for a user's role (system default or custom). */
    private Map<String, String> resolvePermissions(String roleName) {
        if (PermissionCatalog.SYSTEM_ROLE_PERMISSIONS.containsKey(roleName)) {
            return PermissionCatalog.SYSTEM_ROLE_PERMISSIONS.get(roleName);
        }
        Role role = roleRepository.findByName(roleName).orElse(null);
        if (role != null && role.getPermissions() != null && !role.getPermissions().isBlank()) {
            try {
                return new com.fasterxml.jackson.databind.ObjectMapper()
                        .readValue(role.getPermissions(), new com.fasterxml.jackson.core.type.TypeReference<Map<String, String>>() {});
            } catch (Exception e) {
                return Map.of();
            }
        }
        return Map.of();
    }

    /** Rate-limit keys for a TOTP-code attempt, kept separate from login_keys(). */
    private List<String> mfaKeys(HttpServletRequest request, String email) {
        String ip = request.getRemoteAddr();
        List<String> keys = new java.util.ArrayList<>();
        keys.add("mfa-ip:" + (ip == null || ip.isBlank() ? "unknown" : ip));
        if (email != null && !email.isBlank()) {
            keys.add("mfa:" + email.trim().toLowerCase());
        }
        return keys;
    }

    private String generateUrlSafeToken(int numBytes) {
        byte[] raw = new byte[numBytes];
        SECURE_RANDOM.nextBytes(raw);
        return Base64.getUrlEncoder().withoutPadding().encodeToString(raw);
    }

    private String hashToken(String rawToken) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(rawToken.getBytes(StandardCharsets.UTF_8));
            StringBuilder sb = new StringBuilder();
            for (byte b : hash) {
                sb.append(String.format("%02x", b));
            }
            return sb.toString();
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException(e);
        }
    }

    /** Run a block of work with TenantContext temporarily switched to a specific account_code. */
    private <T> T withTenant(String accountCode, java.util.concurrent.Callable<T> work) {
        String previous = TenantContext.getTenant();
        TenantContext.setTenant(accountCode);
        try {
            return work.call();
        } catch (RuntimeException e) {
            throw e;
        } catch (Exception e) {
            throw new RuntimeException(e);
        } finally {
            if (previous != null) {
                TenantContext.setTenant(previous);
            } else {
                TenantContext.clear();
            }
        }
    }
}
