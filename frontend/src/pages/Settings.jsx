import { useEffect, useState } from "react";
import { RefreshCcw, Save, School, CalendarDays, Wallet, Award } from "lucide-react";
import API from "../api";
import { getUser } from "../auth";
import { useSchoolSettings } from "../SettingsContext";

const emptyForm = {
  school_name: "",
  address: "",
  phone: "",
  email: "",
  principal_name: "",

  academic_year: "",
  default_sections: "",
  working_days: "",

  currency: "INR",
  receipt_prefix: "REC",
  late_fee_rule: "",

  pass_percentage: 35,
  grade_rules: "",
};

export default function Settings() {
  const user = getUser();

  const [formData, setFormData] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const { loadSettings: reloadGlobalSettings } = useSchoolSettings();
  async function loadSettings() {
    try {
      setLoading(true);
      setMessage("");

      const response = await API.get("/settings/");
      setFormData({
        school_name: response.data.school_name || "",
        address: response.data.address || "",
        phone: response.data.phone || "",
        email: response.data.email || "",
        principal_name: response.data.principal_name || "",

        academic_year: response.data.academic_year || "",
        default_sections: response.data.default_sections || "",
        working_days: response.data.working_days || "",

        currency: response.data.currency || "INR",
        receipt_prefix: response.data.receipt_prefix || "REC",
        late_fee_rule: response.data.late_fee_rule || "",

        pass_percentage: response.data.pass_percentage || 35,
        grade_rules: response.data.grade_rules || "",
      });
    } catch (error) {
      console.error(error);

      if (error.response?.data?.detail) {
        setMessage(error.response.data.detail);
      } else {
        setMessage("Unable to load settings.");
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadSettings();
  }, []);

  function handleChange(e) {
    const { name, value } = e.target;

    setFormData((prev) => ({
      ...prev,
      [name]: name === "pass_percentage" ? Number(value) : value,
    }));
  }

  async function handleSubmit(e) {
    e.preventDefault();

    if (user?.role !== "Admin") {
      setMessage("Only Admin can update settings.");
      return;
    }

    try {
      setSaving(true);
      setMessage("");

      await API.put("/settings/", formData);

      setMessage("School settings saved successfully.");
      await loadSettings();
      await reloadGlobalSettings();
    } catch (error) {
      console.error(error);

      if (error.response?.data?.detail) {
        setMessage(error.response.data.detail);
      } else {
        setMessage("Unable to save settings.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">System Configuration</p>
          <h2>School Settings</h2>
          <p>
            Configure school profile, academic year, fee receipt settings, and exam rules.
          </p>
        </div>

        <button className="secondary-button" onClick={loadSettings}>
          <RefreshCcw size={17} />
          Refresh
        </button>
      </section>

      {message && <div className="message-box">{message}</div>}

      {loading ? (
        <div className="loading-box">Loading settings...</div>
      ) : (
        <form className="settings-form" onSubmit={handleSubmit}>
          <section className="form-panel">
            <div className="panel-header">
              <div>
                <h3>
                  <School size={20} /> School Profile
                </h3>
                <p>Basic school identity used in reports and PDFs.</p>
              </div>
            </div>

            <div className="form-grid">
              <div className="form-field">
                <label>School Name *</label>
                <input
                  type="text"
                  name="school_name"
                  value={formData.school_name}
                  onChange={handleChange}
                  required
                  disabled={user?.role !== "Admin"}
                />
              </div>

              <div className="form-field">
                <label>Principal Name</label>
                <input
                  type="text"
                  name="principal_name"
                  value={formData.principal_name}
                  onChange={handleChange}
                  disabled={user?.role !== "Admin"}
                />
              </div>

              <div className="form-field">
                <label>Phone</label>
                <input
                  type="text"
                  name="phone"
                  value={formData.phone}
                  onChange={handleChange}
                  disabled={user?.role !== "Admin"}
                />
              </div>

              <div className="form-field">
                <label>Email</label>
                <input
                  type="email"
                  name="email"
                  value={formData.email}
                  onChange={handleChange}
                  disabled={user?.role !== "Admin"}
                />
              </div>

              <div className="form-field full-width">
                <label>Address</label>
                <textarea
                  name="address"
                  value={formData.address}
                  onChange={handleChange}
                  rows="3"
                  disabled={user?.role !== "Admin"}
                ></textarea>
              </div>
            </div>
          </section>

          <section className="form-panel">
            <div className="panel-header">
              <div>
                <h3>
                  <CalendarDays size={20} /> Academic Settings
                </h3>
                <p>Academic year and default school operating rules.</p>
              </div>
            </div>

            <div className="form-grid">
              <div className="form-field">
                <label>Academic Year</label>
                <input
                  type="text"
                  name="academic_year"
                  value={formData.academic_year}
                  onChange={handleChange}
                  placeholder="2026 - 2027"
                  disabled={user?.role !== "Admin"}
                />
              </div>

              <div className="form-field">
                <label>Default Sections</label>
                <input
                  type="text"
                  name="default_sections"
                  value={formData.default_sections}
                  onChange={handleChange}
                  placeholder="A,B,C,D"
                  disabled={user?.role !== "Admin"}
                />
              </div>

              <div className="form-field">
                <label>Working Days</label>
                <input
                  type="text"
                  name="working_days"
                  value={formData.working_days}
                  onChange={handleChange}
                  placeholder="Monday-Friday"
                  disabled={user?.role !== "Admin"}
                />
              </div>
            </div>
          </section>

          <section className="form-panel">
            <div className="panel-header">
              <div>
                <h3>
                  <Wallet size={20} /> Fee Settings
                </h3>
                <p>Used later for fee receipts and accounts reports.</p>
              </div>
            </div>

            <div className="form-grid">
              <div className="form-field">
                <label>Currency</label>
                <select
                  name="currency"
                  value={formData.currency}
                  onChange={handleChange}
                  disabled={user?.role !== "Admin"}
                >
                  <option value="INR">INR - ₹</option>
                  <option value="USD">USD - $</option>
                  <option value="EUR">EUR - €</option>
                </select>
              </div>

              <div className="form-field">
                <label>Receipt Prefix</label>
                <input
                  type="text"
                  name="receipt_prefix"
                  value={formData.receipt_prefix}
                  onChange={handleChange}
                  placeholder="REC"
                  disabled={user?.role !== "Admin"}
                />
              </div>

              <div className="form-field full-width">
                <label>Late Fee Rule</label>
                <textarea
                  name="late_fee_rule"
                  value={formData.late_fee_rule}
                  onChange={handleChange}
                  rows="3"
                  placeholder="Example: ₹50 per week after due date"
                  disabled={user?.role !== "Admin"}
                ></textarea>
              </div>
            </div>
          </section>

          <section className="form-panel">
            <div className="panel-header">
              <div>
                <h3>
                  <Award size={20} /> Exam Settings
                </h3>
                <p>Used later for report cards and performance reports.</p>
              </div>
            </div>

            <div className="form-grid">
              <div className="form-field">
                <label>Pass Percentage</label>
                <input
                  type="number"
                  name="pass_percentage"
                  value={formData.pass_percentage}
                  onChange={handleChange}
                  min="0"
                  max="100"
                  disabled={user?.role !== "Admin"}
                />
              </div>

              <div className="form-field full-width">
                <label>Grade Rules</label>
                <textarea
                  name="grade_rules"
                  value={formData.grade_rules}
                  onChange={handleChange}
                  rows="3"
                  placeholder="A+:90-100,A:80-89,B:70-79,C:60-69,D:50-59,F:0-49"
                  disabled={user?.role !== "Admin"}
                ></textarea>
              </div>
            </div>
          </section>

          {user?.role === "Admin" && (
            <div className="settings-save-bar">
              <button className="primary-button" type="submit" disabled={saving}>
                <Save size={18} />
                {saving ? "Saving..." : "Save Settings"}
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}