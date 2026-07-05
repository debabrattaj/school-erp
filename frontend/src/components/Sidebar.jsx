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
  LogOut
} from "lucide-react";
import { getUser, logout } from "../auth";


export default function Sidebar() {
  const navigate = useNavigate();
  const [user, setUser] = useState(getUser());

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

  const allowedMenuItems = menuItems.filter(
    (item) =>
      item.roles.includes(user?.role) &&
      (!item.feature || user?.features?.[item.feature] !== false)
  );

  function handleLogout() {
    logout();
    navigate("/login");
  }

  return (
    <aside className="sidebar">
      <nav className="sidebar-menu">
        {allowedMenuItems.map((item) => {
          const Icon = item.icon;

          return (
            <NavLink
              key={item.label}
              to={item.path}
              className={({ isActive }) =>
                isActive ? "menu-item active" : "menu-item"
              }
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      <div className="sidebar-footer">
        <div>
          <p>Logged in as</p>
          <strong>{user?.name || "User"}</strong>
          <span>{user?.role || "User"}</span>
        </div>

        <button type="button" onClick={handleLogout}>
          <LogOut size={15} />
          Logout
        </button>
      </div>
    </aside>
  );
}
