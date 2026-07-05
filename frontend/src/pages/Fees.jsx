import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Edit,
  Trash2,
  PlusCircle,
  RefreshCcw,
  Eye,
  X,
  Wallet,
  Settings2,
} from "lucide-react";

import API from "../api";
import StudentPicker from "../components/StudentPicker";
import ManagedRecordsTable from "../components/ManagedRecordsTable";
import { getMasterValues } from "../services/masterDataService";

const emptyFeeForm = {
  student_id: "",
  fee_type: "",
  academic_year: "",
  total_amount: "",
  paid_amount: "",
  payment_date: "",
  due_date: "",
  receipt_no: "",
  remarks: "",
};

const emptyStructureForm = {
  academic_year: "",
  class_name: "",
  residential_type: "",
  fee_type: "",
  amount: "",
  due_date: "",
  remarks: "",
};

const residentialTypeOptions = ["Day Scholar", "Hosteller"];

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b), undefined, { numeric: true })
  );
}

const fallbackFeeTypes = [
  "Tuition Fee",
  "Admission Fee",
  "Hostel Fee",
  "Transport Fee",
  "Library Fee",
  "Exam Fee",
  "Activity Fee",
];

const statusOptions = [
  "Paid",
  "Partial",
  "Unpaid",
];

function getApiErrorMessage(error, fallbackMessage) {
  const detail = error.response?.data?.detail;

  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        const field = Array.isArray(item.loc) ? item.loc.join(".") : "field";
        return `${field}: ${item.msg}`;
      })
      .join(" | ");
  }

  if (typeof detail === "string") {
    return detail;
  }

  if (detail && typeof detail === "object") {
    return detail.msg || JSON.stringify(detail);
  }

  return fallbackMessage;
}

function normalizeDateInput(value) {
  if (!value) return "";
  return String(value).split("T")[0];
}

function getFeeAmount(fee) {
  return Number(fee.total_amount ?? fee.amount ?? 0);
}

function getPaidAmount(fee) {
  return Number(fee.paid_amount ?? 0);
}

function getBalanceAmount(fee) {
  return Number(fee.due_amount ?? Math.max(getFeeAmount(fee) - getPaidAmount(fee), 0));
}

function calculateFeeStatus(totalAmount, paidAmount) {
  const total = Number(totalAmount || 0);
  const paid = Number(paidAmount || 0);

  if (total > 0 && paid >= total) {
    return "Paid";
  }

  if (paid > 0 && paid < total) {
    return "Partial";
  }

  return "Unpaid";
}

function getStatusClass(status) {
  const text = String(status || "").toLowerCase();

  if (text === "paid") return "status active";
  if (text === "unpaid") return "status danger";

  return "status warning";
}

