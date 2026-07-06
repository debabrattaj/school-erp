import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  Users,
  GraduationCap,
  BookOpen,
  ClipboardCheck,
  Wallet,
  FileText,
  BarChart3,
  UserCog,
  Settings,
  Database,
  Layers,
  Building2,
  Bus,
  HeartPulse,
  Utensils,
  Library,
  Boxes,
  UserPlus,
  FileCheck,
  CalendarCheck,
  MessageCircle,
  LifeBuoy,
  Archive,
  Award,
  ClipboardList,
  Search,
  Globe,
  ShieldCheck,
  LogOut
} from "lucide-react";
import { getUser, logout } from "../auth";
import API from "../api";
import { useI18n } from "../i18n";
import { LANGUAGES } from "../i18n/translations";


function studentSearchLabel(s) {
  const name =
    s.student_name ||
    s.name ||
    `${s.first_name || ""} ${s.last_name || ""}`.trim() ||
    "Unknown";
  return s.admission_no ? `${s.admission_no} — ${name}` : name;
}

export default function Sidebar({ onNavigate }) {
  const navigate = useNavigate();
  const { t, lang, setLang } = useI18n();
  const [user, setUser] = useState(getUser());
  const [studentQuery, setStudentQuery] = useState("");
  const [studentCache, setStudentCache] = useState(null);

  useEffect(() => {
    function refreshUser() {
      setUser(getUser());
    }

    window.addEventListener("school-erp-auth-updated", refreshUser);
    window.addEventListener("storage", refreshUser);

    return () => {
      window.removeEventListener("school-erp-auth-updated", refreshUser);
      window.removeEventListener("storage", refreshUser);
    };
  }, []);

  const menuItems = [
    {
      label: "Dashboard",
      icon: LayoutDashboard,
      path: "/",
      roles: ["Admin", "Principal", "Accounts", "Teacher"],
      feature: "dashboard",
    },
    {
      label: "Students",
      icon: Users,
      path: "/students",
      roles: ["Admin", "Principal"],
      feature: "students",
    },
    {
      label: "Teachers",
      icon: GraduationCap,
      path: "/teachers",
      roles: ["Admin", "Principal"],
      feature: "teachers",
    },
    {
      label: "Classes",
      icon: BookOpen,
      path: "/classes",
      roles: ["Admin", "Principal"],
      feature: "classes",
    },
    {
      label: "Attendance",
      icon: ClipboardCheck,
      path: "/attendance",
      roles: ["Admin", "Teacher"],
      feature: "attendance",
    },
    {
      label: "Fees",
      icon: Wallet,
      path: "/fees",
      roles: ["Admin", "Accounts"],
      feature: "fees",
    },
    {
      label: "Exams",
      icon: FileText,
      path: "/exams",
      roles: ["Admin", "Principal", "Teacher"],
      feature: "exams",
    },
    {
      label: "Timetable",
      icon: CalendarCheck,
      path: "/timetable",
      roles: ["Admin", "Principal", "Teacher"],
      feature: "timetable",
    },
    {
    label: "Marks",
    path: "/marks",
    icon: FileText,
    roles: ["Admin", "Principal", "Teacher"],
    feature: "marks",
  },
    {
      label: "Reports",
      icon: BarChart3,
      path: "/reports",
      roles: ["Admin", "Principal", "Accounts"],
      feature: "reports",
    },
    {
      label: "User Management",
      icon: UserCog,
      path: "/users",
      roles: ["Admin"],
      feature: "users",
    },
    {
      label: "Roles & Permissions",
      icon: ShieldCheck,
      path: "/roles",
      roles: ["Admin"],
      feature: "users",
    },
    {
        label: "Institution Settings",
        icon: Settings,
        path: "/settings",
        roles: ["Admin", "Principal"],
        feature: "settings",
    },
    {
      label: "Master Data",
      icon: Database,
      path: "/master-data",
      roles: ["Admin"],
      feature: "master_data",
    },
    {
      label: "Student Layout",
      icon: Layers,
      path: "/students/layout",
      roles: ["Admin"],
      feature: "student_layout",
    },
     {
      label: "Report Card",
      icon: Layers,
      path: "/report-card",
      roles: ["Admin", "Principal", "Teacher"],
      feature: "report_card",
    },
    {
      label: "My Portal",
      icon: Layers,
      path: "/portal",
      roles: ["Parent", "Student"],
      feature: "parent_portal",
    },
    {
      label: "Portal Access",
      icon: Layers,
      path: "/portal-access",
      roles: ["Admin", "Principal"],
      feature: "parent_portal",
    },
    {
      label: "Academic Years",
      icon: Layers,
      path: "/academic-years",
      roles: ["Admin", "Principal"],
      feature: "academic_years",
    },
    {
      label: "Student Enrollments",
      icon: Layers,
      path: "/student-enrollments",
      roles: ["Admin", "Principal", "Teacher"],
      feature: "student_enrollments",
    },
    {
      label: "Admissions CRM",
      icon: UserPlus,
      path: "/admissions",
      roles: ["Admin", "Principal"],
      feature: "admissions",
    },
    {
      label: "Admission Tests",
      icon: CalendarCheck,
      path: "/admission-assessments",
      roles: ["Admin", "Principal", "Teacher"],
      feature: "admission_assessments",
    },
    {
      label: "Communication",
      icon: MessageCircle,
      path: "/communications",
      roles: ["Admin", "Principal", "Teacher", "Accounts"],
      feature: "parent_communication",
    },
    {
      label: "Student Services",
      icon: LifeBuoy,
      path: "/student-services",
      roles: ["Admin", "Principal", "Teacher", "Accounts"],
      feature: "student_services",
    },
    {
      label: "Alumni & Exit",
      icon: Archive,
      path: "/alumni-withdrawals",
      roles: ["Admin", "Principal", "Teacher", "Accounts"],
      feature: "alumni_withdrawals",
    },
    {
      label: "Counseling",
      icon: HeartPulse,
      path: "/counseling",
      roles: ["Admin", "Principal", "Teacher"],
      feature: "counseling",
    },
    {
      label: "Enrichment",
      icon: Award,
      path: "/enrichment",
      roles: ["Admin", "Principal", "Teacher", "Accounts"],
      feature: "enrichment",
    },
    {
      label: "Compliance",
      icon: ClipboardList,
      path: "/compliance",
      roles: ["Admin", "Principal"],
      feature: "compliance",
    },
    {
      label: "Intl. Documents",
      icon: FileCheck,
      path: "/international-documents",
      roles: ["Admin", "Principal", "Teacher"],
      feature: "international_documents",
    },
    {
      label: "Multi Curriculum",
      icon: Layers,
      path: "/multi-curriculum",
      roles: ["Admin", "Principal", "Teacher"],
      feature: "multi_curriculum",
    },
    {
      label: "Hostel",
      icon: Building2,
      path: "/hostel",
      roles: ["Admin", "Principal"],
      feature: "hostel",
    },
    {
      label: "Transport",
      icon: Bus,
      path: "/transport",
      roles: ["Admin", "Principal", "Accounts"],
      feature: "transport",
    },
    {
      label: "Health Infirmary",
      icon: HeartPulse,
      path: "/health-infirmary",
      roles: ["Admin", "Principal", "Teacher"],
      feature: "health_infirmary",
    },
    {
      label: "Mess Management",
      icon: Utensils,
      path: "/mess",
      roles: ["Admin", "Principal", "Accounts", "Teacher"],
      feature: "mess_management",
    },
    {
      label: "Library",
      icon: Library,
      path: "/library",
      roles: ["Admin", "Principal", "Teacher"],
      feature: "library",
    },
    {
      label: "Inventory",
      icon: Boxes,
      path: "/inventory",
      roles: ["Admin", "Principal", "Accounts", "Teacher"],
      feature: "inventory",
    },
    {
      label: "Assistant",
      icon: Boxes,
      path: "/assistant",
      roles: ["Admin", "Principal", "Accounts", "Teacher"],
      feature: "assistant",
    },
  ];

  const perms = user?.permissions || {};
  const allowedMenuItems = menuItems.filter((item) => {
    const featureEnabled = !item.feature || user?.features?.[item.feature] !== false;
    // Built-in roles: keep role-list gating. Custom roles: gate by the role's
    // permission map (or "*" for full access).
    const byRole = item.roles.includes(user?.role);
    const byPerm = perms["*"] || (item.feature && perms[item.feature]);
    return featureEnabled && (byRole || byPerm);
  });

  function handleLogout() {
    logout();
    navigate("/login");
  }

  const canSearchStudents = ["Admin", "Principal"].includes(user?.role);
  const studentMatches = (() => {
    const q = studentQuery.trim().toLowerCase();
    if (!q || !studentCache) return [];
    return studentCache
      .filter((s) => studentSearchLabel(s).toLowerCase().includes(q))
      .slice(0, 8);
  })();

  async function ensureStudentCache() {
    if (studentCache !== null) return;
    try {
      const res = await API.get("/students/");
      setStudentCache(res.data || []);
    } catch {
      setStudentCache([]);
    }
  }

  function openStudent(id) {
    setStudentQuery("");
    navigate(`/students/${id}`);
    onNavigate?.();
  }

  return (
    <aside className="sidebar">
      {canSearchStudents && (
        <div className="sidebar-search">
          <div className="sidebar-search-box">
            <Search size={16} />
            <input
              type="text"
              placeholder={t("Find a student…")}
              value={studentQuery}
              onFocus={ensureStudentCache}
              onChange={(e) => { ensureStudentCache(); setStudentQuery(e.target.value); }}
              onKeyDown={(e) => { if (e.key === "Enter" && studentMatches[0]) openStudent(studentMatches[0].id); }}
            />
          </div>
          {studentQuery.trim() && (
            <div className="sidebar-search-results">
              {studentMatches.length === 0 ? (
                <div className="sidebar-search-empty">
                  {studentCache === null ? "Searching…" : "No matches"}
                </div>
              ) : (
                studentMatches.map((s) => (
                  <button key={s.id} type="button" onClick={() => openStudent(s.id)}>
                    {studentSearchLabel(s)}
                  </button>
                ))
              )}
            </div>
          )}
        </div>
      )}

      <nav className="sidebar-menu">
        {allowedMenuItems.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.label}
              to={item.path}
              onClick={onNavigate}
              className={({ isActive }) =>
                isActive ? "menu-item active" : "menu-item"
              }
            >
              <Icon size={18} />
              <span>{t(item.label)}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div>
          <p>{t("Logged in as")}</p>
          <strong>{user?.name || "User"}</strong>
          <span>{user?.role || "User"}</span>
        </div>

        <div className="sidebar-lang">
          <Globe size={14} />
          <select value={lang} onChange={(e) => setLang(e.target.value)} aria-label={t("Language")}>
            {LANGUAGES.map((l) => (
              <option key={l.code} value={l.code}>{l.label}</option>
            ))}
          </select>
        </div>

        <button type="button" onClick={handleLogout}>
          <LogOut size={15} />
          {t("Logout")}
        </button>
      </div>
    </aside>
  );
}
