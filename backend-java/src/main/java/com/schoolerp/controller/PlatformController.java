package com.schoolerp.controller;

import com.schoolerp.central.entity.*;
import com.schoolerp.central.repository.*;
import com.schoolerp.config.SchoolErpProperties;
import com.schoolerp.dto.platform.*;
import com.schoolerp.entity.SchoolSettings;
import com.schoolerp.entity.User;
import com.schoolerp.exception.ApiException;
import com.schoolerp.repository.SchoolSettingsRepository;
import com.schoolerp.repository.StudentRepository;
import com.schoolerp.repository.TeacherRepository;
import com.schoolerp.repository.UserRepository;
import com.schoolerp.security.JwtService;
import com.schoolerp.security.LoginRateLimiter;
import com.schoolerp.security.PasswordService;
import com.schoolerp.service.BackupService;
import com.schoolerp.service.PlatformAuthService;
import com.schoolerp.tenant.DatabaseUrls;
import com.schoolerp.tenant.TenantAccountService;
import com.schoolerp.tenant.TenantContext;
import io.jsonwebtoken.Claims;
import jakarta.validation.Valid;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDateTime;
import java.util.*;

/**
 * Direct port of backend/app/routes/platform.py: the multi-tenant "owner
 * console" used to create/manage schools, subscriptions, and platform-wide
 * notifications. Deliberately uses its own JWT scope ("platform") rather
 * than PermissionService/the regular tenant User auth — a platform token
 * carries account_code="__platform__", which can never resolve to a real
 * tenant, so it's useless against every other module's endpoints and vice
 * versa (matches the Python source's comment on this design).
 */
@RestController
@RequestMapping("/platform")
public class PlatformController {

    private static final Map<String, String> FEATURE_LABELS = new LinkedHashMap<>();
    static {
        FEATURE_LABELS.put("dashboard", "Dashboard");
        FEATURE_LABELS.put("students", "Students");
        FEATURE_LABELS.put("teachers", "Teachers");
        FEATURE_LABELS.put("classes", "Classes");
        FEATURE_LABELS.put("attendance", "Attendance");
        FEATURE_LABELS.put("fees", "Fees");
        FEATURE_LABELS.put("exams", "Exams");
        FEATURE_LABELS.put("marks", "Marks");
        FEATURE_LABELS.put("reports", "Reports");
        FEATURE_LABELS.put("users", "User Management");
        FEATURE_LABELS.put("settings", "Institution Settings");
        FEATURE_LABELS.put("master_data", "Master Data");
        FEATURE_LABELS.put("student_layout", "Student Layout Builder");
        FEATURE_LABELS.put("report_card", "Report Card");
        FEATURE_LABELS.put("student_enrollments", "Student Enrollments");
        FEATURE_LABELS.put("admissions", "Admissions CRM");
        FEATURE_LABELS.put("admission_assessments", "Admission Tests");
        FEATURE_LABELS.put("parent_communication", "Communication");
        FEATURE_LABELS.put("student_services", "Student Services");
        FEATURE_LABELS.put("alumni_withdrawals", "Alumni & Exit");
        FEATURE_LABELS.put("counseling", "Counseling");
        FEATURE_LABELS.put("enrichment", "Enrichment");
        FEATURE_LABELS.put("compliance", "Compliance");
        FEATURE_LABELS.put("hostel", "Hostel");
        FEATURE_LABELS.put("transport", "Transport");
        FEATURE_LABELS.put("international_documents", "Intl. Documents");
        FEATURE_LABELS.put("health_infirmary", "Health Infirmary");
        FEATURE_LABELS.put("mess_management", "Mess Management");
        FEATURE_LABELS.put("library", "Library");
        FEATURE_LABELS.put("inventory", "Inventory");
        FEATURE_LABELS.put("house_system", "House System");
        FEATURE_LABELS.put("multi_curriculum", "Multi Curriculum");
        FEATURE_LABELS.put("academic_years", "Academic Years");
        FEATURE_LABELS.put("parent_portal", "Parent/Student Portal");
        FEATURE_LABELS.put("ai_chatbot", "AI Assistant");
        FEATURE_LABELS.put("timetable", "Timetable");
    }

    private final PlatformAdminRepository platformAdminRepository;
    private final SchoolAccountRepository schoolAccountRepository;
    private final SchoolFeatureRepository schoolFeatureRepository;
    private final SubscriptionPlanRepository subscriptionPlanRepository;
    private final SchoolSubscriptionRepository schoolSubscriptionRepository;
    private final PlatformNotificationRepository platformNotificationRepository;
    private final AuditLogRepository auditLogRepository;
    private final UserRepository userRepository;
    private final StudentRepository studentRepository;
    private final TeacherRepository teacherRepository;
    private final SchoolSettingsRepository schoolSettingsRepository;
    private final SchoolErpProperties properties;
    private final JwtService jwtService;
    private final PasswordService passwordService;
    private final LoginRateLimiter loginRateLimiter;
    private final BackupService backupService;
    private final PlatformAuthService platformAuthService;

