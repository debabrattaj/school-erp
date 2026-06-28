import { useEffect, useMemo, useState } from "react";
import { Boxes, Edit, PackageCheck, PlusCircle, RefreshCcw, Search, Trash2 } from "lucide-react";

import API from "../api";
import StudentPicker from "../components/StudentPicker";
import { getMasterValues } from "../services/masterDataService";

const today = new Date().toISOString().slice(0, 10);

const emptyItemForm = {
  item_name: "",
  item_code: "",
  category: "",
  unit: "pcs",
  quantity_available: 0,
  reorder_level: 0,
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
  remarks: "",
};

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
  const [categories, setCategories] = useState([]);
  const [units, setUnits] = useState([]);
  const [itemForm, setItemForm] = useState(emptyItemForm);
  const [transactionForm, setTransactionForm] = useState(emptyTransactionForm);
  const [editingItemId, setEditingItemId] = useState(null);
  const [formMode, setFormMode] = useState("");
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function loadPageData() {
    try {
      setLoading(true);
      setMessage("");
      const [itemResponse, transactionResponse, studentResponse, categoryResponse, unitResponse] =
        await Promise.all([
          API.get("/inventory/items/"),
          API.get("/inventory/transactions/"),
          API.get("/students/"),
          getMasterValues("InventoryCategory"),
          getMasterValues("InventoryUnit"),
        ]);
      setItems(itemResponse.data || []);
      setTransactions(transactionResponse.data || []);
      setStudents(studentResponse.data || []);
      setCategories(categoryResponse || []);
      setUnits(unitResponse || []);
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
    setTransactionForm((prev) => ({ ...prev, [name]: value }));
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
    const payload = {
      ...transactionForm,
      item_id: Number(transactionForm.item_id),
      quantity: Number(transactionForm.quantity || 0),
      issued_to_student_id: transactionForm.issued_to_student_id
        ? Number(transactionForm.issued_to_student_id)
        : null,
      issued_to_staff: transactionForm.issued_to_staff || null,
      reference_no: transactionForm.reference_no || null,
      remarks: transactionForm.remarks || null,
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
          <button type="button" className="secondary-button" onClick={loadPageData}>
            <RefreshCcw size={17} />
            Refresh
          </button>
          <button type="button" className="primary-button" onClick={activeTab === "items" ? addItem : addMovement}>
            <PlusCircle size={18} />
            {activeTab === "items" ? "Add Item" : "Add Movement"}
          </button>
        </div>
      </section>

      <section className="summary-strip report-summary-grid">
        <SummaryCard icon={Boxes} label="Items" value={items.length} />
        <SummaryCard icon={PackageCheck} label="Total Quantity" value={totalQuantity} />
        <SummaryCard icon={Boxes} label="Low Stock" value={lowStock} warning />
      </section>

      {message && <div className="message-box">{message}</div>}

      <section className="table-panel">
        <div className="student-profile-tabs">
          <button type="button" className={activeTab === "items" ? "active" : ""} onClick={() => { setActiveTab("items"); resetForms(); }}>Items</button>
          <button type="button" className={activeTab === "transactions" ? "active" : ""} onClick={() => { setActiveTab("transactions"); resetForms(); }}>Stock Movement</button>
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
          <RecordsTable title="Inventory Items" count={filteredItems.length} searchText={searchText} setSearchText={setSearchText} loading={loading} headers={["Item", "Code", "Category", "Unit", "Available", "Reorder", "Location", "Status", "Actions"]}>
            {filteredItems.map((item) => (
              <tr key={item.id}>
                <td>{item.item_name}</td><td>{item.item_code || "-"}</td><td>{item.category || "-"}</td><td>{item.unit || "-"}</td><td>{item.quantity_available}</td><td>{item.reorder_level}</td><td>{item.location || "-"}</td>
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
            <PanelTitle title="Add Stock Movement" text="Record stock in, stock out, returns, and student issues." />
            <form className="classic-form" onSubmit={saveTransaction}>
              <div className="form-grid">
                <div className="form-field"><label>Item *</label><select name="item_id" value={transactionForm.item_id} onChange={handleTransactionChange} required><option value="">Select Item</option>{items.map((item) => <option key={item.id} value={item.id}>{item.item_name} ({item.quantity_available} {item.unit})</option>)}</select></div>
                <TextField label="Date *" type="date" name="transaction_date" value={transactionForm.transaction_date} onChange={handleTransactionChange} required />
                <div className="form-field"><label>Type *</label><select name="transaction_type" value={transactionForm.transaction_type} onChange={handleTransactionChange} required><option value="Stock In">Stock In</option><option value="Stock Out">Stock Out</option><option value="Issue">Issue</option><option value="Return">Return</option><option value="Adjustment">Adjustment</option></select></div>
                <TextField label="Quantity *" type="number" name="quantity" value={transactionForm.quantity} onChange={handleTransactionChange} required />
                {transactionForm.transaction_type === "Issue" && <StudentPicker students={students} value={transactionForm.issued_to_student_id} onChange={handleTransactionChange} name="issued_to_student_id" required={false} label="Student" />}
                <TextField label="Issued To Staff" name="issued_to_staff" value={transactionForm.issued_to_staff} onChange={handleTransactionChange} />
                <TextField label="Reference No" name="reference_no" value={transactionForm.reference_no} onChange={handleTransactionChange} />
                <div className="form-field full-width"><label>Remarks</label><textarea name="remarks" rows="3" value={transactionForm.remarks} onChange={handleTransactionChange}></textarea></div>
              </div>
              <FormActions editing={false} label="Movement" resetForms={resetForms} />
            </form>
          </section>
          )}
          <RecordsTable title="Stock Movements" count={filteredTransactions.length} searchText={searchText} setSearchText={setSearchText} loading={loading} headers={["Date", "Item", "Type", "Quantity", "Student", "Staff", "Reference", "Actions"]}>
            {filteredTransactions.map((record) => (
              <tr key={record.id}>
                <td>{record.transaction_date}</td><td>{record.item_code ? `${record.item_code} - ${record.item_name}` : record.item_name}</td><td>{record.transaction_type}</td><td>{record.quantity}</td><td>{record.student_name ? `${record.admission_no || ""} ${record.student_name}` : "-"}</td><td>{record.issued_to_staff || "-"}</td><td>{record.reference_no || "-"}</td>
                <td><button type="button" className="delete-button" onClick={() => deleteRecord("transaction", record.id)} title="Delete"><Trash2 size={15} /></button></td>
              </tr>
            ))}
          </RecordsTable>
        </>
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
  return <section className="table-panel"><div className="table-toolbar"><div><h3>{title}</h3><p>{count} record(s) found</p></div><div className="table-search"><Search size={17} /><input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search inventory records..." /></div></div>{loading ? <div className="loading-box">Loading inventory records...</div> : <div className="table-wrapper"><table className="classic-table"><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{count === 0 ? <tr><td colSpan={headers.length} className="empty-table">No records found.</td></tr> : children}</tbody></table></div>}</section>;
}

function RowActions({ onEdit, onDelete }) {
  return <div className="action-buttons"><button type="button" className="edit-button" onClick={onEdit} title="Edit"><Edit size={15} /></button><button type="button" className="delete-button" onClick={onDelete} title="Delete"><Trash2 size={15} /></button></div>;
}
