import { useRef, useState } from "react";
import { Upload, X, FileText, ExternalLink } from "lucide-react";
import { resolveFileUrl, uploadFile } from "../utils/files";

const IMAGE_RE = /\.(png|jpe?g|gif|webp)$/i;

export default function FileUploadField({ value, onChange, accept = "image/*,application/pdf" }) {
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

  const isImage = value && IMAGE_RE.test(value);

  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
      {value ? (
        isImage ? (
          <img
            src={resolveFileUrl(value)}
            alt="Attachment"
            style={{ width: 56, height: 56, borderRadius: 8, objectFit: "cover", border: "1px solid var(--saas-border)" }}
          />
        ) : (
          <a
            href={resolveFileUrl(value)}
            target="_blank"
            rel="noreferrer"
            style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--saas-primary)" }}
          >
            <FileText size={18} /> View file <ExternalLink size={13} />
          </a>
        )
      ) : (
        <div
          style={{
            width: 56, height: 56, borderRadius: 8, background: "#f1f5f9",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "#94a3b8",
          }}
        >
          <FileText size={20} />
        </div>
      )}

      <div>
        <input ref={inputRef} type="file" accept={accept} onChange={handleFile} style={{ display: "none" }} />
        <button
          type="button"
          className="secondary-button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          style={{ padding: "8px 12px" }}
        >
          <Upload size={15} /> {busy ? "Uploading…" : value ? "Replace file" : "Upload file"}
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
