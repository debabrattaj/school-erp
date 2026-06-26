import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Mail, School } from "lucide-react";
import API from "../api";
import { saveAuth } from "../auth";

export default function Login() {
  const navigate = useNavigate();

  const [formData, setFormData] = useState({
    email: "admin@school.com",
    password: "admin123",
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

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

      const response = await API.post("/auth/login", formData);

      saveAuth(response.data.access_token, response.data.user);

      navigate("/");
    } catch (error) {
      console.error(error);

      if (error.response?.data?.detail) {
        setMessage(error.response.data.detail);
      } else {
        setMessage("Unable to login.");
      }
    } finally {
      setLoading(false);
    }
  }

  function quickLogin(email, password) {
    setFormData({
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

          {message && <div className="message-box">{message}</div>}

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

          <button className="login-button" type="submit" disabled={loading}>
            {loading ? "Signing in..." : "Login"}
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