    public PlatformController(
            PlatformAdminRepository platformAdminRepository,
            SchoolAccountRepository schoolAccountRepository,
            SchoolFeatureRepository schoolFeatureRepository,
            SubscriptionPlanRepository subscriptionPlanRepository,
            SchoolSubscriptionRepository schoolSubscriptionRepository,
            PlatformNotificationRepository platformNotificationRepository,
            AuditLogRepository auditLogRepository,
            UserRepository userRepository,
            StudentRepository studentRepository,
            TeacherRepository teacherRepository,
            SchoolSettingsRepository schoolSettingsRepository,
            SchoolErpProperties properties,
            JwtService jwtService,
            PasswordService passwordService,
            LoginRateLimiter loginRateLimiter,
            BackupService backupService,
            PlatformAuthService platformAuthService
    ) {
        this.platformAdminRepository = platformAdminRepository;
        this.schoolAccountRepository = schoolAccountRepository;
        this.schoolFeatureRepository = schoolFeatureRepository;
        this.subscriptionPlanRepository = subscriptionPlanRepository;
        this.schoolSubscriptionRepository = schoolSubscriptionRepository;
        this.platformNotificationRepository = platformNotificationRepository;
        this.auditLogRepository = auditLogRepository;
        this.userRepository = userRepository;
        this.studentRepository = studentRepository;
        this.teacherRepository = teacherRepository;
        this.schoolSettingsRepository = schoolSettingsRepository;
        this.properties = properties;
        this.jwtService = jwtService;
        this.passwordService = passwordService;
        this.loginRateLimiter = loginRateLimiter;
        this.backupService = backupService;
        this.platformAuthService = platformAuthService;
    }

    // ===================== Auth =====================

    @PostMapping("/auth/login")
    public Map<String, Object> platformLogin(@Valid @RequestBody PlatformLoginRequest payload, HttpServletRequest request) {
        List<String> keys = loginRateLimiter.loginKeys(request.getRemoteAddr(), payload.getEmail());
        Integer retryAfter = loginRateLimiter.checkLoginAllowed(keys);
        if (retryAfter != null) {
            throw new ApiException(HttpStatus.TOO_MANY_REQUESTS,
                    "Too many failed login attempts. Please try again later.", "Retry-After", String.valueOf(retryAfter));
        }

        PlatformAdmin admin = platformAdminRepository.findByEmail(payload.getEmail()).orElse(null);
        if (admin == null || !admin.isActive() || !passwordService.verify(payload.getPassword(), admin.getPasswordHash())) {
            loginRateLimiter.recordLoginFailure(keys);
            throw ApiException.unauthorized("Invalid credentials");
        }
        loginRateLimiter.clearLoginFailures(keys);

        Map<String, Object> claims = new LinkedHashMap<>();
        claims.put("sub", String.valueOf(admin.getId()));
        claims.put("scope", "platform");
        claims.put("account_code", "__platform__");
        String token = jwtService.createToken(claims, properties.getPlatform().getTokenMinutes());

        Map<String, Object> owner = new LinkedHashMap<>();
        owner.put("id", admin.getId());
        owner.put("name", admin.getName());
        owner.put("email", admin.getEmail());

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("access_token", token);
        body.put("owner", owner);
        return body;
    }

    // ===================== Feature catalog =====================

    @GetMapping("/feature-catalog")
    public List<Map<String, Object>> featureCatalog(HttpServletRequest request) {
        platformAuthService.requirePlatformOwner(request);
        List<Map<String, Object>> result = new ArrayList<>();
        for (Map.Entry<String, Boolean> entry : TenantAccountService.DEFAULT_FEATURES.entrySet()) {
            Map<String, Object> row = new LinkedHashMap<>();
            row.put("key", entry.getKey());
            row.put("label", FEATURE_LABELS.getOrDefault(entry.getKey(), titleCase(entry.getKey())));
            row.put("default_enabled", entry.getValue());
            result.add(row);
        }
        return result;
    }

    // ===================== Backups =====================

    @GetMapping("/backups")
    public List<Map<String, Object>> listDbBackups(HttpServletRequest request) {
        platformAuthService.requirePlatformOwner(request);
        return backupService.listBackups();
    }

    @PostMapping("/backups")
    public Map<String, Object> createDbBackup(HttpServletRequest request) {
        platformAuthService.requirePlatformOwner(request);
        Map<String, Object> result = backupService.backupAll();
        if (!Boolean.TRUE.equals(result.get("ok"))) {
            throw new ApiException(HttpStatus.INTERNAL_SERVER_ERROR, String.valueOf(result));
        }
        return result;
    }

