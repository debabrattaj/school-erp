import { useEffect, useMemo, useState } from "react";
import { todayLocalDate } from "../utils/date";
import {
  BarChart3,
  Boxes,
  Download,
  Edit,
  IndianRupee,
  Layers,
  PackageCheck,
  PlusCircle,
  ScanBarcode,
  Trash2,
  Upload,
  Users,
} from "lucide-react";

import API from "../api";
import StudentPicker from "../components/StudentPicker";
import ManagedRecordsTable from "../components/ManagedRecordsTable";
import BulkImportModal from "../components/BulkImportModal";
import { getMasterValues } from "../services/masterDataService";

const today = todayLocalDate();

const CYCLE_OPTIONS = ["Yearly", "Half-Yearly", "One-time"];
const APPLIES_TO_OPTIONS = ["Student", "Staff"];

const emptyItemForm = {
  item_name: "",
  item_code: "",
  barcode: "",
  category: "",
  unit: "Pcs",
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
  issued_to_teacher_id: "",
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

const emptyKitForm = {
  name: "",
  applies_to: "Student",
  is_active: true,
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
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [transactions, setTransactions] = useState([]);
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [kits, setKits] = useState([]);
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
  const [issueRecipientType, setIssueRecipientType] = useState("Student");
  const [issueMode, setIssueMode] = useState("kit");
  const [issueKitId, setIssueKitId] = useState("");
  const [staffDepartmentFilter, setStaffDepartmentFilter] = useState("");
  const [selectedTeacherIds, setSelectedTeacherIds] = useState([]);
  const [editingItemId, setEditingItemId] = useState(null);
  const [formMode, setFormMode] = useState("");
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // Kit editor state -- separate from the item/transaction editor above
  // because a kit is edited as "meta fields, then its items" rather than one
  // flat form, the same two-step shape the API itself requires (a kit must
  // exist before an item can be attached to it).
  const [kitForm, setKitForm] = useState(emptyKitForm);
  const [editingKit, setEditingKit] = useState(null);
  const [kitFormOpen, setKitFormOpen] = useState(false);
  const [kitItemPickerId, setKitItemPickerId] = useState("");
  const [kitItemPickerQty, setKitItemPickerQty] = useState(1);

  // Barcode scan-to-find in the Stock Movement form -- types/scans a code,
  // resolves it to an item and pre-selects it, rather than hunting the item
  // dropdown by name.
  const [barcodeInput, setBarcodeInput] = useState("");
  const [barcodeLookupMessage, setBarcodeLookupMessage] = useState("");

  const [reportsLoading, setReportsLoading] = useState(false);
  const [lowStockReport, setLowStockReport] = useState([]);
  const [costSummary, setCostSummary] = useState(null);
  const [kitCoverage, setKitCoverage] = useState([]);

  useEffect(() => {
    if (!message) return undefined;

    const timeoutId = window.setTimeout(() => {
      setMessage("");
    }, 2500);

    return () => window.clearTimeout(timeoutId);
  }, [message]);

  async function loadPageData() {
    try {
      setLoading(true);
      setMessage("");
      const [
        itemResponse,
        transactionResponse,
        studentResponse,
        teacherResponse,
        kitResponse,
        categoryResponse,
        unitResponse,
        yearResponse,
      ] = await Promise.all([
        API.get("/inventory/items/"),
        API.get("/inventory/transactions/"),
        API.get("/students/"),
        API.get("/teachers/"),
        API.get("/inventory/kits"),
        getMasterValues("InventoryCategory"),
        getMasterValues("InventoryUnit"),
        getMasterValues("AcademicYear"),
      ]);
      setItems(itemResponse.data || []);
      setTransactions(transactionResponse.data || []);
      setStudents(studentResponse.data || []);
      setTeachers(teacherResponse.data || []);
      setKits(kitResponse.data || []);
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
  const activeKitCount = kits.filter((kit) => kit.is_active).length;

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

  // Only kits scoped to whichever recipient type is selected are offered --
  // a Staff kit issued to students (or the reverse) is refused server-side,
  // so it should not even appear in the picker.
  const kitsForRecipientType = useMemo(
    () => kits.filter((kit) => kit.is_active && kit.applies_to === issueRecipientType),
    [kits, issueRecipientType]
  );
  const departmentOptions = useMemo(() => uniqueValues(teachers.map((teacher) => teacher.department)), [teachers]);
  const filteredTeachersForIssue = useMemo(
    () => teachers.filter((teacher) => !staffDepartmentFilter || teacher.department === staffDepartmentFilter),
    [teachers, staffDepartmentFilter]
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
        `${record.item_name} ${record.item_code} ${record.transaction_type} ${record.student_name} ${record.teacher_name} ${record.issued_to_staff}`
          .toLowerCase()
          .includes(searchText.toLowerCase())
      ),
    [transactions, searchText]
  );

  const filteredKits = useMemo(
    () =>
      kits.filter((kit) =>
        `${kit.name} ${kit.applies_to}`.toLowerCase().includes(searchText.toLowerCase())
      ),
    [kits, searchText]
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
      // Staff never buy -- clear whoever was picked as staff the moment the
      // type becomes Purchase, so a stale selection can't slip through.
      if (name === "transaction_type" && value === "Purchase") {
        next.issued_to_teacher_id = "";
        next.issued_to_staff = "";
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
      barcode: itemForm.barcode || null,
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
      issued_to_teacher_id: !isPurchase && transactionForm.issued_to_teacher_id
        ? Number(transactionForm.issued_to_teacher_id)
        : null,
      issued_to_staff: !isPurchase ? (transactionForm.issued_to_staff || null) : null,
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

  function toggleTeacherSelected(id) {
    setSelectedTeacherIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  function selectAllFilteredTeachers() {
    setSelectedTeacherIds(filteredTeachersForIssue.map((teacher) => teacher.id));
  }

  async function submitBulkIssue(event) {
    event.preventDefault();
    const isStaff = issueRecipientType === "Staff";
    const recipientIds = isStaff ? selectedTeacherIds : bulkIssueMatchedStudents.map((student) => student.id);

    if (!recipientIds.length) {
      setMessage(isStaff ? "Select at least one staff member." : "No students match the selected class/section.");
      return;
    }
    if (issueMode === "kit" && !issueKitId) {
      setMessage("Select a kit to issue.");
      return;
    }
    if (issueMode === "adhoc" && !bulkIssueKit.length) {
      setMessage("Add at least one item to issue.");
      return;
    }

    const payload = {
      transaction_date: bulkIssueForm.transaction_date,
      cycle: bulkIssueForm.cycle,
      academic_year: bulkIssueForm.academic_year,
      reference_no: bulkIssueForm.reference_no || null,
      remarks: bulkIssueForm.remarks || null,
      ...(isStaff ? { teacher_ids: recipientIds } : { student_ids: recipientIds }),
      ...(issueMode === "kit"
        ? { kit_id: Number(issueKitId) }
        : { items: bulkIssueKit.map((entry) => ({ item_id: entry.item_id, quantity_per_student: entry.quantity_per_student })) }),
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
      setMessage(`Issued to ${totalIssued} record(s). ${notes}`);
      setBulkIssueKit([]);
      setSelectedTeacherIds([]);
      setIssueKitId("");
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
    setItemForm({
      ...emptyItemForm,
      ...item,
      item_code: item.item_code || "",
      barcode: item.barcode || "",
      category: item.category || "",
      location: item.location || "",
      remarks: item.remarks || "",
    });
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

  async function downloadCsv(url, filename) {
    try {
      const response = await API.get(url, { responseType: "blob" });
      const blobUrl = window.URL.createObjectURL(new Blob([response.data], { type: "text/csv" }));
      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to export CSV."));
    }
  }

  async function lookupBarcode(event) {
    event.preventDefault();
    const code = barcodeInput.trim();
    if (!code) return;
    setBarcodeLookupMessage("");
    try {
      const response = await API.get(`/inventory/items/by-barcode/${encodeURIComponent(code)}`);
      setTransactionForm((prev) => ({ ...prev, item_id: String(response.data.id) }));
      setBarcodeLookupMessage(`Found: ${response.data.item_name}`);
    } catch (error) {
      setBarcodeLookupMessage(getApiErrorMessage(error, "No item with that barcode."));
    }
  }

  async function loadReports() {
    try {
      setReportsLoading(true);
      const [lowStockRes, costRes, coverageRes] = await Promise.all([
        API.get("/inventory/reports/low-stock"),
        API.get("/inventory/reports/cost-summary"),
        API.get("/inventory/reports/kit-coverage"),
      ]);
      setLowStockReport(lowStockRes.data || []);
      setCostSummary(costRes.data || null);
      setKitCoverage(coverageRes.data || []);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load inventory reports."));
    } finally {
      setReportsLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab === "reports") loadReports();
  }, [activeTab]);

  // ---------------- Kits ----------------

  function handleKitFormChange(event) {
    const { name, value, type, checked } = event.target;
    setKitForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  }

  function startAddKit() {
    setActiveTab("kits");
    setEditingKit(null);
    setKitForm(emptyKitForm);
    setKitFormOpen(true);
  }

  function startEditKit(kit) {
    setActiveTab("kits");
    setEditingKit(kit);
    setKitForm({ name: kit.name, applies_to: kit.applies_to, is_active: kit.is_active, remarks: kit.remarks || "" });
    setKitFormOpen(true);
  }

  function closeKitForm() {
    setEditingKit(null);
    setKitForm(emptyKitForm);
    setKitFormOpen(false);
  }

  async function saveKit(event) {
    event.preventDefault();
    const payload = { ...kitForm, remarks: kitForm.remarks || null };
    try {
      if (editingKit) {
        const response = await API.put(`/inventory/kits/${editingKit.id}`, payload);
        setEditingKit(response.data);
        setMessage("Kit updated successfully.");
      } else {
        const response = await API.post("/inventory/kits", payload);
        setEditingKit(response.data);
        setMessage("Kit created. Now add its items below.");
      }
      await loadPageData();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to save kit."));
    }
  }

  async function deleteKit(kit) {
    const confirmDelete = window.confirm(`Delete "${kit.name}"?`);
    if (!confirmDelete) return;
    try {
      await API.delete(`/inventory/kits/${kit.id}`);
      if (editingKit?.id === kit.id) closeKitForm();
      setMessage("Kit deleted successfully.");
      await loadPageData();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to delete kit. Kits already issued can be marked Inactive instead."));
    }
  }

  async function addKitItem(event) {
    event.preventDefault();
    if (!editingKit || !kitItemPickerId) return;
    try {
      const response = await API.post(`/inventory/kits/${editingKit.id}/items`, {
        item_id: Number(kitItemPickerId),
        quantity: Number(kitItemPickerQty) || 1,
      });
      setEditingKit(response.data);
      setKitItemPickerId("");
      setKitItemPickerQty(1);
      await loadPageData();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to add item to kit."));
    }
  }

  async function removeKitItem(itemId) {
    if (!editingKit) return;
    try {
      const response = await API.delete(`/inventory/kits/${editingKit.id}/items/${itemId}`);
      setEditingKit(response.data);
      await loadPageData();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to remove item from kit."));
    }
  }

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">School Operations</p>
          <h2>Inventory</h2>
          <p>Track school stock, supplies, kits, and issues to students and staff.</p>
        </div>
        <div className="module-header-actions">
          {activeTab === "items" && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => setShowBulkImport(true)}
            >
              <Upload size={17} />
              Import CSV
            </button>
          )}
          {activeTab === "items" && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => downloadCsv("/inventory/items/export", "inventory_items.csv")}
            >
              <Download size={17} />
              Export CSV
            </button>
          )}
          {activeTab === "items" && (
            <button type="button" className="primary-button" onClick={addItem}>
              <PlusCircle size={18} />
              Add Item
            </button>
          )}
          {activeTab === "transactions" && (
            <button
              type="button"
              className="secondary-button"
              onClick={() => downloadCsv("/inventory/transactions/export", "inventory_transactions.csv")}
            >
              <Download size={17} />
              Export CSV
            </button>
          )}
          {activeTab === "transactions" && (
            <button type="button" className="primary-button" onClick={addMovement}>
              <PlusCircle size={18} />
              Add Movement
            </button>
          )}
          {activeTab === "kits" && (
            <button type="button" className="primary-button" onClick={startAddKit}>
              <PlusCircle size={18} />
              Add Kit
            </button>
          )}
        </div>
      </section>

      {showBulkImport && (
        <BulkImportModal
          title="Bulk Import Inventory Items"
          description="Upload a CSV file to add multiple inventory items at once."
          templateUrl="/inventory/items/bulk-import-template"
          templateFilename="inventory_items_import_template.csv"
          importUrl="/inventory/items/bulk-import"
          onClose={() => setShowBulkImport(false)}
          onImported={loadPageData}
        />
      )}

      <section className="summary-strip report-summary-grid">
        <SummaryCard icon={Boxes} label="Items" value={items.length} />
        <SummaryCard icon={PackageCheck} label="Total Quantity" value={totalQuantity} />
        <SummaryCard icon={Boxes} label="Low Stock" value={lowStock} warning />
        <SummaryCard icon={Layers} label="Active Kits" value={activeKitCount} />
        <SummaryCard icon={IndianRupee} label="Purchase Revenue" value={purchaseRevenue.toFixed(2)} />
      </section>

      {message && <div className="toast-notification">{message}</div>}

      <section className="table-panel">
        <div className="student-profile-tabs">
          <button type="button" className={activeTab === "items" ? "active" : ""} onClick={() => { setActiveTab("items"); resetForms(); }}>Items</button>
          <button type="button" className={activeTab === "kits" ? "active" : ""} onClick={() => { setActiveTab("kits"); }}>Kits</button>
          <button type="button" className={activeTab === "transactions" ? "active" : ""} onClick={() => { setActiveTab("transactions"); resetForms(); }}>Stock Movement</button>
          <button type="button" className={activeTab === "bulkIssue" ? "active" : ""} onClick={() => { setActiveTab("bulkIssue"); }}>Issue a Kit</button>
          <button type="button" className={activeTab === "reports" ? "active" : ""} onClick={() => { setActiveTab("reports"); }}>Reports</button>
        </div>
      </section>

      {activeTab === "items" && (
        <>
          {formMode === "item" && (
          <section className="form-panel">
            <PanelTitle title={editingItemId ? "Edit Item" : "Add Item"} text="Create inventory items with quantity and reorder level." />
            <form className="classic-form" onSubmit={saveItem}>
              <div className="form-grid">
                <TextField label="Item Name *" name="item_name" value={itemForm.item_name} onChange={handleItemChange} required />
                <TextField label="Item Code" name="item_code" value={itemForm.item_code} onChange={handleItemChange} />
                <TextField label="Barcode" name="barcode" value={itemForm.barcode} onChange={handleItemChange} />
                <div className="form-field"><label>Category</label><input list="inventory-categories" name="category" value={itemForm.category} onChange={handleItemChange} /></div>
                <div className="form-field">
                  <label>Unit</label>
                  <select name="unit" value={itemForm.unit} onChange={handleItemChange}>
                    <option value="">Select Unit</option>
                    {(itemForm.unit && !units.includes(itemForm.unit) ? [itemForm.unit, ...units] : units).map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </div>
                <TextField label="Available Quantity" type="number" name="quantity_available" value={itemForm.quantity_available} onChange={handleItemChange} />
                <TextField label="Reorder Level" type="number" name="reorder_level" value={itemForm.reorder_level} onChange={handleItemChange} />
                <TextField label="Selling Price" type="number" step="0.01" name="unit_price" value={itemForm.unit_price} onChange={handleItemChange} />
                <TextField label="Location" name="location" value={itemForm.location} onChange={handleItemChange} />
                <div className="form-field"><label>Status</label><select name="status" value={itemForm.status} onChange={handleItemChange}><option value="Active">Active</option><option value="Inactive">Inactive</option></select></div>
                <div className="form-field full-width"><label>Remarks</label><textarea name="remarks" rows="3" value={itemForm.remarks} onChange={handleItemChange}></textarea></div>
              </div>
              <datalist id="inventory-categories">{categories.map((item) => <option key={item} value={item} />)}</datalist>
              <FormActions editing={Boolean(editingItemId)} label="Item" resetForms={resetForms} />
            </form>
          </section>
          )}
          <RecordsTable
            title="Inventory Items"
            count={filteredItems.length}
            searchText={searchText}
            setSearchText={setSearchText}
            loading={loading}
            headers={["Item", "Code", "Barcode", "Category", "Unit", "Available", "Reorder", "Price", "Location", "Status", "Actions"]}
          >
            {filteredItems.map((item) => (
              <tr key={item.id}>
                <td>{item.item_name}</td><td>{item.item_code || "-"}</td><td>{item.barcode || "-"}</td><td>{item.category || "-"}</td><td>{item.unit || "-"}</td><td>{item.quantity_available}</td><td>{item.reorder_level}</td><td>{item.unit_price ? Number(item.unit_price).toFixed(2) : "-"}</td><td>{item.location || "-"}</td>
                <td><span className={item.status === "Active" ? "status active" : "status pending"}>{item.status}</span></td>
                <td><RowActions onEdit={() => editItem(item)} onDelete={() => deleteRecord("item", item.id)} /></td>
              </tr>
            ))}
          </RecordsTable>
        </>
      )}

      {activeTab === "kits" && (
        <>
          {kitFormOpen && (
            <section className="form-panel">
              <PanelTitle
                title={editingKit ? `Edit Kit: ${editingKit.name}` : "Add Kit"}
                text="A kit is a named, reusable set of items issued together every cycle -- a Uniform Kit for students, a Staff ID Kit for staff. It is scoped to one audience: a student kit cannot be issued to staff, and a staff kit cannot be issued to students."
              />
              <form className="classic-form" onSubmit={saveKit}>
                <div className="form-grid">
                  <TextField label="Kit Name *" name="name" value={kitForm.name} onChange={handleKitFormChange} required />
                  <div className="form-field">
                    <label>Applies To *</label>
                    <select name="applies_to" value={kitForm.applies_to} onChange={handleKitFormChange} disabled={Boolean(editingKit)} required>
                      {APPLIES_TO_OPTIONS.map((option) => <option key={option} value={option}>{option}</option>)}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Status</label>
                    <select name="is_active" value={kitForm.is_active ? "true" : "false"} onChange={(event) => setKitForm((prev) => ({ ...prev, is_active: event.target.value === "true" }))}>
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </select>
                  </div>
                  <div className="form-field full-width"><label>Remarks</label><textarea name="remarks" rows="2" value={kitForm.remarks} onChange={handleKitFormChange}></textarea></div>
                </div>
                <div className="form-actions">
                  <button type="submit" className="primary-button"><PlusCircle size={18} />{editingKit ? "Save Changes" : "Create Kit"}</button>
                  <button type="button" className="light-button" onClick={closeKitForm}>Close</button>
                </div>
              </form>

              {editingKit && (
                <div className="kit-items-editor">
                  <h4>Items in this kit</h4>
                  {editingKit.items.length === 0 && <p className="hint-text">No items yet -- add at least one below before this kit can be issued.</p>}
                  {editingKit.items.length > 0 && (
                    <div className="table-wrapper">
                      <table className="classic-table">
                        <thead><tr><th>Item</th><th>Quantity per Recipient</th><th></th></tr></thead>
                        <tbody>
                          {editingKit.items.map((row) => (
                            <tr key={row.id}>
                              <td>{row.item_name}</td>
                              <td>{row.quantity} {row.unit}</td>
                              <td><button type="button" className="delete-button" onClick={() => removeKitItem(row.item_id)} title="Remove"><Trash2 size={15} /></button></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                  <form className="form-grid" onSubmit={addKitItem}>
                    <div className="form-field">
                      <label>Add Item</label>
                      <select value={kitItemPickerId} onChange={(event) => setKitItemPickerId(event.target.value)}>
                        <option value="">Select Item</option>
                        {items
                          .filter((item) => !editingKit.items.some((row) => row.item_id === item.id))
                          .map((item) => <option key={item.id} value={item.id}>{item.item_name} ({item.quantity_available} {item.unit})</option>)}
                      </select>
                    </div>
                    <TextField label="Quantity per Recipient" type="number" value={kitItemPickerQty} onChange={(event) => setKitItemPickerQty(event.target.value)} />
                    <div className="form-field">
                      <label>&nbsp;</label>
                      <button type="submit" className="secondary-button">Add to Kit</button>
                    </div>
                  </form>
                </div>
              )}
            </section>
          )}

          <RecordsTable title="Kits" count={filteredKits.length} searchText={searchText} setSearchText={setSearchText} loading={loading} headers={["Kit", "Applies To", "Items", "Status", "Actions"]}>
            {filteredKits.map((kit) => (
              <tr key={kit.id}>
                <td>{kit.name}</td>
                <td><span className={kit.applies_to === "Staff" ? "status pending" : "status active"}>{kit.applies_to}</span></td>
                <td>{kit.items.length} item(s)</td>
                <td><span className={kit.is_active ? "status active" : "status pending"}>{kit.is_active ? "Active" : "Inactive"}</span></td>
                <td><RowActions onEdit={() => startEditKit(kit)} onDelete={() => deleteKit(kit)} /></td>
              </tr>
            ))}
          </RecordsTable>
        </>
      )}

      {activeTab === "transactions" && (
        <>
          {formMode === "transaction" && (
          <section className="form-panel">
            <PanelTitle title="Add Stock Movement" text="Record stock in, stock out, returns, and individual issues. Purchases (a paid replacement for a lost item) are recorded for a student only -- staff never buy." />
            <form className="classic-form barcode-scan-form" onSubmit={lookupBarcode}>
              <div className="form-grid">
                <TextField
                  label="Scan or Enter Barcode"
                  name="barcodeInput"
                  value={barcodeInput}
                  onChange={(event) => setBarcodeInput(event.target.value)}
                  placeholder="Scan barcode to find item"
                />
                <div className="form-field">
                  <label>&nbsp;</label>
                  <button type="submit" className="secondary-button">
                    <ScanBarcode size={16} /> Find Item
                  </button>
                </div>
              </div>
              {barcodeLookupMessage && <p className="hint-text">{barcodeLookupMessage}</p>}
            </form>
            <form className="classic-form" onSubmit={saveTransaction}>
              <div className="form-grid">
                <div className="form-field"><label>Item *</label><select name="item_id" value={transactionForm.item_id} onChange={handleTransactionChange} required><option value="">Select Item</option>{items.map((item) => <option key={item.id} value={item.id}>{item.item_name} ({item.quantity_available} {item.unit})</option>)}</select></div>
                <TextField label="Date *" type="date" name="transaction_date" value={transactionForm.transaction_date} onChange={handleTransactionChange} required />
                <div className="form-field"><label>Type *</label><select name="transaction_type" value={transactionForm.transaction_type} onChange={handleTransactionChange} required><option value="Stock In">Stock In</option><option value="Stock Out">Stock Out</option><option value="Issue">Issue</option><option value="Purchase">Purchase</option><option value="Return">Return</option><option value="Adjustment">Adjustment</option></select></div>
                <TextField label="Quantity *" type="number" name="quantity" value={transactionForm.quantity} onChange={handleTransactionChange} required />
                {transactionForm.transaction_type === "Stock In" && <TextField label="Unit Cost" type="number" name="unit_cost" value={transactionForm.unit_cost} onChange={handleTransactionChange} />}
                {(transactionForm.transaction_type === "Issue" || transactionForm.transaction_type === "Purchase" || transactionForm.transaction_type === "Return") && (
                  <StudentPicker students={students} value={transactionForm.issued_to_student_id} onChange={handleTransactionChange} name="issued_to_student_id" required={transactionForm.transaction_type === "Purchase"} label="Student" />
                )}
                {transactionForm.transaction_type !== "Purchase" && (
                  <>
                    <div className="form-field">
                      <label>Staff Member</label>
                      <select name="issued_to_teacher_id" value={transactionForm.issued_to_teacher_id} onChange={handleTransactionChange}>
                        <option value="">Select staff</option>
                        {teachers.map((teacher) => {
                          const label = [teacher.name, teacher.employee_no ? `(${teacher.employee_no})` : "", teacher.department ? `- ${teacher.department}` : ""]
                            .filter(Boolean)
                            .join(" ");
                          return <option key={teacher.id} value={teacher.id}>{label}</option>;
                        })}
                      </select>
                    </div>
                    <TextField label="Other Staff (not in directory)" name="issued_to_staff" value={transactionForm.issued_to_staff} onChange={handleTransactionChange} />
                  </>
                )}
                {transactionForm.transaction_type === "Purchase" && (
                  <>
                    <TextField label="Unit Price" type="number" step="0.01" name="unit_price" value={transactionForm.unit_price} onChange={handleTransactionChange} placeholder="Defaults to item's selling price" />
                    <div className="form-field"><label>Payment Status</label><select name="payment_status" value={transactionForm.payment_status} onChange={handleTransactionChange}><option value="Paid">Paid</option><option value="Unpaid">Unpaid</option></select></div>
                    <div className="form-field"><label>Amount</label><input type="text" value={(Number(transactionForm.unit_price || 0) * Number(transactionForm.quantity || 0)).toFixed(2)} disabled /></div>
                    <p className="hint-text full-width">Staff never buy -- a Purchase is always recorded for a student. Leave Unit Price blank to use the item's own selling price.</p>
                  </>
                )}
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
                <td>{record.transaction_date}</td><td>{record.item_code ? `${record.item_code} - ${record.item_name}` : record.item_name}</td><td>{record.transaction_type}</td><td>{record.quantity}</td><td>{record.total_cost != null ? record.total_cost : "-"}</td><td>{record.student_name ? `${record.admission_no || ""} ${record.student_name}` : "-"}</td><td>{record.teacher_name || record.issued_to_staff || "-"}</td>
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
            title="Issue a Kit"
            text="Issue a saved kit (or pick items ad hoc) to a class/section of students, or to a group of staff. Anyone who already received an item this cycle and academic year is skipped automatically."
          />
          <form className="classic-form" onSubmit={submitBulkIssue}>
            <div className="form-grid">
              <div className="form-field">
                <label>Recipients *</label>
                <select
                  value={issueRecipientType}
                  onChange={(event) => {
                    setIssueRecipientType(event.target.value);
                    setIssueKitId("");
                  }}
                >
                  <option value="Student">Students</option>
                  <option value="Staff">Staff</option>
                </select>
              </div>
              <div className="form-field">
                <label>Issue From *</label>
                <select value={issueMode} onChange={(event) => setIssueMode(event.target.value)}>
                  <option value="kit">Saved Kit</option>
                  <option value="adhoc">Pick Items Myself</option>
                </select>
              </div>
              {issueMode === "kit" && (
                <div className="form-field">
                  <label>Kit *</label>
                  <select value={issueKitId} onChange={(event) => setIssueKitId(event.target.value)} required>
                    <option value="">Select a {issueRecipientType.toLowerCase()} kit</option>
                    {kitsForRecipientType.map((kit) => <option key={kit.id} value={kit.id}>{kit.name} ({kit.items.length} item(s))</option>)}
                  </select>
                  {kitsForRecipientType.length === 0 && (
                    <p className="hint-text">No active {issueRecipientType.toLowerCase()} kits yet. Create one on the Kits tab first.</p>
                  )}
                </div>
              )}
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
              <TextField label="Reference No" name="reference_no" value={bulkIssueForm.reference_no} onChange={handleBulkIssueFormChange} />
              <div className="form-field full-width"><label>Remarks</label><textarea name="remarks" rows="2" value={bulkIssueForm.remarks} onChange={handleBulkIssueFormChange}></textarea></div>
            </div>

            {issueRecipientType === "Student" ? (
              <div className="form-grid">
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
                <div className="form-field full-width">
                  <p><Users size={15} /> {bulkIssueMatchedStudents.length} student(s) match this class/section.</p>
                </div>
              </div>
            ) : (
              <div className="staff-recipient-picker">
                <div className="form-grid">
                  <div className="form-field">
                    <label>Department</label>
                    <select value={staffDepartmentFilter} onChange={(event) => setStaffDepartmentFilter(event.target.value)}>
                      <option value="">All Departments</option>
                      {departmentOptions.map((department) => <option key={department} value={department}>{department}</option>)}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>&nbsp;</label>
                    <div className="staff-picker-actions">
                      <button type="button" className="light-button" onClick={selectAllFilteredTeachers}>Select All Shown</button>
                      <button type="button" className="light-button" onClick={() => setSelectedTeacherIds([])}>Clear</button>
                    </div>
                  </div>
                </div>
                <p>{selectedTeacherIds.length} staff member(s) selected.</p>
                <div className="staff-checklist">
                  {filteredTeachersForIssue.map((teacher) => (
                    <label key={teacher.id} className="staff-checklist-row">
                      <input
                        type="checkbox"
                        checked={selectedTeacherIds.includes(teacher.id)}
                        onChange={() => toggleTeacherSelected(teacher.id)}
                      />
                      <span>{teacher.name}{teacher.department ? ` — ${teacher.department}` : ""}</span>
                    </label>
                  ))}
                  {filteredTeachersForIssue.length === 0 && <p className="hint-text">No staff match this filter.</p>}
                </div>
              </div>
            )}

            {issueMode === "adhoc" && (
              <>
                <div className="form-grid">
                  <div className="form-field">
                    <label>Item</label>
                    <select value={bulkIssueItemId} onChange={(event) => setBulkIssueItemId(event.target.value)}>
                      <option value="">Select Item</option>
                      {items.map((item) => <option key={item.id} value={item.id}>{item.item_name} ({item.quantity_available} {item.unit})</option>)}
                    </select>
                  </div>
                  <TextField label="Quantity per Recipient" type="number" value={bulkIssueQuantity} onChange={(event) => setBulkIssueQuantity(event.target.value)} />
                  <div className="form-field">
                    <label>&nbsp;</label>
                    <button type="button" className="secondary-button" onClick={addItemToKit}>Add Item</button>
                  </div>
                </div>

                {bulkIssueKit.length > 0 && (
                  <div className="table-wrapper">
                    <table className="classic-table">
                      <thead><tr><th>Item</th><th>Quantity per Recipient</th><th></th></tr></thead>
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
              </>
            )}

            <div className="form-actions">
              <button type="submit" className="primary-button" disabled={bulkIssueSaving}>
                <PackageCheck size={18} />
                {bulkIssueSaving ? "Issuing..." : "Issue"}
              </button>
            </div>
          </form>
        </section>
      )}

      {activeTab === "reports" && (
        <section className="table-panel reports-panel">
          <PanelTitle title="Inventory Reports" text="Low stock alerts, purchase cost summary, and kit issuance coverage -- computed live from current stock and transaction data." />
          {reportsLoading ? (
            <div className="loading-box">Loading reports...</div>
          ) : (
            <>
              <div className="summary-strip report-summary-grid">
                <SummaryCard icon={IndianRupee} label="Purchase Revenue" value={costSummary ? Number(costSummary.purchase_revenue || 0).toFixed(2) : "0.00"} />
                <SummaryCard icon={IndianRupee} label="Unpaid Purchases" value={costSummary ? Number(costSummary.purchase_unpaid || 0).toFixed(2) : "0.00"} warning={Boolean(costSummary?.purchase_unpaid)} />
                <SummaryCard icon={PackageCheck} label="Stock-In Cost" value={costSummary ? Number(costSummary.stock_in_cost || 0).toFixed(2) : "0.00"} />
                <SummaryCard icon={Boxes} label="Issued Value" value={costSummary ? Number(costSummary.issued_value || 0).toFixed(2) : "0.00"} />
                <SummaryCard icon={IndianRupee} label="Current Stock Value" value={costSummary ? Number(costSummary.current_stock_value || 0).toFixed(2) : "0.00"} />
              </div>

              <div className="panel-header">
                <div>
                  <h3><BarChart3 size={18} /> Low Stock Items</h3>
                  <p>Active items whose available quantity is at or below their reorder level.</p>
                </div>
              </div>
              <div className="table-wrapper">
                <table className="classic-table">
                  <thead><tr><th>Item</th><th>Code</th><th>Category</th><th>Available</th><th>Reorder Level</th><th>Shortfall</th><th>Location</th></tr></thead>
                  <tbody>
                    {lowStockReport.length === 0 && (
                      <tr><td colSpan={7} className="empty-table">No items are below their reorder level.</td></tr>
                    )}
                    {lowStockReport.map((row) => (
                      <tr key={row.id}>
                        <td>{row.item_name}</td>
                        <td>{row.item_code || "-"}</td>
                        <td>{row.category || "-"}</td>
                        <td>{row.quantity_available}</td>
                        <td>{row.reorder_level}</td>
                        <td>{row.shortfall}</td>
                        <td>{row.location || "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              <div className="panel-header">
                <div>
                  <h3><Layers size={18} /> Kit Issuance Coverage</h3>
                  <p>How many eligible recipients have received each active kit at least once.</p>
                </div>
              </div>
              <div className="table-wrapper">
                <table className="classic-table">
                  <thead><tr><th>Kit</th><th>Applies To</th><th>Issued</th><th>Eligible</th><th>Coverage</th></tr></thead>
                  <tbody>
                    {kitCoverage.length === 0 && (
                      <tr><td colSpan={5} className="empty-table">No active kits yet.</td></tr>
                    )}
                    {kitCoverage.map((row) => (
                      <tr key={row.kit_id}>
                        <td>{row.kit_name}</td>
                        <td>{row.applies_to}</td>
                        <td>{row.issued_count}</td>
                        <td>{row.eligible_count}</td>
                        <td>{row.coverage_percent != null ? `${row.coverage_percent}%` : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
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
