import { useLocation, matchPath } from "react-router-dom";
import { usePageTitle } from "../utils/usePageTitle";

// Static title per route. Routes with a dynamic segment that a page can
// describe better than a generic label (e.g. a student's name) set their own
// title with usePageTitle() from inside the page instead -- that call runs
// after this one and simply overrides it once the page has data.
const ROUTE_TITLES = [
  { path: "/", title: "Dashboard" },
  { path: "/login", title: "Log In" },
  { path: "/forgot-password", title: "Forgot Password" },
  { path: "/reset-password", title: "Reset Password" },
  { path: "/apply", title: "Apply Online" },
  { path: "/platform-login", title: "Platform Log In" },
  { path: "/platform", title: "Platform Console" },
  { path: "/profile", title: "My Profile" },
  { path: "/students", title: "Students" },
  { path: "/students/:studentId", title: "Student Details" },
  { path: "/teachers", title: "Teachers" },
  { path: "/classes", title: "Classes" },
  { path: "/classes/:classId", title: "Class Details" },
  { path: "/attendance", title: "Attendance" },
  { path: "/fees", title: "Fees" },
  { path: "/accounting", title: "Accounts" },
  { path: "/payroll", title: "Payroll" },
  { path: "/homework", title: "Homework" },
  { path: "/lms", title: "Learning Resources" },
  { path: "/online-tests", title: "Online Tests" },
  { path: "/biometric", title: "Biometric" },
  { path: "/exams", title: "Exams" },
  { path: "/timetable", title: "Timetable" },
  { path: "/marks", title: "Marks" },
  { path: "/reports", title: "Reports" },
  { path: "/report-card", title: "Report Cards" },
  { path: "/users", title: "Users" },
  { path: "/roles", title: "Roles" },
  { path: "/settings", title: "Settings" },
  { path: "/master-data", title: "Master Data" },
  { path: "/subjects", title: "Subjects" },
  { path: "/assistant", title: "Sai Assistant" },
  { path: "/portal", title: "Parent & Student Portal" },
  { path: "/portal-access", title: "Portal Access" },
  { path: "/academic-years", title: "Academic Years" },
  { path: "/student-enrollments", title: "Student Enrollments" },
  { path: "/admissions", title: "Admissions" },
  { path: "/admission-assessments", title: "Admission Assessments" },
  { path: "/communications", title: "Communications" },
  { path: "/student-services", title: "Student Services" },
  { path: "/alumni-withdrawals", title: "Alumni & Withdrawals" },
  { path: "/counseling", title: "Counseling" },
  { path: "/enrichment", title: "Enrichment" },
  { path: "/compliance", title: "Compliance" },
  { path: "/international-documents", title: "International Documents" },
  { path: "/multi-curriculum", title: "Multi-Curriculum" },
  { path: "/hostel", title: "Hostel" },
  { path: "/transport", title: "Transport" },
  { path: "/leave", title: "Leave" },
  { path: "/gate", title: "Gate" },
  { path: "/syllabus", title: "Syllabus" },
  { path: "/health-infirmary", title: "Health & Infirmary" },
  { path: "/mess", title: "Mess Management" },
  { path: "/library", title: "Library" },
  { path: "/inventory", title: "Inventory" },
  { path: "/:moduleName/layout", dynamic: (params) => `${prettifyModuleName(params.moduleName)} Layout` },
];

function prettifyModuleName(moduleName) {
  if (!moduleName) return "Module";
  return moduleName
    .split("-")
    .filter(Boolean)
    .map((word) => word[0].toUpperCase() + word.slice(1))
    .join(" ");
}

function resolveTitle(pathname) {
  for (const entry of ROUTE_TITLES) {
    const match = matchPath({ path: entry.path, end: true }, pathname);
    if (!match) continue;
    return entry.dynamic ? entry.dynamic(match.params) : entry.title;
  }
  return null;
}

// Renders nothing -- just keeps the browser tab title in sync with the
// current route. Mount once, near the top of the router tree.
export default function RouteTitle() {
  const location = useLocation();
  usePageTitle(resolveTitle(location.pathname));
  return null;
}
