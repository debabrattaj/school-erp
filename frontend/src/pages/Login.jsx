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

// Flat-style illustration of two students -- deliberately not a real photo:
// stock/AI photos of children carry likeness and consent problems a drawn
// illustration doesn't. Self-contained inline SVG, no external asset.
function SchoolChildrenIllustration() {
  return (
    <svg viewBox="0 0 420 420" role="img" aria-label="Illustration of a girl and boy student">
      <circle cx="210" cy="206" r="188" fill="#e7edfb" />
      <ellipse cx="210" cy="372" rx="140" ry="16" fill="#0f172a" opacity="0.08" />

      {/* floating school motifs */}
      <g opacity="0.9">
        <rect x="52" y="88" width="30" height="22" rx="4" fill="#fbbf24" />
        <rect x="52" y="88" width="30" height="7" rx="3" fill="#f59e0b" />
        <circle cx="352" cy="98" r="14" fill="#ef4444" />
        <path d="M352 84c2-5 7-7 10-6" stroke="#15803d" strokeWidth="3" fill="none" strokeLinecap="round" />
        <path d="M351 86v-4" stroke="#78350f" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M300 58 340 72 300 86 260 72Z" fill="#818cf8" />
        <path d="M280 76v14c0 5 9 10 20 10s20-5 20-10V76" stroke="#6366f1" strokeWidth="2.5" fill="none" strokeLinecap="round" />
      </g>

      {/* girl */}
      <g transform="translate(112,150)">
        <path d="M-46 190c0-46 22-78 60-78h6c38 0 60 32 60 78Z" fill="#f472b6" />
        <rect x="-16" y="70" width="52" height="46" rx="10" fill="#ec4899" />
        <circle cx="10" cy="46" r="40" fill="#c98a5e" />
        <path d="M-30 30c0-30 20-50 40-50s40 20 40 50c0-6-6-10-12-8-6-14-20-22-28-22s-22 8-28 22c-6-2-12 2-12 8Z" fill="#3b2314" />
        <circle cx="-24" cy="52" r="12" fill="#3b2314" />
        <circle cx="44" cy="52" r="12" fill="#3b2314" />
        <circle cx="-4" cy="46" r="3.4" fill="#2b1a10" />
        <circle cx="24" cy="46" r="3.4" fill="#2b1a10" />
        <path d="M2 60q8 7 16 0" stroke="#2b1a10" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <g transform="translate(-40,120)">
          <rect x="0" y="0" width="34" height="26" rx="3" fill="#60a5fa" />
          <rect x="4" y="-8" width="34" height="26" rx="3" fill="#93c5fd" />
          <rect x="8" y="-16" width="34" height="26" rx="3" fill="#3b82f6" />
        </g>
        <rect x="-58" y="188" width="26" height="10" rx="4" fill="#7c3aed" />
        <rect x="42" y="188" width="26" height="10" rx="4" fill="#7c3aed" />
      </g>

      {/* boy */}
      <g transform="translate(246,146)">
        <rect x="-58" y="66" width="24" height="48" rx="8" fill="#1d4ed8" />
        <path d="M-30 108c0-4 3-8 8-8h64c5 0 8 4 8 8v34c0 27-11 46-26 46h-28c-15 0-26-19-26-46Z" fill="#1e3a8a" />
        <rect x="-14" y="66" width="48" height="42" rx="9" fill="#38bdf8" />
        <rect x="34" y="30" width="14" height="48" rx="7" fill="#e0a877" transform="rotate(-35 41 78)" />
        <circle cx="10" cy="42" r="38" fill="#e0a877" />
        <path d="M-26 24c4-24 20-38 36-38s32 14 36 38c-4-16-18-26-36-26s-32 10-36 26Z" fill="#1f1a17" />
        <circle cx="-22" cy="46" r="11" fill="#e0a877" />
        <circle cx="42" cy="46" r="11" fill="#e0a877" />
        <circle cx="-4" cy="42" r="3.2" fill="#2b1a10" />
        <circle cx="24" cy="42" r="3.2" fill="#2b1a10" />
        <path d="M2 56q8 6 16 0" stroke="#2b1a10" strokeWidth="2.5" fill="none" strokeLinecap="round" />
        <rect x="-58" y="188" width="26" height="10" rx="4" fill="#1d4ed8" />
        <rect x="30" y="188" width="26" height="10" rx="4" fill="#1d4ed8" />
      </g>
    </svg>
  );
}

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
      <div className="login-illustration-panel">
        <SchoolChildrenIllustration />
        <h2>{t("Welcome back")}</h2>
        <p>{t("Manage admissions, attendance, fees and more — all in one place.")}</p>
      </div>

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
