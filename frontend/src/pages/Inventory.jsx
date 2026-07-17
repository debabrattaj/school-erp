import { useEffect, useMemo, useState } from "react";
import { todayLocalDate } from "../utils/date";
import { Boxes, Edit, IndianRupee, PackageCheck, PlusCircle, Trash2 } from "lucide-react";

import API from "../api";
import StudentPicker from "../components/StudentPicker";
import ManagedRecordsTable from "../components/ManagedRecordsTable";
import { getMasterValues } from "../services/masterDataService";

const today = todayLocalDate();

const CYCLE_OPTIONS = ["Yearly", "Half-Yearly", "One-time"];

const emptyItemForm = {
  item_name: "",
  item_code: "",
  category: "",
  unit: "pcs",
  quantity_available: 0,
  reorder_level: 0,
  unit_price: 0,
  location: "",
  status: "Active",
  remarks: "",
};

const emptyTransactionForm = {
  item_id: "",
  transaction_date: today,
  transaction_type: "Stock In",
  quantity: 1,
  issued_to_student_id: "",
  issued_to_staff: "",
  reference_no: "",
  unit_cost: "",
  remarks: "",
  unit_price: "",
  payment_status: "Paid",
};

const emptyBulkIssueForm = {
  cycle: "Yearly",
  academic_year: "",
  class_name: "",
  section: "",
  transaction_date: today,
  reference_no: "",
  remarks: "",
};

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b), undefined, { numeric: true })
  );
}

function getApiErrorMessage(error, fallbackMessage) {
  const detail = error.response?.data?.detail;
  if (Array.isArray(detail)) return detail.map((item) => item.msg).join(" | ");
  if (typeof detail === "string") return detail;
  return fallbackMessage;
}

