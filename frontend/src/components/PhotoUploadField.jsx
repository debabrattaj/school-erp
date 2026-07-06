import { useRef, useState } from "react";
import { Upload, X } from "lucide-react";
import { resolveFileUrl, uploadFile } from "../utils/files";

export default function PhotoUploadField({ value, onChange }) {
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function handleFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const url = await uploadFile(file);
      onChange(url);
    } catch (err) {
      setError(err.response?.data?.detail || "Upload failed.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      {value ? (
        <img
          src={resolveFileUrl(value)}
          alt="Student"
          style={{ width: 56, height: 56, borderRadius: 8, objectFit: "cover", border: "1px solid var(--saas-border)" }}
        />
      ) : (
        <div
          style={{
            width: 56, height: 56, borderRadius: 8,
            background: "#f1f5f9", display: "flex", alignItems: "center",
            justifyContent: "center", color: "#94a3b8", fontSize: "0.7rem",
          }}
        >
          No photo
        </div>
      )}

      <div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          onChange={handleFile}
          style={{ display: "none" }}
        />
        <button
          type="button"
          className="secondary-button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          style={{ padding: "8px 12px" }}
        >
          <Upload size={15} /> {busy ? "Uploading…" : value ? "Change photo" : "Upload photo"}
        </button>
        {value && (
          <button
            type="button"
            className="light-button"
            onClick={() => onChange("")}
            style={{ padding: "8px 10px", marginLeft: 8 }}
            title="Remove"
          >
            <X size={15} />
          </button>
        )}
        {error && <div style={{ color: "#be123c", fontSize: "0.8rem", marginTop: 4 }}>{error}</div>}
      </div>
    </div>
  );
}
