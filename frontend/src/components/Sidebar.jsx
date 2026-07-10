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
  Landmark,
  Bell,
  X,
  LogOut,
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
  const [notifications, setNotifications] = useState([]);
  const [showNotifications, setShowNotifications] = useState(false);

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

  useEffect(() => {
    async function loadNotifications() {
      try {
        const response = await API.get("/platform/my-notifications");
        setNotifications(response.data || []);
      } catch {
        // silently ignore — endpoint may not exist for older backends
      }
    }

    loadNotifications();
    const interval = setInterval(loadNotifications, 120000);
    return () => clearInterval(interval);
  }, []);

  // Order here also controls the order groups render in the sidebar.
  const GROUP_ORDER = [
    "Overview",
    "Academics",
    "Students",
    "Admissions",
    "Student Wellbeing",
    "People & Access",
    "Finance & Operations",
    "Communication & Portal",
    "Reports & Administration",
    "Tools",
  ];

  const menuItems = [
    {
      label: "Dashboard",
      icon: LayoutDashboard,
      path: "/",
      roles: ["Admin", "Principal", "Accounts", "Teacher"],
      feature: "dashboard",
      group: "Overview",
    },
    {
      label: "Classes",
      icon: BookOpen,
      path: "/classes",
      roles: ["Admin", "Principal"],
      feature: "classes",
      group: "Academics",
    },
    {
      label: "Attendance",
      icon: ClipboardCheck,
      path: "/attendance",
      roles: ["Admin", "Teacher"],
      feature: "attendance",
      group: "Academics",
    },
    {
      label: "Timetable",
      icon: CalendarCheck,
      path: "/timetable",
      roles: ["Admin", "Principal", "Teacher"],
      feature: "timetable",
      group: "Academics",
    },
    {
      label: "Exams",
      icon: FileText,
      path: "/exams",
      roles: ["Admin", "Principal", "Teacher"],
      feature: "exams",
      group: "Academics",
    },
    {
      label: "Marks",
      path: "/marks",
      icon: FileText,
      roles: ["Admin", "Principal", "Teacher"],
      feature: "marks",
      group: "Academics",
    },
    {
      label: "Report Card",
      icon: Layers,
      path: "/report-card",
      roles: ["Admin", "Principal", "Teacher"],
      feature: "report_card",
      group: "Academics",
    },
    {
      label: "Academic Years",
      icon: Layers,
      path: "/academic-years",
      roles: ["Admin", "Principal"],
      feature: "academic_years",
      group: "Academics",
    },
    {
      label: "Multi Curriculum",
      icon: Layers,
      path: "/multi-curriculum",
      roles: ["Admin", "Principal", "Teacher"],
      feature: "multi_curriculum",
      group: "Academics",
    },
    {
      label: "Students",
      icon: Users,
      path: "/students",
      roles: ["Admin", "Principal"],
      feature: "students",
      group: "Students",
    },
    {
      label: "Student Enrollments",
      icon: Layers,
      path: "/student-enrollments",
      roles: ["Admin", "Principal", "Teacher"],
      feature: "student_enrollments",
      group: "Students",
    },
    {
      label: "Student Layout",
      icon: Layers,
      path: "/students/layout",
      roles: ["Admin"],
      feature: "student_layout",
      group: "Students",
    },
    {
      label: "Admissions CRM",
      icon: UserPlus,
      path: "/admissions",
      roles: ["Admin", "Principal"],
      feature: "admissions",
      group: "Admissions",
    },
    {
      label: "Admission Tests",
      icon: CalendarCheck,
      path: "/admission-assessments",
      roles: ["Admin", "Principal", "Teacher"],
      feature: "admission_assessments",
      group: "Admissions",
    },
    {
      label: "Alumni & Exit",
      icon: Archive,
      path: "/alumni-withdrawals",
      roles: ["Admin", "Principal", "Teacher", "Accounts"],
      feature: "alumni_withdrawals",
      group: "Admissions",
    },
    {
      label: "Intl. Documents",
      icon: FileCheck,
      path: "/international-documents",
      roles: ["Admin", "Principal", "Teacher"],
      feature: "international_documents",
      group: "Admissions",
    },
    {
      label: "Student Services",
      icon: LifeBuoy,
      path: "/student-services",
      roles: ["Admin", "Principal", "Teacher", "Accounts"],
      feature: "student_services",
      group: "Student Wellbeing",
    },
    {
      label: "Counseling",
      icon: HeartPulse,
      path: "/counseling",
      roles: ["Admin", "Principal", "Teacher"],
      feature: "counseling",
      group: "Student Wellbeing",
    },
    {
      label: "Health Infirmary",
      icon: HeartPulse,
      path: "/health-infirmary",
      roles: ["Admin", "Principal", "Teacher"],
      feature: "health_infirmary",
      group: "Student Wellbeing",
    },
    {
      label: "Enrichment",
      icon: Award,
      path: "/enrichment",
      roles: ["Admin", "Principal", "Teacher", "Accounts"],
      feature: "enrichment",
      group: "Student Wellbeing",
    },
    {
      label: "Compliance",
      icon: ClipboardList,
      path: "/compliance",
      roles: ["Admin", "Principal"],
      feature: "compliance",
      group: "Student Wellbeing",
    },
    {
      label: "Teachers",
      icon: GraduationCap,
      path: "/teachers",
      roles: ["Admin", "Principal"],
      feature: "teachers",
      group: "People & Access",
    },
    {
      label: "User Management",
      icon: UserCog,
      path: "/users",
      roles: ["Admin"],
      feature: "users",
      group: "People & Access",
    },
    {
      label: "Roles & Permissions",
      icon: ShieldCheck,
      path: "/roles",
      roles: ["Admin"],
      feature: "users",
      group: "People & Access",
    },
    {
      label: "Fees",
      icon: Wallet,
      path: "/fees",
      roles: ["Admin", "Accounts"],
      feature: "fees",
      group: "Finance & Operations",
    },
    {
      label: "Accounts",
      icon: Landmark,
      path: "/accounting",
      roles: ["Admin", "Principal", "Accounts"],
      feature: "accounting",
      group: "Finance & Operations",
    },
    {
      label: "Hostel",
      icon: Building2,
      path: "/hostel",
      roles: ["Admin", "Principal"],
      feature: "hostel",
      group: "Finance & Operations",
    },
    {
      label: "Transport",
      icon: Bus,
      path: "/transport",
      roles: ["Admin", "Principal", "Accounts"],
      feature: "transport",
      group: "Finance & Operations",
    },
    {
      label: "Mess Management",
      icon: Utensils,
      path: "/mess",
      roles: ["Admin", "Principal", "Accounts", "Teacher"],
      feature: "mess_management",
      group: "Finance & Operations",
    },
    {
      label: "Library",
      icon: Library,
      path: "/library",
      roles: ["Admin", "Principal", "Teacher"],
      feature: "library",
      group: "Finance & Operations",
    },
    {
      label: "Inventory",
      icon: Boxes,
      path: "/inventory",
      roles: ["Admin", "Principal", "Accounts", "Teacher"],
      feature: "inventory",
      group: "Finance & Operations",
    },
    {
      label: "My Portal",
      icon: Layers,
      path: "/portal",
      roles: ["Parent", "Student"],
      feature: "parent_portal",
      group: "Communication & Portal",
    },
    {
      label: "Portal Access",
      icon: Layers,
      path: "/portal-access",
      roles: ["Admin", "Principal"],
      feature: "parent_portal",
      group: "Communication & Portal",
    },
    {
      label: "Communication",
      icon: MessageCircle,
      path: "/communications",
      roles: ["Admin", "Principal", "Teacher", "Accounts"],
      feature: "parent_communication",
      group: "Communication & Portal",
    },
    {
      label: "Reports",
      icon: BarChart3,
      path: "/reports",
      roles: ["Admin", "Principal", "Accounts"],
      feature: "reports",
      group: "Reports & Administration",
    },
    {
      label: "Institution Settings",
      icon: Settings,
      path: "/settings",
      roles: ["Admin", "Principal"],
      feature: "settings",
      group: "Reports & Administration",
    },
    {
      label: "Master Data",
      icon: Database,
      path: "/master-data",
      roles: ["Admin"],
      feature: "master_data",
      group: "Reports & Administration",
    },
    {
      label: "Assistant",
      icon: Boxes,
      path: "/assistant",
      roles: ["Admin", "Principal", "Accounts", "Teacher"],
      feature: "assistant",
      group: "Tools",
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

  const menuGroups = GROUP_ORDER.map((group) => ({
    group,
    items: allowedMenuItems.filter((item) => item.group === group),
  })).filter((g) => g.items.length > 0);

  function handleLogout() {
    logout();
    navigate("/login");
  }

  const unreadCount = notifications.filter((n) => !n.is_read).length;

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
        {menuGroups.map(({ group, items }) => (
          <div className="menu-group" key={group}>
            <div className="menu-group-label">{t(group)}</div>
            {items.map((item) => {
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
          </div>
        ))}
      </nav>

      <div className="sidebar-footer">
        <div className="sidebar-identity">
          <div>
            <p>{t("Logged in as")}</p>
            <strong>{user?.name || "User"}</strong>
            <span>{user?.role || "User"}</span>
          </div>

          <div>
            <button
              type="button"
              className="sidebar-notify-button"
              onClick={() => setShowNotifications((prev) => !prev)}
              aria-label={t("Notifications")}
            >
              <Bell size={16} />
              {unreadCount > 0 && (
                <div className="sidebar-notify-badge">{unreadCount}</div>
              )}
            </button>

            {showNotifications && (
              <div className="sidebar-notify-panel">
                <div className="sidebar-notify-panel-header">
                  <div className="sidebar-notify-panel-title">{t("Notifications")}</div>
                  <button type="button" className="sidebar-notify-close" onClick={() => setShowNotifications(false)}>
                    <X size={16} />
                  </button>
                </div>
                {notifications.length === 0 ? (
                  <div className="sidebar-notify-empty">{t("No notifications")}</div>
                ) : (
                  notifications.slice(0, 20).map((n) => (
                    <div key={n.id} className={`sidebar-notify-item sidebar-notify-item-${n.notification_type || "info"}`}>
                      <div className="sidebar-notify-item-top">
                        <div className="sidebar-notify-item-title">{n.title}</div>
                        <div className="sidebar-notify-item-date">{n.created_at?.slice(0, 10)}</div>
                      </div>
                      <div className="sidebar-notify-item-message">{n.message}</div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
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
