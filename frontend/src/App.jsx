import { useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Menu, PanelLeftClose } from "lucide-react";
import Sidebar from "./components/Sidebar";
import Topbar from "./components/Topbar";
import ProtectedRoute from "./components/ProtectedRoute";
import MasterData from "./pages/MasterData";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import Students from "./pages/Students";
import Teachers from "./pages/Teachers";
import Fees from "./pages/Fees";
import Attendance from "./pages/Attendance";
import Exams from "./pages/Exams";
import Classes from "./pages/Classes";
import Marks from "./pages/Marks";
import Reports from "./pages/Reports";
import Users from "./pages/Users";
import Settings from "./pages/Settings";
import { SettingsProvider } from "./SettingsContext";
// import StudentLayoutBuilder from "./pages/StudentLayoutBuilder";
import ModuleLayoutBuilder from "./pages/ModuleLayoutBuilder";
import StudentDetails from "./pages/StudentDetails";
import ClassDetails from "./pages/ClassDetails";
import Subjects from "./pages/Subjects";
import StudentEnrollments from "./pages/StudentEnrollments";
import Hostel from "./pages/Hostel";
import Transport from "./pages/Transport";
import HealthInfirmary from "./pages/HealthInfirmary";
import MessManagement from "./pages/MessManagement";
import Library from "./pages/Library";
import Inventory from "./pages/Inventory";
import Admissions from "./pages/Admissions";
import InternationalDocuments from "./pages/InternationalDocuments";
import MultiCurriculum from "./pages/MultiCurriculum";
import AdmissionAssessments from "./pages/AdmissionAssessments";
import Communications from "./pages/Communications";
import StudentServices from "./pages/StudentServices";
import AlumniWithdrawals from "./pages/AlumniWithdrawals";
import Counseling from "./pages/Counseling";
import Enrichment from "./pages/Enrichment";
import Compliance from "./pages/Compliance";
import ReportCard from "./pages/ReportCard";

