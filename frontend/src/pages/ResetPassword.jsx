import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Lock, School } from "lucide-react";
import API from "../api";

const MIN_LENGTH = 8;

export default function ResetPassword() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token") || "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [done, setDone] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage("");

    if (!token) {
      setMessage("This reset link is missing its token.");
      return;
    }
    if (password.length < MIN_LENGTH) {
      setMessage(`Password must be at least ${MIN_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setMessage("Passwords do not match.");
      return;
    }

    setLoading(true);
    try {
      const response = await API.post("/auth/reset-password", {
        token,
        new_password: password,
      });
      setDone(true);
      setMessage(
        response?.data?.message ||
          "Your password has been reset. You can now sign in."
      );
    } catch (error) {
      setMessage(
        error.response?.data?.detail ||
          "This reset link is invalid or has expired."
      );
    } finally {
      setLoading(false);
    }
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

        <h2>Choose a new password</h2>

        {message && <div className="toast-notification">{message}</div>}

        {!done ? (
          <form onSubmit={handleSubmit}>
            <div className="login-field">
              <label>New Password</label>
              <div className="login-input">
                <Lock size={18} />
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={`At least ${MIN_LENGTH} characters`}
                  required
                />
              </div>
            </div>

            <div className="login-field">
              <label>Confirm Password</label>
              <div className="login-input">
                <Lock size={18} />
                <input
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  required
                />
              </div>
            </div>

            <button className="login-button" type="submit" disabled={loading}>
              {loading ? "Resetting..." : "Reset password"}
            </button>
          </form>
        ) : (
          <button
            type="button"
            className="login-button"
            onClick={() => navigate("/login")}
          >
            Go to login
          </button>
        )}
      </div>
    </div>
  );
}
