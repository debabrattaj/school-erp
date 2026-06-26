import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Edit,
  Trash2,
  PlusCircle,
  Search,
  RefreshCcw,
  Eye,
  X,
  Wallet,
} from "lucide-react";

import API from "../api";
import { getMasterValues } from "../services/masterDataService";

const emptyFeeForm = {
  student_id: "",
  fee_type: "",
  total_amount: "",
  paid_amount: "",
  due_date: "",
  payment_date: "",
  status: "Pending",
};

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
  "Pending",
  "Partially Paid",
  "Paid",
  "Overdue",
  "Cancelled",
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
  return Math.max(getFeeAmount(fee) - getPaidAmount(fee), 0);
}

function calculateFeeStatus(totalAmount, paidAmount, dueDate, currentStatus) {
  if (currentStatus === "Cancelled") {
    return "Cancelled";
  }

  const total = Number(totalAmount || 0);
  const paid = Number(paidAmount || 0);

  if (total > 0 && paid >= total) {
    return "Paid";
  }

  if (paid > 0 && paid < total) {
    return "Partially Paid";
  }

  if (dueDate) {
    const today = new Date().toISOString().split("T")[0];

    if (dueDate < today) {
      return "Overdue";
    }
  }

  return "Pending";
}

function getStatusClass(status) {
  const text = String(status || "").toLowerCase();

  if (text === "paid") return "status active";
  if (text === "cancelled") return "status danger";
  if (text === "overdue") return "status danger";

  return "status warning";
}

