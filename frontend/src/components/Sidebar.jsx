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
  LogOut
} from "lucide-react";
import { getUser, isFeatureEnabled, logout } from "../auth";


export default function Sidebar() {
  const navigate = useNavigate();
  const user = getUser();

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
      label: "Student Enrollments",
      icon: Layers,
      path: "/student-enrollments",
      roles: ["Admin", "Principal", "Teacher"],
      feature: "student_enrollments",
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
  ];

  const allowedMenuItems = menuItems.filter(
    (item) => item.roles.includes(user?.role) && isFeatureEnabled(item.feature)
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
