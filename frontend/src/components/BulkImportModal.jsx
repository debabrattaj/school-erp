import { useState } from "react";
import { Download, X } from "lucide-react";

import API from "../api";

export default function BulkImportModal({
  title,
  description,
  templateUrl,
  templateFilename,
  importUrl,
  onClose,
  onImported,
}) {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [busy, setBusy] = useState(false);

  async function downloadTemplate() {
    try {
      const response = await API.get(templateUrl, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: "text/csv" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = templateFilename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
    }
  }

  async function submit(dryRun) {
    if (!file) return;
    setBusy(true);
    setResult(null);
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await API.post(`${importUrl}?dry_run=${dryRun}`, form, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      setResult(response.data);
      if (!dryRun && response.data.created > 0) {
        onImported?.();
      }
    } catch (error) {
      console.error(error);
      setResult({
        errors: [{ row: "-", error: error.response?.data?.detail || "Import failed." }],
      });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="layout-modal-backdrop" onClick={onClose}>
      <div className="layout-modal" onClick={(event) => event.stopPropagation()}>
        <div className="layout-modal-header">
          <div>
            <h3>{title}</h3>
            <p>{description}</p>
          </div>
          <button type="button" className="light-icon-button" onClick={onClose}>
            <X size={16} />
          </button>
        </div>

        <button type="button" className="light-button" onClick={downloadTemplate}>
          <Download size={16} />
          Download CSV Template
        </button>

        <div style={{ marginTop: 16 }}>
          <input
            type="file"
            accept=".csv"
            onChange={(event) => {
              setFile(event.target.files?.[0] || null);
              setResult(null);
            }}
          />
        </div>

        <div className="form-actions" style={{ marginTop: 16 }}>
          <button
            type="button"
            className="secondary-button"
            disabled={!file || busy}
            onClick={() => submit(true)}
          >
            Validate Only
          </button>
          <button
            type="button"
            className="primary-button"
            disabled={!file || busy}
            onClick={() => submit(false)}
          >
            {busy ? "Importing..." : "Import"}
          </button>
        </div>

        {result && (
          <div style={{ marginTop: 18 }}>
            {"total_rows" in result && (
              <p>
                {result.dry_run ? "Validated" : "Imported"}{" "}
                <strong>{result.created ?? result.valid_rows}</strong> of{" "}
                {result.total_rows} row(s).
                {result.errors?.length > 0 &&
                  ` ${result.errors.length} row(s) had errors.`}
              </p>
            )}
            {result.errors?.length > 0 && (
              <div style={{ maxHeight: 220, overflowY: "auto" }}>
                <table className="classic-table">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {result.errors.map((err, idx) => (
                      <tr key={idx}>
                        <td>{err.row}</td>
                        <td>{err.error}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
