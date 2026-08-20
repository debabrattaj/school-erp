import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Mail, School } from "lucide-react";
import API from "../api";
import { saveAuth } from "../auth";
import { useI18n } from "../i18n";

const BUILT_IN = ["Admin", "Principal", "Accounts", "Teacher"];
const FEATURE_PATHS = {
  dashboard: "/", students: "/students", teachers: "/teachers", classes: "/classes",
  attendance: "/attendance", fees: "/fees", exams: "/exams", marks: "/marks",
  timetable: "/timetable", admissions: "/admissions", parent_communication: "/communications",
  student_services: "/student-services", counseling: "/counseling", enrichment: "/enrichment",
  compliance: "/compliance", international_documents: "/international-documents",
  multi_curriculum: "/multi-curriculum", academic_years: "/academic-years", hostel: "/hostel",
  transport: "/transport", health_infirmary: "/health-infirmary", mess_management: "/mess",
  library: "/library", inventory: "/inventory", alumni_withdrawals: "/alumni-withdrawals",
  reports: "/reports", master_data: "/master-data", users: "/users", settings: "/settings",
};

// Demo quick-logins and credential prefill are a dev convenience only.
// import.meta.env.DEV is true under `vite dev` and false in production
// builds, so deployed sites never expose the seeded demo credentials.
const SHOW_DEMO_LOGINS = import.meta.env.DEV;

// Where to send the user after login.
function landingPath(role, permissions) {
  if (["Parent", "Student"].includes(role)) return "/portal";
  if (BUILT_IN.includes(role)) return "/";
  // Custom role: land on the first module they can access.
  const perms = permissions || {};
  if (perms["*"] || perms.dashboard) return "/";
  for (const key of Object.keys(perms)) {
    if (FEATURE_PATHS[key]) return FEATURE_PATHS[key];
  }
  return "/";
}

export default function Login() {
  const navigate = useNavigate();
  const { t } = useI18n();

  const [formData, setFormData] = useState({
    account_code: "default",
    email: SHOW_DEMO_LOGINS ? "admin@school.com" : "",
    password: SHOW_DEMO_LOGINS ? "admin123" : "",
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [mfaRequired, setMfaRequired] = useState(false);
  const [mfaCode, setMfaCode] = useState("");

  useEffect(() => {
    if (!message) return undefined;

    const timeoutId = window.setTimeout(() => {
      setMessage("");
    }, 2000);

    return () => window.clearTimeout(timeoutId);
  }, [message]);

  function handleChange(e) {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: value,
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage("");

    try {
      setLoading(true);

      const payload = { ...formData };
      if (mfaRequired && mfaCode) payload.mfa_code = mfaCode;

      const response = await API.post("/auth/login", payload);

      saveAuth(response.data.access_token, response.data.user);

      const loggedInUser = response?.data?.user;
      const role = loggedInUser?.role;
      navigate(landingPath(role, loggedInUser?.permissions));
    } catch (error) {
      console.error(error);

      const detail = error.response?.data?.detail;
      if (detail === "MFA_REQUIRED") {
        setMfaRequired(true);
        setMessage("Enter the 6-digit code from your authenticator app.");
      } else if (detail) {
        setMessage(detail);
      } else {
        setMessage("Unable to login.");
      }
    } finally {
      setLoading(false);
    }
  }

  function quickLogin(email, password, accountCode = "default") {
    setFormData({
      account_code: accountCode,
      email,
      password,
    });
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-brand">
          <div className="login-logo">
            <School size={34} />
          </div>

          <div>
            <h1>School ERP</h1>
            <p>Secure Management Portal</p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="login-form">
          <h2>{t("Sign in")}</h2>
          <p className="login-subtitle">
            {t("Login with your assigned school role.")}
          </p>

          {message && <div className="toast-notification">{message}</div>}

          <div className="login-field">
            <label>{t("School Account Code")}</label>
            <div className="login-input">
              <School size={18} />
              <input
                type="text"
                name="account_code"
                value={formData.account_code}
                onChange={handleChange}
                placeholder="default"
                required
              />
            </div>
          </div>

          <div className="login-field">
            <label>{t("Email Address")}</label>
            <div className="login-input">
              <Mail size={18} />
              <input
                type="email"
                name="email"
                value={formData.email}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          <div className="login-field">
            <label>{t("Password")}</label>
            <div className="login-input">
              <Lock size={18} />
              <input
                type="password"
                name="password"
                value={formData.password}
                onChange={handleChange}
                required
              />
            </div>
          </div>

          {mfaRequired && (
            <div className="login-field">
              <label>Authentication Code</label>
              <div className="login-input">
                <Lock size={18} />
                <input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="6-digit code"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, ""))}
                  autoFocus
                  required
                />
              </div>
            </div>
          )}

          <button className="login-button" type="submit" disabled={loading}>
            {loading ? "…" : mfaRequired ? "Verify & Sign in" : t("Login")}
          </button>

          <button
            type="button"
            className="login-forgot-link"
            onClick={() => navigate("/forgot-password")}
          >
            {t("Forgot password?")}
          </button>
        </form>

        {SHOW_DEMO_LOGINS && (
          <div className="demo-users">
            <h3>Demo Logins</h3>

            <button onClick={() => quickLogin("admin@school.com", "admin123")}>
              Admin
            </button>

            <button
              onClick={() =>
                quickLogin("principal@school.com", "principal123")
              }
            >
              Principal
            </button>

            <button
              onClick={() => quickLogin("accounts@school.com", "accounts123")}
            >
              Accounts
            </button>

            <button onClick={() => quickLogin("teacher@school.com", "teacher123")}>
              Teacher
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
