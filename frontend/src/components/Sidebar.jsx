import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
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
  ShieldCheck,
  Landmark,
  ChevronDown,
} from "lucide-react";
import { getUser } from "../auth";
import { useI18n } from "../i18n";


export default function Sidebar({ onNavigate }) {
  const location = useLocation();
  const { t } = useI18n();
  const [user, setUser] = useState(getUser());
  const [expandedGroups, setExpandedGroups] = useState(null);

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

  // Order here also controls the order groups render in the sidebar.
  const GROUP_ORDER = [
    "Overview",
    "Finance & Operations",
    "Academics",
    "Students",
    "Admissions",
    "Student Wellbeing",
    "Communication & Portal",
    "People & Access",
    "Reports & Administration",
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

  function isItemActive(item) {
    return item.path === "/"
      ? location.pathname === "/"
      : location.pathname === item.path || location.pathname.startsWith(`${item.path}/`);
  }

  useEffect(() => {
    const activeGroup = menuGroups.find(({ items }) => items.some(isItemActive));

    if (activeGroup) {
      setExpandedGroups((prev) => new Set(prev).add(activeGroup.group));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.pathname]);

  function toggleGroup(group) {
    setExpandedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(group)) {
        next.delete(group);
      } else {
        next.add(group);
      }
      return next;
    });
  }

  return (
    <aside className="sidebar">
      <nav className="sidebar-menu">
        {menuGroups.map(({ group, items }) => {
          const isExpanded = expandedGroups?.has(group);
          const hasActiveItem = items.some(isItemActive);

          return (
            <div className="menu-group" key={group}>
              <button
                type="button"
                className={
                  hasActiveItem
                    ? "menu-group-label menu-group-toggle has-active"
                    : "menu-group-label menu-group-toggle"
                }
                onClick={() => toggleGroup(group)}
                aria-expanded={isExpanded}
              >
                <span>{t(group)}</span>
                <ChevronDown
                  size={14}
                  className={isExpanded ? "menu-group-chevron open" : "menu-group-chevron"}
                />
              </button>

              {isExpanded && items.map((item) => {
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
          );
        })}
      </nav>

    </aside>
  );
}
