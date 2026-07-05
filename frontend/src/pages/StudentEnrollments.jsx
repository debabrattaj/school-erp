import { useEffect, useMemo, useState } from "react";
import { PlusCircle, RefreshCcw, Send } from "lucide-react";

import API from "../api";
import StudentPicker from "../components/StudentPicker";

const emptyEnrollmentForm = {
  student_id: "",
  class_id: "",
  academic_year: "",
  roll_no: "",
  start_date: "",
  end_date: "",
  enrollment_status: "Active",
  remarks: "",
};

const emptyPromotionForm = {
  from_class_id: "",
  to_class_id: "",
  from_academic_year: "",
  to_academic_year: "",
  start_date: "",
  remarks: "",
};

function getApiErrorMessage(error, fallbackMessage) {
  const detail = error.response?.data?.detail;

  if (Array.isArray(detail)) {
    return detail.map((item) => item.msg).join(" | ");
  }

  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object") return detail.msg || JSON.stringify(detail);

  return fallbackMessage;
}

function getStudentName(student) {
  if (!student) return "-";

  const name =
    student.student_name ||
    student.name ||
    `${student.first_name || ""} ${student.last_name || ""}`.trim() ||
    "Unknown Student";

  return student.admission_no ? `${student.admission_no} - ${name}` : name;
}

function getClassLabel(classRecord) {
  if (!classRecord) return "-";

  const className = classRecord.class_name || "-";
  const section = classRecord.section || "-";

  return `${className} - Section ${section}`;
}

