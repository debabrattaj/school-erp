import { useEffect, useState } from "react";
import { ShieldCheck, ShieldOff } from "lucide-react";
import API from "../api";

export default function MfaCard() {
  const [enabled, setEnabled] = useState(null);
  const [setup, setSetup] = useState(null); // { secret, otpauth_uri }
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState("");

  useEffect(() => {
    API.get("/auth/mfa/status")
      .then((res) => setEnabled(Boolean(res.data?.mfa_enabled)))
      .catch(() => setEnabled(false));
  }, []);

  async function beginSetup() {
    setNote("");
    setBusy(true);
    try {
      const res = await API.post("/auth/mfa/setup");
      setSetup(res.data);
    } catch (error) {
      setNote(error.response?.data?.detail || "Could not start setup.");
    } finally {
      setBusy(false);
    }
  }

  async function confirmEnable(e) {
    e.preventDefault();
    setBusy(true);
    setNote("");
    try {
      await API.post("/auth/mfa/verify", { code });
      setEnabled(true);
      setSetup(null);
      setCode("");
      setNote("Two-factor authentication is now enabled.");
    } catch (error) {
      setNote(error.response?.data?.detail || "Invalid code.");
    } finally {
      setBusy(false);
    }
  }

  async function disable(e) {
    e.preventDefault();
    setBusy(true);
    setNote("");
    try {
      await API.post("/auth/mfa/disable", { code });
      setEnabled(false);
      setCode("");
      setNote("Two-factor authentication has been disabled.");
    } catch (error) {
      setNote(error.response?.data?.detail || "Invalid code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="form-panel">
      <div className="panel-header">
        <div>
          <h3>
            {enabled ? <ShieldCheck size={18} /> : <ShieldOff size={18} />}{" "}
            Two-Factor Authentication
          </h3>
          <p>
            {enabled
              ? "Your account is protected with an authenticator app."
              : "Add a second step at login using an authenticator app (Google Authenticator, Authy, 1Password…)."}
          </p>
        </div>
        <span className={enabled ? "status active" : "status danger"}>
          {enabled === null ? "…" : enabled ? "Enabled" : "Disabled"}
        </span>
      </div>

      {note && <div className="toast-notification">{note}</div>}

      {/* Not enabled, no setup started */}
      {enabled === false && !setup && (
        <div style={{ padding: "0 1rem 1rem" }}>
          <button type="button" className="primary-button" onClick={beginSetup} disabled={busy}>
            {busy ? "Preparing…" : "Enable Two-Factor Auth"}
          </button>
        </div>
      )}

      {/* Setup in progress */}
      {enabled === false && setup && (
        <form className="classic-form" onSubmit={confirmEnable} style={{ padding: "0 1rem 1rem" }}>
          <p style={{ marginBottom: 8 }}>
            1. In your authenticator app, add an account using this setup key:
          </p>
          <div
            style={{
              fontFamily: "monospace",
              fontSize: "1.05rem",
              letterSpacing: "2px",
              background: "var(--saas-surface-2, #f1f5f9)",
              padding: "10px 14px",
              borderRadius: 8,
              wordBreak: "break-all",
              marginBottom: 12,
            }}
          >
            {setup.secret}
          </div>
          <p style={{ marginBottom: 8 }}>
            2. Enter the 6-digit code it shows to confirm:
          </p>
          <div className="form-field" style={{ maxWidth: 220 }}>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              required
            />
          </div>
          <div style={{ marginTop: 12 }}>
            <button type="submit" className="primary-button" disabled={busy || code.length < 6}>
              {busy ? "Verifying…" : "Verify & Enable"}
            </button>{" "}
            <button type="button" className="light-button" onClick={() => { setSetup(null); setCode(""); setNote(""); }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Enabled -> allow disable */}
      {enabled === true && (
        <form className="classic-form" onSubmit={disable} style={{ padding: "0 1rem 1rem" }}>
          <p style={{ marginBottom: 8 }}>Enter a current code to turn off two-factor auth:</p>
          <div className="form-field" style={{ maxWidth: 220 }}>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              placeholder="6-digit code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
              required
            />
          </div>
          <div style={{ marginTop: 12 }}>
            <button type="submit" className="delete-button" style={{ width: "auto", padding: "10px 16px" }} disabled={busy || code.length < 6}>
              {busy ? "Disabling…" : "Disable Two-Factor Auth"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
}