export default function Fees() {
  const navigate = useNavigate();

  const [fees, setFees] = useState([]);
  const [students, setStudents] = useState([]);
  const [feeTypes, setFeeTypes] = useState(fallbackFeeTypes);

  const [formData, setFormData] = useState(emptyFeeForm);
  const [editingId, setEditingId] = useState(null);
  const [selectedFee, setSelectedFee] = useState(null);

  const [searchText, setSearchText] = useState("");
  const [feeTypeFilter, setFeeTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

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

  async function loadPageData() {
    try {
      setLoading(true);
      setMessage("");

      await Promise.all([loadFees(), loadStudents(), loadFeeTypes()]);
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
      const name = `${student.first_name || ""} ${
        student.last_name || ""
      }`.trim();

      map[student.id] = student.admission_no
        ? `${student.admission_no} - ${name}`
        : name || `Student ID: ${student.id}`;
    });

    return map;
  }, [students]);

  function getStudentName(studentId) {
    if (!studentId) return "-";
    return studentMap[studentId] || `Student ID: ${studentId}`;
  }

  function handleInputChange(e) {
    const { name, value } = e.target;

    setFormData((prev) => {
      const updated = {
        ...prev,
        [name]: value,
      };

      if (
        name === "total_amount" ||
        name === "paid_amount" ||
        name === "due_date" ||
        name === "status"
      ) {
        updated.status = calculateFeeStatus(
          updated.total_amount,
          updated.paid_amount,
          updated.due_date,
          updated.status
        );
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
      total_amount: totalAmount,
      paid_amount: paidAmount,
      due_date: formData.due_date || "",
      payment_date: formData.payment_date || null,
      status: calculateFeeStatus(
        totalAmount,
        paidAmount,
        formData.due_date,
        formData.status
      ),
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

    if (!payload.due_date) {
      return "Due Date is required.";
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

    const totalAmount = getFeeAmount(fee);
    const paidAmount = getPaidAmount(fee);

    setFormData({
      student_id: fee.student_id || "",
      fee_type: fee.fee_type || "",
      total_amount: totalAmount || "",
      paid_amount: paidAmount || "",
      due_date: normalizeDateInput(fee.due_date),
      payment_date: normalizeDateInput(fee.payment_date),
      status:
        fee.status ||
        calculateFeeStatus(totalAmount, paidAmount, fee.due_date, "Pending"),
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
  }

  const filteredFees = fees.filter((fee) => {
    const studentName = getStudentName(fee.student_id);

    const searchableText = `
      ${studentName}
      ${fee.fee_type}
      ${getFeeAmount(fee)}
      ${getPaidAmount(fee)}
      ${getBalanceAmount(fee)}
      ${fee.due_date}
      ${fee.payment_date}
      ${fee.status}
    `.toLowerCase();

    const matchSearch = searchableText.includes(searchText.toLowerCase());
    const matchFeeType = feeTypeFilter ? fee.fee_type === feeTypeFilter : true;
    const matchStatus = statusFilter ? fee.status === statusFilter : true;

    return matchSearch && matchFeeType && matchStatus;
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
            <strong>₹{totalAmount.toLocaleString("en-IN")}</strong>
          </div>
        </div>

        <div className="summary-card">
          <Wallet size={22} />
          <div>
            <span>Paid Amount</span>
            <strong>₹{paidAmount.toLocaleString("en-IN")}</strong>
          </div>
        </div>

        <div className="summary-card warning">
          <Wallet size={22} />
          <div>
            <span>Balance Amount</span>
            <strong>₹{balanceAmount.toLocaleString("en-IN")}</strong>
          </div>
        </div>
      </section>

      {message && <div className="message-box">{message}</div>}

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
            <div className="form-field">
              <label>Student *</label>
              <select
                name="student_id"
                value={formData.student_id}
                onChange={handleInputChange}
                required
              >
                <option value="">Select Student</option>
                {students.map((student) => (
                  <option key={student.id} value={student.id}>
                    {student.admission_no
                      ? `${student.admission_no} - ${student.first_name || ""} ${
                          student.last_name || ""
                        }`
                      : `${student.first_name || ""} ${student.last_name || ""}`}
                  </option>
                ))}
              </select>
            </div>

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
              />
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
              <label>Due Date *</label>
              <input
                type="date"
                name="due_date"
                value={formData.due_date}
                onChange={handleInputChange}
                required
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
              <label>Status *</label>
              <select
                name="status"
                value={formData.status}
                onChange={handleInputChange}
                required
              >
                {statusOptions.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>Balance Amount</label>
              <input
                type="text"
                value={`₹${Math.max(
                  Number(formData.total_amount || 0) -
                    Number(formData.paid_amount || 0),
                  0
                ).toLocaleString("en-IN")}`}
                disabled
              />
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="primary-button">
              <PlusCircle size={18} />
              {editingId ? "Update Fee" : "Add Fee"}
            </button>

            {editingId && (
              <button
                type="button"
                className="light-button"
                onClick={handleCancelEdit}
              >
                Cancel Edit
              </button>
            )}
          </div>
        </form>
      </section>

      <section className="table-panel">
        <div className="table-toolbar">
          <div>
            <h3>Fee Records</h3>
            <p>{filteredFees.length} fee record(s) found</p>
          </div>

          <div className="table-search">
            <Search size={17} />
            <input
              type="text"
              placeholder="Search student, fee type, status..."
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
            />
          </div>
        </div>

        <div className="filter-row sis-filter-row">
          <div className="form-field">
            <label>Fee Type</label>
            <select
              value={feeTypeFilter}
              onChange={(e) => setFeeTypeFilter(e.target.value)}
            >
              <option value="">All Fee Types</option>
              {feeTypes.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Status</option>
              {statusOptions.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className="light-button"
            onClick={() => {
              setFeeTypeFilter("");
              setStatusFilter("");
              setSearchText("");
            }}
          >
            Clear Filters
          </button>
        </div>

        {loading ? (
          <div className="loading-box">Loading fees...</div>
        ) : (
          <div className="table-wrapper">
            <table className="classic-table">
              <thead>
                <tr>
                  <th>Student</th>
                  <th>Fee Type</th>
                  <th>Total Amount</th>
                  <th>Paid Amount</th>
                  <th>Balance</th>
                  <th>Due Date</th>
                  <th>Payment Date</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>

              <tbody>
                {filteredFees.length === 0 ? (
                  <tr>
                    <td colSpan="9" className="empty-table">
                      No fee records found.
                    </td>
                  </tr>
                ) : (
                  filteredFees.map((fee) => (
                    <tr key={fee.id}>
                      <td>{getStudentName(fee.student_id)}</td>
                      <td>{fee.fee_type || "-"}</td>
                      <td>₹{getFeeAmount(fee).toLocaleString("en-IN")}</td>
                      <td>₹{getPaidAmount(fee).toLocaleString("en-IN")}</td>
                      <td>₹{getBalanceAmount(fee).toLocaleString("en-IN")}</td>
                      <td>{normalizeDateInput(fee.due_date) || "-"}</td>
                      <td>{normalizeDateInput(fee.payment_date) || "-"}</td>
                      <td>
                        <span className={getStatusClass(fee.status)}>
                          {fee.status || "Pending"}
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
                  ))
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

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
              <p>Fee Type: {selectedFee.fee_type || "-"}</p>
              <p>
                Total Amount: ₹
                {getFeeAmount(selectedFee).toLocaleString("en-IN")}
              </p>
              <p>
                Paid Amount: ₹
                {getPaidAmount(selectedFee).toLocaleString("en-IN")}
              </p>
              <p>
                Balance: ₹
                {getBalanceAmount(selectedFee).toLocaleString("en-IN")}
              </p>
              <p>
                Due Date: {normalizeDateInput(selectedFee.due_date) || "-"}
              </p>
              <p>
                Payment Date:{" "}
                {normalizeDateInput(selectedFee.payment_date) || "-"}
              </p>
              <p>Status: {selectedFee.status || "Pending"}</p>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}