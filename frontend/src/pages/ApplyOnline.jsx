import { useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { School, User, Users, Phone, Mail, GraduationCap, CheckCircle } from "lucide-react";
import API from "../api";

const emptyForm = {
  student_name: "",
  grade_applying: "",
  academic_year: "",
  guardian_name: "",
  guardian_phone: "",
  guardian_email: "",
  notes: "",
  website: "", // honeypot — real visitors never see or fill this
};

function getApiErrorMessage(error, fallback) {
  return error?.response?.data?.detail || fallback;
}

export default function ApplyOnline() {
  const [searchParams] = useSearchParams();
  const accountCode = searchParams.get("school") || "default";

  const [formData, setFormData] = useState(emptyForm);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [result, setResult] = useState(null);

  function handleChange(e) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage("");
    setLoading(true);

    try {
      const response = await API.post("/admissions/public", {
        account_code: accountCode,
        ...formData,
      });
      setResult(response.data);
    } catch (error) {
      if (error.response?.status === 429) {
        setMessage("Too many requests. Please try again in a little while.");
      } else {
        setMessage(getApiErrorMessage(error, "Something went wrong. Please try again."));
      }
    } finally {
      setLoading(false);
    }
  }

  if (result) {
    return (
      <div className="login-page">
        <div className="login-card login-card--wide">
          <div className="apply-success">
            <div className="apply-success-icon">
              <CheckCircle size={32} />
            </div>
            <h2>Application received</h2>
            <p className="login-subtitle">{result.message}</p>
            {result.inquiry_no && (
              <div className="apply-inquiry-no">Reference No: {result.inquiry_no}</div>
            )}
            <button
              type="button"
              className="login-forgot-link"
              onClick={() => {
                setFormData(emptyForm);
                setResult(null);
              }}
            >
              Submit another inquiry
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="login-page">
      <div className="login-card login-card--wide">
        <div className="login-brand">
          <div className="login-logo">
            <School size={34} />
          </div>
          <div>
            <h1>School ERP</h1>
            <p>Admissions</p>
          </div>
        </div>

        <h2>Apply for admission online</h2>
        <p className="login-subtitle">
          Fill in a few details and our admissions team will get back to you.
        </p>

        {message && <div className="toast-notification">{message}</div>}

        <form onSubmit={handleSubmit}>
          <div className="login-field-row">
            <div className="login-field">
              <label>Student's Full Name *</label>
              <div className="login-input">
                <User size={18} />
                <input
                  type="text"
                  name="student_name"
                  value={formData.student_name}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            <div className="login-field">
              <label>Grade Applying For *</label>
              <div className="login-input">
                <GraduationCap size={18} />
                <input
                  type="text"
                  name="grade_applying"
                  value={formData.grade_applying}
                  onChange={handleChange}
                  placeholder="e.g. 6"
                  required
                />
              </div>
            </div>
          </div>

          <div className="login-field">
            <label>Academic Year *</label>
            <div className="login-input">
              <School size={18} />
              <input
                type="text"
                name="academic_year"
                value={formData.academic_year}
                onChange={handleChange}
                placeholder="e.g. 2026-27"
                required
              />
            </div>
          </div>

          <div className="login-field-row">
            <div className="login-field">
              <label>Guardian's Name *</label>
              <div className="login-input">
                <Users size={18} />
                <input
                  type="text"
                  name="guardian_name"
                  value={formData.guardian_name}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>

            <div className="login-field">
              <label>Guardian's Phone *</label>
              <div className="login-input">
                <Phone size={18} />
                <input
                  type="tel"
                  name="guardian_phone"
                  value={formData.guardian_phone}
                  onChange={handleChange}
                  required
                />
              </div>
            </div>
          </div>

          <div className="login-field">
            <label>Guardian's Email (optional)</label>
            <div className="login-input">
              <Mail size={18} />
              <input
                type="email"
                name="guardian_email"
                value={formData.guardian_email}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="login-field">
            <label>Anything you'd like us to know? (optional)</label>
            <textarea
              className="login-textarea"
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows={3}
            />
          </div>

          <div className="apply-honeypot" aria-hidden="true">
            <label htmlFor="website">Leave this field empty</label>
            <input
              type="text"
              id="website"
              name="website"
              value={formData.website}
              onChange={handleChange}
              tabIndex={-1}
              autoComplete="off"
            />
          </div>

          <button className="login-button" type="submit" disabled={loading}>
            {loading ? "Submitting..." : "Submit application"}
          </button>
        </form>

        <Link to="/login" className="login-forgot-link">
          Already have an account? Log in
        </Link>
      </div>
    </div>
  );
}
