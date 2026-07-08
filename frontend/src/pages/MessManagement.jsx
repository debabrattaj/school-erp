import { useEffect, useMemo, useState } from "react";
import { todayLocalDate } from "../utils/date";
import {
  CalendarDays,
  ClipboardCheck,
  Edit,
  PlusCircle,
  Trash2,
  Utensils,
  Users,
} from "lucide-react";

import API from "../api";
import StudentPicker from "../components/StudentPicker";
import ManagedRecordsTable from "../components/ManagedRecordsTable";

const today = todayLocalDate();

const emptyMenuForm = {
  menu_date: today,
  meal_type: "Breakfast",
  menu_items: "",
  nutrition_notes: "",
  allergen_notes: "",
  is_published: true,
  remarks: "",
};

const emptyAttendanceForm = {
  student_id: "",
  meal_date: today,
  meal_type: "Breakfast",
  status: "Present",
  remarks: "",
};

function getApiErrorMessage(error, fallbackMessage) {
  const detail = error.response?.data?.detail;

  if (Array.isArray(detail)) return detail.map((item) => item.msg).join(" | ");
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

export default function MessManagement() {
  const [activeTab, setActiveTab] = useState("menus");
  const [menus, setMenus] = useState([]);
  const [attendance, setAttendance] = useState([]);
  const [students, setStudents] = useState([]);
  const [menuForm, setMenuForm] = useState(emptyMenuForm);
  const [attendanceForm, setAttendanceForm] = useState(emptyAttendanceForm);
  const [editing, setEditing] = useState({ type: "", id: null });
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

      const [menuResponse, attendanceResponse, studentResponse] = await Promise.all([
        API.get("/mess/menus/"),
        API.get("/mess/attendance/"),
        API.get("/students/"),
      ]);

      setMenus(menuResponse.data || []);
      setAttendance(attendanceResponse.data || []);
      setStudents(studentResponse.data || []);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load mess management data."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadPageData();
  }, []);

  const todayMenus = menus.filter((menu) => menu.menu_date === today).length;
  const publishedMenus = menus.filter((menu) => menu.is_published).length;
  const presentMeals = attendance.filter((record) => record.status === "Present").length;
  const absentMeals = attendance.filter((record) => record.status === "Absent").length;

  const filteredMenus = useMemo(() => {
    return menus.filter((menu) =>
      [
        menu.menu_date,
        menu.meal_type,
        menu.menu_items,
        menu.nutrition_notes,
        menu.allergen_notes,
      ]
        .join(" ")
        .toLowerCase()
        .includes(searchText.toLowerCase())
    );
  }, [menus, searchText]);

  const filteredAttendance = useMemo(() => {
    return attendance.filter((record) =>
      [
        record.student_name,
        record.admission_no,
        record.class_name,
        record.section,
        record.meal_date,
        record.meal_type,
        record.status,
      ]
        .join(" ")
        .toLowerCase()
        .includes(searchText.toLowerCase())
    );
  }, [attendance, searchText]);

  function handleMenuChange(event) {
    const { name, value, type, checked } = event.target;
    setMenuForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  }

  function handleAttendanceChange(event) {
    const { name, value } = event.target;
    setAttendanceForm((prev) => ({ ...prev, [name]: value }));
  }

  function resetForms() {
    setMenuForm(emptyMenuForm);
    setAttendanceForm(emptyAttendanceForm);
    setEditing({ type: "", id: null });
  }

  async function saveMenu(event) {
    event.preventDefault();
    setMessage("");

    const payload = {
      ...menuForm,
      menu_items: menuForm.menu_items.trim(),
      nutrition_notes: menuForm.nutrition_notes.trim() || null,
      allergen_notes: menuForm.allergen_notes.trim() || null,
      remarks: menuForm.remarks.trim() || null,
    };

    if (!payload.menu_date || !payload.meal_type || !payload.menu_items) {
      setMessage("Date, meal type and menu items are required.");
      return;
    }

    try {
      if (editing.type === "menu") {
        await API.put(`/mess/menus/${editing.id}`, payload);
        setMessage("Mess menu updated successfully.");
      } else {
        await API.post("/mess/menus/", payload);
        setMessage("Mess menu added successfully.");
      }

      resetForms();
      await loadPageData();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to save mess menu."));
    }
  }

  async function saveAttendance(event) {
    event.preventDefault();
    setMessage("");

    const payload = {
      ...attendanceForm,
      student_id: Number(attendanceForm.student_id),
      remarks: attendanceForm.remarks.trim() || null,
    };

    if (!payload.student_id || !payload.meal_date || !payload.meal_type) {
      setMessage("Student, date and meal type are required.");
      return;
    }

    try {
      if (editing.type === "attendance") {
        await API.put(`/mess/attendance/${editing.id}`, payload);
        setMessage("Meal attendance updated successfully.");
      } else {
        await API.post("/mess/attendance/", payload);
        setMessage("Meal attendance added successfully.");
      }

      resetForms();
      await loadPageData();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to save meal attendance."));
    }
  }

  function editMenu(menu) {
    setActiveTab("menus");
    setEditing({ type: "menu", id: menu.id });
    setMenuForm({
      menu_date: menu.menu_date || today,
      meal_type: menu.meal_type || "Breakfast",
      menu_items: menu.menu_items || "",
      nutrition_notes: menu.nutrition_notes || "",
      allergen_notes: menu.allergen_notes || "",
      is_published: Boolean(menu.is_published),
      remarks: menu.remarks || "",
    });
  }

  function editAttendance(record) {
    setActiveTab("attendance");
    setEditing({ type: "attendance", id: record.id });
    setAttendanceForm({
      student_id: record.student_id || "",
      meal_date: record.meal_date || today,
      meal_type: record.meal_type || "Breakfast",
      status: record.status || "Present",
      remarks: record.remarks || "",
    });
  }

  async function deleteRecord(type, id) {
    const confirmDelete = window.confirm("Delete this mess record?");
    if (!confirmDelete) return;

    const endpoint = type === "menu" ? `/mess/menus/${id}` : `/mess/attendance/${id}`;

    try {
      await API.delete(endpoint);
      setMessage("Mess record deleted successfully.");
      resetForms();
      await loadPageData();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to delete mess record."));
    }
  }

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Residential Services</p>
          <h2>Mess Management</h2>
          <p>
            Plan daily meals and track student meal attendance for hostel and
            residential operations.
          </p>
        </div>
      </section>

      <section className="summary-strip report-summary-grid">
        <SummaryCard icon={CalendarDays} label="Today's Menus" value={todayMenus} />
        <SummaryCard icon={Utensils} label="Published Menus" value={publishedMenus} />
        <SummaryCard icon={Users} label="Meals Present" value={presentMeals} />
        <SummaryCard icon={ClipboardCheck} label="Meals Absent" value={absentMeals} warning />
      </section>

      {message && <div className="toast-notification">{message}</div>}

      <section className="table-panel">
        <div className="student-profile-tabs">
          {[
            ["menus", "Meal Menu"],
            ["attendance", "Meal Attendance"],
          ].map(([tab, label]) => (
            <button
              key={tab}
              type="button"
              className={activeTab === tab ? "active" : ""}
              onClick={() => setActiveTab(tab)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      {activeTab === "menus" && (
        <>
          <section className="form-panel">
            <PanelTitle
              title={editing.type === "menu" ? "Edit Meal Menu" : "Add Meal Menu"}
              text="Publish breakfast, lunch, snacks and dinner plans for students."
            />
            <form className="classic-form" onSubmit={saveMenu}>
              <div className="form-grid">
                <TextField
                  label="Menu Date *"
                  type="date"
                  name="menu_date"
                  value={menuForm.menu_date}
                  onChange={handleMenuChange}
                  required
                />
                <MealTypeSelect value={menuForm.meal_type} onChange={handleMenuChange} />
                <div className="form-field full-width">
                  <label>Menu Items *</label>
                  <textarea
                    name="menu_items"
                    value={menuForm.menu_items}
                    onChange={handleMenuChange}
                    rows="3"
                    placeholder="Example: Idli, sambar, fruit, milk"
                    required
                  ></textarea>
                </div>
                <TextField
                  label="Nutrition Notes"
                  name="nutrition_notes"
                  value={menuForm.nutrition_notes}
                  onChange={handleMenuChange}
                />
                <TextField
                  label="Allergen Notes"
                  name="allergen_notes"
                  value={menuForm.allergen_notes}
                  onChange={handleMenuChange}
                />
                <div className="form-field">
                  <label>Publish Status</label>
                  <label className="switch-row">
                    <input
                      type="checkbox"
                      name="is_published"
                      checked={menuForm.is_published}
                      onChange={handleMenuChange}
                    />
                    <span>{menuForm.is_published ? "Published" : "Draft"}</span>
                  </label>
                </div>
                <div className="form-field full-width">
                  <label>Remarks</label>
                  <textarea
                    name="remarks"
                    value={menuForm.remarks}
                    onChange={handleMenuChange}
                    rows="3"
                  ></textarea>
                </div>
              </div>
              <FormActions editing={editing.type === "menu"} label="Menu" resetForms={resetForms} />
            </form>
          </section>

          <MessTable
            title="Meal Menus"
            count={filteredMenus.length}
            searchText={searchText}
            setSearchText={setSearchText}
            loading={loading}
            headers={["Date", "Meal", "Items", "Nutrition", "Allergens", "Status", "Actions"]}
            emptyText="No meal menus found."
          >
            {filteredMenus.map((menu) => (
              <tr key={menu.id}>
                <td>{menu.menu_date}</td>
                <td>{menu.meal_type}</td>
                <td>{menu.menu_items}</td>
                <td>{menu.nutrition_notes || "-"}</td>
                <td>{menu.allergen_notes || "-"}</td>
                <td>
                  <span className={menu.is_published ? "status active" : "status pending"}>
                    {menu.is_published ? "Published" : "Draft"}
                  </span>
                </td>
                <td>
                  <RowActions
                    onEdit={() => editMenu(menu)}
                    onDelete={() => deleteRecord("menu", menu.id)}
                  />
                </td>
              </tr>
            ))}
          </MessTable>
        </>
      )}

      {activeTab === "attendance" && (
        <>
          <section className="form-panel">
            <PanelTitle
              title={
                editing.type === "attendance"
                  ? "Edit Meal Attendance"
                  : "Add Meal Attendance"
              }
              text="Track whether a student took a scheduled meal."
            />
            <form className="classic-form" onSubmit={saveAttendance}>
              <div className="form-grid">
                <StudentPicker
                  students={students}
                  value={attendanceForm.student_id}
                  onChange={handleAttendanceChange}
                />
                <TextField
                  label="Meal Date *"
                  type="date"
                  name="meal_date"
                  value={attendanceForm.meal_date}
                  onChange={handleAttendanceChange}
                  required
                />
                <MealTypeSelect
                  value={attendanceForm.meal_type}
                  onChange={handleAttendanceChange}
                />
                <div className="form-field">
                  <label>Status</label>
                  <select
                    name="status"
                    value={attendanceForm.status}
                    onChange={handleAttendanceChange}
                  >
                    <option value="Present">Present</option>
                    <option value="Absent">Absent</option>
                    <option value="Excused">Excused</option>
                    <option value="Packed Meal">Packed Meal</option>
                  </select>
                </div>
                <div className="form-field full-width">
                  <label>Remarks</label>
                  <textarea
                    name="remarks"
                    value={attendanceForm.remarks}
                    onChange={handleAttendanceChange}
                    rows="3"
                  ></textarea>
                </div>
              </div>
              <FormActions
                editing={editing.type === "attendance"}
                label="Attendance"
                resetForms={resetForms}
              />
            </form>
          </section>

          <MessTable
            title="Meal Attendance"
            count={filteredAttendance.length}
            searchText={searchText}
            setSearchText={setSearchText}
            loading={loading}
            headers={["Student", "Class", "Date", "Meal", "Status", "Remarks", "Actions"]}
            emptyText="No meal attendance records found."
          >
            {filteredAttendance.map((record) => (
              <tr key={record.id}>
                <td>
                  {record.admission_no
                    ? `${record.admission_no} - ${record.student_name}`
                    : record.student_name}
                </td>
                <td>
                  {record.class_name || "-"}
                  {record.section ? `-${record.section}` : ""}
                </td>
                <td>{record.meal_date}</td>
                <td>{record.meal_type}</td>
                <td>
                  <span className={getAttendanceStatusClass(record.status)}>
                    {record.status}
                  </span>
                </td>
                <td>{record.remarks || "-"}</td>
                <td>
                  <RowActions
                    onEdit={() => editAttendance(record)}
                    onDelete={() => deleteRecord("attendance", record.id)}
                  />
                </td>
              </tr>
            ))}
          </MessTable>
        </>
      )}
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, warning = false }) {
  return (
    <div className={warning ? "summary-card warning" : "summary-card"}>
      <Icon size={22} />
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}

function PanelTitle({ title, text }) {
  return (
    <div className="panel-header">
      <div>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
    </div>
  );
}

function TextField({ label, ...props }) {
  return (
    <div className="form-field">
      <label>{label}</label>
      <input {...props} />
    </div>
  );
}

function MealTypeSelect({ value, onChange }) {
  return (
    <div className="form-field">
      <label>Meal Type *</label>
      <select name="meal_type" value={value} onChange={onChange} required>
        <option value="Breakfast">Breakfast</option>
        <option value="Lunch">Lunch</option>
        <option value="Snacks">Snacks</option>
        <option value="Dinner">Dinner</option>
      </select>
    </div>
  );
}

function FormActions({ editing, label, resetForms }) {
  return (
    <div className="form-actions">
      <button type="submit" className="primary-button">
        <PlusCircle size={18} />
        {editing ? `Update ${label}` : `Add ${label}`}
      </button>
      {editing && (
        <button type="button" className="light-button" onClick={resetForms}>
          Cancel Edit
        </button>
      )}
    </div>
  );
}

function MessTable({
  title,
  count,
  searchText,
  setSearchText,
  loading,
  headers,
  emptyText,
  children,
}) {
  return (
    <ManagedRecordsTable
      count={count}
      emptyText={emptyText}
      headers={headers}
      loading={loading}
      loadingText={`Loading ${title.toLowerCase()}...`}
      searchPlaceholder="Search mess records..."
      searchText={searchText}
      setSearchText={setSearchText}
    >
      {children}
    </ManagedRecordsTable>
  );
}

function RowActions({ onEdit, onDelete }) {
  return (
    <div className="action-buttons">
      <button type="button" className="edit-button" onClick={onEdit} title="Edit">
        <Edit size={15} />
      </button>
      <button type="button" className="delete-button" onClick={onDelete} title="Delete">
        <Trash2 size={15} />
      </button>
    </div>
  );
}

function getAttendanceStatusClass(status) {
  if (status === "Present" || status === "Packed Meal") return "status active";
  if (status === "Absent") return "status danger";
  return "status pending";
}