    // ===================== Audit log =====================

    @GetMapping("/audit-logs")
    public List<Map<String, Object>> listAuditLogs(
            @RequestParam(name = "account_code", required = false) String accountCode,
            @RequestParam(name = "actor_email", required = false) String actorEmail,
            @RequestParam(defaultValue = "100") int limit,
            HttpServletRequest request
    ) {
        platformAuthService.requirePlatformOwner(request);
        int cappedLimit = Math.max(1, Math.min(limit, 500));

        return auditLogRepository.findAll().stream()
                .filter(a -> accountCode == null || accountCode.equals(a.getAccountCode()))
                .filter(a -> actorEmail == null || actorEmail.equals(a.getActorEmail()))
                .sorted(Comparator.comparing(AuditLog::getId).reversed())
                .limit(cappedLimit)
                .map(row -> {
                    Map<String, Object> body = new LinkedHashMap<>();
                    body.put("id", row.getId());
                    body.put("created_at", row.getCreatedAt());
                    body.put("account_code", row.getAccountCode());
                    body.put("actor_email", row.getActorEmail());
                    body.put("actor_role", row.getActorRole());
                    body.put("method", row.getMethod());
                    body.put("path", row.getPath());
                    body.put("status_code", row.getStatusCode());
                    body.put("client_ip", row.getClientIp());
                    body.put("detail", row.getDetail());
                    return body;
                })
                .toList();
    }

    // ===================== Schools =====================

    @GetMapping("/schools")
    public List<Map<String, Object>> listSchools(HttpServletRequest request) {
        platformAuthService.requirePlatformOwner(request);
        return schoolAccountRepository.findAll().stream()
                .sorted(Comparator.comparing(SchoolAccount::getId))
                .map(a -> accountSummary(a, true))
                .toList();
    }

    @GetMapping("/schools/{accountId}")
    public Map<String, Object> schoolDetail(@PathVariable Long accountId, HttpServletRequest request) {
        platformAuthService.requirePlatformOwner(request);
        SchoolAccount account = requireAccount(accountId);
        Map<String, Object> data = accountSummary(account, true);

        Map<String, Object> settingsSnapshot = null;
        String previousTenant = TenantContext.getTenant();
        try {
            TenantContext.setTenant(account.getAccountCode());
            SchoolSettings settings = schoolSettingsRepository.findAll().stream().findFirst().orElse(null);
            if (settings != null) {
                settingsSnapshot = new LinkedHashMap<>();
                settingsSnapshot.put("school_name", settings.getSchoolName());
                settingsSnapshot.put("academic_year", settings.getAcademicYear());
                settingsSnapshot.put("principal_name", settings.getPrincipalName());
                settingsSnapshot.put("phone", settings.getPhone());
                settingsSnapshot.put("email", settings.getEmail());
            }
        } catch (Exception ignored) {
        } finally {
            TenantContext.setTenant(previousTenant);
        }
        data.put("settings_snapshot", settingsSnapshot);
        return data;
    }

    @PostMapping("/schools")
    public Map<String, Object> createSchool(@Valid @RequestBody SchoolCreateRequest payload, HttpServletRequest request) {
        platformAuthService.requirePlatformOwner(request);

        String accountCode = payload.getAccountCode() != null ? payload.getAccountCode().strip().toLowerCase() : "";
        if (accountCode.isEmpty() || !accountCode.replace("_", "").replace("-", "").chars().allMatch(Character::isLetterOrDigit)) {
            throw ApiException.badRequest("Account code must be alphanumeric (dashes/underscores allowed)");
        }
        passwordService.validate(payload.getAdminPassword());

        StringBuilder safeCode = new StringBuilder();
        for (char c : accountCode.toCharArray()) {
            safeCode.append(Character.isLetterOrDigit(c) ? Character.toLowerCase(c) : '_');
        }
        String safeCodeTrimmed = safeCode.toString().replaceAll("^_+|_+$", "");
        String databaseUrl = DatabaseUrls.buildTenantDatabaseUrl(properties.getTenant().getDefaultSchoolDatabaseUrl(), safeCodeTrimmed);

        SchoolAccount account = new SchoolAccount();
        account.setSchoolName(payload.getSchoolName() != null ? payload.getSchoolName().strip() : null);
        account.setAccountCode(accountCode);
        account.setDomain(payload.getDomain());
        account.setSchoolType(payload.getSchoolType());
        account.setCurriculum(payload.getCurriculum());
        account.setCountry(payload.getCountry());
        account.setTimezone(payload.getTimezone());
        account.setDatabaseUrl(databaseUrl);
        account.setStatus("Active");

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
            User admin = new User();
            admin.setName(payload.getAdminName());
            admin.setEmail(payload.getAdminEmail());
            admin.setPasswordHash(passwordService.hash(payload.getAdminPassword()));
            admin.setRole("Admin");
            userRepository.save(admin);
        } finally {
            TenantContext.setTenant(previousTenant);
        }