export default function Fees() {
  const navigate = useNavigate();

  const [fees, setFees] = useState([]);
  const [students, setStudents] = useState([]);
  const [feeTypes, setFeeTypes] = useState(fallbackFeeTypes);
  const [academicYears, setAcademicYears] = useState([]);
  const [classOptionsMaster, setClassOptionsMaster] = useState([]);
  const [feeStructures, setFeeStructures] = useState([]);

  const [formData, setFormData] = useState(emptyFeeForm);
  const [editingId, setEditingId] = useState(null);
  const [pageMode, setPageMode] = useState("list");
  const [selectedFee, setSelectedFee] = useState(null);
  const [structureLookupMessage, setStructureLookupMessage] = useState("");
  const [structureFound, setStructureFound] = useState(false);

  const [structureForm, setStructureForm] = useState(emptyStructureForm);
  const [editingStructureId, setEditingStructureId] = useState(null);

  const [searchText, setSearchText] = useState("");
  const [feeTypeFilter, setFeeTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [academicYearFilter, setAcademicYearFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!message) return undefined;

    const timeoutId = window.setTimeout(() => {
      setMessage("");
    }, 2000);

    return () => window.clearTimeout(timeoutId);
  }, [message]);

  async function loadFees() {
    const response = await API.get("/fees/");
    setFees(response.data || []);
  }

  async function loadStudents() {
    const response = await API.get("/students/");
    setStudents(response.data || []);
  }

  async function loadFeeTypes() {
    try {
      const values = await getMasterValues("FeeType");
      const finalValues = values && values.length > 0 ? values : fallbackFeeTypes;
      setFeeTypes(finalValues);
    } catch {
      setFeeTypes(fallbackFeeTypes);
    }
  }

  async function loadAcademicYears() {
    try {
      const response = await API.get("/academic-years/");
      setAcademicYears(response.data || []);
    } catch (error) {
      console.error(error);
    }
  }

  async function loadClassOptionsMaster() {
    try {
      const values = await getMasterValues("Class");
      setClassOptionsMaster(values || []);
    } catch (error) {
      console.error(error);
    }
  }

  async function loadFeeStructures() {
    try {
      const response = await API.get("/fee-structures/");
      setFeeStructures(response.data || []);
    } catch (error) {
      console.error(error);
    }
  }

  async function loadPageData() {
    try {
      setLoading(true);
      setMessage("");

      await Promise.all([
        loadFees(),
        loadStudents(),
        loadFeeTypes(),
        loadAcademicYears(),
        loadClassOptionsMaster(),
        loadFeeStructures(),
      ]);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load fees."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPageData();
  }, []);

  const studentMap = useMemo(() => {
    const map = {};

    students.forEach((student) => {
      map[student.id] = student;
    });

    return map;
  }, [students]);

  function getStudentName(studentId) {
    if (!studentId) return "-";
    const student = studentMap[studentId];

    if (!student) return `Student ID: ${studentId}`;

    const name =
      student.name ||
      student.student_name ||
      `${student.first_name || ""} ${student.last_name || ""}`.trim() ||
      `Student ID: ${student.id}`;

    return student.admission_no ? `${student.admission_no} - ${name}` : name;
  }

  function getClassLabel(fee) {
    const student = studentMap[fee.student_id];
    const className = fee.class_name_snapshot || student?.class_name || "";
    const section = fee.section_snapshot || student?.section || "";

    if (className && section) return `${className} - Section ${section}`;
    if (className) return className;
    if (fee.class_id || student?.class_id) {
      return `Class ID: ${fee.class_id || student.class_id}`;
    }

    return "-";
  }

  const academicYearOptions = useMemo(() => {
    return Array.from(new Set(fees.map((fee) => fee.academic_year).filter(Boolean)));
  }, [fees]);

  const classFilterOptions = useMemo(
    () => uniqueSorted(students.map((student) => student.class_name)),
    [students]
  );

  const sectionFilterOptions = useMemo(() => {
    return uniqueSorted(
      students
        .filter((student) => !classFilter || student.class_name === classFilter)
        .map((student) => student.section)
    );
  }, [students, classFilter]);

  useEffect(() => {
    if (editingId) return undefined;
    if (!formData.fee_type || !formData.academic_year) {
      setStructureLookupMessage("");
      setStructureFound(false);
      return undefined;
    }

    const student = studentMap[formData.student_id];
    let cancelled = false;

    API.get("/fee-structures/lookup", {
      params: {
        academic_year: formData.academic_year,
        fee_type: formData.fee_type,
        class_name: student?.class_name || undefined,
        residential_type: student?.residential_type || undefined,
      },
    })
      .then((response) => {
        if (cancelled) return;
        const structure = response.data;
        setFormData((prev) => ({
          ...prev,
          total_amount: String(structure.amount),
          due_date: structure.due_date || "",
        }));
        setStructureFound(true);
        setStructureLookupMessage("");
      })
      .catch((error) => {
        if (cancelled) return;
        setStructureFound(false);
        if (error.response?.status === 404) {
          setStructureLookupMessage(
            `No fee structure configured yet for ${formData.fee_type}${
              student?.class_name ? ` / Class ${student.class_name}` : ""
            }${
              student?.residential_type ? ` / ${student.residential_type}` : ""
            } in ${formData.academic_year}. Enter the amount manually, or add one under "Fee Structure".`
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [formData.fee_type, formData.academic_year, formData.student_id, editingId, studentMap]);

  function handleInputChange(e) {
    const { name, value } = e.target;

    if (["fee_type", "academic_year", "student_id"].includes(name)) {
      setStructureFound(false);
      setStructureLookupMessage("");
    }

    setFormData((prev) => {
      const updated = {
        ...prev,
        [name]: value,
      };

      if (["fee_type", "academic_year", "student_id"].includes(name)) {
        updated.total_amount = "";
        updated.due_date = "";
      }

      if (
        name === "total_amount" ||
        name === "paid_amount"
      ) {
        updated.payment_status = calculateFeeStatus(updated.total_amount, updated.paid_amount);
      }

      return updated;
    });
  }

  function buildPayload() {
    const totalAmount =
      formData.total_amount !== "" ? Number(formData.total_amount) : 0;

    const paidAmount =
      formData.paid_amount !== "" ? Number(formData.paid_amount) : 0;

    return {
      student_id: formData.student_id ? Number(formData.student_id) : null,
      fee_type: formData.fee_type || "",
      academic_year: formData.academic_year || null,
      total_amount: totalAmount,
      paid_amount: paidAmount,
      payment_date: formData.payment_date || null,
      due_date: formData.due_date || null,
      receipt_no: formData.receipt_no || null,
      remarks: formData.remarks || null,
    };
  }

  function validatePayload(payload) {
    if (!payload.student_id) {
      return "Student is required.";
    }

    if (!payload.fee_type) {
      return "Fee Type is required.";
    }

    if (!payload.total_amount || payload.total_amount <= 0) {
      return "Total Amount must be greater than 0.";
    }

    if (payload.paid_amount < 0) {
      return "Paid Amount cannot be negative.";
    }

    if (payload.paid_amount > payload.total_amount) {
      return "Paid Amount cannot be greater than Total Amount.";
    }

    if (payload.paid_amount > 0 && !payload.payment_date) {
      return "Payment Date is required when Paid Amount is entered.";
    }

    return "";
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setMessage("");

    try {
      const payload = buildPayload();
      const validationMessage = validatePayload(payload);

      if (validationMessage) {
        setMessage(validationMessage);
        return;
      }

      if (editingId) {
        await API.put(`/fees/${editingId}`, payload);
        setMessage("Fee updated successfully.");
      } else {
        await API.post("/fees/", payload);
        setMessage("Fee added successfully.");
      }

      setFormData(emptyFeeForm);
      setEditingId(null);
      setPageMode("list");
      await loadFees();
    } catch (error) {
      console.error(error);
      setMessage(
        getApiErrorMessage(error, "Something went wrong while saving fee.")
      );
    }
  }

  function handleEdit(fee) {
    setEditingId(fee.id);
    setPageMode("form");
    setStructureFound(false);
    setStructureLookupMessage("");

    const totalAmount = getFeeAmount(fee);
    const paidAmount = getPaidAmount(fee);

    setFormData({
      student_id: fee.student_id || "",
      fee_type: fee.fee_type || "",
      academic_year: fee.academic_year || "",
      total_amount: totalAmount || "",
      paid_amount: paidAmount || "",
      payment_date: normalizeDateInput(fee.payment_date),
      due_date: normalizeDateInput(fee.due_date),
      receipt_no: fee.receipt_no || "",
      remarks: fee.remarks || "",
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(feeId) {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this fee record?"
    );

    if (!confirmDelete) return;

    try {
      await API.delete(`/fees/${feeId}`);
      setMessage("Fee deleted successfully.");
      setSelectedFee(null);
      await loadFees();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to delete fee."));
    }
  }

  function handleCancelEdit() {
    setEditingId(null);
    setFormData(emptyFeeForm);
    setMessage("");
    setStructureLookupMessage("");
    setStructureFound(false);
    setPageMode("list");
  }

  function handleAddFee() {
    setEditingId(null);
    const currentYear = academicYears.find((year) => year.is_current);
    setFormData({
      ...emptyFeeForm,
      academic_year: currentYear ? currentYear.name : "",
    });
    setMessage("");
    setStructureFound(false);
    setPageMode("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleStructureFormChange(e) {
    const { name, value } = e.target;
    setStructureForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleAddStructure() {
    setEditingStructureId(null);
    setStructureForm(emptyStructureForm);
    setMessage("");
    setPageMode("structure");
  }

  function handleEditStructure(structure) {
    setEditingStructureId(structure.id);
    setStructureForm({
      academic_year: structure.academic_year || "",
      class_name: structure.class_name || "",
      residential_type: structure.residential_type || "",
      fee_type: structure.fee_type || "",
      amount: structure.amount ?? "",
      due_date: normalizeDateInput(structure.due_date),
      remarks: structure.remarks || "",
    });
    setPageMode("structure");
  }

  async function handleStructureSubmit(e) {
    e.preventDefault();
    setMessage("");

    if (!structureForm.academic_year || !structureForm.fee_type || !structureForm.amount) {
      setMessage("Academic Year, Fee Type and Amount are required.");
      return;
    }

    const payload = {
      academic_year: structureForm.academic_year,
      class_name: structureForm.class_name || null,
      residential_type: structureForm.residential_type || null,
      fee_type: structureForm.fee_type,
      amount: Number(structureForm.amount),
      due_date: structureForm.due_date || null,
      remarks: structureForm.remarks || null,
    };

    try {
      if (editingStructureId) {
        await API.put(`/fee-structures/${editingStructureId}`, payload);
        setMessage("Fee structure updated successfully.");
      } else {
        await API.post("/fee-structures/", payload);
        setMessage("Fee structure added successfully.");
      }
      setStructureForm(emptyStructureForm);
      setEditingStructureId(null);
      await loadFeeStructures();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to save fee structure."));
    }
  }

  async function handleDeleteStructure(structureId) {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this fee structure entry?"
    );
    if (!confirmDelete) return;

    try {
      await API.delete(`/fee-structures/${structureId}`);
      setMessage("Fee structure deleted successfully.");
      await loadFeeStructures();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to delete fee structure."));
    }
  }

  const filteredFees = fees.filter((fee) => {
    const studentName = getStudentName(fee.student_id);

    const searchableText = `
      ${studentName}
      ${fee.fee_type}
      ${getFeeAmount(fee)}
      ${getPaidAmount(fee)}
      ${getBalanceAmount(fee)}
      ${fee.academic_year}
      ${getClassLabel(fee)}
      ${fee.payment_date}
      ${fee.due_date}
      ${fee.payment_status}
      ${fee.receipt_no}
      ${fee.remarks}
    `.toLowerCase();

    const student = studentMap[fee.student_id];
    const feeClassName = fee.class_name_snapshot || student?.class_name || "";
    const feeSection = fee.section_snapshot || student?.section || "";

    const matchSearch = searchableText.includes(searchText.toLowerCase());
    const matchFeeType = feeTypeFilter ? fee.fee_type === feeTypeFilter : true;
    const matchStatus = statusFilter ? fee.payment_status === statusFilter : true;
    const matchAcademicYear = academicYearFilter
      ? fee.academic_year === academicYearFilter
      : true;
    const matchClass = classFilter ? feeClassName === classFilter : true;
    const matchSection = sectionFilter ? feeSection === sectionFilter : true;

    return (
      matchSearch &&
      matchFeeType &&
      matchStatus &&
      matchAcademicYear &&
      matchClass &&
      matchSection
    );
  });

  const totalAmount = fees.reduce((sum, fee) => sum + getFeeAmount(fee), 0);
  const paidAmount = fees.reduce((sum, fee) => sum + getPaidAmount(fee), 0);
  const balanceAmount = Math.max(totalAmount - paidAmount, 0);

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Fees Management</p>
          <h2>Fees Management</h2>
          <p>Manage total amount, paid amount, balance and payment status.</p>
        </div>

        <div className="module-header-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={loadPageData}
          >
            <RefreshCcw size={17} />
            Refresh
          </button>

          <button type="button" className="secondary-button" onClick={handleAddStructure}>
            <Settings2 size={17} />
            Fee Structure
          </button>

          <button type="button" className="primary-button" onClick={handleAddFee}>
            <PlusCircle size={18} />
            Add Fee
          </button>
        </div>
      </section>

      <section className="summary-strip report-summary-grid">
        <div className="summary-card">
          <Wallet size={22} />
          <div>
            <span>Total Fee Records</span>
            <strong>{fees.length}</strong>
          </div>
        </div>

        <div className="summary-card">
          <Wallet size={22} />
          <div>
            <span>Total Amount</span>
            <strong>Rs {totalAmount.toLocaleString("en-IN")}</strong>
          </div>
        </div>

        <div className="summary-card">
          <Wallet size={22} />
          <div>
            <span>Paid Amount</span>
            <strong>Rs {paidAmount.toLocaleString("en-IN")}</strong>
          </div>
        </div>

        <div className="summary-card warning">
          <Wallet size={22} />
          <div>
            <span>Balance Amount</span>
            <strong>Rs {balanceAmount.toLocaleString("en-IN")}</strong>
          </div>
        </div>
      </section>

      {message && <div className="toast-notification">{message}</div>}

      {pageMode === "form" && (
      <section className="form-panel">
        <div className="panel-header">
          <div>
            <h3>{editingId ? "Edit Fee" : "Add Fee"}</h3>
            <p>Fee status is calculated automatically from payment amount.</p>
          </div>
        </div>

        <form className="classic-form" onSubmit={handleSubmit}>
          <div className="sis-section-title">Fee Information</div>

          <div className="form-grid">
            <StudentPicker
              students={students}
              value={formData.student_id}
              onChange={handleInputChange}
            />

            <div className="form-field">
              <label>Fee Type *</label>
              <select
                name="fee_type"
                value={formData.fee_type}
                onChange={handleInputChange}
                required
              >
                <option value="">Select Fee Type</option>
                {feeTypes.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>Total Amount *</label>
              <input
                type="number"
                name="total_amount"
                value={formData.total_amount}
                onChange={handleInputChange}
                min="0"
                step="0.01"
                required
                disabled={structureFound}
              />
              <small>
                {structureLookupMessage ||
                  "Auto-filled from Fee Structure once Fee Type and Academic Year are set."}
                {" "}
                <button
                  type="button"
                  className="link-button"
                  onClick={() => setPageMode("structure")}
                  style={{ padding: 0, border: "none", background: "none", color: "var(--saas-primary)", textDecoration: "underline", cursor: "pointer", font: "inherit" }}
                >
                  Manage Fee Structures
                </button>
              </small>
            </div>

            <div className="form-field">
              <label>Academic Year</label>
              <select
                name="academic_year"
                value={formData.academic_year}
                onChange={handleInputChange}
              >
                <option value="">Select academic year</option>
                {academicYears.map((year) => (
                  <option key={year.id} value={year.name}>
                    {year.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>Due Date</label>
              <input
                type="date"
                name="due_date"
                value={formData.due_date}
                onChange={handleInputChange}
                disabled={structureFound}
              />
              <small>Auto-filled from Fee Structure when configured.</small>
            </div>

            <div className="form-field">
              <label>Paid Amount</label>
              <input
                type="number"
                name="paid_amount"
                value={formData.paid_amount}
                onChange={handleInputChange}
                min="0"
                step="0.01"
              />
            </div>

            <div className="form-field">
              <label>Payment Date</label>
              <input
                type="date"
                name="payment_date"
                value={formData.payment_date}
                onChange={handleInputChange}
              />
            </div>

            <div className="form-field">
              <label>Balance Amount</label>
              <input
                type="text"
                value={`Rs ${Math.max(
                  Number(formData.total_amount || 0) -
                    Number(formData.paid_amount || 0),
                  0
                ).toLocaleString("en-IN")}`}
                disabled
              />
            </div>

            <div className="form-field">
              <label>Receipt No</label>
              <input
                type="text"
                name="receipt_no"
                value={formData.receipt_no}
                onChange={handleInputChange}
                placeholder="Auto generated when paid"
              />
            </div>

            <div className="form-field full-width">
              <label>Remarks</label>
              <textarea
                name="remarks"
                rows="3"
                value={formData.remarks}
                onChange={handleInputChange}
              ></textarea>
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="primary-button">
              <PlusCircle size={18} />
              {editingId ? "Update Fee" : "Add Fee"}
            </button>

            <button
              type="button"
              className="light-button"
              onClick={handleCancelEdit}
            >
              Cancel
            </button>
          </div>
        </form>
      </section>
      )}

      {pageMode === "structure" && (
        <>
          <section className="form-panel">
            <div className="panel-header">
              <div>
                <h3>{editingStructureId ? "Edit Fee Structure" : "Add Fee Structure"}</h3>
                <p>
                  Define the amount and due date per academic year, class, and fee type.
                  Leave Class as "All Classes" for fee types that don't vary by grade
                  (e.g. Transport, Library). Leave Residential Type as "Both" unless
                  Day Scholars and Hostellers pay different amounts (e.g. Tuition Fee
                  is usually higher for boarders) &mdash; a specific match always wins
                  over a "Both"/"All Classes" entry.
                </p>
              </div>
            </div>

            <form className="classic-form" onSubmit={handleStructureSubmit}>
              <div className="form-grid">
                <div className="form-field">
                  <label>Academic Year *</label>
                  <select
                    name="academic_year"
                    value={structureForm.academic_year}
                    onChange={handleStructureFormChange}
                    required
                  >
                    <option value="">Select academic year</option>
                    {academicYears.map((year) => (
                      <option key={year.id} value={year.name}>{year.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-field">
                  <label>Class</label>
                  <select
                    name="class_name"
                    value={structureForm.class_name}
                    onChange={handleStructureFormChange}
                  >
                    <option value="">All Classes</option>
                    {classOptionsMaster.map((className) => (
                      <option key={className} value={className}>{className}</option>
                    ))}
                  </select>
                </div>

                <div className="form-field">
                  <label>Residential Type</label>
                  <select
                    name="residential_type"
                    value={structureForm.residential_type}
                    onChange={handleStructureFormChange}
                  >
                    <option value="">Both (Day Scholar &amp; Hosteller)</option>
                    {residentialTypeOptions.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </div>

                <div className="form-field">
                  <label>Fee Type *</label>
                  <select
                    name="fee_type"
                    value={structureForm.fee_type}
                    onChange={handleStructureFormChange}
                    required
                  >
                    <option value="">Select Fee Type</option>
                    {feeTypes.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </div>

                <div className="form-field">
                  <label>Amount *</label>
                  <input
                    type="number"
                    name="amount"
                    value={structureForm.amount}
                    onChange={handleStructureFormChange}
                    min="0"
                    step="0.01"
                    required
                  />
                </div>

                <div className="form-field">
                  <label>Due Date</label>
                  <input
                    type="date"
                    name="due_date"
                    value={structureForm.due_date}
                    onChange={handleStructureFormChange}
                  />
                </div>

                <div className="form-field full-width">
                  <label>Remarks</label>
                  <textarea
                    name="remarks"
                    rows="2"
                    value={structureForm.remarks}
                    onChange={handleStructureFormChange}
                  ></textarea>
                </div>
              </div>

              <div className="form-actions">
                <button type="submit" className="primary-button">
                  <PlusCircle size={18} />
                  {editingStructureId ? "Update Structure" : "Add Structure"}
                </button>

                <button
                  type="button"
                  className="light-button"
                  onClick={() => {
                    setEditingStructureId(null);
                    setStructureForm(emptyStructureForm);
                    setPageMode("list");
                  }}
                >
                  Back to Fees
                </button>
              </div>
            </form>
          </section>

          <section className="table-panel">
            <div className="panel-header">
              <div>
                <h3>Configured Fee Structures ({feeStructures.length})</h3>
              </div>
            </div>

            <div className="table-wrapper">
              <table className="classic-table">
                <thead>
                  <tr>
                    <th>Academic Year</th>
                    <th>Class</th>
                    <th>Residential Type</th>
                    <th>Fee Type</th>
                    <th>Amount</th>
                    <th>Due Date</th>
                    <th>Remarks</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {feeStructures.map((structure) => (
                    <tr key={structure.id}>
                      <td>{structure.academic_year}</td>
                      <td>{structure.class_name || "All Classes"}</td>
                      <td>{structure.residential_type || "Both"}</td>
                      <td>{structure.fee_type}</td>
                      <td>Rs {Number(structure.amount).toLocaleString("en-IN")}</td>
                      <td>{normalizeDateInput(structure.due_date) || "-"}</td>
                      <td>{structure.remarks || "-"}</td>
                      <td>
                        <div className="action-buttons">
                          <button
                            type="button"
                            className="edit-button"
                            onClick={() => handleEditStructure(structure)}
                            title="Edit"
                          >
                            <Edit size={15} />
                          </button>
                          <button
                            type="button"
                            className="delete-button"
                            onClick={() => handleDeleteStructure(structure.id)}
                            title="Delete"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!feeStructures.length && (
                    <tr>
                      <td colSpan={8}>No fee structures configured yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {pageMode === "list" && (
        <>
          <section className="table-panel module-filter-panel">
            <div className="filter-row sis-filter-row">
              <div className="form-field">
                <label>Fee Type</label>
                <select value={feeTypeFilter} onChange={(e) => setFeeTypeFilter(e.target.value)}>
                  <option value="">All Fee Types</option>
                  {feeTypes.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label>Status</label>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="">All Status</option>
                  {statusOptions.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label>Academic Year</label>
                <select
                  value={academicYearFilter}
                  onChange={(e) => setAcademicYearFilter(e.target.value)}
                >
                  <option value="">All Years</option>
                  {academicYearOptions.map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label>Class</label>
                <select
                  value={classFilter}
                  onChange={(e) => {
                    setClassFilter(e.target.value);
                    setSectionFilter("");
                  }}
                >
                  <option value="">All Classes</option>
                  {classFilterOptions.map((className) => (
                    <option key={className} value={className}>{className}</option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label>Section</label>
                <select value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)}>
                  <option value="">All Sections</option>
                  {sectionFilterOptions.map((section) => (
                    <option key={section} value={section}>{section}</option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                className="light-button"
                onClick={() => {
                  setFeeTypeFilter("");
                  setStatusFilter("");
                  setAcademicYearFilter("");
                  setClassFilter("");
                  setSectionFilter("");
                  setSearchText("");
                }}
              >
                Clear Filters
              </button>
            </div>
          </section>

          <ManagedRecordsTable
            count={filteredFees.length}
            emptyText="No fee records found."
            headers={["Student", "Class", "Academic Year", "Fee Type", "Total Amount", "Paid Amount", "Balance", "Due Date", "Payment Date", "Status", "Actions"]}
            loading={loading}
            loadingText="Loading fees..."
            searchPlaceholder="Search student, class, year, fee type, status..."
            searchText={searchText}
            setSearchText={setSearchText}
          >
            {filteredFees.map((fee) => (
                    <tr key={fee.id}>
                      <td>{getStudentName(fee.student_id)}</td>
                      <td>{getClassLabel(fee)}</td>
                      <td>{fee.academic_year || "-"}</td>
                      <td>{fee.fee_type || "-"}</td>
                      <td>Rs {getFeeAmount(fee).toLocaleString("en-IN")}</td>
                      <td>Rs {getPaidAmount(fee).toLocaleString("en-IN")}</td>
                      <td>Rs {getBalanceAmount(fee).toLocaleString("en-IN")}</td>
                      <td>{normalizeDateInput(fee.due_date) || "-"}</td>
                      <td>{normalizeDateInput(fee.payment_date) || "-"}</td>
                      <td>
                        <span className={getStatusClass(fee.payment_status)}>
                          {fee.payment_status || "Unpaid"}
                        </span>
                      </td>
                      <td>
                        <div className="action-buttons">
                          <button
                            type="button"
                            className="edit-button"
                            onClick={() => setSelectedFee(fee)}
                            title="View"
                          >
                            <Eye size={15} />
                          </button>

                          <button
                            type="button"
                            className="edit-button"
                            onClick={() => handleEdit(fee)}
                            title="Edit"
                          >
                            <Edit size={15} />
                          </button>

                          <button
                            type="button"
                            className="delete-button"
                            onClick={() => handleDelete(fee.id)}
                            title="Delete"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
            ))}
          </ManagedRecordsTable>
        </>
      )}

      {selectedFee && (
        <div className="student-drawer-backdrop">
          <aside className="student-drawer">
            <button
              type="button"
              className="drawer-close"
              onClick={() => setSelectedFee(null)}
            >
              <X size={18} />
            </button>

            <div className="student-profile-head">
              <div className="student-avatar">
                <Wallet size={42} />
              </div>

              <h3>{selectedFee.fee_type || "Fee Record"}</h3>
              <p>{getStudentName(selectedFee.student_id)}</p>
            </div>

            <div className="drawer-section">
              <h4>Fee Information</h4>
              <p>Student: {getStudentName(selectedFee.student_id)}</p>
              <p>Class: {getClassLabel(selectedFee)}</p>
              <p>Academic Year: {selectedFee.academic_year || "-"}</p>
              <p>Fee Type: {selectedFee.fee_type || "-"}</p>
              <p>Total Amount: Rs {getFeeAmount(selectedFee).toLocaleString("en-IN")}</p>
              <p>Paid Amount: Rs {getPaidAmount(selectedFee).toLocaleString("en-IN")}</p>
              <p>Balance: Rs {getBalanceAmount(selectedFee).toLocaleString("en-IN")}</p>
              <p>Due Date: {normalizeDateInput(selectedFee.due_date) || "-"}</p>
              <p>Payment Date: {normalizeDateInput(selectedFee.payment_date) || "-"}</p>
              <p>Receipt No: {selectedFee.receipt_no || "-"}</p>
              <p>Status: {selectedFee.payment_status || "Unpaid"}</p>
              <p>Remarks: {selectedFee.remarks || "-"}</p>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

