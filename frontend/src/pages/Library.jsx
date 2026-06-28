import { useEffect, useMemo, useState } from "react";
import { BookOpen, Edit, PlusCircle, RefreshCcw, Search, Trash2, Undo2 } from "lucide-react";

import API from "../api";
import StudentPicker from "../components/StudentPicker";
import { getMasterValues } from "../services/masterDataService";

const today = new Date().toISOString().slice(0, 10);

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
  student_id: "",
  issue_date: today,
  due_date: "",
  return_date: "",
  status: "Issued",
  fine_amount: 0,
  remarks: "",
};

function getApiErrorMessage(error, fallbackMessage) {
  const detail = error.response?.data?.detail;
  if (Array.isArray(detail)) return detail.map((item) => item.msg).join(" | ");
  if (typeof detail === "string") return detail;
  return fallbackMessage;
}

export default function Library() {
  const [activeTab, setActiveTab] = useState("books");
  const [books, setBooks] = useState([]);
  const [issues, setIssues] = useState([]);
  const [students, setStudents] = useState([]);
  const [categories, setCategories] = useState([]);
  const [bookForm, setBookForm] = useState(emptyBookForm);
  const [issueForm, setIssueForm] = useState(emptyIssueForm);
  const [editing, setEditing] = useState({ type: "", id: null });
  const [formMode, setFormMode] = useState("");
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function loadPageData() {
    try {
      setLoading(true);
      setMessage("");
      const [bookResponse, issueResponse, studentResponse, categoryResponse] = await Promise.all([
        API.get("/library/books/"),
        API.get("/library/issues/"),
        API.get("/students/"),
        getMasterValues("LibraryCategory"),
      ]);
      setBooks(bookResponse.data || []);
      setIssues(issueResponse.data || []);
      setStudents(studentResponse.data || []);
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

  const issuedCount = issues.filter((issue) => issue.status === "Issued").length;
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
        `${issue.book_title} ${issue.accession_no} ${issue.student_name} ${issue.admission_no} ${issue.status}`
          .toLowerCase()
          .includes(searchText.toLowerCase())
      ),
    [issues, searchText]
  );

  function handleBookChange(event) {
    const { name, value } = event.target;
    setBookForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleIssueChange(event) {
    const { name, value } = event.target;
    setIssueForm((prev) => ({ ...prev, [name]: value }));
  }

  function resetForms() {
    setBookForm(emptyBookForm);
    setIssueForm(emptyIssueForm);
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

  async function saveIssue(event) {
    event.preventDefault();
    const payload = {
      ...issueForm,
      book_id: Number(issueForm.book_id),
      student_id: Number(issueForm.student_id),
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

  function editBook(book) {
    setActiveTab("books");
    setEditing({ type: "book", id: book.id });
    setFormMode("book");
    setBookForm({ ...emptyBookForm, ...book });
  }

  function editIssue(issue) {
    setActiveTab("issues");
    setEditing({ type: "issue", id: issue.id });
    setFormMode("issue");
    setIssueForm({
      book_id: issue.book_id || "",
      student_id: issue.student_id || "",
      issue_date: issue.issue_date || today,
      due_date: issue.due_date || "",
      return_date: issue.return_date || "",
      status: issue.status || "Issued",
      fine_amount: issue.fine_amount || 0,
      remarks: issue.remarks || "",
    });
  }

  function addBook() {
    setActiveTab("books");
    setBookForm(emptyBookForm);
    setEditing({ type: "", id: null });
    setFormMode("book");
  }

  function addIssue() {
    setActiveTab("issues");
    setIssueForm(emptyIssueForm);
    setEditing({ type: "", id: null });
    setFormMode("issue");
  }

  async function deleteRecord(type, id) {
    const confirmDelete = window.confirm("Delete this library record?");
    if (!confirmDelete) return;
    const endpoint = type === "book" ? `/library/books/${id}` : `/library/issues/${id}`;
    try {
      await API.delete(endpoint);
      setMessage("Library record deleted successfully.");
      resetForms();
      await loadPageData();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to delete library record."));
    }
  }

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Academic Resources</p>
          <h2>Library</h2>
          <p>Manage books, student issues, returns, and library availability.</p>
        </div>
        <div className="module-header-actions">
          <button type="button" className="secondary-button" onClick={loadPageData}>
            <RefreshCcw size={17} />
            Refresh
          </button>
          <button type="button" className="primary-button" onClick={activeTab === "books" ? addBook : addIssue}>
            <PlusCircle size={18} />
            {activeTab === "books" ? "Add Book" : "Issue Book"}
          </button>
        </div>
      </section>

      <section className="summary-strip report-summary-grid">
        <SummaryCard icon={BookOpen} label="Books" value={books.length} />
        <SummaryCard icon={BookOpen} label="Available Copies" value={availableCopies} />
        <SummaryCard icon={Undo2} label="Issued Books" value={issuedCount} warning />
      </section>

      {message && <div className="message-box">{message}</div>}

      <section className="table-panel">
        <div className="student-profile-tabs">
          <button className={activeTab === "books" ? "active" : ""} type="button" onClick={() => { setActiveTab("books"); resetForms(); }}>Books</button>
          <button className={activeTab === "issues" ? "active" : ""} type="button" onClick={() => { setActiveTab("issues"); resetForms(); }}>Issue / Return</button>
        </div>
      </section>

      {activeTab === "books" ? (
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
                <td><span className={book.status === "Available" ? "status active" : "status pending"}>{book.status}</span></td>
                <td><RowActions onEdit={() => editBook(book)} onDelete={() => deleteRecord("book", book.id)} /></td>
              </tr>
            ))}
          </RecordsTable>
        </>
      ) : (
        <>
          {formMode === "issue" && (
          <section className="form-panel">
            <PanelTitle title={editing.type === "issue" ? "Edit Book Issue" : "Issue Book"} text="Link issued books to student records and mark returns." />
            <form className="classic-form" onSubmit={saveIssue}>
              <div className="form-grid">
                <div className="form-field">
                  <label>Book *</label>
                  <select name="book_id" value={issueForm.book_id} onChange={handleIssueChange} required>
                    <option value="">Select Book</option>
                    {books.map((book) => <option key={book.id} value={book.id}>{book.accession_no} - {book.title} ({book.available_copies} free)</option>)}
                  </select>
                </div>
                <StudentPicker students={students} value={issueForm.student_id} onChange={handleIssueChange} />
                <TextField label="Issue Date *" type="date" name="issue_date" value={issueForm.issue_date} onChange={handleIssueChange} required />
                <TextField label="Due Date" type="date" name="due_date" value={issueForm.due_date} onChange={handleIssueChange} />
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
                <TextField label="Fine Amount" type="number" name="fine_amount" value={issueForm.fine_amount} onChange={handleIssueChange} />
                <div className="form-field full-width">
                  <label>Remarks</label>
                  <textarea name="remarks" rows="3" value={issueForm.remarks} onChange={handleIssueChange}></textarea>
                </div>
              </div>
              <FormActions editing={editing.type === "issue"} label="Issue" resetForms={resetForms} />
            </form>
          </section>
          )}
          <RecordsTable title="Book Issues" count={filteredIssues.length} searchText={searchText} setSearchText={setSearchText} loading={loading} headers={["Book", "Student", "Class", "Issue", "Due", "Return", "Status", "Fine", "Actions"]}>
            {filteredIssues.map((issue) => (
              <tr key={issue.id}>
                <td>{issue.accession_no} - {issue.book_title}</td><td>{issue.admission_no ? `${issue.admission_no} - ${issue.student_name}` : issue.student_name}</td><td>{issue.class_name || "-"} {issue.section || ""}</td><td>{issue.issue_date}</td><td>{issue.due_date || "-"}</td><td>{issue.return_date || "-"}</td>
                <td><span className={issue.status === "Issued" ? "status pending" : "status active"}>{issue.status}</span></td><td>{issue.fine_amount || 0}</td>
                <td><RowActions onEdit={() => editIssue(issue)} onDelete={() => deleteRecord("issue", issue.id)} /></td>
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
  return (
    <section className="table-panel">
      <div className="table-toolbar"><div><h3>{title}</h3><p>{count} record(s) found</p></div><div className="table-search"><Search size={17} /><input value={searchText} onChange={(event) => setSearchText(event.target.value)} placeholder="Search library records..." /></div></div>
      {loading ? <div className="loading-box">Loading library records...</div> : <div className="table-wrapper"><table className="classic-table"><thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead><tbody>{count === 0 ? <tr><td colSpan={headers.length} className="empty-table">No records found.</td></tr> : children}</tbody></table></div>}
    </section>
  );
}

function RowActions({ onEdit, onDelete }) {
  return <div className="action-buttons"><button type="button" className="edit-button" onClick={onEdit} title="Edit"><Edit size={15} /></button><button type="button" className="delete-button" onClick={onDelete} title="Delete"><Trash2 size={15} /></button></div>;
}