        return accountSummary(account, true);
    }

    @PutMapping("/schools/{accountId}")
    public Map<String, Object> updateSchool(@PathVariable Long accountId, @RequestBody SchoolUpdateRequest payload, HttpServletRequest request) {
        platformAuthService.requirePlatformOwner(request);
        SchoolAccount account = requireAccount(accountId);

        if (payload.getStatus() != null && !"Active".equals(payload.getStatus()) && !"Suspended".equals(payload.getStatus())) {
            throw ApiException.badRequest("Status must be Active or Suspended");
        }

        if (payload.getSchoolName() != null) account.setSchoolName(payload.getSchoolName());
        if (payload.getDomain() != null) account.setDomain(payload.getDomain());
        if (payload.getSchoolType() != null) account.setSchoolType(payload.getSchoolType());
        if (payload.getCurriculum() != null) account.setCurriculum(payload.getCurriculum());
        if (payload.getCountry() != null) account.setCountry(payload.getCountry());
        if (payload.getTimezone() != null) account.setTimezone(payload.getTimezone());
        if (payload.getStatus() != null) account.setStatus(payload.getStatus());
        account.setUpdatedAt(LocalDateTime.now());

        try {
            account = schoolAccountRepository.save(account);
        } catch (DataIntegrityViolationException e) {
            throw ApiException.badRequest("Domain already exists");
        }
        return accountSummary(account, true);
    }

    @PutMapping("/schools/{accountId}/features")
    public Map<String, Object> updateSchoolFeatures(@PathVariable Long accountId, @Valid @RequestBody FeatureUpdateRequest payload, HttpServletRequest request) {
        platformAuthService.requirePlatformOwner(request);

        List<String> unknown = payload.getFeatures().keySet().stream()
                .filter(k -> !TenantAccountService.DEFAULT_FEATURES.containsKey(k))
                .toList();
        if (!unknown.isEmpty()) {
            throw ApiException.badRequest("Unknown feature keys: " + String.join(", ", unknown));
        }

        SchoolAccount account = requireAccount(accountId);
        Map<String, SchoolFeature> existing = new LinkedHashMap<>();
        for (SchoolFeature feature : schoolFeatureRepository.findByAccountId(account.getId())) {
            existing.put(feature.getFeatureKey(), feature);
        }
        for (Map.Entry<String, Boolean> entry : payload.getFeatures().entrySet()) {
            SchoolFeature feature = existing.get(entry.getKey());
            if (feature != null) {
                feature.setEnabled(entry.getValue());
                feature.setUpdatedAt(LocalDateTime.now());
                schoolFeatureRepository.save(feature);
            } else {
                SchoolFeature fresh = new SchoolFeature();
                fresh.setAccountId(account.getId());
                fresh.setFeatureKey(entry.getKey());
                fresh.setEnabled(entry.getValue());
                schoolFeatureRepository.save(fresh);
            }
        }
        return accountSummary(account, false);
    }

    @PostMapping("/schools/{accountId}/reset-admin")
    public Map<String, Object> resetSchoolAdmin(@PathVariable Long accountId, @Valid @RequestBody ResetAdminRequest payload, HttpServletRequest request) {
        platformAuthService.requirePlatformOwner(request);
        passwordService.validate(payload.getNewPassword());

        SchoolAccount account = requireAccount(accountId);

        String action;
        String previousTenant = TenantContext.getTenant();
        try {
            TenantContext.setTenant(account.getAccountCode());
            User user = userRepository.findByEmail(payload.getAdminEmail()).orElse(null);
            if (user != null) {
                user.setPasswordHash(passwordService.hash(payload.getNewPassword()));
                if (!"Admin".equals(user.getRole())) {
                    user.setRole("Admin");
                }
                userRepository.save(user);
                action = "reset";
            } else {
                User fresh = new User();
                fresh.setName(payload.getAdminName() != null ? payload.getAdminName() : "School Admin");
                fresh.setEmail(payload.getAdminEmail());
                fresh.setPasswordHash(passwordService.hash(payload.getNewPassword()));
                fresh.setRole("Admin");
                userRepository.save(fresh);
                action = "created";
            }
        } finally {
            TenantContext.setTenant(previousTenant);
        }

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("message", "Admin login " + action + " for " + account.getSchoolName());
        body.put("admin_email", payload.getAdminEmail());
        return body;
    }

    // ===================== Subscription plans =====================

    @GetMapping("/plans")
    public List<Map<String, Object>> listPlans(HttpServletRequest request) {
        platformAuthService.requirePlatformOwner(request);
        return subscriptionPlanRepository.findAll().stream()
                .sorted(Comparator.comparing(SubscriptionPlan::getId))
                .map(this::planToMap)
                .toList();
    }

    @PostMapping("/plans")
    public Map<String, Object> createPlan(@Valid @RequestBody PlanCreate payload, HttpServletRequest request) {
        platformAuthService.requirePlatformOwner(request);
        SubscriptionPlan plan = new SubscriptionPlan();
        plan.setName(payload.getName() != null ? payload.getName().strip() : null);
        plan.setPriceMonthly(payload.getPriceMonthly());
        plan.setPriceYearly(payload.getPriceYearly());
        plan.setMaxStudents(payload.getMaxStudents());
        plan.setMaxUsers(payload.getMaxUsers());
        plan.setDescription(payload.getDescription());
        try {
            plan = subscriptionPlanRepository.save(plan);
        } catch (DataIntegrityViolationException e) {
            throw ApiException.badRequest("Plan name already exists");
        }
        return planToMap(plan);
    }

    @PutMapping("/plans/{planId}")
    public Map<String, Object> updatePlan(@PathVariable Long planId, @RequestBody PlanUpdate payload, HttpServletRequest request) {
        platformAuthService.requirePlatformOwner(request);
        SubscriptionPlan plan = subscriptionPlanRepository.findById(planId).orElseThrow(() -> ApiException.notFound("Plan not found"));

        if (payload.getName() != null) plan.setName(payload.getName());
        if (payload.getPriceMonthly() != null) plan.setPriceMonthly(payload.getPriceMonthly());
        if (payload.getPriceYearly() != null) plan.setPriceYearly(payload.getPriceYearly());
        if (payload.getMaxStudents() != null) plan.setMaxStudents(payload.getMaxStudents());
        if (payload.getMaxUsers() != null) plan.setMaxUsers(payload.getMaxUsers());
        if (payload.getDescription() != null) plan.setDescription(payload.getDescription());
        if (payload.getIsActive() != null) plan.setActive(payload.getIsActive());
        plan.setUpdatedAt(LocalDateTime.now());

        try {
            plan = subscriptionPlanRepository.save(plan);
        } catch (DataIntegrityViolationException e) {
            throw ApiException.badRequest("Plan name already exists");
        }
        return planToMap(plan);
    }

    // ===================== Subscriptions (billing) =====================

    @GetMapping("/subscriptions")
    public List<Map<String, Object>> listSubscriptions(HttpServletRequest request) {
        platformAuthService.requirePlatformOwner(request);
        return schoolSubscriptionRepository.findAll().stream()
                .sorted(Comparator.comparing(SchoolSubscription::getExpiryDate, Comparator.nullsLast(Comparator.reverseOrder())))
                .map(this::subToMap)
                .toList();
    }

    @GetMapping("/schools/{accountId}/subscriptions")
    public List<Map<String, Object>> schoolSubscriptions(@PathVariable Long accountId, HttpServletRequest request) {
        platformAuthService.requirePlatformOwner(request);
        requireAccount(accountId);
        return schoolSubscriptionRepository.findByAccountId(accountId).stream()
                .sorted(Comparator.comparing(SchoolSubscription::getStartDate, Comparator.nullsLast(Comparator.reverseOrder())))
                .map(this::subToMap)
                .toList();
    }

    @PostMapping("/subscriptions")
    public Map<String, Object> createSubscription(@Valid @RequestBody SubscriptionCreate payload, HttpServletRequest request) {
        platformAuthService.requirePlatformOwner(request);
        requireAccount(payload.getAccountId());
        SubscriptionPlan plan = subscriptionPlanRepository.findById(payload.getPlanId()).orElseThrow(() -> ApiException.notFound("Plan not found"));

        LocalDateTime start;
        try {
            start = java.time.LocalDate.parse(payload.getStartDate()).atStartOfDay();
        } catch (Exception e) {
            throw ApiException.badRequest("Invalid start_date format (use YYYY-MM-DD)");
        }
        LocalDateTime expiry = start.plusDays((long) payload.getMonths() * 30);

        int amount = payload.getAmountPaid() != null ? payload.getAmountPaid() : 0;
        if (amount == 0) {
            amount = "yearly".equals(payload.getBillingCycle()) ? plan.getPriceYearly() : plan.getPriceMonthly();
        }

        SchoolSubscription sub = new SchoolSubscription();
        sub.setAccountId(payload.getAccountId());
        sub.setPlanId(payload.getPlanId());
        sub.setBillingCycle(payload.getBillingCycle());
        sub.setAmountPaid(amount);
        sub.setCurrency(payload.getCurrency());
        sub.setStartDate(start);
        sub.setExpiryDate(expiry);
        sub.setStatus("Active");
        sub.setPaymentReference(payload.getPaymentReference());
        sub.setRemarks(payload.getRemarks());

        try {
            sub = schoolSubscriptionRepository.save(sub);
        } catch (DataIntegrityViolationException e) {
            throw ApiException.badRequest("Duplicate subscription for this start date");
        }

        Long newSubId = sub.getId();
        for (SchoolSubscription previous : schoolSubscriptionRepository.findByAccountId(payload.getAccountId())) {
            if (!previous.getId().equals(newSubId) && "Active".equals(previous.getStatus())) {
                previous.setStatus("Replaced");
                schoolSubscriptionRepository.save(previous);
            }
        }

        return subToMap(sub);
    }

    @GetMapping("/billing/summary")
    public Map<String, Object> billingSummary(HttpServletRequest request) {
        platformAuthService.requirePlatformOwner(request);
        LocalDateTime now = LocalDateTime.now();
        List<SchoolSubscription> activeSubs = schoolSubscriptionRepository.findAll().stream()
                .filter(s -> "Active".equals(s.getStatus()))
                .toList();

        long totalRevenue = activeSubs.stream().mapToLong(s -> s.getAmountPaid() != null ? s.getAmountPaid() : 0).sum();
        int activeCount = 0;
        List<Map<String, Object>> expiringSoon = new ArrayList<>();
        List<Map<String, Object>> expired = new ArrayList<>();

        for (SchoolSubscription sub : activeSubs) {
            Long days = sub.getExpiryDate() != null ? java.time.Duration.between(now, sub.getExpiryDate()).toDays() : null;
            SchoolAccount account = schoolAccountRepository.findById(sub.getAccountId()).orElse(null);
            String schoolName = account != null ? account.getSchoolName() : ("Account #" + sub.getAccountId());
            SubscriptionPlan plan = subscriptionPlanRepository.findById(sub.getPlanId()).orElse(null);

            if (days != null && days < 0) {
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("school_name", schoolName);
                row.put("account_id", sub.getAccountId());
                row.put("days_overdue", Math.abs(days));
                row.put("plan", plan != null ? plan.getName() : null);
                expired.add(row);
            } else {
                activeCount++;
                if (days != null && days <= 30) {
                    Map<String, Object> row = new LinkedHashMap<>();
                    row.put("school_name", schoolName);
                    row.put("account_id", sub.getAccountId());
                    row.put("days_left", days);
                    row.put("expiry_date", sub.getExpiryDate());
                    row.put("plan", plan != null ? plan.getName() : null);
                    expiringSoon.add(row);
                }
            }
        }

        expiringSoon.sort(Comparator.comparing(m -> (Long) m.get("days_left")));

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("total_revenue", totalRevenue);
        body.put("active_subscriptions", activeCount);
        body.put("expired_count", expired.size());
        body.put("expiring_soon_count", expiringSoon.size());
        body.put("expiring_soon", expiringSoon);
        body.put("expired", expired);
        return body;
    }

    // ===================== Platform notifications =====================

    @GetMapping("/notifications")
    public List<Map<String, Object>> listNotifications(HttpServletRequest request) {
        platformAuthService.requirePlatformOwner(request);
        return platformNotificationRepository.findAll().stream()
                .sorted(Comparator.comparing(PlatformNotification::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .limit(100)
                .map(this::notifToMap)
                .toList();
    }

    @PostMapping("/notifications")
    public Map<String, Object> sendNotification(@Valid @RequestBody NotificationCreate payload, HttpServletRequest request) {
        platformAuthService.requirePlatformOwner(request);
        if (!List.of("info", "warning", "urgent").contains(payload.getNotificationType())) {
            throw ApiException.badRequest("Type must be info, warning, or urgent");
        }
        if (payload.getAccountId() != null) {
            requireAccount(payload.getAccountId());
        }

        PlatformNotification notif = new PlatformNotification();
        notif.setAccountId(payload.getAccountId());
        notif.setTitle(payload.getTitle() != null ? payload.getTitle().strip() : null);
        notif.setMessage(payload.getMessage() != null ? payload.getMessage().strip() : null);
        notif.setNotificationType(payload.getNotificationType());
        notif = platformNotificationRepository.save(notif);
        return notifToMap(notif);
    }

    @PostMapping("/notifications/expiry-reminders")
    public Map<String, String> sendExpiryReminders(HttpServletRequest request) {
        platformAuthService.requirePlatformOwner(request);
        LocalDateTime now = LocalDateTime.now();
        List<SchoolSubscription> activeSubs = schoolSubscriptionRepository.findAll().stream()
                .filter(s -> "Active".equals(s.getStatus()))
                .toList();
        int sent = 0;

        for (SchoolSubscription sub : activeSubs) {
            if (sub.getExpiryDate() == null) continue;
            long days = java.time.Duration.between(now, sub.getExpiryDate()).toDays();

            SubscriptionPlan plan = subscriptionPlanRepository.findById(sub.getPlanId()).orElse(null);
            String planName = plan != null ? plan.getName() : "your plan";

            String ntype;
            String title;
            String msg;
            if (days < 0) {
                ntype = "urgent";
                title = "Subscription Expired";
                msg = "Your " + planName + " subscription expired " + Math.abs(days) + " day(s) ago. Please renew to avoid service interruption.";
            } else if (days <= 30) {
                ntype = "warning";
                title = "Subscription Expiring Soon";
                msg = "Your " + planName + " subscription expires in " + days + " day(s) on "
                        + sub.getExpiryDate().toLocalDate() + ". Please renew to continue uninterrupted access.";
            } else {
                continue;
            }

            LocalDateTime recentCutoff = now.minusDays(7);
            boolean recentExists = platformNotificationRepository.findAll().stream()
                    .anyMatch(n -> Objects.equals(n.getAccountId(), sub.getAccountId())
                            && title.equals(n.getTitle())
                            && n.getCreatedAt() != null && n.getCreatedAt().isAfter(recentCutoff));
            if (recentExists) continue;

            PlatformNotification notif = new PlatformNotification();
            notif.setAccountId(sub.getAccountId());
            notif.setTitle(title);
            notif.setMessage(msg);
            notif.setNotificationType(ntype);
            platformNotificationRepository.save(notif);
            sent++;
        }

        return Map.of("message", "Sent " + sent + " expiry reminder(s)");
    }

    @GetMapping("/my-notifications")
    public List<Map<String, Object>> myNotifications(HttpServletRequest request) {
        String authHeader = request.getHeader("Authorization");
        if (authHeader == null || !authHeader.toLowerCase().startsWith("bearer ")) {
            throw ApiException.unauthorized("Invalid or expired token");
        }
        Optional<Claims> claims = jwtService.parseClaims(authHeader.substring(7));
        if (claims.isEmpty()) {
            throw ApiException.unauthorized("Invalid or expired token");
        }

        Object accountCodeClaim = claims.get().get("account_code");
        boolean isPlatform = "platform".equals(claims.get().get("scope"));

        List<PlatformNotification> notifs;
        if (isPlatform) {
            notifs = platformNotificationRepository.findAll();
        } else if (accountCodeClaim != null && !"__platform__".equals(accountCodeClaim)) {
            SchoolAccount account = schoolAccountRepository.findByAccountCode(accountCodeClaim.toString()).orElse(null);
            if (account == null) {
                return List.of();
            }
            notifs = platformNotificationRepository.findAll().stream()
                    .filter(n -> account.getId().equals(n.getAccountId()) || n.getAccountId() == null)
                    .toList();
        } else {
            return List.of();
        }

        return notifs.stream()
                .sorted(Comparator.comparing(PlatformNotification::getCreatedAt, Comparator.nullsLast(Comparator.reverseOrder())))
                .limit(50)
                .map(this::notifToMap)
                .toList();
    }

    // ===================== helpers =====================

    private SchoolAccount requireAccount(Long accountId) {
        return schoolAccountRepository.findById(accountId).orElseThrow(() -> ApiException.notFound("School not found"));
    }

    private String titleCase(String key) {
        String[] words = key.replace("_", " ").split(" ");
        StringBuilder sb = new StringBuilder();
        for (String w : words) {
            if (w.isEmpty()) continue;
            if (sb.length() > 0) sb.append(" ");
            sb.append(Character.toUpperCase(w.charAt(0))).append(w.substring(1));
        }
        return sb.toString();
    }

    private Map<String, Object> tenantStats(String databaseUrl) {
        Map<String, Object> stats = new LinkedHashMap<>();
        String previousTenant = TenantContext.getTenant();
        try {
            long students = studentRepository.count();
            long users = userRepository.count();
            long teachers = teacherRepository.count();
            stats.put("students", students);
            stats.put("users", users);
            stats.put("teachers", teachers);
        } catch (Exception e) {
            stats.put("students", null);
            stats.put("users", null);
            stats.put("teachers", null);
        } finally {
            TenantContext.setTenant(previousTenant);
        }
        return stats;
    }

    private Map<String, Object> accountSummary(SchoolAccount account, boolean includeStats) {
        Map<String, Boolean> features = new LinkedHashMap<>();
        for (SchoolFeature feature : schoolFeatureRepository.findByAccountId(account.getId())) {
            features.put(feature.getFeatureKey(), feature.isEnabled());
        }

        Map<String, Object> data = new LinkedHashMap<>();
        data.put("id", account.getId());
        data.put("school_name", account.getSchoolName());
        data.put("account_code", account.getAccountCode());
        data.put("domain", account.getDomain());
        data.put("school_type", account.getSchoolType());
        data.put("curriculum", account.getCurriculum());
        data.put("country", account.getCountry());
        data.put("timezone", account.getTimezone());
        data.put("status", account.getStatus());
        data.put("created_at", account.getCreatedAt());
        data.put("features", features);
        data.put("features_enabled", features.values().stream().filter(Boolean::booleanValue).count());
        data.put("features_total", features.size());

        if (includeStats) {
            String previousTenant = TenantContext.getTenant();
            try {
                TenantContext.setTenant(account.getAccountCode());
                data.put("stats", tenantStats(account.getDatabaseUrl()));
            } finally {
                TenantContext.setTenant(previousTenant);
            }
        }

        SchoolSubscription activeSub = schoolSubscriptionRepository.findByAccountId(account.getId()).stream()
                .filter(s -> "Active".equals(s.getStatus()))
                .max(Comparator.comparing(SchoolSubscription::getStartDate, Comparator.nullsLast(Comparator.naturalOrder())))
                .orElse(null);

        if (activeSub != null) {
            SubscriptionPlan plan = subscriptionPlanRepository.findById(activeSub.getPlanId()).orElse(null);
            LocalDateTime now = LocalDateTime.now();
            Long daysLeft = activeSub.getExpiryDate() != null ? java.time.Duration.between(now, activeSub.getExpiryDate()).toDays() : null;

            Map<String, Object> subscription = new LinkedHashMap<>();
            subscription.put("plan_name", plan != null ? plan.getName() : null);
            subscription.put("billing_cycle", activeSub.getBillingCycle());
            subscription.put("amount_paid", activeSub.getAmountPaid());
            subscription.put("currency", activeSub.getCurrency());
            subscription.put("start_date", activeSub.getStartDate());
            subscription.put("expiry_date", activeSub.getExpiryDate());
            subscription.put("days_left", daysLeft);
            subscription.put("is_expired", daysLeft != null && daysLeft < 0);
            subscription.put("is_expiring_soon", daysLeft != null && daysLeft >= 0 && daysLeft <= 30);
            subscription.put("status", activeSub.getStatus());
            data.put("subscription", subscription);
        } else {
            data.put("subscription", null);
        }

        return data;
    }

    private Map<String, Object> planToMap(SubscriptionPlan plan) {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", plan.getId());
        body.put("name", plan.getName());
        body.put("price_monthly", plan.getPriceMonthly());
        body.put("price_yearly", plan.getPriceYearly());
        body.put("max_students", plan.getMaxStudents());
        body.put("max_users", plan.getMaxUsers());
        body.put("description", plan.getDescription());
        body.put("is_active", plan.isActive());
        return body;
    }

    private Map<String, Object> subToMap(SchoolSubscription sub) {
        SubscriptionPlan plan = subscriptionPlanRepository.findById(sub.getPlanId()).orElse(null);
        SchoolAccount account = schoolAccountRepository.findById(sub.getAccountId()).orElse(null);
        LocalDateTime now = LocalDateTime.now();
        Long daysLeft = sub.getExpiryDate() != null ? java.time.Duration.between(now, sub.getExpiryDate()).toDays() : null;

        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", sub.getId());
        body.put("account_id", sub.getAccountId());
        body.put("school_name", account != null ? account.getSchoolName() : null);
        body.put("plan_id", sub.getPlanId());
        body.put("plan_name", plan != null ? plan.getName() : null);
        body.put("billing_cycle", sub.getBillingCycle());
        body.put("amount_paid", sub.getAmountPaid());
        body.put("currency", sub.getCurrency());
        body.put("start_date", sub.getStartDate());
        body.put("expiry_date", sub.getExpiryDate());
        body.put("days_left", daysLeft);
        body.put("is_expired", daysLeft != null && daysLeft < 0);
        body.put("is_expiring_soon", daysLeft != null && daysLeft >= 0 && daysLeft <= 30);
        body.put("status", sub.getStatus());
        body.put("payment_reference", sub.getPaymentReference());
        body.put("remarks", sub.getRemarks());
        body.put("created_at", sub.getCreatedAt());
        return body;
    }

    private Map<String, Object> notifToMap(PlatformNotification notif) {
        String schoolName = null;
        if (notif.getAccountId() != null) {
            SchoolAccount account = schoolAccountRepository.findById(notif.getAccountId()).orElse(null);
            schoolName = account != null ? account.getSchoolName() : null;
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("id", notif.getId());
        body.put("account_id", notif.getAccountId());
        body.put("school_name", schoolName);
        body.put("title", notif.getTitle());
        body.put("message", notif.getMessage());
        body.put("notification_type", notif.getNotificationType());
        body.put("is_read", notif.isRead());
        body.put("created_at", notif.getCreatedAt());
        return body;
    }
}
