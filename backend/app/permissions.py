"""Custom roles & permissions.

System roles (Admin/Principal/Accounts/Teacher/Parent/Student) keep their
existing hardcoded access — require_roles() authorizes them by name exactly as
before, so there is zero behaviour change for built-in roles.

Custom roles created by a school are authorized purely by a permission map:
  { feature_key: "view" | "manage" }
"manage" implies "view". Access is checked by mapping the request path to a
feature and the HTTP method to an action.
"""

# Grantable modules (feature keys) shown in the role editor.
MODULES = [
    ("dashboard", "Dashboard"),
    ("students", "Students"),
    ("teachers", "Teachers"),
    ("classes", "Classes"),
    ("attendance", "Attendance"),
    ("fees", "Fees"),
    ("exams", "Exams"),
    ("marks", "Marks"),
    ("timetable", "Timetable"),
    ("admissions", "Admissions"),
    ("parent_communication", "Communication"),
    ("student_services", "Student Services"),
    ("counseling", "Counseling"),
    ("enrichment", "Enrichment"),
    ("compliance", "Compliance"),
    ("international_documents", "International Documents"),
    ("multi_curriculum", "Multi-Curriculum"),
    ("academic_years", "Academic Years"),
    ("hostel", "Hostel"),
    ("transport", "Transport"),
    ("health_infirmary", "Health Infirmary"),
    ("mess_management", "Mess Management"),
    ("library", "Library"),
    ("inventory", "Inventory"),
    ("alumni_withdrawals", "Alumni & Exit"),
    ("reports", "Reports"),
    ("master_data", "Master Data"),
    ("users", "User Management"),
    ("settings", "Settings"),
]
MODULE_KEYS = {key for key, _ in MODULES}

# Map a request path prefix to a feature key. Longest prefix wins.
PATH_FEATURE_MAP = {
    "/students": "students",
    "/teachers": "teachers",
    "/classes": "classes",
    "/attendance": "attendance",
    "/fees": "fees",
    "/fee-structures": "fees",
    "/exams": "exams",
    "/exam-components": "exams",
    "/marks": "marks",
    "/timetable": "timetable",
    "/admissions": "admissions",
    "/admission-assessments": "admissions",
    "/admission-workflow-stages": "admissions",
    "/communications": "parent_communication",
    "/student-services": "student_services",
    "/counseling": "counseling",
    "/enrichment": "enrichment",
    "/compliance": "compliance",
    "/international-documents": "international_documents",
    "/multi-curriculum": "multi_curriculum",
    "/academic-years": "academic_years",
    "/hostel": "hostel",
    "/transport": "transport",
    "/health-infirmary": "health_infirmary",
    "/mess": "mess_management",
    "/library": "library",
    "/inventory": "inventory",
    "/alumni-withdrawals": "alumni_withdrawals",
    "/master-data": "master_data",
    "/module-custom-fields": "master_data",
    "/module-layouts": "master_data",
    "/users": "users",
    "/settings": "settings",
    "/dashboard": "dashboard",
}

WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}

# Default permission maps for the built-in roles (used for the roles UI and to
# drive custom-aware frontend navigation; enforcement for system roles still
# uses the legacy name check).
SYSTEM_ROLE_PERMISSIONS = {
    "Admin": {"*": "manage"},
    "Principal": {
        "dashboard": "view", "students": "manage", "teachers": "manage",
        "classes": "manage", "attendance": "manage", "exams": "manage",
        "marks": "manage", "timetable": "manage", "admissions": "manage",
        "parent_communication": "manage", "reports": "view", "settings": "manage",
        "academic_years": "manage", "student_services": "manage",
        "counseling": "manage", "enrichment": "manage", "compliance": "manage",
        "international_documents": "manage", "multi_curriculum": "manage",
        "hostel": "manage", "fees": "view", "alumni_withdrawals": "manage",
        "master_data": "view",
    },
    "Accounts": {
        "dashboard": "view", "fees": "manage", "students": "view",
        "parent_communication": "manage", "transport": "manage",
        "mess_management": "manage", "reports": "view",
        "student_services": "view", "enrichment": "view",
        "alumni_withdrawals": "view",
    },
    "Teacher": {
        "dashboard": "view", "students": "view", "classes": "view",
        "attendance": "manage", "marks": "manage", "exams": "view",
        "timetable": "view", "parent_communication": "manage", "admissions": "view",
        "counseling": "manage", "enrichment": "manage", "library": "view",
        "student_services": "manage", "health_infirmary": "view",
        "international_documents": "view", "multi_curriculum": "view",
        "compliance": "view",
    },
    "Parent": {"portal": "view"},
    "Student": {"portal": "view"},
}


def feature_for_path(path: str):
    """Resolve the feature key a request path belongs to (longest prefix)."""
    best = None
    for prefix, feature in PATH_FEATURE_MAP.items():
        if path == prefix or path.startswith(prefix + "/") or path.startswith(prefix):
            if best is None or len(prefix) > len(best[0]):
                best = (prefix, feature)
    return best[1] if best else None


def action_for_method(method: str) -> str:
    return "manage" if method.upper() in WRITE_METHODS else "view"


def permission_grants(permissions: dict, feature: str, action: str) -> bool:
    """Does this permission map grant `action` on `feature`?"""
    if not permissions:
        return False
    if permissions.get("*") == "manage":
        return True
    level = permissions.get(feature)
    if level == "manage":
        return True
    if level == "view" and action == "view":
        return True
    return False
