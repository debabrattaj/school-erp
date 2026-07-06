import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Mail, School } from "lucide-react";
import API from "../api";
import { saveAuth } from "../auth";

export default function Login() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    account_code: "default",
    email: "admin@school.com",
    password: "admin123",
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

      const role = response?.data?.user?.role;
      navigate(["Parent", "Student"].includes(role) ? "/portal" : "/");
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
          <h2>Sign in</h2>
          <p className="login-subtitle">
            Login with your assigned school role.
          </p>

          {message && <div className="toast-notification">{message}</div>}

          <div className="login-field">
            <label>School Account Code</label>
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
            <label>Email Address</label>
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
            <label>Password</label>
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
            {loading ? "Signing in..." : mfaRequired ? "Verify & Sign in" : "Login"}
          </button>

          <button
            type="button"
            className="login-forgot-link"
            onClick={() => navigate("/forgot-password")}
          >
            Forgot password?
          </button>
        </form>

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
      </div>
    </div>
  );
}
