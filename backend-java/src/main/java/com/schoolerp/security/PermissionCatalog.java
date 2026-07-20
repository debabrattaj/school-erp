package com.schoolerp.security;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.Set;

/**
 * Custom roles & permissions catalog. Direct port of backend/app/permissions.py.
 *
 * System roles (Admin/Principal/Accounts/Teacher/Parent/Student) keep their
 * existing hardcoded access - requireRoles() authorizes them by name exactly
 * as before, so there is zero behaviour change for built-in roles.
 *
 * Custom roles created by a school are authorized purely by a permission map:
 *   { feature_key: "view" | "manage" }
 * "manage" implies "view". Access is checked by mapping the request path to a
 * feature and the HTTP method to an action.
 */
public final class PermissionCatalog {

    private PermissionCatalog() {}

    public static final Set<String> WRITE_METHODS = Set.of("POST", "PUT", "PATCH", "DELETE");

    /** Map a request path prefix to a feature key. Longest prefix wins. */
    public static final Map<String, String> PATH_FEATURE_MAP = new LinkedHashMap<>();
    static {
        PATH_FEATURE_MAP.put("/students", "students");
        PATH_FEATURE_MAP.put("/teachers", "teachers");
        PATH_FEATURE_MAP.put("/classes", "classes");
        PATH_FEATURE_MAP.put("/attendance", "attendance");
        PATH_FEATURE_MAP.put("/fees", "fees");
        PATH_FEATURE_MAP.put("/fee-structures", "fees");
        PATH_FEATURE_MAP.put("/accounting", "accounting");
        PATH_FEATURE_MAP.put("/exams", "exams");
        PATH_FEATURE_MAP.put("/exam-components", "exams");
        PATH_FEATURE_MAP.put("/marks", "marks");
        PATH_FEATURE_MAP.put("/timetable", "timetable");
        PATH_FEATURE_MAP.put("/admissions", "admissions");
        PATH_FEATURE_MAP.put("/admission-assessments", "admissions");
        PATH_FEATURE_MAP.put("/admission-workflow-stages", "admissions");
        PATH_FEATURE_MAP.put("/communications", "parent_communication");
        PATH_FEATURE_MAP.put("/student-services", "student_services");
        PATH_FEATURE_MAP.put("/counseling", "counseling");
        PATH_FEATURE_MAP.put("/enrichment", "enrichment");
        PATH_FEATURE_MAP.put("/compliance", "compliance");
        PATH_FEATURE_MAP.put("/international-documents", "international_documents");
        PATH_FEATURE_MAP.put("/multi-curriculum", "multi_curriculum");
        PATH_FEATURE_MAP.put("/academic-years", "academic_years");
        PATH_FEATURE_MAP.put("/hostel", "hostel");
        PATH_FEATURE_MAP.put("/transport", "transport");
        PATH_FEATURE_MAP.put("/health-infirmary", "health_infirmary");
        PATH_FEATURE_MAP.put("/mess", "mess_management");
        PATH_FEATURE_MAP.put("/library", "library");
        PATH_FEATURE_MAP.put("/inventory", "inventory");
        PATH_FEATURE_MAP.put("/alumni-withdrawals", "alumni_withdrawals");
        PATH_FEATURE_MAP.put("/master-data", "master_data");
        PATH_FEATURE_MAP.put("/module-custom-fields", "master_data");
        PATH_FEATURE_MAP.put("/module-layouts", "master_data");
        PATH_FEATURE_MAP.put("/users", "users");
        PATH_FEATURE_MAP.put("/settings", "settings");
        PATH_FEATURE_MAP.put("/dashboard", "dashboard");
    }