function ProtectedLayout({ children }) {
  const [sidebarOpen, setSidebarOpen] = useState(true);

  return (
    <SettingsProvider>
      <div className="app-layout">
        <Topbar />

        <div className={sidebarOpen ? "app-body" : "app-body sidebar-hidden"}>
          <button
            type="button"
            className="sidebar-toggle-button"
            onClick={() => setSidebarOpen((prev) => !prev)}
            title={sidebarOpen ? "Hide sidebar" : "Show sidebar"}
          >
            {sidebarOpen ? <PanelLeftClose size={18} /> : <Menu size={18} />}
          </button>

          {sidebarOpen && <Sidebar />}

          <main className="main-area">
            <div className="page-content">{children}</div>
          </main>
        </div>
      </div>
    </SettingsProvider>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />

        <Route
          path="/"
          element={
            <ProtectedRoute
              allowedRoles={["Admin", "Principal", "Accounts", "Teacher"]}
            >
              <ProtectedLayout>
                <Dashboard />
              </ProtectedLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/students"
          element={
            <ProtectedRoute allowedRoles={["Admin", "Principal"]}>
              <ProtectedLayout>
                <Students />
              </ProtectedLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/teachers"
          element={
            <ProtectedRoute allowedRoles={["Admin", "Principal"]}>
              <ProtectedLayout>
                <Teachers />
              </ProtectedLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/classes"
          element={
            <ProtectedRoute allowedRoles={["Admin", "Principal"]}>
              <ProtectedLayout>
                <Classes />
              </ProtectedLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/attendance"
          element={
            <ProtectedRoute allowedRoles={["Admin", "Teacher"]}>
              <ProtectedLayout>
                <Attendance />
              </ProtectedLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/fees"
          element={
            <ProtectedRoute allowedRoles={["Admin", "Accounts"]}>
              <ProtectedLayout>
                <Fees />
              </ProtectedLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/exams"
          element={
            <ProtectedRoute allowedRoles={["Admin", "Principal", "Teacher"]}>
              <ProtectedLayout>
                <Exams />
              </ProtectedLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/marks"
          element={
            <ProtectedRoute allowedRoles={["Admin", "Principal", "Teacher"]}>
              <ProtectedLayout>
                <Marks />
              </ProtectedLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/reports"
          element={
            <ProtectedRoute allowedRoles={["Admin", "Principal", "Accounts"]}>
              <ProtectedLayout>
                <Reports />
              </ProtectedLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/report-card"
          element={
            <ProtectedRoute allowedRoles={["Admin", "Principal", "Teacher"]}>
              <ProtectedLayout>
                <ReportCard />
              </ProtectedLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/users"
          element={
            <ProtectedRoute allowedRoles={["Admin"]}>
              <ProtectedLayout>
                <Users />
              </ProtectedLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/settings"
          element={
            <ProtectedRoute allowedRoles={["Admin", "Principal"]}>
              <ProtectedLayout>
                <Settings />
              </ProtectedLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/master-data"
          element={
            <ProtectedRoute allowedRoles={["Admin"]}>
              <ProtectedLayout>
                <MasterData />
              </ProtectedLayout>
            </ProtectedRoute>
          }
        />
        {/* <Route
          path="/students/layout"
          element={
            <ProtectedRoute allowedRoles={["Admin"]}>
              <ProtectedLayout>
                <StudentLayoutBuilder />
              </ProtectedLayout>
            </ProtectedRoute>
          }
        /> */}
        <Route
          path="/:moduleName/layout"
          element={
            <ProtectedRoute allowedRoles={["Admin"]}>
              <ProtectedLayout>
                <ModuleLayoutBuilder />
              </ProtectedLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/students/:studentId"
          element={
            <ProtectedRoute allowedRoles={["Admin", "Principal", "Teacher"]}>
              <ProtectedLayout>
                <StudentDetails />
              </ProtectedLayout>
            </ProtectedRoute>
          }
        />

        <Route
          path="/classes/:classId"
          element={
            <ProtectedRoute allowedRoles={["Admin", "Principal", "Teacher"]}>
              <ProtectedLayout>
                <ClassDetails />
              </ProtectedLayout>
            </ProtectedRoute>
          }
        />
        <Route 
          path="/subjects" 
          element={
          <ProtectedRoute allowedRoles={["Admin", "Principal", "Teacher"]}>
              <ProtectedLayout>
                <Subjects />
              </ProtectedLayout>
            </ProtectedRoute>
          }
          />
        <Route
          path="/student-enrollments"
          element={
            <ProtectedRoute allowedRoles={["Admin", "Principal", "Teacher"]}>
              <ProtectedLayout>
                <StudentEnrollments />
              </ProtectedLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admissions"
          element={
            <ProtectedRoute allowedRoles={["Admin", "Principal"]}>
              <ProtectedLayout>
                <Admissions />
              </ProtectedLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/admission-assessments"
          element={
            <ProtectedRoute allowedRoles={["Admin", "Principal", "Teacher"]}>
              <ProtectedLayout>
                <AdmissionAssessments />
              </ProtectedLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/communications"
          element={
            <ProtectedRoute allowedRoles={["Admin", "Principal", "Teacher", "Accounts"]}>
              <ProtectedLayout>
                <Communications />
              </ProtectedLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/student-services"
          element={
            <ProtectedRoute allowedRoles={["Admin", "Principal", "Teacher", "Accounts"]}>
              <ProtectedLayout>
                <StudentServices />
              </ProtectedLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/alumni-withdrawals"
          element={
            <ProtectedRoute allowedRoles={["Admin", "Principal", "Teacher", "Accounts"]}>
              <ProtectedLayout>
                <AlumniWithdrawals />
              </ProtectedLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/counseling"
          element={
            <ProtectedRoute allowedRoles={["Admin", "Principal", "Teacher"]}>
              <ProtectedLayout>
                <Counseling />
              </ProtectedLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/enrichment"
          element={
            <ProtectedRoute allowedRoles={["Admin", "Principal", "Teacher", "Accounts"]}>
              <ProtectedLayout>
                <Enrichment />
              </ProtectedLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/compliance"
          element={
            <ProtectedRoute allowedRoles={["Admin", "Principal"]}>
              <ProtectedLayout>
                <Compliance />
              </ProtectedLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/international-documents"
          element={
            <ProtectedRoute allowedRoles={["Admin", "Principal", "Teacher"]}>
              <ProtectedLayout>
                <InternationalDocuments />
              </ProtectedLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/multi-curriculum"
          element={
            <ProtectedRoute allowedRoles={["Admin", "Principal", "Teacher"]}>
              <ProtectedLayout>
                <MultiCurriculum />
              </ProtectedLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/hostel"
          element={
            <ProtectedRoute allowedRoles={["Admin", "Principal"]}>
              <ProtectedLayout>
                <Hostel />
              </ProtectedLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/transport"
          element={
            <ProtectedRoute allowedRoles={["Admin", "Principal", "Accounts"]}>
              <ProtectedLayout>
                <Transport />
              </ProtectedLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/health-infirmary"
          element={
            <ProtectedRoute allowedRoles={["Admin", "Principal", "Teacher"]}>
              <ProtectedLayout>
                <HealthInfirmary />
              </ProtectedLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/mess"
          element={
            <ProtectedRoute allowedRoles={["Admin", "Principal", "Accounts", "Teacher"]}>
              <ProtectedLayout>
                <MessManagement />
              </ProtectedLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/library"
          element={
            <ProtectedRoute allowedRoles={["Admin", "Principal", "Teacher"]}>
              <ProtectedLayout>
                <Library />
              </ProtectedLayout>
            </ProtectedRoute>
          }
        />
        <Route
          path="/inventory"
          element={
            <ProtectedRoute allowedRoles={["Admin", "Principal", "Accounts", "Teacher"]}>
              <ProtectedLayout>
                <Inventory />
              </ProtectedLayout>
            </ProtectedRoute>
          }
        />
      </Routes>
    </BrowserRouter>
  );
}
