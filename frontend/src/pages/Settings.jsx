import { useEffect, useState } from "react";
import {
  Award,
  CalendarDays,
  Save,
  School,
  Settings2,
  Wallet,
} from "lucide-react";
import API from "../api";
import { getUser, saveAuth } from "../auth";
import { useSchoolSettings } from "../SettingsContext";
import MfaCard from "../components/MfaCard";
import PhotoUploadField from "../components/PhotoUploadField";

const emptyForm = {
  school_name: "",
  tagline: "",
  logo_url: "",
  address: "",
  phone: "",
  email: "",
  principal_name: "",

  academic_year: "",
  default_sections: "",
  working_days: "",

  currency: "INR",
  receipt_prefix: "REC",
  upi_id: "",
  late_fee_rule: "",

  pass_percentage: 35,
  grade_rules: "",
};

const featureGroups = [
  {
    title: "Core Modules",
    description: "Common modules used by most schools.",
    items: [
      ["dashboard", "Dashboard"],
      ["students", "Students"],
      ["teachers", "Teachers"],
      ["classes", "Classes"],
      ["attendance", "Attendance"],
      ["fees", "Fees"],
      ["users", "User Management"],
      ["settings", "Institution Settings"],
      ["master_data", "Master Data"],
    ],
  },
  {
    title: "Academic Modules",
    description: "Academic planning, assessment, and year-wise records.",
    items: [
      ["exams", "Exams"],
      ["marks", "Marks"],
      ["reports", "Reports"],
      ["report_card", "Report Card"],
      ["student_enrollments", "Student Enrollments"],
      ["admissions", "Admissions CRM"],
      ["admission_assessments", "Admission Assessments"],
      ["parent_communication", "Parent Communication"],
      ["student_services", "Student Services"],
      ["alumni_withdrawals", "Alumni & Withdrawals"],
      ["counseling", "Counseling & Wellbeing"],
      ["enrichment", "Activities & Enrichment"],
      ["compliance", "Compliance & Accreditation"],
      ["library", "Library"],
      ["student_layout", "Student Layout"],
      ["multi_curriculum", "Multi Curriculum"],
    ],
  },
  {
    title: "Residential School",
    description: "Use these for boarding and hostel operations.",
    items: [
      ["hostel", "Hostel"],
      ["mess_management", "Mess Management"],
      ["health_infirmary", "Health Infirmary"],
      ["house_system", "House System"],
    ],
  },
  {
    title: "International School",
    description: "Use these for international admissions and student services.",
    items: [
      ["international_documents", "Passport / Visa Documents"],
      ["transport", "Transport"],
      ["inventory", "Inventory"],
    ],
  },
];

export default function Settings() {
  const [user, setUser] = useState(getUser());

  const [formData, setFormData] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [account, setAccount] = useState(user?.account || null);
  const [features, setFeatures] = useState(user?.features || {});
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!message) return undefined;

    const timeoutId = window.setTimeout(() => {
      setMessage("");
    }, 2000);

    return () => window.clearTimeout(timeoutId);
  }, [message]);

  const [featureToast, setFeatureToast] = useState("");
  const { loadSettings: reloadGlobalSettings } = useSchoolSettings();

  useEffect(() => {
    if (!featureToast) return;
    const timer = setTimeout(() => setFeatureToast(""), 5000);
    return () => clearTimeout(timer);
  }, [featureToast]);

  async function loadAccountFeatures() {
    const response = await API.get("/accounts/me");
    const nextAccount = response.data.account || null;
    const nextFeatures = response.data.features || {};
    setAccount(response.data.account || null);
    setFeatures(nextFeatures);

    saveAuth(localStorage.getItem("school_erp_token"), {
      ...getUser(),
      account: nextAccount,
      features: nextFeatures,
    });
    setUser(getUser());
  }

  async function loadSettings() {
    try {
      setLoading(true);
      setMessage("");

      const [settingsResponse] = await Promise.all([
        API.get("/settings/"),
        loadAccountFeatures(),
      ]);
      setFormData({
        school_name: settingsResponse.data.school_name || "",
        tagline: settingsResponse.data.tagline || "",
        logo_url: settingsResponse.data.logo_url || "",
        address: settingsResponse.data.address || "",
        phone: settingsResponse.data.phone || "",
        email: settingsResponse.data.email || "",
        principal_name: settingsResponse.data.principal_name || "",

        academic_year: settingsResponse.data.academic_year || "",
        default_sections: settingsResponse.data.default_sections || "",
        working_days: settingsResponse.data.working_days || "",

        currency: settingsResponse.data.currency || "INR",
        receipt_prefix: settingsResponse.data.receipt_prefix || "REC",
        upi_id: settingsResponse.data.upi_id || "",
        late_fee_rule: settingsResponse.data.late_fee_rule || "",

        pass_percentage: settingsResponse.data.pass_percentage || 35,
        grade_rules: settingsResponse.data.grade_rules || "",
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

  function handleFeatureChange(featureKey) {
    setFeatureToast(
      "Module access is controlled by your platform administrator from the Owner Console. Contact them to enable or disable a module for your school."
    );
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
      {featureToast && <div className="toast-notification">{featureToast}</div>}

      <section className="page-heading">
        <div>
          <p className="eyebrow">System Configuration</p>
          <h2>School Settings</h2>
          <p>
            Configure school profile, academic year, fee receipt settings, and exam rules.
          </p>
        </div>

      </section>

      {message && <div className="toast-notification">{message}</div>}

      <MfaCard />

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
                <label>School Logo</label>
                <PhotoUploadField
                  value={formData.logo_url}
                  onChange={(url) => setFormData((prev) => ({ ...prev, logo_url: url }))}
                />
              </div>

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
                <label>Tagline</label>
                <input
                  type="text"
                  name="tagline"
                  value={formData.tagline}
                  onChange={handleChange}
                  placeholder="e.g. Nurturing Global Citizens"
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

              <div className="form-field">
                <label>School UPI ID</label>
                <input
                  type="text"
                  name="upi_id"
                  value={formData.upi_id}
                  onChange={handleChange}
                  placeholder="schoolname@bank"
                  disabled={user?.role !== "Admin"}
                />
                <small>
                  Fee payments show a UPI QR for this ID. Leave empty to
                  disable UPI payment.
                </small>
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

          <section className="form-panel">
            <div className="panel-header">
              <div>
                <h3>
                  <Settings2 size={20} /> Feature Access
                </h3>
                <p>
                  Module access is controlled by your platform administrator
                  from the Owner Console. Disabled modules are hidden from
                  the sidebar and cannot be turned on here.
                </p>
              </div>

              {account && (
                <span className="feature-account-badge">
                  {account.account_code}
                </span>
              )}
            </div>

            <div className="feature-settings-grid">
              {featureGroups.map((group) => (
                <div className="feature-group-card" key={group.title}>
                  <div className="feature-group-header">
                    <div>
                      <h4>{group.title}</h4>
                      <p>{group.description}</p>
                    </div>
                  </div>

                  <div className="feature-toggle-list">
                    {group.items.map(([featureKey, label]) => {
                      const enabled = features[featureKey] !== false;

                      return (
                        <label className="feature-toggle-row" key={featureKey}>
                          <span>
                            <strong>{label}</strong>
                            <small>{enabled ? "Enabled" : "Disabled"}</small>
                          </span>

                          <input
                            type="checkbox"
                            checked={enabled}
                            onChange={() => handleFeatureChange(featureKey)}
                            title="Module access is controlled by your platform administrator"
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
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