    /** Default permission maps for the built-in roles. */
    public static final Map<String, Map<String, String>> SYSTEM_ROLE_PERMISSIONS = new LinkedHashMap<>();
    static {
        Map<String, String> admin = new LinkedHashMap<>();
        admin.put("*", "manage");
        SYSTEM_ROLE_PERMISSIONS.put("Admin", admin);

        Map<String, String> principal = new LinkedHashMap<>();
        principal.put("dashboard", "view");
        principal.put("students", "manage");
        principal.put("teachers", "manage");
        principal.put("classes", "manage");
        principal.put("attendance", "manage");
        principal.put("exams", "manage");
        principal.put("marks", "manage");
        principal.put("timetable", "manage");
        principal.put("admissions", "manage");
        principal.put("parent_communication", "manage");
        principal.put("reports", "view");
        principal.put("settings", "manage");
        principal.put("academic_years", "manage");
        principal.put("student_services", "manage");
        principal.put("counseling", "manage");
        principal.put("enrichment", "manage");
        principal.put("compliance", "manage");
        principal.put("international_documents", "manage");
        principal.put("multi_curriculum", "manage");
        principal.put("hostel", "manage");
        principal.put("fees", "view");
        principal.put("accounting", "view");
        principal.put("alumni_withdrawals", "manage");
        principal.put("master_data", "view");
        SYSTEM_ROLE_PERMISSIONS.put("Principal", principal);

        Map<String, String> accounts = new LinkedHashMap<>();
        accounts.put("dashboard", "view");
        accounts.put("fees", "manage");
        accounts.put("accounting", "manage");
        accounts.put("inventory", "view");
        accounts.put("students", "view");
        accounts.put("parent_communication", "manage");
        accounts.put("transport", "manage");
        accounts.put("mess_management", "manage");
        accounts.put("reports", "view");
        accounts.put("student_services", "view");
        accounts.put("enrichment", "view");
        accounts.put("alumni_withdrawals", "view");
        SYSTEM_ROLE_PERMISSIONS.put("Accounts", accounts);

        Map<String, String> teacher = new LinkedHashMap<>();
        teacher.put("dashboard", "view");
        teacher.put("students", "view");
        teacher.put("classes", "view");
        teacher.put("attendance", "manage");
        teacher.put("marks", "manage");
        teacher.put("exams", "view");
        teacher.put("timetable", "view");
        teacher.put("parent_communication", "manage");
        teacher.put("admissions", "view");
        teacher.put("counseling", "manage");
        teacher.put("enrichment", "manage");
        teacher.put("library", "view");
        teacher.put("student_services", "manage");
        teacher.put("health_infirmary", "view");
        teacher.put("international_documents", "view");
        teacher.put("multi_curriculum", "view");
        teacher.put("compliance", "view");
        SYSTEM_ROLE_PERMISSIONS.put("Teacher", teacher);

        Map<String, String> parent = new LinkedHashMap<>();
        parent.put("portal", "view");
        SYSTEM_ROLE_PERMISSIONS.put("Parent", parent);

        Map<String, String> student = new LinkedHashMap<>();
        student.put("portal", "view");
        SYSTEM_ROLE_PERMISSIONS.put("Student", student);
    }

    /** Resolve the feature key a request path belongs to (longest prefix). */
    public static String featureForPath(String path) {
        String bestPrefix = null;
        String bestFeature = null;
        for (Map.Entry<String, String> entry : PATH_FEATURE_MAP.entrySet()) {
            String prefix = entry.getKey();
            if (path.equals(prefix) || path.startsWith(prefix + "/") || path.startsWith(prefix)) {
                if (bestPrefix == null || prefix.length() > bestPrefix.length()) {
                    bestPrefix = prefix;
                    bestFeature = entry.getValue();
                }
            }
        }
        return bestFeature;
    }

    public static String actionForMethod(String method) {
        return WRITE_METHODS.contains(method.toUpperCase()) ? "manage" : "view";
    }

    /** Does this permission map grant `action` on `feature`? */
    public static boolean permissionGrants(Map<String, String> permissions, String feature, String action) {
        if (permissions == null || permissions.isEmpty()) {
            return false;
        }
        if ("manage".equals(permissions.get("*"))) {
            return true;
        }
        String level = permissions.get(feature);
        if ("manage".equals(level)) {
            return true;
        }
        return "view".equals(level) && "view".equals(action);
    }
}
