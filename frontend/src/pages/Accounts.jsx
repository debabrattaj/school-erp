import { useEffect, useMemo, useState } from "react";
import {
  Landmark,
  TrendingUp,
  TrendingDown,
  Wallet,
  PlusCircle,
  Trash2,
  Edit,
  Download,
} from "lucide-react";

import API from "../api";
import { useMoney } from "../utils/money";
import ManagedRecordsTable from "../components/ManagedRecordsTable";

const emptyEntryForm = {
  entry_date: "",
  entry_type: "Expense",
  category: "",
  amount: "",
  payment_mode: "",
  reference_no: "",
  description: "",
};

const entryTypeOptions = ["Income", "Expense"];
const categoryOptions = [
  "Salary",
  "Utilities",
  "Maintenance",
  "Donation",
  "Miscellaneous Income",
  "Other",
];

function getApiErrorMessage(error, fallbackMessage) {
  const detail = error.response?.data?.detail;
  if (Array.isArray(detail)) return detail.map((item) => item.msg).join(" | ");
  if (typeof detail === "string") return detail;
  return fallbackMessage;
}

export default function Accounts() {
  const money = useMoney();
  const [activeTab, setActiveTab] = useState("overview");
  const [summary, setSummary] = useState(null);
  const [ledger, setLedger] = useState([]);
  const [entries, setEntries] = useState([]);
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [ledgerTypeFilter, setLedgerTypeFilter] = useState("");
  const [searchText, setSearchText] = useState("");
  const [entryForm, setEntryForm] = useState(emptyEntryForm);
  const [editingEntryId, setEditingEntryId] = useState(null);
  const [formOpen, setFormOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!message) return undefined;
    const timeoutId = window.setTimeout(() => setMessage(""), 2000);
    return () => window.clearTimeout(timeoutId);
  }, [message]);

  async function loadPageData() {
    try {
      setLoading(true);
      setMessage("");
      const params = {};
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;

      const [summaryResponse, ledgerResponse, entriesResponse] = await Promise.all([
        API.get("/accounting/summary", { params }),
        API.get("/accounting/ledger", { params }),
        API.get("/accounting/entries/"),
      ]);
      setSummary(summaryResponse.data);
      setLedger(ledgerResponse.data || []);
      setEntries(entriesResponse.data || []);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load accounts data."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPageData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [startDate, endDate]);

  const filteredLedger = useMemo(() => {
    return ledger
      .filter((row) => !ledgerTypeFilter || row.entry_type === ledgerTypeFilter)
      .filter((row) =>
        `${row.category} ${row.description} ${row.source} ${row.reference_no || ""}`
          .toLowerCase()
          .includes(searchText.toLowerCase())
      );
  }, [ledger, ledgerTypeFilter, searchText]);

  const filteredEntries = useMemo(
    () =>
      entries.filter((entry) =>
        `${entry.category} ${entry.description || ""}`.toLowerCase().includes(searchText.toLowerCase())
      ),
    [entries, searchText]
  );

  function handleEntryChange(event) {
    const { name, value } = event.target;
    setEntryForm((prev) => ({ ...prev, [name]: value }));
  }

  function resetForm() {
    setEntryForm(emptyEntryForm);
    setEditingEntryId(null);
    setFormOpen(false);
  }

  function addEntry() {
    setActiveTab("entries");
    setEntryForm(emptyEntryForm);
    setEditingEntryId(null);
    setFormOpen(true);
  }

  function editEntry(entry) {
    setActiveTab("entries");
    setEditingEntryId(entry.id);
    setEntryForm({ ...emptyEntryForm, ...entry });
    setFormOpen(true);
  }

  async function saveEntry(event) {
    event.preventDefault();
    const payload = {
      ...entryForm,
      amount: Number(entryForm.amount || 0),
      payment_mode: entryForm.payment_mode || null,
      reference_no: entryForm.reference_no || null,
      description: entryForm.description || null,
    };

    try {
      if (editingEntryId) {
        await API.put(`/accounting/entries/${editingEntryId}`, payload);
        setMessage("Ledger entry updated successfully.");
      } else {
        await API.post("/accounting/entries/", payload);
        setMessage("Ledger entry added successfully.");
      }
      resetForm();
      await loadPageData();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to save ledger entry."));
    }
  }

  async function deleteEntry(id) {
    const confirmDelete = window.confirm("Delete this ledger entry?");
    if (!confirmDelete) return;
    try {
      await API.delete(`/accounting/entries/${id}`);
      setMessage("Ledger entry deleted successfully.");
      await loadPageData();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to delete ledger entry."));
    }
  }

  async function exportTally() {
    try {
      const params = {};
      if (startDate) params.start_date = startDate;
      if (endDate) params.end_date = endDate;

      const response = await API.get("/accounting/export/tally", {
        params,
        responseType: "blob",
      });

      const disposition = response.headers["content-disposition"] || "";
      const match = disposition.match(/filename="?([^";]+)"?/);
      const filename = match ? match[1] : "tally-vouchers.xml";

      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setMessage("Tally voucher file downloaded. Import it in Tally via Gateway > Import Data > Vouchers.");
    } catch (error) {
      console.error(error);
      if (error.response?.status === 404) {
        setMessage("No ledger entries in the selected period to export.");
      } else {
        setMessage(getApiErrorMessage(error, "Unable to export Tally file."));
      }
    }
  }

  const maxMonthly = Math.max(
    1,
    ...(summary?.monthly || []).map((row) => Math.max(row.income, row.expense))
  );

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Finance & Operations</p>
          <h2>Accounts</h2>
          <p>Track income from fee collections and expenses from inventory purchases, alongside other school finances.</p>
        </div>
        <div className="module-header-actions">
          <button type="button" className="secondary-button" onClick={exportTally}>
            <Download size={17} />
            Export to Tally
          </button>
          <button type="button" className="primary-button" onClick={addEntry}>
            <PlusCircle size={18} />
            Add Entry
          </button>
        </div>
      </section>

      <section className="accounts-filter-row">
        <div className="form-field">
          <label>From</label>
          <input type="date" value={startDate} onChange={(event) => setStartDate(event.target.value)} />
        </div>
        <div className="form-field">
          <label>To</label>
          <input type="date" value={endDate} onChange={(event) => setEndDate(event.target.value)} />
        </div>
      </section>

      <section className="accounts-summary-strip">
        <SummaryCard icon={TrendingUp} label="Total Income" value={money(summary?.total_income || 0)} accent="positive" />
        <SummaryCard icon={TrendingDown} label="Total Expense" value={money(summary?.total_expense || 0)} accent="negative" />
        <SummaryCard icon={Wallet} label="Fee Income" value={money(summary?.fee_income || 0)} />
        <SummaryCard icon={Landmark} label="Net Balance" value={money(summary?.net_balance || 0)} accent={(summary?.net_balance || 0) < 0 ? "negative" : "positive"} />
      </section>

      {message && <div className="toast-notification">{message}</div>}

      <section className="table-panel">
        <div className="student-profile-tabs">
          <button type="button" className={activeTab === "overview" ? "active" : ""} onClick={() => setActiveTab("overview")}>Overview</button>
          <button type="button" className={activeTab === "ledger" ? "active" : ""} onClick={() => setActiveTab("ledger")}>Ledger</button>
          <button type="button" className={activeTab === "entries" ? "active" : ""} onClick={() => setActiveTab("entries")}>Manual Entries</button>
        </div>
      </section>

      {activeTab === "overview" && (
        <section className="form-panel">
          <PanelTitle title="Monthly Income vs Expense" text="Fee collections and inventory purchases are pulled in automatically; other entries come from the manual ledger." />
          {(summary?.monthly || []).length === 0 ? (
            <p>No financial activity recorded for this period yet.</p>
          ) : (
            <div className="accounts-chart">
              {summary.monthly.map((row) => (
                <div className="accounts-chart-column" key={row.month}>
                  <div className="accounts-chart-bars">
                    <span
                      className="accounts-bar income"
                      style={{ height: `${(row.income / maxMonthly) * 100}%` }}
                      title={`Income: ${money(row.income)}`}
                    />
                    <span
                      className="accounts-bar expense"
                      style={{ height: `${(row.expense / maxMonthly) * 100}%` }}
                      title={`Expense: ${money(row.expense)}`}
                    />
                  </div>
                  <span className="accounts-chart-label">{row.month}</span>
                </div>
              ))}
            </div>
          )}
          <div className="accounts-breakdown">
            <div><span>Fee Income</span><strong>{money(summary?.fee_income || 0)}</strong></div>
            <div><span>Other Income</span><strong>{money(summary?.other_income || 0)}</strong></div>
            <div><span>Inventory Expense</span><strong>{money(summary?.inventory_expense || 0)}</strong></div>
            <div><span>Other Expense</span><strong>{money(summary?.other_expense || 0)}</strong></div>
          </div>
        </section>
      )}

      {activeTab === "ledger" && (
        <>
          <section className="accounts-filter-row">
            <div className="form-field">
              <label>Type</label>
              <select value={ledgerTypeFilter} onChange={(event) => setLedgerTypeFilter(event.target.value)}>
                <option value="">All</option>
                <option value="Income">Income</option>
                <option value="Expense">Expense</option>
              </select>
            </div>
          </section>
          <RecordsTable
            title="Ledger"
            count={filteredLedger.length}
            searchText={searchText}
            setSearchText={setSearchText}
            loading={loading}
            headers={["Date", "Type", "Category", "Description", "Source", "Reference", "Amount"]}
          >
            {filteredLedger.map((row, index) => (
              <tr key={`${row.source}-${row.date}-${index}`}>
                <td>{row.date}</td>
                <td><span className={row.entry_type === "Income" ? "status active" : "status danger"}>{row.entry_type}</span></td>
                <td>{row.category}</td>
                <td>{row.description}</td>
                <td>{row.source}</td>
                <td>{row.reference_no || "-"}</td>
                <td>{money(row.amount)}</td>
              </tr>
            ))}
          </RecordsTable>
        </>
      )}

      {activeTab === "entries" && (
        <>
          {formOpen && (
            <section className="form-panel">
              <PanelTitle title={editingEntryId ? "Edit Entry" : "Add Entry"} text="Record income and expenses not tied to fees or inventory, e.g. salaries, utilities, donations." />
              <form className="classic-form" onSubmit={saveEntry}>
                <div className="form-grid">
                  <TextField label="Date *" type="date" name="entry_date" value={entryForm.entry_date} onChange={handleEntryChange} required />
                  <div className="form-field">
                    <label>Type *</label>
                    <select name="entry_type" value={entryForm.entry_type} onChange={handleEntryChange} required>
                      {entryTypeOptions.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Category *</label>
                    <input list="accounts-categories" name="category" value={entryForm.category} onChange={handleEntryChange} required />
                  </div>
                  <TextField label="Amount *" type="number" name="amount" value={entryForm.amount} onChange={handleEntryChange} required />
                  <TextField label="Payment Mode" name="payment_mode" value={entryForm.payment_mode} onChange={handleEntryChange} />
                  <TextField label="Reference No" name="reference_no" value={entryForm.reference_no} onChange={handleEntryChange} />
                  <div className="form-field full-width">
                    <label>Description</label>
                    <textarea rows="3" name="description" value={entryForm.description} onChange={handleEntryChange}></textarea>
                  </div>
                </div>
                <datalist id="accounts-categories">
                  {categoryOptions.map((option) => <option key={option} value={option} />)}
                </datalist>
                <div className="form-actions">
                  <button type="submit" className="primary-button"><PlusCircle size={18} />{editingEntryId ? "Update Entry" : "Add Entry"}</button>
                  <button type="button" className="light-button" onClick={resetForm}>Cancel</button>
                </div>
              </form>
            </section>
          )}
          <RecordsTable
            title="Manual Entries"
            count={filteredEntries.length}
            searchText={searchText}
            setSearchText={setSearchText}
            loading={loading}
            headers={["Date", "Type", "Category", "Description", "Amount", "Actions"]}
          >
            {filteredEntries.map((entry) => (
              <tr key={entry.id}>
                <td>{entry.entry_date}</td>
                <td><span className={entry.entry_type === "Income" ? "status active" : "status danger"}>{entry.entry_type}</span></td>
                <td>{entry.category}</td>
                <td>{entry.description || "-"}</td>
                <td>{money(entry.amount)}</td>
                <td>
                  <div className="action-buttons">
                    <button type="button" className="edit-button" onClick={() => editEntry(entry)} title="Edit"><Edit size={15} /></button>
                    <button type="button" className="delete-button" onClick={() => deleteEntry(entry.id)} title="Delete"><Trash2 size={15} /></button>
                  </div>
                </td>
              </tr>
            ))}
          </RecordsTable>
        </>
      )}
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, accent }) {
  return (
    <div className={accent ? `summary-card ${accent}` : "summary-card"}>
      <Icon size={22} />
      <div><span>{label}</span><strong>{value}</strong></div>
    </div>
  );
}

function PanelTitle({ title, text }) {
  return <div className="panel-header"><div><h3>{title}</h3><p>{text}</p></div></div>;
}

function TextField({ label, ...props }) {
  return <div className="form-field"><label>{label}</label><input {...props} /></div>;
}

function RecordsTable({ title, count, searchText, setSearchText, loading, headers, children }) {
  return (
    <ManagedRecordsTable
      count={count}
      emptyText="No records found."
      headers={headers}
      loading={loading}
      loadingText={`Loading ${title.toLowerCase()}...`}
      searchPlaceholder="Search accounts records..."
      searchText={searchText}
      setSearchText={setSearchText}
    >
      {children}
    </ManagedRecordsTable>
  );
}