export default function Inventory() {
  const [activeTab, setActiveTab] = useState("items");
  const [items, setItems] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [itemForm, setItemForm] = useState(emptyItemForm);
  const [transactionForm, setTransactionForm] = useState(emptyTransactionForm);
  const [bulkIssueForm, setBulkIssueForm] = useState(emptyBulkIssueForm);
  const [bulkIssueKit, setBulkIssueKit] = useState([]);
  const [bulkIssueItemId, setBulkIssueItemId] = useState("");
  const [bulkIssueQuantity, setBulkIssueQuantity] = useState(1);
  const [bulkIssueSaving, setBulkIssueSaving] = useState(false);
  const [editingItemId, setEditingItemId] = useState(null);
  const [formMode, setFormMode] = useState("");
  const [searchText, setSearchText] = useState("");
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
      const [itemResponse, transactionResponse, studentResponse, teacherResponse, categoryResponse, unitResponse, yearResponse] =
        await Promise.all([
          API.get("/inventory/items/"),
          API.get("/inventory/transactions/"),
          API.get("/students/"),
          API.get("/teachers/"),
          getMasterValues("InventoryCategory"),
          getMasterValues("InventoryUnit"),
          getMasterValues("AcademicYear"),
        ]);
      setItems(itemResponse.data || []);
      setTransactions(transactionResponse.data || []);
      setStudents(studentResponse.data || []);
      setTeachers(teacherResponse.data || []);
      setCategories(categoryResponse || []);
      setUnits(unitResponse || []);
      setAcademicYears(yearResponse || []);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load inventory data."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPageData();
  }, []);

  const lowStock = items.filter((item) => Number(item.quantity_available || 0) <= Number(item.reorder_level || 0)).length;
  const totalQuantity = items.reduce((sum, item) => sum + Number(item.quantity_available || 0), 0);
  const purchaseRevenue = transactions
    .filter((record) => record.transaction_type === "Purchase")
    .reduce((sum, record) => sum + Number(record.amount || 0), 0);

  const classOptions = useMemo(() => uniqueValues(students.map((student) => student.class_name)), [students]);
  const sectionOptions = useMemo(
    () =>
      uniqueValues(
        students
          .filter((student) => !bulkIssueForm.class_name || student.class_name === bulkIssueForm.class_name)
          .map((student) => student.section)
      ),
    [students, bulkIssueForm.class_name]
  );
  const bulkIssueMatchedStudents = useMemo(
    () =>
      students.filter((student) => {
        const matchClass = bulkIssueForm.class_name ? student.class_name === bulkIssueForm.class_name : true;
        const matchSection = bulkIssueForm.section ? student.section === bulkIssueForm.section : true;
        return matchClass && matchSection;
      }),
    [students, bulkIssueForm.class_name, bulkIssueForm.section]
  );

  const filteredItems = useMemo(
    () =>
      items.filter((item) =>
        `${item.item_name} ${item.item_code} ${item.category} ${item.location}`
          .toLowerCase()
          .includes(searchText.toLowerCase())
      ),
    [items, searchText]
  );

  const filteredTransactions = useMemo(
    () =>
      transactions.filter((record) =>
        `${record.item_name} ${record.item_code} ${record.transaction_type} ${record.student_name} ${record.issued_to_staff}`
          .toLowerCase()
          .includes(searchText.toLowerCase())
      ),
    [transactions, searchText]
  );

  function handleItemChange(event) {
    const { name, value } = event.target;
    setItemForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleTransactionChange(event) {
    const { name, value } = event.target;
    setTransactionForm((prev) => {
      const next = { ...prev, [name]: value };
      if (name === "item_id") {
        const selectedItem = items.find((item) => String(item.id) === String(value));
        if (selectedItem && !prev.unit_price) {
          next.unit_price = selectedItem.unit_price || "";
        }
      }
      return next;
    });
  }

  function handleBulkIssueFormChange(event) {
    const { name, value } = event.target;
    setBulkIssueForm((prev) => {
      const next = { ...prev, [name]: value };
      if (name === "class_name") next.section = "";
      return next;
    });
  }

  function addItemToKit() {
    if (!bulkIssueItemId || Number(bulkIssueQuantity) <= 0) return;
    setBulkIssueKit((prev) => {
      if (prev.some((entry) => String(entry.item_id) === String(bulkIssueItemId))) return prev;
      const item = items.find((candidate) => String(candidate.id) === String(bulkIssueItemId));
      return [
        ...prev,
        { item_id: Number(bulkIssueItemId), item_name: item?.item_name || "Item", quantity_per_student: Number(bulkIssueQuantity) },
      ];
    });
    setBulkIssueItemId("");
    setBulkIssueQuantity(1);
  }

  function removeItemFromKit(itemId) {
    setBulkIssueKit((prev) => prev.filter((entry) => entry.item_id !== itemId));
  }

  function resetForms() {
    setItemForm(emptyItemForm);
    setTransactionForm(emptyTransactionForm);
    setEditingItemId(null);
    setFormMode("");
  }

  async function saveItem(event) {
    event.preventDefault();
    const payload = {
      ...itemForm,
      quantity_available: Number(itemForm.quantity_available || 0),
      reorder_level: Number(itemForm.reorder_level || 0),
      unit_price: Number(itemForm.unit_price || 0),
      item_code: itemForm.item_code || null,
      remarks: itemForm.remarks || null,
    };

    try {
      if (editingItemId) {
        await API.put(`/inventory/items/${editingItemId}`, payload);
        setMessage("Inventory item updated successfully.");
      } else {
        await API.post("/inventory/items/", payload);
        setMessage("Inventory item added successfully.");
      }
      resetForms();
      await loadPageData();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to save inventory item."));
    }
  }

  async function saveTransaction(event) {
    event.preventDefault();
    const isPurchase = transactionForm.transaction_type === "Purchase";
    const payload = {
      ...transactionForm,
      item_id: Number(transactionForm.item_id),
      quantity: Number(transactionForm.quantity || 0),
      issued_to_student_id: transactionForm.issued_to_student_id
        ? Number(transactionForm.issued_to_student_id)
        : null,
      issued_to_staff: transactionForm.issued_to_staff || null,
      reference_no: transactionForm.reference_no || null,
      unit_cost: transactionForm.unit_cost !== "" ? Number(transactionForm.unit_cost) : null,
      remarks: transactionForm.remarks || null,
      unit_price: isPurchase && transactionForm.unit_price ? Number(transactionForm.unit_price) : null,
      payment_status: isPurchase ? transactionForm.payment_status : null,
    };

    try {
      await API.post("/inventory/transactions/", payload);
      setMessage("Inventory transaction saved successfully.");
      resetForms();
      await loadPageData();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to save inventory transaction."));
    }
  }

  async function submitBulkIssue(event) {
    event.preventDefault();
    if (!bulkIssueKit.length) {
      setMessage("Add at least one item to the issuance kit.");
      return;
    }
    if (!bulkIssueMatchedStudents.length) {
      setMessage("No students match the selected class/section.");
      return;
    }

    const payload = {
      items: bulkIssueKit.map((entry) => ({ item_id: entry.item_id, quantity_per_student: entry.quantity_per_student })),
      student_ids: bulkIssueMatchedStudents.map((student) => student.id),
      transaction_date: bulkIssueForm.transaction_date,
      cycle: bulkIssueForm.cycle,
      academic_year: bulkIssueForm.academic_year,
      reference_no: bulkIssueForm.reference_no || null,
      remarks: bulkIssueForm.remarks || null,
    };

    try {
      setBulkIssueSaving(true);
      const response = await API.post("/inventory/bulk-issue", payload);
      const { results, total_issued: totalIssued } = response.data;
      const notes = results
        .map((result) => {
          if (result.skipped_insufficient_stock) return `${result.item_name}: not enough stock`;
          if (result.skipped_duplicate_count) return `${result.item_name}: ${result.issued_count} issued, ${result.skipped_duplicate_count} already had this cycle`;
          return `${result.item_name}: ${result.issued_count} issued`;
        })
        .join(" | ");
      setMessage(`Issued to ${totalIssued} student record(s). ${notes}`);
      setBulkIssueKit([]);
      setBulkIssueForm(emptyBulkIssueForm);
      await loadPageData();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to complete bulk issuance."));
    } finally {
      setBulkIssueSaving(false);
    }
  }

  function editItem(item) {
    setActiveTab("items");
    setEditingItemId(item.id);
    setFormMode("item");
    setItemForm({ ...emptyItemForm, ...item });
  }

  function addItem() {
    setActiveTab("items");
    setEditingItemId(null);
    setItemForm(emptyItemForm);
    setFormMode("item");
  }

  function addMovement() {
    setActiveTab("transactions");
    setTransactionForm(emptyTransactionForm);
    setFormMode("transaction");
  }

  async function deleteRecord(type, id) {
    const confirmDelete = window.confirm("Delete this inventory record?");
    if (!confirmDelete) return;
    const endpoint = type === "item" ? `/inventory/items/${id}` : `/inventory/transactions/${id}`;
    try {
      await API.delete(endpoint);
      setMessage("Inventory record deleted successfully.");
      resetForms();
      await loadPageData();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to delete inventory record."));
    }
  }

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">School Operations</p>
          <h2>Inventory</h2>
          <p>Track school stock, supplies, issues to students, and reorder levels.</p>
        </div>
        <div className="module-header-actions">
          
          {activeTab !== "bulkIssue" && (
            <button type="button" className="primary-button" onClick={activeTab === "items" ? addItem : addMovement}>
              <PlusCircle size={18} />
              {activeTab === "items" ? "Add Item" : "Add Movement"}
            </button>
          )}
        </div>
      </section>

      <section className="summary-strip report-summary-grid">
        <SummaryCard icon={Boxes} label="Items" value={items.length} />
        <SummaryCard icon={PackageCheck} label="Total Quantity" value={totalQuantity} />
        <SummaryCard icon={Boxes} label="Low Stock" value={lowStock} warning />
        <SummaryCard icon={IndianRupee} label="Purchase Revenue" value={purchaseRevenue.toFixed(2)} />
      </section>

      {message && <div className="toast-notification">{message}</div>}

      <section className="table-panel">
        <div className="student-profile-tabs">
          <button type="button" className={activeTab === "items" ? "active" : ""} onClick={() => { setActiveTab("items"); resetForms(); }}>Items</button>
          <button type="button" className={activeTab === "transactions" ? "active" : ""} onClick={() => { setActiveTab("transactions"); resetForms(); }}>Stock Movement</button>
          <button type="button" className={activeTab === "bulkIssue" ? "active" : ""} onClick={() => { setActiveTab("bulkIssue"); resetForms(); }}>Issue to Class</button>
        </div>
      </section>

      {activeTab === "items" ? (
        <>
          {formMode === "item" && (
          <section className="form-panel">
            <PanelTitle title={editingItemId ? "Edit Item" : "Add Item"} text="Create inventory items with quantity and reorder level." />
            <form className="classic-form" onSubmit={saveItem}>
              <div className="form-grid">
                <TextField label="Item Name *" name="item_name" value={itemForm.item_name} onChange={handleItemChange} required />
                <TextField label="Item Code" name="item_code" value={itemForm.item_code} onChange={handleItemChange} />
                <div className="form-field"><label>Category</label><input list="inventory-categories" name="category" value={itemForm.category} onChange={handleItemChange} /></div>
                <div className="form-field"><label>Unit</label><input list="inventory-units" name="unit" value={itemForm.unit} onChange={handleItemChange} /></div>
                <TextField label="Available Quantity" type="number" name="quantity_available" value={itemForm.quantity_available} onChange={handleItemChange} />
                <TextField label="Reorder Level" type="number" name="reorder_level" value={itemForm.reorder_level} onChange={handleItemChange} />
                <TextField label="Selling Price" type="number" step="0.01" name="unit_price" value={itemForm.unit_price} onChange={handleItemChange} />
                <TextField label="Location" name="location" value={itemForm.location} onChange={handleItemChange} />
                <div className="form-field"><label>Status</label><select name="status" value={itemForm.status} onChange={handleItemChange}><option value="Active">Active</option><option value="Inactive">Inactive</option></select></div>
                <div className="form-field full-width"><label>Remarks</label><textarea name="remarks" rows="3" value={itemForm.remarks} onChange={handleItemChange}></textarea></div>
              </div>
              <datalist id="inventory-categories">{categories.map((item) => <option key={item} value={item} />)}</datalist>
              <datalist id="inventory-units">{units.map((item) => <option key={item} value={item} />)}</datalist>
              <FormActions editing={Boolean(editingItemId)} label="Item" resetForms={resetForms} />
            </form>
          </section>
          )}
          <RecordsTable title="Inventory Items" count={filteredItems.length} searchText={searchText} setSearchText={setSearchText} loading={loading} headers={["Item", "Code", "Category", "Unit", "Available", "Reorder", "Price", "Location", "Status", "Actions"]}>
            {filteredItems.map((item) => (
              <tr key={item.id}>
                <td>{item.item_name}</td><td>{item.item_code || "-"}</td><td>{item.category || "-"}</td><td>{item.unit || "-"}</td><td>{item.quantity_available}</td><td>{item.reorder_level}</td><td>{item.unit_price ? Number(item.unit_price).toFixed(2) : "-"}</td><td>{item.location || "-"}</td>
                <td><span className={item.status === "Active" ? "status active" : "status pending"}>{item.status}</span></td>
                <td><RowActions onEdit={() => editItem(item)} onDelete={() => deleteRecord("item", item.id)} /></td>
              </tr>
            ))}
          </RecordsTable>
        </>
      ) : (
        <>
          {formMode === "transaction" && (
          <section className="form-panel">
            <PanelTitle title="Add Stock Movement" text="Record stock in, stock out, returns, student issues, and student purchases." />
            <form className="classic-form" onSubmit={saveTransaction}>
              <div className="form-grid">
                <div className="form-field"><label>Item *</label><select name="item_id" value={transactionForm.item_id} onChange={handleTransactionChange} required><option value="">Select Item</option>{items.map((item) => <option key={item.id} value={item.id}>{item.item_name} ({item.quantity_available} {item.unit})</option>)}</select></div>
                <TextField label="Date *" type="date" name="transaction_date" value={transactionForm.transaction_date} onChange={handleTransactionChange} required />
                <div className="form-field"><label>Type *</label><select name="transaction_type" value={transactionForm.transaction_type} onChange={handleTransactionChange} required><option value="Stock In">Stock In</option><option value="Stock Out">Stock Out</option><option value="Issue">Issue</option><option value="Purchase">Purchase</option><option value="Return">Return</option><option value="Adjustment">Adjustment</option></select></div>
                <TextField label="Quantity *" type="number" name="quantity" value={transactionForm.quantity} onChange={handleTransactionChange} required />
                {transactionForm.transaction_type === "Stock In" && <TextField label="Unit Cost" type="number" name="unit_cost" value={transactionForm.unit_cost} onChange={handleTransactionChange} />}
                {(transactionForm.transaction_type === "Issue" || transactionForm.transaction_type === "Purchase") && (
                  <StudentPicker students={students} value={transactionForm.issued_to_student_id} onChange={handleTransactionChange} name="issued_to_student_id" required={transactionForm.transaction_type === "Purchase"} label="Student" />
                )}
                {transactionForm.transaction_type === "Purchase" && (
                  <>
                    <TextField label="Unit Price *" type="number" step="0.01" name="unit_price" value={transactionForm.unit_price} onChange={handleTransactionChange} required />
                    <div className="form-field"><label>Payment Status</label><select name="payment_status" value={transactionForm.payment_status} onChange={handleTransactionChange}><option value="Paid">Paid</option><option value="Unpaid">Unpaid</option></select></div>
                    <div className="form-field"><label>Amount</label><input type="text" value={(Number(transactionForm.unit_price || 0) * Number(transactionForm.quantity || 0)).toFixed(2)} disabled /></div>
                  </>
                )}
                <div className="form-field">
                  <label>Issued To Staff</label>
                  <select name="issued_to_staff" value={transactionForm.issued_to_staff} onChange={handleTransactionChange}>
                    <option value="">Select staff</option>
                    {teachers.map((teacher) => {
                      const label = [teacher.name, teacher.employee_no ? `(${teacher.employee_no})` : "", teacher.department ? `- ${teacher.department}` : ""]
                        .filter(Boolean)
                        .join(" ");
                      return (
                        <option key={teacher.id} value={teacher.name}>
                          {label}
                        </option>
                      );
                    })}
                  </select>
                </div>
                <TextField label="Reference No" name="reference_no" value={transactionForm.reference_no} onChange={handleTransactionChange} />
                <div className="form-field full-width"><label>Remarks</label><textarea name="remarks" rows="3" value={transactionForm.remarks} onChange={handleTransactionChange}></textarea></div>
              </div>
              <FormActions editing={false} label="Movement" resetForms={resetForms} />
            </form>
          </section>
          )}
          <RecordsTable title="Stock Movements" count={filteredTransactions.length} searchText={searchText} setSearchText={setSearchText} loading={loading} headers={["Date", "Item", "Type", "Quantity", "Cost", "Student", "Staff", "Cycle", "Amount", "Payment", "Reference", "Actions"]}>
            {filteredTransactions.map((record) => (
              <tr key={record.id}>
                <td>{record.transaction_date}</td><td>{record.item_code ? `${record.item_code} - ${record.item_name}` : record.item_name}</td><td>{record.transaction_type}</td><td>{record.quantity}</td><td>{record.total_cost != null ? record.total_cost : "-"}</td><td>{record.student_name ? `${record.admission_no || ""} ${record.student_name}` : "-"}</td><td>{record.issued_to_staff || "-"}</td>
                <td>{record.cycle ? `${record.cycle}${record.academic_year ? ` (${record.academic_year})` : ""}` : "-"}</td>
                <td>{record.amount ? Number(record.amount).toFixed(2) : "-"}</td>
                <td>{record.payment_status || "-"}</td>
                <td>{record.reference_no || "-"}</td>
                <td><button type="button" className="delete-button" onClick={() => deleteRecord("transaction", record.id)} title="Delete"><Trash2 size={15} /></button></td>
              </tr>
            ))}
          </RecordsTable>
        </>
      )}

      {activeTab === "bulkIssue" && (
        <section className="form-panel">
          <PanelTitle
            title="Issue to Class"
            text="Issue a kit of items to every student in a class/section for a Yearly or Half-Yearly cycle. Students who already received this cycle's kit are skipped automatically."
          />
          <form className="classic-form" onSubmit={submitBulkIssue}>
            <div className="form-grid">
              <div className="form-field">
                <label>Cycle *</label>
                <select name="cycle" value={bulkIssueForm.cycle} onChange={handleBulkIssueFormChange} required>
                  {CYCLE_OPTIONS.map((cycle) => <option key={cycle} value={cycle}>{cycle}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>Academic Year *</label>
                <select name="academic_year" value={bulkIssueForm.academic_year} onChange={handleBulkIssueFormChange} required>
                  <option value="">Select Academic Year</option>
                  {academicYears.map((year) => <option key={year} value={year}>{year}</option>)}
                </select>
              </div>
              <TextField label="Date *" type="date" name="transaction_date" value={bulkIssueForm.transaction_date} onChange={handleBulkIssueFormChange} required />
              <div className="form-field">
                <label>Class</label>
                <select name="class_name" value={bulkIssueForm.class_name} onChange={handleBulkIssueFormChange}>
                  <option value="">All Classes</option>
                  {classOptions.map((className) => <option key={className} value={className}>{className}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>Section</label>
                <select name="section" value={bulkIssueForm.section} onChange={handleBulkIssueFormChange}>
                  <option value="">All Sections</option>
                  {sectionOptions.map((section) => <option key={section} value={section}>{section}</option>)}
                </select>
              </div>
              <TextField label="Reference No" name="reference_no" value={bulkIssueForm.reference_no} onChange={handleBulkIssueFormChange} />
              <div className="form-field full-width"><label>Remarks</label><textarea name="remarks" rows="2" value={bulkIssueForm.remarks} onChange={handleBulkIssueFormChange}></textarea></div>
            </div>

            <p>{bulkIssueMatchedStudents.length} student(s) match this class/section.</p>

            <div className="form-grid">
              <div className="form-field">
                <label>Item</label>
                <select value={bulkIssueItemId} onChange={(event) => setBulkIssueItemId(event.target.value)}>
                  <option value="">Select Item</option>
                  {items.map((item) => <option key={item.id} value={item.id}>{item.item_name} ({item.quantity_available} {item.unit})</option>)}
                </select>
              </div>
              <TextField label="Quantity per Student" type="number" value={bulkIssueQuantity} onChange={(event) => setBulkIssueQuantity(event.target.value)} />
              <div className="form-field">
                <label>&nbsp;</label>
                <button type="button" className="secondary-button" onClick={addItemToKit}>Add to Kit</button>
              </div>
            </div>

            {bulkIssueKit.length > 0 && (
              <div className="table-wrapper">
                <table className="classic-table">
                  <thead><tr><th>Item</th><th>Quantity per Student</th><th></th></tr></thead>
                  <tbody>
                    {bulkIssueKit.map((entry) => (
                      <tr key={entry.item_id}>
                        <td>{entry.item_name}</td>
                        <td>{entry.quantity_per_student}</td>
                        <td><button type="button" className="delete-button" onClick={() => removeItemFromKit(entry.item_id)} title="Remove"><Trash2 size={15} /></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="form-actions">
              <button type="submit" className="primary-button" disabled={bulkIssueSaving}>
                <PackageCheck size={18} />
                {bulkIssueSaving ? "Issuing..." : "Issue to Class"}
              </button>
            </div>
          </form>
        </section>
      )}
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, warning = false }) {
  return <div className={warning ? "summary-card warning" : "summary-card"}><Icon size={22} /><div><span>{label}</span><strong>{value}</strong></div></div>;
}

function PanelTitle({ title, text }) {
  return <div className="panel-header"><div><h3>{title}</h3><p>{text}</p></div></div>;
}

function TextField({ label, ...props }) {
  return <div className="form-field"><label>{label}</label><input {...props} /></div>;
}

function FormActions({ editing, label, resetForms }) {
  return <div className="form-actions"><button type="submit" className="primary-button"><PlusCircle size={18} />{editing ? `Update ${label}` : `Add ${label}`}</button><button type="button" className="light-button" onClick={resetForms}>Cancel</button></div>;
}

function RecordsTable({ title, count, searchText, setSearchText, loading, headers, children }) {
  return (
    <ManagedRecordsTable
      count={count}
      emptyText="No records found."
      headers={headers}
      loading={loading}
      loadingText={`Loading ${title.toLowerCase()}...`}
      searchPlaceholder="Search inventory records..."
      searchText={searchText}
      setSearchText={setSearchText}
    >
      {children}
    </ManagedRecordsTable>
  );
}

function RowActions({ onEdit, onDelete }) {
  return <div className="action-buttons"><button type="button" className="edit-button" onClick={onEdit} title="Edit"><Edit size={15} /></button><button type="button" className="delete-button" onClick={onDelete} title="Delete"><Trash2 size={15} /></button></div>;
}
