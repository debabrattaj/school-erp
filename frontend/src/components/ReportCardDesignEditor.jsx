import { useEffect, useState } from "react";
import API from "../api";
import ReportTextToolbar from "./ReportTextToolbar";

export const DEFAULT_REPORT_DESIGN = {
  title: "Report Card", accent_color: null, font_family: "default",
  feedback_title: "Teacher feedback & next steps",
  feedback_prompt: "Strengths, areas to develop and agreed learning goals",
  teacher_label: "Class Teacher", coordinator_label: "Exam Coordinator", principal_label: "Principal",
  text_styles: {}, show_rank: true, show_attendance: true, show_feedback: true,
};


export default function ReportCardDesignEditor({ design, template, markColors, onChange, onOpen, accent }) {
  const [saved, setSaved] = useState([]);
  const [selection, setSelection] = useState("");
  const [opened, setOpened] = useState(null);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const editable = ["heritage", "scholar", "horizon", "ledger", "studio"].includes(template);
  const config = { ...design, template, mark_colors: markColors };
  const dirty = opened && (opened.name !== name || Object.keys(config).some((key) => JSON.stringify(opened.configuration[key]) !== JSON.stringify(config[key])));

  async function refresh() {
    const response = await API.get("/marks/templates");
    setSaved(response.data);
    return response.data;
  }
  useEffect(() => { refresh().catch(() => setNotice("Saved designs could not be loaded. Try reopening a saved template after the backend update.")); }, []);

  async function openSaved() {
    setBusy(true);
    try {
      const rows = await refresh();
      const row = rows.find((item) => String(item.id) === selection);
      if (!row) throw new Error("Select an existing saved template.");
      setOpened(row); setName(row.name); onOpen(row.configuration);
      setNotice(`Opened ${row.name}. Edit it and choose Save changes, or save a separate copy.`);
    } catch (error) { setNotice(error.response?.data?.detail || error.message || "Unable to open template."); }
    finally { setBusy(false); }
  }

  async function save(asNew) {
    if (!name.trim()) return setNotice("Enter a name for your school template.");
    if (!design.title.trim()) return setNotice("Enter a report heading.");
    setBusy(true);
    try {
      const payload = { name: name.trim(), configuration: config, ...(asNew ? {} : {revision: opened.revision}) };
      const response = asNew ? await API.post("/marks/templates",payload) : await API.put(`/marks/templates/${opened.id}`,payload);
      const row = response.data;
      setOpened(row); setName(row.name); setSelection(String(row.id));
      setSaved((prev) => [...prev.filter((item) => item.id !== row.id),row].sort((a,b) => a.name.localeCompare(b.name)));
      setNotice(`Saved ${row.name} to your school. Reopen it here from any device.`);
    } catch (error) {
      const detail = error.response?.data?.detail;
      setNotice(typeof detail === "string" ? detail : "Unable to save. Check your entries and try again; your edits are still here.");
    } finally { setBusy(false); }
  }

  return <section id="report-template-editor" className="report-design-editor no-print">
    <h3>Your school’s saved templates</h3>
    <p>Save a named design with its colours, headings and signature labels. Saved designs are shared with authorised staff in this school.</p>
    <div className="report-design-open">
      <label>Saved template<select value={selection} onChange={(event) => setSelection(event.target.value)} disabled={busy}>
        <option value="">Choose a school template</option>{saved.map((row) => <option key={row.id} value={row.id}>{row.name}</option>)}
      </select></label>
      <button type="button" className="secondary-button" disabled={busy || !selection} onClick={openSaved}>Open saved template</button>
    </div>
    {dirty && <p className="report-design-dirty">You have unsaved edits. Opening another template replaces the current draft; save it first to keep your changes.</p>}
    {editable ? <>
      <ReportTextToolbar key={opened ? `${opened.id}-${opened.revision}` : "new"} design={design} onChange={onChange} />
      <div className="report-design-fields">
        <label>Template name<input value={name} maxLength={100} onChange={(event) => setName(event.target.value)} placeholder="e.g. Senior school term report" /></label>

        <label>Heading font<select value={design.font_family} onChange={(event) => onChange({...design,font_family:event.target.value})}><option value="default">Design default</option><option value="sans">Modern sans serif</option><option value="serif">Traditional serif</option></select></label>
        <label>Design accent<input type="color" value={design.accent_color || accent} onChange={(event) => onChange({...design,accent_color:event.target.value})} /><button type="button" className="light-button" onClick={() => onChange({...design,accent_color:null})}>Use design colour</button></label>
      </div>
      <div className="report-design-toggles">{[["show_rank","Show class rank"],["show_attendance","Show attendance"],["show_feedback","Show feedback area"]].map(([key,label]) => <label key={key}><input type="checkbox" checked={design[key]} onChange={(event) => onChange({...design,[key]:event.target.checked})} />{label}</label>)}</div>
      <div className="module-header-actions">
        <button type="button" className="primary-button" disabled={busy || !opened} onClick={() => save(false)}>{busy ? "Saving / opening…" : "Save changes"}</button>
        <button type="button" className="secondary-button" disabled={busy} onClick={() => save(true)}>{opened ? "Save as new template" : "Save school template"}</button>
      </div>
      <p>Your preview and PDF use the current edits. Save to reuse them later. Student marks and school identity are not changed by this editor.</p>
    </> : <p>Choose Heritage, Scholar, Horizon, Ledger or Studio above to create an editable school template. Original layouts remain available for download.</p>}
    {notice && <p role="status">{notice}</p>}
  </section>;
}
