// Translations keyed by the English string, so any untranslated key falls back
// to English automatically. Add languages and fill in keys incrementally.

export const LANGUAGES = [
  { code: "en", label: "English" },
  { code: "fr", label: "Français" },
  { code: "ar", label: "العربية" },
];

// Right-to-left languages (used to set dir="rtl").
export const RTL_LANGUAGES = ["ar"];

export const translations = {
  en: {},

  fr: {
    // Auth
    "Sign in": "Se connecter",
    "Login with your assigned school role.": "Connectez-vous avec votre rôle scolaire.",
    "School Account Code": "Code du compte scolaire",
    "Email Address": "Adresse e-mail",
    "Password": "Mot de passe",
    "Login": "Connexion",
    "Forgot password?": "Mot de passe oublié ?",
    // Nav
    "Dashboard": "Tableau de bord",
    "Students": "Élèves",
    "Teachers": "Enseignants",
    "Classes": "Classes",
    "Attendance": "Présence",
    "Fees": "Frais",
    "Exams": "Examens",
    "Timetable": "Emploi du temps",
    "Marks": "Notes",
    "Reports": "Rapports",
    "Settings": "Paramètres",
    "Communication": "Communication",
    // Common
    "Logged in as": "Connecté en tant que",
    "Logout": "Déconnexion",
    "Language": "Langue",
    "Find a student…": "Rechercher un élève…",
    // Page headings
    "Student Management": "Gestion des élèves",
    "Teacher Management": "Gestion des enseignants",
    "Attendance Management": "Gestion des présences",
    "Exam Management": "Gestion des examens",
    "Fees Management": "Gestion des frais",
    "Reports Center": "Centre de rapports",
  },

  ar: {
    "Sign in": "تسجيل الدخول",
    "Login with your assigned school role.": "سجّل الدخول بدور المدرسة المخصص لك.",
    "School Account Code": "رمز حساب المدرسة",
    "Email Address": "البريد الإلكتروني",
    "Password": "كلمة المرور",
    "Login": "دخول",
    "Forgot password?": "هل نسيت كلمة المرور؟",
    "Dashboard": "لوحة التحكم",
    "Students": "الطلاب",
    "Teachers": "المعلمون",
    "Classes": "الفصول",
    "Attendance": "الحضور",
    "Fees": "الرسوم",
    "Exams": "الامتحانات",
    "Timetable": "الجدول الزمني",
    "Marks": "الدرجات",
    "Reports": "التقارير",
    "Settings": "الإعدادات",
    "Communication": "التواصل",
    "Logged in as": "تم تسجيل الدخول كـ",
    "Logout": "تسجيل الخروج",
    "Language": "اللغة",
    "Find a student…": "ابحث عن طالب…",
    "Student Management": "إدارة الطلاب",
    "Teacher Management": "إدارة المعلمين",
    "Attendance Management": "إدارة الحضور",
    "Exam Management": "إدارة الامتحانات",
    "Fees Management": "إدارة الرسوم",
    "Reports Center": "مركز التقارير",
  },
};
