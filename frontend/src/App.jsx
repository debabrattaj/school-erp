import { BrowserRouter, Routes, Route } from "react-router-dom";
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

function ProtectedLayout({ children }) {
  return (
    <SettingsProvider>
      <div className="app-layout">
        <Sidebar />

        <main className="main-area">
          <Topbar />

          <div className="page-content">{children}</div>
        </main>
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
      </Routes>
    </BrowserRouter>
  );
}