import { useEffect, useState } from "react";
import { ShieldCheck, PlusCircle, Edit, Trash2, X } from "lucide-react";
import API from "../api";

const LEVELS = [
  { value: "", label: "No access" },
  { value: "view", label: "View" },
  { value: "manage", label: "Manage" },
];

export default function Roles() {
  const [roles, setRoles] = useState([]);
  const [modules, setModules] = useState([]);
  const [message, setMessage] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [form, setForm] = useState({ name: "", description: "", permissions: {} });

  useEffect(() => {
    if (!message) return undefined;
    const id = window.setTimeout(() => setMessage(""), 2800);
    return () => window.clearTimeout(id);
  }, [message]);

  async function loadAll() {
    try {
      const [rolesRes, modulesRes] = await Promise.all([
        API.get("/roles/"),
        API.get("/roles/modules"),
      ]);
      setRoles(rolesRes.data || []);
      setModules(modulesRes.data || []);
    } catch (error) {
      setMessage(error.response?.data?.detail || "Unable to load roles.");
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  function openCreate() {
    setEditingId(null);
    setForm({ name: "", description: "", permissions: {} });
    setShowForm(true);
    setMessage("");
  }

  function openEdit(role) {
    setEditingId(role.id);
    setForm({ name: role.name, description: role.description || "", permissions: { ...role.permissions } });
    setShowForm(true);
    setMessage("");
  }

  function setPerm(key, level) {
    setForm((f) => {
      const permissions = { ...f.permissions };
      if (level) permissions[key] = level;
      else delete permissions[key];
      return { ...f, permissions };
    });
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!form.name.trim()) {
      setMessage("Role name is required.");
      return;
    }
    try {
      if (editingId) {
        await API.put(`/roles/${editingId}`, form);
        setMessage("Role updated.");
      } else {
        await API.post("/roles/", form);
        setMessage("Role created.");
      }
      setShowForm(false);
      await loadAll();
    } catch (error) {
      setMessage(error.response?.data?.detail || "Unable to save role.");
    }
  }

  async function handleDelete(role) {
    if (!window.confirm(`Delete role "${role.name}"?`)) return;
    try {
      await API.delete(`/roles/${role.id}`);
      setMessage("Role deleted.");
      await loadAll();
    } catch (error) {
      setMessage(error.response?.data?.detail || "Unable to delete role.");
    }
  }

  function permSummary(role) {
    const keys = Object.keys(role.permissions || {});
    if (role.permissions?.["*"]) return "Full access";
    if (keys.length === 0) return "No modules";
    return `${keys.length} module${keys.length > 1 ? "s" : ""}`;
  }

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Access Control</p>
          <h2>Roles &amp; Permissions</h2>
          <p>Define custom roles and control which modules each role can view or manage.</p>
        </div>
        <div className="module-header-actions">
          
          <button type="button" className="primary-button" onClick={openCreate}><PlusCircle size={16} /> New Role</button>
        </div>
      </section>

      {message && <div className="toast-notification">{message}</div>}

      {showForm && (
        <section className="form-panel">
          <div className="panel-header">
            <div><h3>{editingId ? "Edit Role" : "New Role"}</h3></div>
            <button type="button" className="light-button" onClick={() => setShowForm(false)}><X size={15} /></button>
          </div>
          <form className="classic-form" onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-field">
                <label>Role Name *</label>
                <input value={form.name} disabled={Boolean(editingId)} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="e.g. Coordinator" required />
              </div>
              <div className="form-field">
                <label>Description</label>
                <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Academic coordinator" />
              </div>
            </div>

            <div className="sis-section-title" style={{ marginTop: 8 }}>Module Permissions</div>
            <div className="table-wrapper"><table className="classic-table">
              <thead><tr><th>Module</th><th style={{ width: 200 }}>Access</th></tr></thead>
              <tbody>
                {modules.map((m) => (
                  <tr key={m.key}>
                    <td>{m.label}</td>
                    <td>
                      <select value={form.permissions[m.key] || ""} onChange={(e) => setPerm(m.key, e.target.value)}>
                        {LEVELS.map((l) => <option key={l.value} value={l.value}>{l.label}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table></div>

            <div className="form-actions">
              <button type="submit" className="primary-button"><PlusCircle size={16} /> {editingId ? "Update Role" : "Create Role"}</button>
              <button type="button" className="light-button" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </section>
      )}

      <section className="form-panel">
        <div className="panel-header"><div><h3><ShieldCheck size={18} /> Roles ({roles.length})</h3></div></div>
        <div className="table-wrapper"><table className="classic-table">
          <thead><tr><th>Role</th><th>Type</th><th>Description</th><th>Access</th><th>Actions</th></tr></thead>
          <tbody>
            {roles.map((role) => (
              <tr key={role.id}>
                <td style={{ fontWeight: 600 }}>{role.name}</td>
                <td><span className={role.is_system ? "status" : "status active"}>{role.is_system ? "Built-in" : "Custom"}</span></td>
                <td>{role.description || "-"}</td>
                <td>{permSummary(role)}</td>
                <td>
                  <div className="action-buttons">
                    <button type="button" className="edit-button" onClick={() => openEdit(role)} disabled={role.is_system} title={role.is_system ? "Built-in roles can't be edited" : "Edit"}>
                      <Edit size={15} />
                    </button>
                    <button type="button" className="delete-button" onClick={() => handleDelete(role)} disabled={role.is_system} title={role.is_system ? "Built-in roles can't be deleted" : "Delete"}>
                      <Trash2 size={15} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
            {!roles.length && <tr><td colSpan={5}>No roles yet.</td></tr>}
          </tbody>
        </table></div>
      </section>
    </div>
  );
}
