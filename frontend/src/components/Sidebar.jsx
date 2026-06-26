import { NavLink } from "react-router-dom";
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
  Layers
} from "lucide-react";
import { getUser } from "../auth";
import { useSchoolSettings } from "../SettingsContext";

export default function Sidebar() {
  const user = getUser();

  console.log("Logged in user from Sidebar:", user);
  const { settings } = useSchoolSettings();
  const menuItems = [
    {
      label: "Dashboard",
      icon: LayoutDashboard,
      path: "/",
      roles: ["Admin", "Principal", "Accounts", "Teacher"],
    },
    {
      label: "Students",
      icon: Users,
      path: "/students",
      roles: ["Admin", "Principal"],
    },
    {
      label: "Teachers",
      icon: GraduationCap,
      path: "/teachers",
      roles: ["Admin", "Principal"],
    },
    {
      label: "Classes",
      icon: BookOpen,
      path: "/classes",
      roles: ["Admin", "Principal"],
    },
    {
      label: "Attendance",
      icon: ClipboardCheck,
      path: "/attendance",
      roles: ["Admin", "Teacher"],
    },
    {
      label: "Fees",
      icon: Wallet,
      path: "/fees",
      roles: ["Admin", "Accounts"],
    },
    {
      label: "Exams",
      icon: FileText,
      path: "/exams",
      roles: ["Admin", "Principal", "Teacher"],
    },
    {
    label: "Marks",
    path: "/marks",
    icon: FileText,
    roles: ["Admin", "Principal", "Teacher"],
  },
    {
      label: "Reports",
      icon: BarChart3,
      path: "/reports",
      roles: ["Admin", "Principal", "Accounts"],
    },
    {
      label: "User Management",
      icon: UserCog,
      path: "/users",
      roles: ["Admin"],
    },
    {
        label: "Institution Settings",
        icon: Settings,
        path: "/settings",
        roles: ["Admin", "Principal"],
    },
    {
      label: "Master Data",
      icon: Database,
      path: "/master-data",
      roles: ["Admin"],
    },
    {
      label: "Student Layout",
      icon: Layers,
      path: "/students/layout",
      roles: ["Admin"],
    },
  ];

  const allowedMenuItems = menuItems.filter((item) =>
    item.roles.includes(user?.role)
  );

  return (
    <aside className="sidebar">
      <div className="school-brand">
        <div className="school-logo">
            {(settings?.school_name || "S").charAt(0).toUpperCase()}
        </div>
        <div>
          <h2>{settings?.school_name || "School ERP"}</h2>
          <p>Management Portal</p>
        </div>
      </div>

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

      {/* <div className="sidebar-footer">
        <p>Logged in as</p>
        <strong>{user?.name || "User"}</strong>
      </div> */}
    </aside>
  );
}