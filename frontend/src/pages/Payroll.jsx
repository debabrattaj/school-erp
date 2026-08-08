import { useEffect, useMemo, useState } from "react";
import { Wallet, Users, Banknote, Download, Edit, X, PlayCircle } from "lucide-react";

import API from "../api";
import EnhancedRecordsTable from "../components/EnhancedRecordsTable";

const emptyStructureForm = {
  basic_pay: "",
  hra: "",
  other_allowances: "",
  provident_fund: "",
  professional_tax: "",
  other_deductions: "",
  effective_from: "",
};

const MONTH_NAMES = [
  "", "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function getApiErrorMessage(error, fallback) {
  return error.response?.data?.detail || fallback;
}

function currentMonthYear() {
  const now = new Date();
  return { month: now.getMonth() + 1, year: now.getFullYear() };
}

export default function Payroll() {
  const [teachers, setTeachers] = useState([]);
  const [structures, setStructures] = useState([]);
  const [payslips, setPayslips] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  const [editingTeacher, setEditingTeacher] = useState(null);
  const [structureForm, setStructureForm] = useState(emptyStructureForm);
  const [savingStructure, setSavingStructure] = useState(false);

  const { month: nowMonth, year: nowYear } = currentMonthYear();
  const [genMonth, setGenMonth] = useState(nowMonth);
  const [genYear, setGenYear] = useState(nowYear);
  const [generating, setGenerating] = useState(false);

  const [statusFilter, setStatusFilter] = useState("");
  const [searchText, setSearchText] = useState("");

  useEffect(() => {
    if (!message) return undefined;
    const timeoutId = window.setTimeout(() => setMessage(""), 2500);
    return () => window.clearTimeout(timeoutId);
  }, [message]);

  async function loadAll() {
    setLoading(true);
    try {
      const [teachersRes, structuresRes, payslipsRes] = await Promise.all([
        API.get("/teachers/"),
        API.get("/payroll/salary-structures"),
        API.get("/payroll/payslips"),
      ]);
      setTeachers(teachersRes.data || []);
      setStructures(structuresRes.data || []);
      setPayslips(payslipsRes.data || []);
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to load payroll data."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
  }, []);

  const structureByTeacher = useMemo(() => {
    const map = {};
    structures.forEach((s) => {
      map[s.teacher_id] = s;
    });
    return map;
  }, [structures]);

  function openStructureEditor(teacher) {
    const existing = structureByTeacher[teacher.id];
    setEditingTeacher(teacher);
    setStructureForm(
      existing
        ? {
            basic_pay: existing.basic_pay,
            hra: existing.hra,
            other_allowances: existing.other_allowances,
            provident_fund: existing.provident_fund,
            professional_tax: existing.professional_tax,
            other_deductions: existing.other_deductions,
            effective_from: existing.effective_from || "",
          }
        : emptyStructureForm
    );
  }

  function closeStructureEditor() {
    setEditingTeacher(null);
    setStructureForm(emptyStructureForm);
  }

  function handleStructureChange(e) {
    const { name, value } = e.target;
    setStructureForm((prev) => ({ ...prev, [name]: value }));
  }

  async function saveStructure(e) {
    e.preventDefault();
    if (!editingTeacher) return;
    setSavingStructure(true);
    try {
      await API.put(`/payroll/salary-structures/${editingTeacher.id}`, {
        basic_pay: Number(structureForm.basic_pay) || 0,
        hra: Number(structureForm.hra) || 0,
        other_allowances: Number(structureForm.other_allowances) || 0,
        provident_fund: Number(structureForm.provident_fund) || 0,
        professional_tax: Number(structureForm.professional_tax) || 0,
        other_deductions: Number(structureForm.other_deductions) || 0,
        effective_from: structureForm.effective_from || null,
      });
      setMessage("Salary structure saved.");
      closeStructureEditor();
      await loadAll();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to save salary structure."));
    } finally {
      setSavingStructure(false);
    }
  }

  async function runGeneratePayroll() {
    setGenerating(true);
    setMessage("");
    try {
      const response = await API.post("/payroll/generate", { month: Number(genMonth), year: Number(genYear) });
      const created = response.data || [];
      setMessage(
        created.length
          ? `Generated ${created.length} payslip(s) for ${MONTH_NAMES[genMonth]} ${genYear}.`
          : `No new payslips — already generated for ${MONTH_NAMES[genMonth]} ${genYear}, or no salary structures configured.`
      );
      await loadAll();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to generate payroll."));
    } finally {
      setGenerating(false);
    }
  }

  async function markPaid(payslip) {
    try {
      await API.put(`/payroll/payslips/${payslip.id}/mark-paid`, {
        payment_date: new Date().toISOString().slice(0, 10),
      });
      setMessage("Marked as paid.");
      await loadAll();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to update payslip."));
    }
  }

  async function downloadPayslip(payslip) {
    try {
      const response = await API.get(`/payroll/payslips/${payslip.id}/pdf`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `payslip_${payslip.teacher_name_snapshot || payslip.teacher_id}_${payslip.year}_${String(payslip.month).padStart(2, "0")}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to download payslip."));
    }
  }

  const pendingCount = payslips.filter((p) => p.status === "Pending").length;
  const thisMonthTotal = payslips
    .filter((p) => p.month === nowMonth && p.year === nowYear)
    .reduce((sum, p) => sum + (p.net_pay || 0), 0);

  const filteredPayslips = payslips.filter((p) => {
    const matchStatus = statusFilter ? p.status === statusFilter : true;
    const fullText = `${p.teacher_name_snapshot} ${MONTH_NAMES[p.month]} ${p.year} ${p.status}`.toLowerCase();
    const matchSearch = fullText.includes(searchText.toLowerCase());
    return matchStatus && matchSearch;
  });

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Finance & Operations</p>
          <h2>Payroll</h2>
          <p>Set each teacher's salary structure, then generate and track monthly payslips.</p>
        </div>
      </section>

      <section className="summary-strip report-summary-grid">
        <div className="summary-card">
          <Users size={22} />
          <div>
            <span>Salary Structures Set</span>
            <strong>{structures.length} / {teachers.length}</strong>
          </div>
        </div>
        <div className="summary-card warning">
          <Wallet size={22} />
          <div>
            <span>Pending Payslips</span>
            <strong>{pendingCount}</strong>
          </div>
        </div>
        <div className="summary-card">
          <Banknote size={22} />
          <div>
            <span>{MONTH_NAMES[nowMonth]} {nowYear} Net Payroll</span>
            <strong>{thisMonthTotal.toLocaleString()}</strong>
          </div>
        </div>
      </section>

      {message && <div className="toast-notification">{message}</div>}

      <section className="table-panel">
        <div className="panel-header">
          <div>
            <h3>Salary Structures</h3>
            <p>One structure per teacher. Editing it never changes an already-generated payslip.</p>
          </div>
        </div>
        <div className="table-wrapper">
          <table className="classic-table">
            <thead>
              <tr>
                <th>Employee No</th>
                <th>Name</th>
                <th>Basic Pay</th>
                <th>Gross Pay</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {teachers.map((teacher) => {
                const structure = structureByTeacher[teacher.id];
                const gross = structure
                  ? (structure.basic_pay || 0) + (structure.hra || 0) + (structure.other_allowances || 0)
                  : null;
                return (
                  <tr key={teacher.id}>
                    <td>{teacher.employee_no}</td>
                    <td>{teacher.name}</td>
                    <td>{structure ? structure.basic_pay.toLocaleString() : "-"}</td>
                    <td>{gross !== null ? gross.toLocaleString() : "Not configured"}</td>
                    <td>
                      <button type="button" className="edit-button" onClick={() => openStructureEditor(teacher)} title="Edit Salary">
                        <Edit size={15} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {!teachers.length && (
                <tr>
                  <td colSpan={5}>No teachers found. Add teachers first.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="form-panel">
        <div className="panel-header">
          <div>
            <h3>Generate Payroll</h3>
            <p>Snapshots every teacher's current salary structure into payslips for the chosen month. Safe to re-run — already-generated teachers are skipped.</p>
          </div>
        </div>
        <div className="classic-form">
          <div className="form-grid">
            <div className="form-field">
              <label>Month</label>
              <select value={genMonth} onChange={(e) => setGenMonth(Number(e.target.value))}>
                {MONTH_NAMES.slice(1).map((name, index) => (
                  <option key={name} value={index + 1}>{name}</option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label>Year</label>
              <input type="number" value={genYear} onChange={(e) => setGenYear(Number(e.target.value))} />
            </div>
          </div>
          <div className="form-actions">
            <button type="button" className="primary-button" onClick={runGeneratePayroll} disabled={generating}>
              <PlayCircle size={18} />
              {generating ? "Generating..." : "Generate Payroll"}
            </button>
          </div>
        </div>
      </section>

      <section className="table-panel module-filter-panel">
        <div className="filter-row sis-filter-row">
          <div className="form-field">
            <label>Status</label>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="">All Status</option>
              <option value="Pending">Pending</option>
              <option value="Paid">Paid</option>
            </select>
          </div>
        </div>
      </section>

      <EnhancedRecordsTable
        data={filteredPayslips}
        emptyText="No payslips generated yet."
        loading={loading}
        loadingText="Loading payslips..."
        searchPlaceholder="Search teacher, month, status..."
        searchText={searchText}
        setSearchText={setSearchText}
        columns={[
          { key: "teacher_name_snapshot", label: "Teacher", render: (p) => p.teacher_name_snapshot || "-" },
          { key: "period", label: "Period", render: (p) => `${MONTH_NAMES[p.month]} ${p.year}` },
          { key: "gross_pay", label: "Gross Pay", render: (p) => p.gross_pay.toLocaleString() },
          { key: "total_deductions", label: "Deductions", render: (p) => p.total_deductions.toLocaleString() },
          { key: "net_pay", label: "Net Pay", render: (p) => p.net_pay.toLocaleString() },
          {
            key: "status",
            label: "Status",
            render: (p) => (
              <span className={p.status === "Paid" ? "status active" : "status pending"}>{p.status}</span>
            ),
            value: (p) => p.status,
          },
          {
            key: "actions",
            label: "Actions",
            hideable: false,
            actions: false,
            render: (p) => (
              <div className="action-buttons">
                {p.status !== "Paid" && (
                  <button type="button" className="edit-button" onClick={() => markPaid(p)} title="Mark Paid">
                    Mark Paid
                  </button>
                )}
                <button type="button" className="edit-button" onClick={() => downloadPayslip(p)} title="Download PDF">
                  <Download size={15} />
                </button>
              </div>
            ),
            value: () => "",
          },
        ]}
      />

      {editingTeacher && (
        <div className="layout-modal-backdrop" onClick={closeStructureEditor}>
          <div className="layout-modal" style={{ width: "min(520px, 100%)" }} onClick={(event) => event.stopPropagation()}>
            <div className="layout-modal-header">
              <div>
                <h3>Salary Structure</h3>
                <p>{editingTeacher.name} ({editingTeacher.employee_no})</p>
              </div>
              <button type="button" className="light-icon-button" onClick={closeStructureEditor} title="Close">
                <X size={16} />
              </button>
            </div>

            <form className="classic-form" onSubmit={saveStructure}>
              <div className="form-grid">
                <div className="form-field">
                  <label>Basic Pay</label>
                  <input type="number" name="basic_pay" value={structureForm.basic_pay} onChange={handleStructureChange} min="0" step="0.01" required />
                </div>
                <div className="form-field">
                  <label>HRA</label>
                  <input type="number" name="hra" value={structureForm.hra} onChange={handleStructureChange} min="0" step="0.01" />
                </div>
                <div className="form-field">
                  <label>Other Allowances</label>
                  <input type="number" name="other_allowances" value={structureForm.other_allowances} onChange={handleStructureChange} min="0" step="0.01" />
                </div>
                <div className="form-field">
                  <label>Provident Fund</label>
                  <input type="number" name="provident_fund" value={structureForm.provident_fund} onChange={handleStructureChange} min="0" step="0.01" />
                </div>
                <div className="form-field">
                  <label>Professional Tax</label>
                  <input type="number" name="professional_tax" value={structureForm.professional_tax} onChange={handleStructureChange} min="0" step="0.01" />
                </div>
                <div className="form-field">
                  <label>Other Deductions</label>
                  <input type="number" name="other_deductions" value={structureForm.other_deductions} onChange={handleStructureChange} min="0" step="0.01" />
                </div>
                <div className="form-field">
                  <label>Effective From</label>
                  <input type="date" name="effective_from" value={structureForm.effective_from} onChange={handleStructureChange} />
                </div>
              </div>
              <div className="form-actions">
                <button type="submit" className="primary-button" disabled={savingStructure}>
                  {savingStructure ? "Saving..." : "Save Structure"}
                </button>
                <button type="button" className="light-button" onClick={closeStructureEditor}>
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
