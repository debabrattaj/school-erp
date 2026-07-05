import { useEffect, useMemo, useState } from "react";
import { Link2, RefreshCcw, Trash2 } from "lucide-react";

import API from "../api";
import StudentPicker from "../components/StudentPicker";

function getApiErrorMessage(error, fallback) {
  return error?.response?.data?.detail || fallback;
}

export default function PortalAccess() {
  const [links, setLinks] = useState([]);
  const [users, setUsers] = useState([]);
  const [students, setStudents] = useState([]);
  const [message, setMessage] = useState("");
  const [form, setForm] = useState({
    user_id: "",
    student_id: "",
    relationship: "",
  });
  const [saving, setSaving] = useState(false);

  async function loadPageData() {
    try {
      const [linksRes, usersRes, studentsRes] = await Promise.all([
        API.get("/portal/links"),
        API.get("/users/"),
        API.get("/students/"),
      ]);
      setLinks(linksRes.data || []);
      setUsers(usersRes.data || []);
      setStudents(studentsRes.data || []);
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to load portal links."));
    }
  }

  useEffect(() => {
    loadPageData();
  }, []);

  const portalUsers = useMemo(
    () => users.filter((user) => ["Parent", "Student"].includes(user.role)),
    [users]
  );

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleCreateLink(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await API.post("/portal/links", {
        user_id: Number(form.user_id),
        student_id: Number(form.student_id),
        relationship: form.relationship || null,
      });
      setMessage("Portal link created.");
      setForm({ user_id: "", student_id: "", relationship: "" });
      await loadPageData();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to create link."));
    } finally {
      setSaving(false);
    }
  }

  async function handleDeleteLink(linkId) {
    if (!window.confirm("Remove this portal link?")) return;
    try {
      await API.delete(`/portal/links/${linkId}`);
      setMessage("Portal link removed.");
      await loadPageData();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to remove link."));
    }
  }

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Family Portal</p>
          <h2>Portal Access</h2>
          <p>
            Link Parent and Student accounts to student records. Create the user
            first in User Management with the Parent or Student role.
          </p>
        </div>

        <button type="button" className="secondary-button" onClick={loadPageData}>
          <RefreshCcw size={17} />
          Refresh
        </button>
      </section>

      {message && <div className="message-box">{message}</div>}

      <section className="form-panel">
        <div className="panel-header">
          <div>
            <h3>Add Link</h3>
            <p>
              A Parent account can be linked to multiple children. A Student
              account can be linked to exactly one student record.
            </p>
          </div>
        </div>

        <form className="classic-form" onSubmit={handleCreateLink}>
          <div className="form-grid">
            <div className="form-field">
              <label>Portal User *</label>
              <select name="user_id" value={form.user_id} onChange={handleChange} required>
                <option value="">Select User</option>
                {portalUsers.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} ({user.role}) — {user.email}
                  </option>
                ))}
              </select>
            </div>

            <StudentPicker
              students={students}
              value={form.student_id}
              onChange={handleChange}
            />

            <div className="form-field">
              <label>Relationship</label>
              <select name="relationship" value={form.relationship} onChange={handleChange}>
                <option value="">Select</option>
                <option value="Father">Father</option>
                <option value="Mother">Mother</option>
                <option value="Guardian">Guardian</option>
                <option value="Self">Self (student)</option>
              </select>
            </div>
          </div>

          <button type="submit" className="primary-button" disabled={saving}>
            <Link2 size={17} />
            {saving ? "Saving..." : "Create Link"}
          </button>
        </form>
      </section>

      <section className="form-panel">
        <div className="panel-header">
          <div>
            <h3>Existing Links ({links.length})</h3>
          </div>
        </div>

        <table className="records-table">
          <thead>
            <tr>
              <th>Portal User</th>
              <th>Role</th>
              <th>Student</th>
              <th>Admission No</th>
              <th>Relationship</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {links.map((link) => (
              <tr key={link.id}>
                <td>
                  {link.user_name}
                  <br />
                  <small>{link.user_email}</small>
                </td>
                <td>{link.user_role}</td>
                <td>{link.student_name}</td>
                <td>{link.admission_no}</td>
                <td>{link.relationship || "-"}</td>
                <td>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => handleDeleteLink(link.id)}
                  >
                    <Trash2 size={15} />
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {!links.length && (
              <tr>
                <td colSpan={6}>No portal links yet.</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
