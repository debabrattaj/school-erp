import { useEffect, useMemo, useState } from "react";
import { todayLocalDate } from "../utils/date";
import {
  BookOpen, Edit, PlusCircle, Trash2, Undo2, Upload, RefreshCw, Clock,
  BookMarked, Users, BarChart3, Settings as SettingsIcon, Barcode, XCircle,
} from "lucide-react";

import API from "../api";
import StudentPicker from "../components/StudentPicker";
import ManagedRecordsTable from "../components/ManagedRecordsTable";
import BulkImportModal from "../components/BulkImportModal";
import { getMasterValues } from "../services/masterDataService";
import { isFeatureEnabled, hasAccess } from "../auth";
import { useSchoolSettings } from "../SettingsContext";
import { formatMoney as formatMoneyUtil } from "../utils/money";

const today = todayLocalDate();

const TOP_TABS = [
  ["books", "Books", BookOpen],
  ["issues", "Issue / Return", Undo2],
  ["reservations", "Reservations", BookMarked],
  ["reports", "Reports", BarChart3],
  ["settings", "Settings", SettingsIcon],
];

const emptyBookForm = {
  accession_no: "",
  title: "",
  author: "",
  category: "",
  publisher: "",
  isbn: "",
  total_copies: 1,
  available_copies: 1,
  shelf_no: "",
  status: "Available",
  remarks: "",
};

const emptyIssueForm = {
  book_id: "",
  borrower_type: "Student",
  student_id: "",
  staff_id: "",
  copy_id: "",
  issue_date: today,
  due_date: "",
  return_date: "",
  status: "Issued",
  fine_amount: 0,
  remarks: "",
};

const emptyReservationForm = {
  book_id: "",
  borrower_type: "Student",
  student_id: "",
  staff_id: "",
  remarks: "",
};

const emptySettingsForm = {
  loan_period_days: 14,
  loan_period_days_staff: 30,
  fine_per_day: 2,
  fine_grace_days: 0,
  max_books_student: 3,
  max_books_staff: 5,
  max_renewals: 2,
  block_renewal_if_reserved: true,
  reservation_hold_days: 2,
};

const emptyReminderForm = {
  name: "",
  offset_days: 3,
  channel: "Email",
  template_id: "",
  is_active: true,
  remarks: "",
};

const REMINDER_CHANNELS = ["Email", "SMS", "WhatsApp", "In App"];

function getApiErrorMessage(error, fallbackMessage) {
  const detail = error.response?.data?.detail;
  if (Array.isArray(detail)) return detail.map((item) => item.msg).join(" | ");
  if (typeof detail === "string") return detail;
  return fallbackMessage;
}

function statusClass(kind, value) {
  const positive = {
    book: ["Available"],
    issue: ["Returned"],
    copy: ["Available"],
    reservation: ["Ready", "Fulfilled"],
  };
  const negative = {
    book: ["Unavailable", "Damaged"],
    issue: ["Lost", "Damaged"],
    copy: ["Lost", "Damaged", "Retired"],
    reservation: ["Cancelled", "Expired"],
  };
  if (positive[kind]?.includes(value)) return "status active";
  if (negative[kind]?.includes(value)) return "status danger";
  return "status pending";
}

