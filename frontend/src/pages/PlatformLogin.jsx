import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, LogIn } from "lucide-react";

import PlatformAPI, { savePlatformAuth } from "../platformApi";

export default function PlatformLogin() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");
    setLoading(true);
    try {
      const response = await PlatformAPI.post("/platform/auth/login", form);
      savePlatformAuth(response.data.access_token, response.data.owner);
      navigate("/platform");
    } catch (error) {
      setMessage(error?.response?.data?.detail || "Login failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--saas-primary)",
        padding: "1.5rem",
      }}
    >
      <div
        className="form-panel"
        style={{ width: "400px", maxWidth: "100%", padding: "2rem" }}
      >
        <div style={{ textAlign: "center", marginBottom: "1.25rem" }}>
          <Building2 size={34} color="var(--saas-primary)" />
          <h2 style={{ margin: "0.5rem 0 0.25rem" }}>Owner Console</h2>
          <p style={{ margin: 0, color: "var(--saas-muted)" }}>
            School ERP platform administration
          </p>
        </div>

        {message && <div className="message-box">{message}</div>}

        <form className="classic-form" onSubmit={handleSubmit}>
          <div className="form-field">
            <label>Email</label>
            <input
              type="email"
              name="email"
              value={form.email}
              onChange={handleChange}
              required
            />
          </div>
          <div className="form-field">
            <label>Password</label>
            <input
              type="password"
              name="password"
              value={form.password}
              onChange={handleChange}
              required
            />
          </div>
          <button
            type="submit"
            className="primary-button"
            disabled={loading}
            style={{ width: "100%", justifyContent: "center" }}
          >
            <LogIn size={17} />
            {loading ? "Signing in..." : "Sign In"}
          </button>
        </form>

        <p
          style={{
            marginTop: "1rem",
            textAlign: "center",
            fontSize: "0.8rem",
            color: "var(--saas-muted)",
          }}
        >
          This console is for the platform owner only.
          <br />
          School staff should use the regular login page.
        </p>
      </div>
    </div>
  );
}
