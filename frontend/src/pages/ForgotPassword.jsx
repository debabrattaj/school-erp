import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Mail, School, ArrowLeft } from "lucide-react";
import API from "../api";

export default function ForgotPassword() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    account_code: "default",
    email: "",
  });
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [message, setMessage] = useState("");

  function handleChange(e) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      const response = await API.post("/auth/forgot-password", formData);
      setSubmitted(true);
      setMessage(
        response?.data?.message ||
          "If that account exists, a password reset link has been sent."
      );
    } catch (error) {
      if (error.response?.status === 429) {
        setMessage("Too many requests. Please try again later.");
      } else {
        setMessage("Something went wrong. Please try again.");
      }
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

        <h2>Reset your password</h2>
        <p className="login-subtitle">
          Enter your school code and email. If an account exists, we'll send a
          reset link.
        </p>

        {message && <div className="toast-notification">{message}</div>}

        {!submitted && (
          <form onSubmit={handleSubmit}>
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

            <button className="login-button" type="submit" disabled={loading}>
              {loading ? "Sending..." : "Send reset link"}
            </button>
          </form>
        )}

        <button
          type="button"
          className="login-forgot-link"
          onClick={() => navigate("/login")}
        >
          <ArrowLeft size={14} style={{ verticalAlign: "middle" }} /> Back to
          login
        </button>
      </div>
    </div>
  );
}