export default function StudentEnrollments() {
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [selectedStudentIds, setSelectedStudentIds] = useState([]);

  const [enrollmentForm, setEnrollmentForm] = useState(emptyEnrollmentForm);
  const [promotionForm, setPromotionForm] = useState(emptyPromotionForm);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!message) return undefined;

    const timeoutId = window.setTimeout(() => {
      setMessage("");
    }, 2000);

    return () => window.clearTimeout(timeoutId);
  }, [message]);

  async function loadPageData() {
    try {
      setLoading(true);
      setMessage("");

      const [studentResponse, classResponse, yearResponse, enrollmentResponse] =
        await Promise.all([
          API.get("/students/"),
          API.get("/classes/"),
          API.get("/master-data/AcademicYear"),
          API.get("/student-enrollments/"),
        ]);

      setStudents(studentResponse.data || []);
      setClasses(classResponse.data || []);
      setAcademicYears((yearResponse.data || []).filter((item) => item.is_active));
      setEnrollments(enrollmentResponse.data || []);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load student enrollments."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPageData();
  }, []);

  const classMap = useMemo(() => {
    const map = {};
    classes.forEach((classRecord) => {
      map[classRecord.id] = classRecord;
    });
    return map;
  }, [classes]);

  const activeSourceEnrollments = useMemo(() => {
    return enrollments.filter((enrollment) => {
      const matchClass = promotionForm.from_class_id
        ? String(enrollment.class_id) === String(promotionForm.from_class_id)
        : false;
      const matchYear = promotionForm.from_academic_year
        ? enrollment.academic_year === promotionForm.from_academic_year
        : false;
      return matchClass && matchYear && enrollment.enrollment_status === "Active";
    });
  }, [enrollments, promotionForm.from_academic_year, promotionForm.from_class_id]);

  function handleEnrollmentChange(event) {
    const { name, value } = event.target;
    setEnrollmentForm((prev) => ({ ...prev, [name]: value }));
  }

  function handlePromotionChange(event) {
    const { name, value } = event.target;
    setPromotionForm((prev) => ({ ...prev, [name]: value }));
    setSelectedStudentIds([]);
  }

  async function handleAddEnrollment(event) {
    event.preventDefault();
    setMessage("");

    try {
      const payload = {
        ...enrollmentForm,
        student_id: Number(enrollmentForm.student_id),
        class_id: Number(enrollmentForm.class_id),
        promotion_status: "Not Promoted",
        end_date: enrollmentForm.end_date || null,
        start_date: enrollmentForm.start_date || null,
      };

      await API.post("/student-enrollments/", payload);
      setMessage("Enrollment added successfully.");
      setEnrollmentForm(emptyEnrollmentForm);
      await loadPageData();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to add enrollment."));
    }
  }

  async function handlePromoteStudents(event) {
    event.preventDefault();
    setMessage("");

    if (selectedStudentIds.length === 0) {
      setMessage("Select at least one active student to promote.");
      return;
    }

    try {
      await API.post("/student-enrollments/promote", {
        ...promotionForm,
        student_ids: selectedStudentIds.map(Number),
        from_class_id: Number(promotionForm.from_class_id),
        to_class_id: Number(promotionForm.to_class_id),
        start_date: promotionForm.start_date || null,
      });

      setMessage("Students promoted successfully.");
      setPromotionForm(emptyPromotionForm);
      setSelectedStudentIds([]);
      await loadPageData();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to promote students."));
    }
  }

  function toggleStudent(studentId) {
    setSelectedStudentIds((prev) =>
      prev.includes(studentId)
        ? prev.filter((id) => id !== studentId)
        : [...prev, studentId]
    );
  }

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Academic Progression</p>
          <h2>Student Enrollments</h2>
          <p>Manage academic-year enrollment and promotions.</p>
        </div>

        <button type="button" className="secondary-button" onClick={loadPageData}>
          <RefreshCcw size={17} />
          Refresh
        </button>
      </section>

      {message && <div className="toast-notification">{message}</div>}

      <section className="form-panel">
        <div className="panel-header">
          <div>
            <h3>Add Enrollment</h3>
            <p>Promotion status is handled automatically.</p>
          </div>
        </div>

        <form className="classic-form" onSubmit={handleAddEnrollment}>
          <div className="form-grid">
            <StudentPicker
              students={students}
              value={enrollmentForm.student_id}
              onChange={handleEnrollmentChange}
            />

            <div className="form-field">
              <label>Class *</label>
              <select name="class_id" value={enrollmentForm.class_id} onChange={handleEnrollmentChange} required>
                <option value="">Select Class</option>
                {classes.map((classRecord) => (
                  <option key={classRecord.id} value={classRecord.id}>
                    {getClassLabel(classRecord)}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>Academic Year *</label>
              <input
                list="enrollment-academic-years"
                name="academic_year"
                value={enrollmentForm.academic_year}
                onChange={handleEnrollmentChange}
                placeholder="2026-27"
                required
              />
            </div>

            <div className="form-field">
              <label>Roll No</label>
              <input name="roll_no" value={enrollmentForm.roll_no} onChange={handleEnrollmentChange} />
            </div>

            <div className="form-field">
              <label>Start Date</label>
              <input type="date" name="start_date" value={enrollmentForm.start_date} onChange={handleEnrollmentChange} />
            </div>

            <div className="form-field">
              <label>End Date</label>
              <input type="date" name="end_date" value={enrollmentForm.end_date} onChange={handleEnrollmentChange} />
            </div>

            <div className="form-field">
              <label>Status *</label>
              <select name="enrollment_status" value={enrollmentForm.enrollment_status} onChange={handleEnrollmentChange} required>
                <option value="Active">Active</option>
                <option value="Completed">Completed</option>
                <option value="Inactive">Inactive</option>
              </select>
            </div>

            <div className="form-field full-width">
              <label>Remarks</label>
              <textarea name="remarks" rows="3" value={enrollmentForm.remarks} onChange={handleEnrollmentChange}></textarea>
            </div>
          </div>

          <datalist id="enrollment-academic-years">
            {academicYears.map((year) => (
              <option key={year.id || year.value} value={year.value} />
            ))}
          </datalist>

          <div className="form-actions">
            <button type="submit" className="primary-button">
              <PlusCircle size={18} />
              Add Enrollment
            </button>
          </div>
        </form>
      </section>

      <section className="form-panel">
        <div className="panel-header">
          <div>
            <h3>Promote Students</h3>
            <p>Old records become Completed and Promoted; new records become Active and Not Promoted.</p>
          </div>
        </div>

        <form className="classic-form" onSubmit={handlePromoteStudents}>
          <div className="form-grid">
            <div className="form-field">
              <label>From Class *</label>
              <select name="from_class_id" value={promotionForm.from_class_id} onChange={handlePromotionChange} required>
                <option value="">Select Class</option>
                {classes.map((classRecord) => (
                  <option key={classRecord.id} value={classRecord.id}>
                    {getClassLabel(classRecord)}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>From Academic Year *</label>
              <input
                list="enrollment-academic-years"
                name="from_academic_year"
                value={promotionForm.from_academic_year}
                onChange={handlePromotionChange}
                placeholder="2026-27"
                required
              />
            </div>

            <div className="form-field">
              <label>To Class *</label>
              <select name="to_class_id" value={promotionForm.to_class_id} onChange={handlePromotionChange} required>
                <option value="">Select Class</option>
                {classes.map((classRecord) => (
                  <option key={classRecord.id} value={classRecord.id}>
                    {getClassLabel(classRecord)}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>To Academic Year *</label>
              <input
                list="enrollment-academic-years"
                name="to_academic_year"
                value={promotionForm.to_academic_year}
                onChange={handlePromotionChange}
                placeholder="2027-28"
                required
              />
            </div>

            <div className="form-field">
              <label>Start Date</label>
              <input type="date" name="start_date" value={promotionForm.start_date} onChange={handlePromotionChange} />
            </div>

            <div className="form-field full-width">
              <label>Remarks</label>
              <textarea name="remarks" rows="3" value={promotionForm.remarks} onChange={handlePromotionChange}></textarea>
            </div>
          </div>

          <div className="table-wrapper">
            <table className="classic-table">
              <thead>
                <tr>
                  <th>Select</th>
                  <th>Student</th>
                  <th>Class</th>
                  <th>Academic Year</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {activeSourceEnrollments.length === 0 ? (
                  <tr>
                    <td colSpan="5" className="empty-table">
                      {loading ? "Loading enrollments..." : "No active enrollments found for the selected class and year."}
                    </td>
                  </tr>
                ) : (
                  activeSourceEnrollments.map((enrollment) => (
                    <tr key={enrollment.id}>
                      <td>
                        <input
                          type="checkbox"
                          checked={selectedStudentIds.includes(enrollment.student_id)}
                          onChange={() => toggleStudent(enrollment.student_id)}
                        />
                      </td>
                      <td>{enrollment.admission_no ? `${enrollment.admission_no} - ${enrollment.student_name}` : enrollment.student_name}</td>
                      <td>{enrollment.class_display || getClassLabel(classMap[enrollment.class_id])}</td>
                      <td>{enrollment.academic_year}</td>
                      <td>{enrollment.enrollment_status}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="form-actions">
            <button type="submit" className="primary-button">
              <Send size={18} />
              Promote Selected
            </button>
          </div>
        </form>
      </section>

      <section className="table-panel">
        <div className="table-toolbar">
          <div>
            <h3>Enrollment Records</h3>
            <p>{enrollments.length} academic-year enrollment record(s) found</p>
          </div>
        </div>

        <div className="table-wrapper">
          <table className="classic-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Class</th>
                <th>Academic Year</th>
                <th>Roll No</th>
                <th>Status</th>
                <th>Promotion</th>
                <th>Start</th>
                <th>End</th>
              </tr>
            </thead>
            <tbody>
              {enrollments.length === 0 ? (
                <tr>
                  <td colSpan="8" className="empty-table">
                    {loading ? "Loading enrollments..." : "No enrollment records found."}
                  </td>
                </tr>
              ) : (
                enrollments.map((enrollment) => (
                  <tr key={enrollment.id}>
                    <td>
                      {enrollment.admission_no
                        ? `${enrollment.admission_no} - ${enrollment.student_name}`
                        : enrollment.student_name || "-"}
                    </td>
                    <td>{enrollment.class_display || getClassLabel(classMap[enrollment.class_id])}</td>
                    <td>{enrollment.academic_year || "-"}</td>
                    <td>{enrollment.roll_no || "-"}</td>
                    <td>{enrollment.enrollment_status || "-"}</td>
                    <td>{enrollment.promotion_status || "-"}</td>
                    <td>{enrollment.start_date || "-"}</td>
                    <td>{enrollment.end_date || "-"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