export default function Library() {
  const { settings: schoolSettings } = useSchoolSettings();
  const formatMoney = (value) => formatMoneyUtil(value, schoolSettings?.currency);
  const remindersEnabled = isFeatureEnabled("library_reminders");
  const canRunReminders = hasAccess(["Admin", "Principal"], "manage");

  const [activeTab, setActiveTab] = useState("books");
  const [books, setBooks] = useState([]);
  const [showBulkImport, setShowBulkImport] = useState(false);
  const [issues, setIssues] = useState([]);
  const [students, setStudents] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [bookForm, setBookForm] = useState(emptyBookForm);
  const [issueForm, setIssueForm] = useState(emptyIssueForm);
  const [editing, setEditing] = useState({ type: "", id: null });
  const [formMode, setFormMode] = useState("");
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // Per-book copy management (opened from the Books table)
  const [copiesModalBook, setCopiesModalBook] = useState(null);
  const [copies, setCopies] = useState([]);
  const [copiesLoading, setCopiesLoading] = useState(false);
  const [newCopyBarcode, setNewCopyBarcode] = useState("");
  const [generateCount, setGenerateCount] = useState(1);

  // Copies available for whichever book is selected in the issue form
  const [issueBookCopies, setIssueBookCopies] = useState([]);

  // Reservations
  const [reservations, setReservations] = useState([]);
  const [reservationForm, setReservationForm] = useState(emptyReservationForm);
  const [showReservationForm, setShowReservationForm] = useState(false);
  const [reservationStatusFilter, setReservationStatusFilter] = useState("");

  // Reports
  const [reportsLoading, setReportsLoading] = useState(false);
  const [overdueReport, setOverdueReport] = useState([]);
  const [topBorrowers, setTopBorrowers] = useState([]);
  const [mostIssued, setMostIssued] = useState([]);
  const [finesSummary, setFinesSummary] = useState(null);

  // Settings + reminders
  const [settingsForm, setSettingsForm] = useState(emptySettingsForm);
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaving, setSettingsSaving] = useState(false);
  const [reminderView, setReminderView] = useState("rules");
  const [reminderRules, setReminderRules] = useState([]);
  const [reminderForm, setReminderForm] = useState(emptyReminderForm);
  const [editingRuleId, setEditingRuleId] = useState(null);
  const [communicationTemplates, setCommunicationTemplates] = useState([]);
  const [reminderHistory, setReminderHistory] = useState([]);
  const [reminderHistoryStatusFilter, setReminderHistoryStatusFilter] = useState("");
  const [reminderPreview, setReminderPreview] = useState(null);
  const [reminderPreviewLoading, setReminderPreviewLoading] = useState(false);
  const [reminderRunResult, setReminderRunResult] = useState(null);
  const [reminderRunning, setReminderRunning] = useState(false);

  useEffect(() => {
    if (!message) return undefined;
    const timeoutId = window.setTimeout(() => setMessage(""), 2500);
    return () => window.clearTimeout(timeoutId);
  }, [message]);

  async function loadPageData() {
    try {
      setLoading(true);
      setMessage("");
      const [bookResponse, issueResponse, studentResponse, teacherResponse, categoryResponse] = await Promise.all([
        API.get("/library/books/"),
        API.get("/library/issues/"),
        API.get("/students/"),
        API.get("/teachers/"),
        getMasterValues("LibraryCategory"),
      ]);
      setBooks(bookResponse.data || []);
      setIssues(issueResponse.data || []);
      setStudents(studentResponse.data || []);
      setTeachers(teacherResponse.data || []);
      setCategories(categoryResponse || []);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load library data."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPageData();
  }, []);

  useEffect(() => {
    if (activeTab === "reservations") loadReservations();
    if (activeTab === "reports") loadReports();
    if (activeTab === "settings") {
      loadSettings();
      if (remindersEnabled) loadReminderRules();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === "settings" && remindersEnabled && reminderView === "history") {
      loadReminderHistory();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, reminderView, reminderHistoryStatusFilter]);

  const issuedCount = issues.filter((issue) => issue.status === "Issued").length;
  const overdueCount = issues.filter((issue) => issue.status === "Issued" && issue.days_overdue > 0).length;
  const availableCopies = books.reduce((sum, book) => sum + Number(book.available_copies || 0), 0);

  const filteredBooks = useMemo(
    () =>
      books.filter((book) =>
        `${book.accession_no} ${book.title} ${book.author} ${book.category}`
          .toLowerCase()
          .includes(searchText.toLowerCase())
      ),
    [books, searchText]
  );

  const filteredIssues = useMemo(
    () =>
      issues.filter((issue) =>
        `${issue.book_title} ${issue.accession_no} ${issue.student_name || ""} ${issue.staff_name || ""} ${issue.admission_no || ""} ${issue.status}`
          .toLowerCase()
          .includes(searchText.toLowerCase())
      ),
    [issues, searchText]
  );

  // ---------------- Books ----------------

  function handleBookChange(event) {
    const { name, value } = event.target;
    setBookForm((prev) => ({ ...prev, [name]: value }));
  }

  function resetForms() {
    setBookForm(emptyBookForm);
    setIssueForm(emptyIssueForm);
    setIssueBookCopies([]);
    setEditing({ type: "", id: null });
    setFormMode("");
  }

  async function saveBook(event) {
    event.preventDefault();
    const payload = {
      ...bookForm,
      total_copies: Number(bookForm.total_copies || 0),
      available_copies: Number(bookForm.available_copies || 0),
      remarks: bookForm.remarks || null,
    };
    try {
      if (editing.type === "book") {
        await API.put(`/library/books/${editing.id}`, payload);
        setMessage("Book updated successfully.");
      } else {
        await API.post("/library/books/", payload);
        setMessage("Book added successfully.");
      }
      resetForms();
      await loadPageData();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to save book."));
    }
  }

  function editBook(book) {
    setActiveTab("books");
    setEditing({ type: "book", id: book.id });
    setFormMode("book");
    setBookForm({ ...emptyBookForm, ...book });
  }

  function addBook() {
    setActiveTab("books");
    setBookForm(emptyBookForm);
    setEditing({ type: "", id: null });
    setFormMode("book");
  }

  async function deleteRecord(type, id) {
    const confirmDelete = window.confirm("Delete this library record?");
    if (!confirmDelete) return;
    const endpoints = {
      book: `/library/books/${id}`,
      issue: `/library/issues/${id}`,
      reservation: `/library/reservations/${id}`,
    };
    try {
      await API.delete(endpoints[type]);
      setMessage("Library record deleted successfully.");
      resetForms();
      if (type === "reservation") await loadReservations();
      else await loadPageData();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to delete library record."));
    }
  }

  // ---------------- Copies ----------------

  async function openCopiesModal(book) {
    setCopiesModalBook(book);
    setNewCopyBarcode("");
    setGenerateCount(1);
    await loadCopies(book.id);
  }

  async function loadCopies(bookId) {
    try {
      setCopiesLoading(true);
      const response = await API.get(`/library/books/${bookId}/copies`);
      setCopies(response.data || []);
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to load copies."));
    } finally {
      setCopiesLoading(false);
    }
  }

  async function addCopy(event) {
    event.preventDefault();
    if (!copiesModalBook) return;
    try {
      await API.post(`/library/books/${copiesModalBook.id}/copies`, { barcode: newCopyBarcode || null });
      setNewCopyBarcode("");
      await loadCopies(copiesModalBook.id);
      await loadPageData();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to add copy."));
    }
  }

  async function generateCopies(event) {
    event.preventDefault();
    if (!copiesModalBook) return;
    try {
      await API.post(`/library/books/${copiesModalBook.id}/copies/generate`, null, {
        params: { count: Number(generateCount || 1) },
      });
      await loadCopies(copiesModalBook.id);
      await loadPageData();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to generate copies."));
    }
  }

  async function updateCopyStatus(copy, status) {
    try {
      await API.put(`/library/copies/${copy.id}`, { status });
      await loadCopies(copiesModalBook.id);
      await loadPageData();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to update copy."));
    }
  }

  async function deleteCopy(copy) {
    if (!window.confirm(`Delete copy ${copy.barcode}?`)) return;
    try {
      await API.delete(`/library/copies/${copy.id}`);
      await loadCopies(copiesModalBook.id);
      await loadPageData();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to delete copy."));
    }
  }

  // ---------------- Issue / Return ----------------

  function handleIssueChange(event) {
    const { name, value } = event.target;
    setIssueForm((prev) => {
      const next = { ...prev, [name]: value };
      if (name === "borrower_type") {
        next.student_id = "";
        next.staff_id = "";
      }
      return next;
    });
    if (name === "book_id") {
      if (value) {
        API.get(`/library/books/${value}/copies`)
          .then((response) => setIssueBookCopies((response.data || []).filter((c) => c.status === "Available")))
          .catch(() => setIssueBookCopies([]));
      } else {
        setIssueBookCopies([]);
      }
    }
  }

  async function saveIssue(event) {
    event.preventDefault();
    const payload = {
      ...issueForm,
      book_id: Number(issueForm.book_id),
      student_id: issueForm.borrower_type === "Student" && issueForm.student_id ? Number(issueForm.student_id) : null,
      staff_id: issueForm.borrower_type === "Staff" && issueForm.staff_id ? Number(issueForm.staff_id) : null,
      copy_id: issueForm.copy_id ? Number(issueForm.copy_id) : null,
      due_date: issueForm.due_date || null,
      return_date: issueForm.return_date || null,
      fine_amount: Number(issueForm.fine_amount || 0),
      remarks: issueForm.remarks || null,
    };

    try {
      if (editing.type === "issue") {
        await API.put(`/library/issues/${editing.id}`, payload);
        setMessage("Book issue updated successfully.");
      } else {
        await API.post("/library/issues/", payload);
        setMessage("Book issued successfully.");
      }
      resetForms();
      await loadPageData();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to save book issue."));
    }
  }

  function editIssue(issue) {
    setActiveTab("issues");
    setEditing({ type: "issue", id: issue.id });
    setFormMode("issue");
    setIssueForm({
      book_id: issue.book_id || "",
      borrower_type: issue.borrower_type || "Student",
      student_id: issue.student_id || "",
      staff_id: issue.staff_id || "",
      copy_id: issue.copy_id || "",
      issue_date: issue.issue_date || today,
      due_date: issue.due_date || "",
      return_date: issue.return_date || "",
      status: issue.status || "Issued",
      fine_amount: issue.fine_amount || 0,
      remarks: issue.remarks || "",
    });
    setIssueBookCopies([]);
  }

  function addIssue() {
    setActiveTab("issues");
    setIssueForm(emptyIssueForm);
    setIssueBookCopies([]);
    setEditing({ type: "", id: null });
    setFormMode("issue");
  }

  async function quickReturn(issue) {
    try {
      await API.put(`/library/issues/${issue.id}`, {
        book_id: issue.book_id,
        borrower_type: issue.borrower_type,
        student_id: issue.student_id,
        staff_id: issue.staff_id,
        issue_date: issue.issue_date,
        due_date: issue.due_date,
        return_date: today,
        status: "Returned",
        fine_amount: 0,
        remarks: issue.remarks,
      });
      setMessage("Book returned. Fine (if any) calculated automatically.");
      await loadPageData();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to return book."));
    }
  }

  async function renewIssue(issue) {
    try {
      await API.post(`/library/issues/${issue.id}/renew`);
      setMessage("Book renewed successfully.");
      await loadPageData();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to renew book."));
    }
  }

  // ---------------- Reservations ----------------

  async function loadReservations() {
    try {
      setLoading(true);
      const response = await API.get("/library/reservations/", {
        params: { status: reservationStatusFilter || undefined },
      });
      setReservations(response.data || []);
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to load reservations."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab === "reservations") loadReservations();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reservationStatusFilter]);

  function handleReservationChange(event) {
    const { name, value } = event.target;
    setReservationForm((prev) => {
      const next = { ...prev, [name]: value };
      if (name === "borrower_type") {
        next.student_id = "";
        next.staff_id = "";
      }
      return next;
    });
  }

  async function saveReservation(event) {
    event.preventDefault();
    const payload = {
      book_id: Number(reservationForm.book_id),
      borrower_type: reservationForm.borrower_type,
      student_id: reservationForm.borrower_type === "Student" && reservationForm.student_id ? Number(reservationForm.student_id) : null,
      staff_id: reservationForm.borrower_type === "Staff" && reservationForm.staff_id ? Number(reservationForm.staff_id) : null,
      remarks: reservationForm.remarks || null,
    };
    try {
      await API.post("/library/reservations/", payload);
      setMessage("Reservation placed successfully.");
      setReservationForm(emptyReservationForm);
      setShowReservationForm(false);
      await loadReservations();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to place reservation."));
    }
  }

  async function cancelReservation(reservation) {
    if (!window.confirm("Cancel this reservation?")) return;
    try {
      await API.post(`/library/reservations/${reservation.id}/cancel`);
      setMessage("Reservation cancelled.");
      await loadReservations();
      await loadPageData();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to cancel reservation."));
    }
  }

  // ---------------- Reports ----------------

  async function loadReports() {
    try {
      setReportsLoading(true);
      const [overdueRes, borrowersRes, issuedRes, finesRes] = await Promise.all([
        API.get("/library/reports/overdue"),
        API.get("/library/reports/top-borrowers"),
        API.get("/library/reports/most-issued"),
        API.get("/library/reports/fines-summary"),
      ]);
      setOverdueReport(overdueRes.data || []);
      setTopBorrowers(borrowersRes.data || []);
      setMostIssued(issuedRes.data || []);
      setFinesSummary(finesRes.data || null);
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to load library reports."));
    } finally {
      setReportsLoading(false);
    }
  }

  // ---------------- Settings ----------------

  async function loadSettings() {
    try {
      setSettingsLoading(true);
      const response = await API.get("/library/settings");
      setSettingsForm({ ...emptySettingsForm, ...response.data });
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to load library settings."));
    } finally {
      setSettingsLoading(false);
    }
  }

  function handleSettingsChange(event) {
    const { name, value, type, checked } = event.target;
    setSettingsForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  }

  async function saveSettings(event) {
    event.preventDefault();
    try {
      setSettingsSaving(true);
      const payload = {
        ...settingsForm,
        loan_period_days: Number(settingsForm.loan_period_days),
        loan_period_days_staff: Number(settingsForm.loan_period_days_staff),
        fine_per_day: Number(settingsForm.fine_per_day),
        fine_grace_days: Number(settingsForm.fine_grace_days),
        max_books_student: Number(settingsForm.max_books_student),
        max_books_staff: Number(settingsForm.max_books_staff),
        max_renewals: Number(settingsForm.max_renewals),
        reservation_hold_days: Number(settingsForm.reservation_hold_days),
      };
      const response = await API.put("/library/settings", payload);
      setSettingsForm({ ...emptySettingsForm, ...response.data });
      setMessage("Library settings saved.");
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to save library settings."));
    } finally {
      setSettingsSaving(false);
    }
  }

  // ---------------- Reminder rules ----------------

  async function loadReminderRules() {
    try {
      const response = await API.get("/library-reminders/rules");
      setReminderRules(response.data || []);
      const templatesRes = await API.get("/communications/templates/");
      setCommunicationTemplates(templatesRes.data || []);
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to load overdue reminder rules."));
    }
  }

  async function loadReminderHistory() {
    try {
      const response = await API.get("/library-reminders/history", {
        params: { status: reminderHistoryStatusFilter || undefined, limit: 200 },
      });
      setReminderHistory(response.data || []);
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to load reminder history."));
    }
  }

  function handleReminderFormChange(event) {
    const { name, value, type, checked } = event.target;
    setReminderForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  }

  function editReminderRule(rule) {
    setEditingRuleId(rule.id);
    setReminderForm({
      name: rule.name,
      offset_days: rule.offset_days,
      channel: rule.channel,
      template_id: rule.template_id || "",
      is_active: rule.is_active,
      remarks: rule.remarks || "",
    });
  }

  function cancelReminderForm() {
    setEditingRuleId(null);
    setReminderForm(emptyReminderForm);
  }

  async function saveReminderRule(event) {
    event.preventDefault();
    if (!reminderForm.name.trim()) {
      setMessage("A rule name is required.");
      return;
    }
    const payload = {
      name: reminderForm.name.trim(),
      offset_days: Number(reminderForm.offset_days || 0),
      channel: reminderForm.channel,
      template_id: reminderForm.template_id ? Number(reminderForm.template_id) : null,
      is_active: reminderForm.is_active,
      remarks: reminderForm.remarks || null,
    };
    try {
      if (editingRuleId) {
        await API.put(`/library-reminders/rules/${editingRuleId}`, payload);
        setMessage("Reminder rule updated.");
      } else {
        await API.post("/library-reminders/rules", payload);
        setMessage("Reminder rule added.");
      }
      cancelReminderForm();
      await loadReminderRules();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to save reminder rule."));
    }
  }

  async function deleteReminderRule(rule) {
    if (!window.confirm(`Delete the reminder rule "${rule.name}"?`)) return;
    try {
      await API.delete(`/library-reminders/rules/${rule.id}`);
      setMessage("Reminder rule deleted.");
      await loadReminderRules();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to delete reminder rule."));
    }
  }

  async function runReminderPreview() {
    try {
      setReminderPreviewLoading(true);
      setReminderPreview(null);
      const response = await API.get("/library-reminders/preview");
      setReminderPreview(response.data);
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to preview reminders."));
    } finally {
      setReminderPreviewLoading(false);
    }
  }

  async function runRemindersNow() {
    if (!window.confirm("This sends real reminders to borrowers right now — it is not a preview. Continue?")) return;
    try {
      setReminderRunning(true);
      const response = await API.post("/library-reminders/run");
      setReminderRunResult(response.data);
      setMessage(`Sent ${response.data.sent || 0} reminder(s).`);
      await loadReminderHistory();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to run reminders."));
    } finally {
      setReminderRunning(false);
    }
  }

  const channelTemplates = communicationTemplates.filter((t) => t.channel === reminderForm.channel);

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Academic Resources</p>
          <h2>Library</h2>
          <p>Catalogue, circulation, reservations, fines and overdue reminders.</p>
        </div>
        <div className="module-header-actions">
          {activeTab === "books" && (
            <button type="button" className="secondary-button" onClick={() => setShowBulkImport(true)}>
              <Upload size={17} />
              Import CSV
            </button>
          )}
          {activeTab === "books" && (
            <button type="button" className="primary-button" onClick={addBook}>
              <PlusCircle size={18} />
              Add Book
            </button>
          )}
          {activeTab === "issues" && (
            <button type="button" className="primary-button" onClick={addIssue}>
              <PlusCircle size={18} />
              Issue Book
            </button>
          )}
          {activeTab === "reservations" && (
            <button type="button" className="primary-button" onClick={() => setShowReservationForm(true)}>
              <PlusCircle size={18} />
              Reserve Book
            </button>
          )}
        </div>
      </section>

      {showBulkImport && (
        <BulkImportModal
          title="Bulk Import Library Books"
          description="Upload a CSV file to add multiple books to the catalogue at once."
          templateUrl="/library/books/bulk-import-template"
          templateFilename="library_books_import_template.csv"
          importUrl="/library/books/bulk-import"
          onClose={() => setShowBulkImport(false)}
          onImported={loadPageData}
        />
      )}

      <section className="summary-strip report-summary-grid">
        <SummaryCard icon={BookOpen} label="Books" value={books.length} />
        <SummaryCard icon={BookOpen} label="Available Copies" value={availableCopies} />
        <SummaryCard icon={Undo2} label="Issued Books" value={issuedCount} warning={issuedCount > 0} />
        <SummaryCard icon={Clock} label="Overdue" value={overdueCount} warning={overdueCount > 0} />
      </section>

      {message && <div className="toast-notification">{message}</div>}

      <section className="table-panel">
        <div className="student-profile-tabs">
          {TOP_TABS.map(([key, label, Icon]) => (
            <button
              key={key}
              className={activeTab === key ? "active" : ""}
              type="button"
              onClick={() => { setActiveTab(key); resetForms(); }}
            >
              <Icon size={15} style={{ marginRight: 6, verticalAlign: "-2px" }} />
              {label}
            </button>
          ))}
        </div>
      </section>

      {activeTab === "books" && (
        <BooksTab
          formMode={formMode} editing={editing} bookForm={bookForm} categories={categories}
          handleBookChange={handleBookChange} saveBook={saveBook} resetForms={resetForms}
          filteredBooks={filteredBooks} searchText={searchText} setSearchText={setSearchText}
          loading={loading} editBook={editBook} deleteRecord={deleteRecord} openCopiesModal={openCopiesModal}
        />
      )}

      {copiesModalBook && (
        <CopiesModal
          book={copiesModalBook} copies={copies} loading={copiesLoading}
          newCopyBarcode={newCopyBarcode} setNewCopyBarcode={setNewCopyBarcode}
          generateCount={generateCount} setGenerateCount={setGenerateCount}
          addCopy={addCopy} generateCopies={generateCopies}
          updateCopyStatus={updateCopyStatus} deleteCopy={deleteCopy}
          onClose={() => setCopiesModalBook(null)}
        />
      )}

      {activeTab === "issues" && (
        <IssuesTab
          formMode={formMode} editing={editing} issueForm={issueForm} books={books} students={students}
          teachers={teachers} issueBookCopies={issueBookCopies}
          handleIssueChange={handleIssueChange} saveIssue={saveIssue} resetForms={resetForms}
          filteredIssues={filteredIssues} searchText={searchText} setSearchText={setSearchText}
          loading={loading} editIssue={editIssue} deleteRecord={deleteRecord}
          quickReturn={quickReturn} renewIssue={renewIssue} formatMoney={formatMoney}
        />
      )}

      {activeTab === "reservations" && (
        <ReservationsTab
          reservations={reservations} books={books} students={students} teachers={teachers}
          showForm={showReservationForm} setShowForm={setShowReservationForm}
          reservationForm={reservationForm} handleReservationChange={handleReservationChange}
          saveReservation={saveReservation} cancelReservation={cancelReservation}
          deleteRecord={deleteRecord} statusFilter={reservationStatusFilter}
          setStatusFilter={setReservationStatusFilter} loading={loading}
        />
      )}

      {activeTab === "reports" && (
        <ReportsTab
          loading={reportsLoading} overdueReport={overdueReport} topBorrowers={topBorrowers}
          mostIssued={mostIssued} finesSummary={finesSummary} formatMoney={formatMoney}
        />
      )}

      {activeTab === "settings" && (
        <SettingsTab
          settingsForm={settingsForm} settingsLoading={settingsLoading} settingsSaving={settingsSaving}
          handleSettingsChange={handleSettingsChange} saveSettings={saveSettings}
          remindersEnabled={remindersEnabled} canRunReminders={canRunReminders}
          reminderView={reminderView} setReminderView={setReminderView}
          reminderRules={reminderRules} reminderForm={reminderForm} editingRuleId={editingRuleId}
          handleReminderFormChange={handleReminderFormChange} saveReminderRule={saveReminderRule}
          cancelReminderForm={cancelReminderForm} editReminderRule={editReminderRule}
          deleteReminderRule={deleteReminderRule} channelTemplates={channelTemplates}
          reminderPreview={reminderPreview} reminderPreviewLoading={reminderPreviewLoading}
          runReminderPreview={runReminderPreview} reminderRunResult={reminderRunResult}
          reminderRunning={reminderRunning} runRemindersNow={runRemindersNow}
          reminderHistory={reminderHistory} reminderHistoryStatusFilter={reminderHistoryStatusFilter}
          setReminderHistoryStatusFilter={setReminderHistoryStatusFilter}
        />
      )}
    </div>
  );
}

// =====================================================================
// Books tab
// =====================================================================

function BooksTab({
  formMode, editing, bookForm, categories, handleBookChange, saveBook, resetForms,
  filteredBooks, searchText, setSearchText, loading, editBook, deleteRecord, openCopiesModal,
}) {
  return (
    <>
      {formMode === "book" && (
        <section className="form-panel">
          <PanelTitle title={editing.type === "book" ? "Edit Book" : "Add Book"} text="Create the library catalogue with copy availability." />
          <form className="classic-form" onSubmit={saveBook}>
            <div className="form-grid">
              <TextField label="Accession No *" name="accession_no" value={bookForm.accession_no} onChange={handleBookChange} required />
              <TextField label="Title *" name="title" value={bookForm.title} onChange={handleBookChange} required />
              <TextField label="Author" name="author" value={bookForm.author} onChange={handleBookChange} />
              <div className="form-field">
                <label>Category</label>
                <input list="library-categories" name="category" value={bookForm.category} onChange={handleBookChange} />
              </div>
              <TextField label="Publisher" name="publisher" value={bookForm.publisher} onChange={handleBookChange} />
              <TextField label="ISBN" name="isbn" value={bookForm.isbn} onChange={handleBookChange} />
              <TextField label="Total Copies" type="number" name="total_copies" value={bookForm.total_copies} onChange={handleBookChange} />
              <TextField label="Available Copies" type="number" name="available_copies" value={bookForm.available_copies} onChange={handleBookChange} />
              <TextField label="Shelf No" name="shelf_no" value={bookForm.shelf_no} onChange={handleBookChange} />
              <div className="form-field">
                <label>Status</label>
                <select name="status" value={bookForm.status} onChange={handleBookChange}>
                  <option value="Available">Available</option>
                  <option value="Unavailable">Unavailable</option>
                  <option value="Damaged">Damaged</option>
                </select>
              </div>
              <div className="form-field full-width">
                <label>Remarks</label>
                <textarea name="remarks" rows="3" value={bookForm.remarks} onChange={handleBookChange}></textarea>
              </div>
            </div>
            <datalist id="library-categories">{categories.map((item) => <option key={item} value={item} />)}</datalist>
            <FormActions editing={editing.type === "book"} label="Book" resetForms={resetForms} />
          </form>
        </section>
      )}
      <RecordsTable title="Books" count={filteredBooks.length} searchText={searchText} setSearchText={setSearchText} loading={loading} headers={["Accession", "Title", "Author", "Category", "Copies", "Available", "Status", "Actions"]}>
        {filteredBooks.map((book) => (
          <tr key={book.id}>
            <td>{book.accession_no}</td><td>{book.title}</td><td>{book.author || "-"}</td><td>{book.category || "-"}</td><td>{book.total_copies}</td><td>{book.available_copies}</td>
            <td><span className={statusClass("book", book.status)}>{book.status}</span></td>
            <td>
              <div className="action-buttons">
                <button type="button" className="edit-button" title="Copies / Barcodes" onClick={() => openCopiesModal(book)}><Barcode size={15} /></button>
                <button type="button" className="edit-button" title="Edit" onClick={() => editBook(book)}><Edit size={15} /></button>
                <button type="button" className="delete-button" title="Delete" onClick={() => deleteRecord("book", book.id)}><Trash2 size={15} /></button>
              </div>
            </td>
          </tr>
        ))}
      </RecordsTable>
    </>
  );
}

function CopiesModal({
  book, copies, loading, newCopyBarcode, setNewCopyBarcode, generateCount, setGenerateCount,
  addCopy, generateCopies, updateCopyStatus, deleteCopy, onClose,
}) {
  return (
    <div className="layout-modal-backdrop" onClick={onClose}>
      <div className="layout-modal" onClick={(event) => event.stopPropagation()}>
        <div className="layout-modal-header">
          <div>
            <h3>Copies — {book.title}</h3>
            <p>Optional per-copy barcode tracking, on top of the aggregate copy count.</p>
          </div>
          <button type="button" className="light-icon-button" onClick={onClose}><XCircle size={20} /></button>
        </div>

        <form className="classic-form" onSubmit={addCopy} style={{ marginBottom: 16 }}>
          <div className="form-grid">
            <TextField label="Barcode (optional, auto-generated if blank)" value={newCopyBarcode} onChange={(e) => setNewCopyBarcode(e.target.value)} />
          </div>
          <div className="form-actions">
            <button type="submit" className="primary-button"><PlusCircle size={16} /> Add Copy</button>
          </div>
        </form>

        <form className="classic-form" onSubmit={generateCopies} style={{ marginBottom: 16 }}>
          <div className="form-grid">
            <TextField label="Generate N barcoded copies" type="number" min="1" value={generateCount} onChange={(e) => setGenerateCount(e.target.value)} />
          </div>
          <div className="form-actions">
            <button type="submit" className="secondary-button"><Barcode size={16} /> Generate</button>
          </div>
        </form>

        <div className="table-wrapper">
          <table className="classic-table">
            <thead>
              <tr><th>Barcode</th><th>Shelf</th><th>Status</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={4}>Loading copies…</td></tr>}
              {!loading && copies.map((copy) => (
                <tr key={copy.id}>
                  <td>{copy.barcode}</td>
                  <td>{copy.shelf_no || "-"}</td>
                  <td>
                    <select value={copy.status} onChange={(e) => updateCopyStatus(copy, e.target.value)}>
                      {["Available", "Issued", "Reserved", "Lost", "Damaged", "Retired"].map((s) => (
                        <option key={s} value={s} disabled={s === "Issued"}>{s}</option>
                      ))}
                    </select>
                  </td>
                  <td>
                    <button type="button" className="delete-button" title="Delete" onClick={() => deleteCopy(copy)} disabled={copy.status === "Issued"}>
                      <Trash2 size={15} />
                    </button>
                  </td>
                </tr>
              ))}
              {!loading && !copies.length && <tr><td colSpan={4}>No barcoded copies yet — the book is still tracked by aggregate count.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// =====================================================================
// Issue / Return tab
// =====================================================================

function StaffPicker({ teachers, value, onChange, required = true }) {
  return (
    <div className="form-field">
      <label>Staff Member{required ? " *" : ""}</label>
      <select name="staff_id" value={value} onChange={onChange} required={required}>
        <option value="">Select Staff</option>
        {teachers.map((teacher) => (
          <option key={teacher.id} value={teacher.id}>
            {teacher.employee_no ? `${teacher.employee_no} - ${teacher.name}` : teacher.name}
          </option>
        ))}
      </select>
    </div>
  );
}

function IssuesTab({
  formMode, editing, issueForm, books, students, teachers, issueBookCopies,
  handleIssueChange, saveIssue, resetForms, filteredIssues, searchText, setSearchText,
  loading, editIssue, deleteRecord, quickReturn, renewIssue, formatMoney,
}) {
  return (
    <>
      {formMode === "issue" && (
        <section className="form-panel">
          <PanelTitle title={editing.type === "issue" ? "Edit Book Issue" : "Issue Book"} text="Link issued books to students or staff, and mark returns." />
          <form className="classic-form" onSubmit={saveIssue}>
            <div className="form-grid">
              <div className="form-field">
                <label>Book *</label>
                <select name="book_id" value={issueForm.book_id} onChange={handleIssueChange} required>
                  <option value="">Select Book</option>
                  {books.map((book) => <option key={book.id} value={book.id}>{book.accession_no} - {book.title} ({book.available_copies} free)</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>Borrower Type</label>
                <select name="borrower_type" value={issueForm.borrower_type} onChange={handleIssueChange}>
                  <option value="Student">Student</option>
                  <option value="Staff">Staff</option>
                </select>
              </div>
              {issueForm.borrower_type === "Student" ? (
                <StudentPicker students={students} value={issueForm.student_id} onChange={handleIssueChange} />
              ) : (
                <StaffPicker teachers={teachers} value={issueForm.staff_id} onChange={handleIssueChange} />
              )}
              {!!issueBookCopies.length && (
                <div className="form-field">
                  <label>Specific Copy (optional)</label>
                  <select name="copy_id" value={issueForm.copy_id} onChange={handleIssueChange}>
                    <option value="">Any available copy</option>
                    {issueBookCopies.map((copy) => <option key={copy.id} value={copy.id}>{copy.barcode}</option>)}
                  </select>
                </div>
              )}
              <TextField label="Issue Date *" type="date" name="issue_date" value={issueForm.issue_date} onChange={handleIssueChange} required />
              <div className="form-field">
                <label>Due Date</label>
                <input type="date" name="due_date" value={issueForm.due_date} onChange={handleIssueChange} placeholder="Auto from library settings" />
                <small>Leave blank to auto-calculate from the loan period in Library → Settings.</small>
              </div>
              <TextField label="Return Date" type="date" name="return_date" value={issueForm.return_date} onChange={handleIssueChange} />
              <div className="form-field">
                <label>Status</label>
                <select name="status" value={issueForm.status} onChange={handleIssueChange}>
                  <option value="Issued">Issued</option>
                  <option value="Returned">Returned</option>
                  <option value="Lost">Lost</option>
                  <option value="Damaged">Damaged</option>
                </select>
              </div>
              <div className="form-field">
                <label>Fine Amount</label>
                <input type="number" name="fine_amount" value={issueForm.fine_amount} onChange={handleIssueChange} />
                <small>Auto-calculated on return unless you set a non-zero override here.</small>
              </div>
              <div className="form-field full-width">
                <label>Remarks</label>
                <textarea name="remarks" rows="3" value={issueForm.remarks} onChange={handleIssueChange}></textarea>
              </div>
            </div>
            <FormActions editing={editing.type === "issue"} label="Issue" resetForms={resetForms} />
          </form>
        </section>
      )}
      <RecordsTable title="Book Issues" count={filteredIssues.length} searchText={searchText} setSearchText={setSearchText} loading={loading} headers={["Book", "Borrower", "Issue", "Due", "Return", "Status", "Renewals", "Fine", "Actions"]}>
        {filteredIssues.map((issue) => (
          <tr key={issue.id}>
            <td>{issue.accession_no} - {issue.book_title}</td>
            <td>
              {issue.borrower_type === "Staff"
                ? (issue.employee_no ? `${issue.employee_no} - ${issue.staff_name}` : issue.staff_name)
                : (issue.admission_no ? `${issue.admission_no} - ${issue.student_name}` : issue.student_name)}
              {issue.borrower_type === "Staff" && <span className="status pending" style={{ marginLeft: 6 }}>Staff</span>}
            </td>
            <td>{issue.issue_date}</td>
            <td>{issue.due_date || "-"}</td>
            <td>{issue.return_date || "-"}</td>
            <td>
              <span className={statusClass("issue", issue.status)}>{issue.status}</span>
              {issue.status === "Issued" && issue.days_overdue > 0 && (
                <div><small style={{ color: "var(--danger-600)" }}>{issue.days_overdue} day(s) overdue</small></div>
              )}
            </td>
            <td>{issue.renewal_count || 0}</td>
            <td>{issue.fine_amount ? formatMoney(issue.fine_amount) : "-"}</td>
            <td>
              <div className="action-buttons">
                {issue.status === "Issued" && (
                  <>
                    <button type="button" className="edit-button" title="Renew" onClick={() => renewIssue(issue)}><RefreshCw size={15} /></button>
                    <button type="button" className="edit-button" title="Return" onClick={() => quickReturn(issue)}><Undo2 size={15} /></button>
                  </>
                )}
                <button type="button" className="edit-button" title="Edit" onClick={() => editIssue(issue)}><Edit size={15} /></button>
                <button type="button" className="delete-button" title="Delete" onClick={() => deleteRecord("issue", issue.id)}><Trash2 size={15} /></button>
              </div>
            </td>
          </tr>
        ))}
      </RecordsTable>
    </>
  );
}

// =====================================================================
// Reservations tab
// =====================================================================

function ReservationsTab({
  reservations, books, students, teachers, showForm, setShowForm, reservationForm,
  handleReservationChange, saveReservation, cancelReservation, deleteRecord,
  statusFilter, setStatusFilter, loading,
}) {
  return (
    <>
      {showForm && (
        <section className="form-panel">
          <PanelTitle title="Reserve Book" text="Queue a borrower for a book that has no available copy right now." />
          <form className="classic-form" onSubmit={saveReservation}>
            <div className="form-grid">
              <div className="form-field">
                <label>Book *</label>
                <select name="book_id" value={reservationForm.book_id} onChange={handleReservationChange} required>
                  <option value="">Select Book</option>
                  {books.map((book) => <option key={book.id} value={book.id}>{book.accession_no} - {book.title}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>Borrower Type</label>
                <select name="borrower_type" value={reservationForm.borrower_type} onChange={handleReservationChange}>
                  <option value="Student">Student</option>
                  <option value="Staff">Staff</option>
                </select>
              </div>
              {reservationForm.borrower_type === "Student" ? (
                <StudentPicker students={students} value={reservationForm.student_id} onChange={handleReservationChange} />
              ) : (
                <StaffPicker teachers={teachers} value={reservationForm.staff_id} onChange={handleReservationChange} />
              )}
              <div className="form-field full-width">
                <label>Remarks</label>
                <textarea name="remarks" rows="2" value={reservationForm.remarks} onChange={handleReservationChange}></textarea>
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="primary-button"><PlusCircle size={18} /> Reserve</button>
              <button type="button" className="light-button" onClick={() => setShowForm(false)}>Cancel</button>
            </div>
          </form>
        </section>
      )}

      <section className="table-panel">
        <div className="panel-header">
          <div>
            <h3>Reservations</h3>
            <p>The hold queue per book — earliest reservation is served first.</p>
          </div>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
            <option value="">All statuses</option>
            {["Waiting", "Ready", "Fulfilled", "Cancelled", "Expired"].map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        <div className="table-wrapper">
          <table className="classic-table">
            <thead>
              <tr><th>Book</th><th>Borrower</th><th>Queue #</th><th>Status</th><th>Expires</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6}>Loading reservations…</td></tr>}
              {!loading && reservations.map((r) => (
                <tr key={r.id}>
                  <td>{r.accession_no} - {r.book_title}</td>
                  <td>
                    {r.borrower_type === "Staff"
                      ? r.staff_name
                      : (r.admission_no ? `${r.admission_no} - ${r.student_name}` : r.student_name)}
                  </td>
                  <td>{r.queue_position}</td>
                  <td><span className={statusClass("reservation", r.status)}>{r.status}</span></td>
                  <td>{r.expires_at ? new Date(r.expires_at).toLocaleString() : "-"}</td>
                  <td>
                    <div className="action-buttons">
                      {(r.status === "Waiting" || r.status === "Ready") && (
                        <button type="button" className="edit-button" title="Cancel" onClick={() => cancelReservation(r)}><XCircle size={15} /></button>
                      )}
                      <button type="button" className="delete-button" title="Delete" onClick={() => deleteRecord("reservation", r.id)}><Trash2 size={15} /></button>
                    </div>
                  </td>
                </tr>
              ))}
              {!loading && !reservations.length && <tr><td colSpan={6}>No reservations found.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

// =====================================================================
// Reports tab
// =====================================================================

function ReportsTab({ loading, overdueReport, topBorrowers, mostIssued, finesSummary, formatMoney }) {
  if (loading) return <section className="table-panel"><p>Loading reports…</p></section>;

  return (
    <>
      {finesSummary && (
        <section className="summary-strip report-summary-grid">
          <SummaryCard icon={BarChart3} label="Fines Charged" value={formatMoney(finesSummary.total_charged)} />
          <SummaryCard icon={BarChart3} label="Fines Collected" value={formatMoney(finesSummary.total_paid)} />
          <SummaryCard icon={Clock} label="Fines Outstanding" value={formatMoney(finesSummary.total_outstanding)} warning={finesSummary.total_outstanding > 0} />
          <SummaryCard icon={Users} label="Unpaid Fine Records" value={finesSummary.unpaid_fine_count} warning={finesSummary.unpaid_fine_count > 0} />
        </section>
      )}

      <section className="table-panel">
        <div className="panel-header"><div><h3>Overdue Books</h3><p>Currently issued and past their due date.</p></div></div>
        <div className="table-wrapper">
          <table className="classic-table">
            <thead><tr><th>Book</th><th>Borrower</th><th>Due</th><th>Days Overdue</th><th>Estimated Fine</th></tr></thead>
            <tbody>
              {overdueReport.map((row) => (
                <tr key={row.id}>
                  <td>{row.accession_no} - {row.book_title}</td>
                  <td>{row.borrower_type === "Staff" ? row.staff_name : row.student_name}</td>
                  <td>{row.due_date}</td>
                  <td>{row.days_overdue}</td>
                  <td>{formatMoney(row.estimated_fine)}</td>
                </tr>
              ))}
              {!overdueReport.length && <tr><td colSpan={5}>No overdue books.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="table-panel">
        <div className="panel-header"><div><h3>Top Borrowers</h3><p>Most books issued, all-time.</p></div></div>
        <div className="table-wrapper">
          <table className="classic-table">
            <thead><tr><th>Borrower</th><th>Type</th><th>Group</th><th>Total Issues</th><th>Currently Issued</th><th>Total Fines</th></tr></thead>
            <tbody>
              {topBorrowers.map((row) => (
                <tr key={`${row.borrower_type}-${row.borrower_id}`}>
                  <td>{row.name}</td><td>{row.borrower_type}</td><td>{row.group || "-"}</td>
                  <td>{row.issues}</td><td>{row.currently_issued}</td><td>{formatMoney(row.fine_total)}</td>
                </tr>
              ))}
              {!topBorrowers.length && <tr><td colSpan={6}>No issue history yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className="table-panel">
        <div className="panel-header"><div><h3>Most Issued Books</h3><p>Popularity by number of times issued.</p></div></div>
        <div className="table-wrapper">
          <table className="classic-table">
            <thead><tr><th>Book</th><th>Author</th><th>Category</th><th>Times Issued</th></tr></thead>
            <tbody>
              {mostIssued.map((row) => (
                <tr key={row.book_id}>
                  <td>{row.accession_no} - {row.title}</td><td>{row.author || "-"}</td><td>{row.category || "-"}</td><td>{row.issue_count}</td>
                </tr>
              ))}
              {!mostIssued.length && <tr><td colSpan={4}>No issue history yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

// =====================================================================
// Settings tab
// =====================================================================

function SettingsTab({
  settingsForm, settingsLoading, settingsSaving, handleSettingsChange, saveSettings,
  remindersEnabled, canRunReminders, reminderView, setReminderView, reminderRules,
  reminderForm, editingRuleId, handleReminderFormChange, saveReminderRule, cancelReminderForm,
  editReminderRule, deleteReminderRule, channelTemplates, reminderPreview, reminderPreviewLoading,
  runReminderPreview, reminderRunResult, reminderRunning, runRemindersNow, reminderHistory,
  reminderHistoryStatusFilter, setReminderHistoryStatusFilter,
}) {
  return (
    <>
      <section className="form-panel">
        <PanelTitle title="Library Settings" text="Loan periods, fines and borrowing limits used across issuing, renewals and returns." />
        {settingsLoading ? <p>Loading settings…</p> : (
          <form className="classic-form" onSubmit={saveSettings}>
            <div className="form-grid">
              <TextField label="Loan Period — Students (days)" type="number" name="loan_period_days" value={settingsForm.loan_period_days} onChange={handleSettingsChange} />
              <TextField label="Loan Period — Staff (days)" type="number" name="loan_period_days_staff" value={settingsForm.loan_period_days_staff} onChange={handleSettingsChange} />
              <TextField label="Fine per Day" type="number" name="fine_per_day" value={settingsForm.fine_per_day} onChange={handleSettingsChange} />
              <TextField label="Grace Days (before fine starts)" type="number" name="fine_grace_days" value={settingsForm.fine_grace_days} onChange={handleSettingsChange} />
              <TextField label="Max Books — Students" type="number" name="max_books_student" value={settingsForm.max_books_student} onChange={handleSettingsChange} />
              <TextField label="Max Books — Staff" type="number" name="max_books_staff" value={settingsForm.max_books_staff} onChange={handleSettingsChange} />
              <TextField label="Max Renewals" type="number" name="max_renewals" value={settingsForm.max_renewals} onChange={handleSettingsChange} />
              <TextField label="Reservation Hold (days)" type="number" name="reservation_hold_days" value={settingsForm.reservation_hold_days} onChange={handleSettingsChange} />
              <div className="form-field">
                <label>
                  <input type="checkbox" name="block_renewal_if_reserved" checked={!!settingsForm.block_renewal_if_reserved} onChange={handleSettingsChange} style={{ marginRight: 8 }} />
                  Block renewal when another borrower is waiting
                </label>
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="primary-button" disabled={settingsSaving}>{settingsSaving ? "Saving…" : "Save Settings"}</button>
            </div>
          </form>
        )}
      </section>

      <section className="table-panel">
        <div className="panel-header">
          <div>
            <h3>Automated Overdue Reminders</h3>
            <p>Email/SMS borrowers automatically once a book is overdue.</p>
          </div>
        </div>

        {!remindersEnabled ? (
          <p>Not enabled for this school yet. Ask your platform owner to switch on "Automated Overdue Book Reminders".</p>
        ) : (
          <>
            <div className="student-profile-tabs">
              <button className={reminderView === "rules" ? "active" : ""} type="button" onClick={() => setReminderView("rules")}>Rules</button>
              <button className={reminderView === "history" ? "active" : ""} type="button" onClick={() => setReminderView("history")}>History</button>
            </div>

            {reminderView === "rules" && (
              <>
                <form className="classic-form" onSubmit={saveReminderRule} style={{ marginTop: 16 }}>
                  <div className="form-grid">
                    <TextField label="Rule Name *" name="name" value={reminderForm.name} onChange={handleReminderFormChange} required />
                    <TextField label="Days After Due" type="number" name="offset_days" value={reminderForm.offset_days} onChange={handleReminderFormChange} />
                    <div className="form-field">
                      <label>Channel</label>
                      <select name="channel" value={reminderForm.channel} onChange={handleReminderFormChange}>
                        {REMINDER_CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <div className="form-field">
                      <label>Template (optional)</label>
                      <select name="template_id" value={reminderForm.template_id} onChange={handleReminderFormChange}>
                        <option value="">Default wording</option>
                        {channelTemplates.map((t) => <option key={t.id} value={t.id}>{t.template_name}</option>)}
                      </select>
                      <small>Only Active templates for the selected channel are shown.</small>
                    </div>
                    <div className="form-field">
                      <label>
                        <input type="checkbox" name="is_active" checked={!!reminderForm.is_active} onChange={handleReminderFormChange} style={{ marginRight: 8 }} />
                        Active
                      </label>
                    </div>
                    <div className="form-field full-width">
                      <label>Remarks</label>
                      <textarea name="remarks" rows="2" value={reminderForm.remarks} onChange={handleReminderFormChange}></textarea>
                    </div>
                  </div>
                  <div className="form-actions">
                    <button type="submit" className="primary-button"><PlusCircle size={16} /> {editingRuleId ? "Update Rule" : "Add Rule"}</button>
                    {editingRuleId && <button type="button" className="light-button" onClick={cancelReminderForm}>Cancel</button>}
                  </div>
                </form>

                <div className="table-wrapper" style={{ marginTop: 16 }}>
                  <table className="classic-table">
                    <thead><tr><th>Name</th><th>When</th><th>Channel</th><th>Template</th><th>Active</th><th>Actions</th></tr></thead>
                    <tbody>
                      {reminderRules.map((rule) => (
                        <tr key={rule.id}>
                          <td>{rule.name}</td><td>{rule.when}</td><td>{rule.channel}</td>
                          <td>{channelTemplates.find((t) => t.id === rule.template_id)?.template_name || "Default"}</td>
                          <td><span className={rule.is_active ? "status active" : "status danger"}>{rule.is_active ? "Active" : "Inactive"}</span></td>
                          <td><RowActions onEdit={() => editReminderRule(rule)} onDelete={() => deleteReminderRule(rule)} /></td>
                        </tr>
                      ))}
                      {!reminderRules.length && <tr><td colSpan={6}>No reminder rules yet.</td></tr>}
                    </tbody>
                  </table>
                </div>

                <div className="form-actions" style={{ marginTop: 16 }}>
                  <button type="button" className="secondary-button" onClick={runReminderPreview} disabled={reminderPreviewLoading}>
                    {reminderPreviewLoading ? "Checking…" : "Preview Who Would Be Contacted"}
                  </button>
                  {canRunReminders && (
                    <button type="button" className="primary-button" onClick={runRemindersNow} disabled={reminderRunning}>
                      {reminderRunning ? "Sending…" : "Send Due Reminders Now"}
                    </button>
                  )}
                </div>

                {reminderPreview && (
                  <div className="message-box" style={{ marginTop: 12 }}>
                    Would contact {reminderPreview.sent || 0} borrower(s) as of {reminderPreview.as_of}.
                    {reminderPreview.note && <div>{reminderPreview.note}</div>}
                  </div>
                )}
                {reminderRunResult && (
                  <div className="message-box" style={{ marginTop: 12 }}>
                    Sent {reminderRunResult.sent || 0}, skipped {reminderRunResult.skipped || 0}, failed {reminderRunResult.failed || 0}.
                  </div>
                )}
              </>
            )}

            {reminderView === "history" && (
              <>
                <div className="form-field" style={{ maxWidth: 240, marginTop: 16 }}>
                  <label>Status</label>
                  <select value={reminderHistoryStatusFilter} onChange={(e) => setReminderHistoryStatusFilter(e.target.value)}>
                    <option value="">All statuses</option>
                    {["Sent", "Failed", "Skipped", "Superseded"].map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="table-wrapper">
                  <table className="classic-table">
                    <thead><tr><th>Borrower</th><th>Status</th><th>Reason</th><th>Fine</th><th>Recipient</th><th>Sent</th></tr></thead>
                    <tbody>
                      {reminderHistory.map((row) => (
                        <tr key={row.id}>
                          <td>{row.borrower || "-"}</td>
                          <td><span className={row.status === "Sent" ? "status active" : row.status === "Skipped" || row.status === "Superseded" ? "status pending" : "status danger"}>{row.status}</span></td>
                          <td>{row.skip_reason || row.error_message || "-"}</td>
                          <td>{row.fine_amount != null ? row.fine_amount : "-"}</td>
                          <td>{row.recipient || "-"}</td>
                          <td>{row.sent_on}</td>
                        </tr>
                      ))}
                      {!reminderHistory.length && <tr><td colSpan={6}>No reminders sent yet.</td></tr>}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </>
        )}
      </section>
    </>
  );
}

// =====================================================================
// Shared small components
// =====================================================================

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
      searchPlaceholder="Search library records..."
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
