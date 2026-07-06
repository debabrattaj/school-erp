import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Download,
  Filter,
  RefreshCcw,
  X,
} from "lucide-react";

import API from "../api";
import ManagedRecordsTable from "../components/ManagedRecordsTable";
import { useSchoolSettings } from "../SettingsContext";
import { formatMoney } from "../utils/money";
import { getModuleLayout } from "../services/moduleLayoutService";
import { getModuleCustomFields } from "../services/moduleCustomFieldService";

const MODULES = {
  Students: {
    label: "Students",
    apiPath: "/students/",
    layoutModuleName: "Students",
    idKey: "id",
    columns: [
      { key: "admission_no", label: "Admission No" },
      { key: "full_name", label: "Student Name" },
      { key: "class_display", label: "Class" },
      { key: "section", label: "Section" },
      { key: "gender", label: "Gender" },
      { key: "phone", label: "Phone" },
      { key: "email", label: "Email" },
      { key: "status", label: "Status" },
    ],
  },

  Teachers: {
    label: "Teachers",
    apiPath: "/teachers/",
    layoutModuleName: "Teachers",
    idKey: "id",
    columns: [
      { key: "teacher_code", label: "Teacher Code" },
      { key: "full_name", label: "Teacher Name" },
      { key: "department", label: "Department" },
      { key: "subject", label: "Subject" },
      { key: "phone", label: "Phone" },
      { key: "email", label: "Email" },
      { key: "employment_type", label: "Employment Type" },
      { key: "status", label: "Status" },
    ],
  },

  Classes: {
    label: "Classes",
    apiPath: "/classes/",
    layoutModuleName: "Classes",
    idKey: "id",
    columns: [
      { key: "class_name", label: "Class" },
      { key: "section", label: "Section" },
      { key: "class_teacher", label: "Class Teacher" },
      { key: "room_no", label: "Room No" },
      { key: "student_count", label: "Students" },
    ],
  },

  Fees: {
    label: "Fees",
    apiPath: "/fees/",
    layoutModuleName: "Fees",
    idKey: "id",
    columns: [
      { key: "student_name", label: "Student" },
      { key: "academic_year", label: "Academic Year" },
      { key: "class_display", label: "Class" },
      { key: "fee_type", label: "Fee Type" },
      { key: "total_amount", label: "Total Amount" },
      { key: "paid_amount", label: "Paid Amount" },
      { key: "balance_amount", label: "Balance" },
      { key: "payment_date", label: "Payment Date" },
      { key: "receipt_no", label: "Receipt No" },
      { key: "status", label: "Status" },
      { key: "remarks", label: "Remarks" },
    ],
  },

  Attendance: {
    label: "Attendance",
    apiPath: "/attendance/",
    fallbackApiPath: "/attendances/",
    layoutModuleName: "Attendance",
    idKey: "id",
    columns: [
      { key: "student_name", label: "Student" },
      { key: "academic_year", label: "Academic Year" },
      { key: "class_display", label: "Class" },
      { key: "attendance_date", label: "Date" },
      { key: "status", label: "Status" },
      { key: "remarks", label: "Remarks" },
    ],
  },

  Exams: {
    label: "Exam Master",
    apiPath: "/exams/",
    layoutModuleName: "Exams",
    idKey: "id",
    columns: [
      { key: "exam_name", label: "Exam Name" },
      { key: "remarks", label: "Remarks" },
    ],
  },

  StudentEnrollments: {
    label: "Student Enrollments",
    apiPath: "/student-enrollments/",
    layoutModuleName: "StudentEnrollments",
    idKey: "id",
    columns: [
      { key: "student_name", label: "Student" },
      { key: "admission_no", label: "Admission No" },
      { key: "academic_year", label: "Academic Year" },
      { key: "class_display", label: "Class" },
      { key: "roll_no", label: "Roll No" },
      { key: "enrollment_status", label: "Enrollment Status" },
      { key: "promotion_status", label: "Promotion Status" },
      { key: "start_date", label: "Start Date" },
      { key: "end_date", label: "End Date" },
    ],
  },

  Marks: {
    label: "Marks",
    apiPath: "/marks/",
    layoutModuleName: "Marks",
    idKey: "id",
    columns: [
      { key: "student_name", label: "Student" },
      { key: "academic_year", label: "Academic Year" },
      { key: "class_display", label: "Class" },
      { key: "exam_name", label: "Exam" },
      { key: "subject", label: "Subject" },
      { key: "marks_obtained", label: "Marks Obtained" },
      { key: "max_marks", label: "Max Marks" },
      { key: "percentage", label: "Percentage" },
      { key: "result_status", label: "Result" },
    ],
  },
};

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

function getAllLayoutFields(layout) {
  if (!Array.isArray(layout)) return [];

  return layout.flatMap((section) =>
    Array.isArray(section.fields) ? section.fields : []
  );
}

function normalizeDate(value) {
  if (!value) return "";
  return String(value).split("T")[0];
}

// Set from the component once settings load, so the module-level table config
// formats amounts in the school's currency.
let reportCurrency = "INR";
export function setReportCurrency(code) {
  reportCurrency = code || "INR";
}

function formatCurrency(value) {
  return formatMoney(value, reportCurrency);
}

function formatValue(key, value) {
  if (value === null || value === undefined || value === "") return "-";

  if (
    [
      "total_amount",
      "paid_amount",
      "balance_amount",
      "amount",
    ].includes(key)
  ) {
    return formatCurrency(value);
  }

  if (
    key.toLowerCase().includes("date") ||
    key === "attendance_date" ||
    key === "exam_date" ||
    key === "due_date" ||
    key === "payment_date"
  ) {
    return normalizeDate(value) || "-";
  }

  if (typeof value === "boolean") {
    return value ? "Yes" : "No";
  }

  return String(value);
}

function getRawRecordValue(record, key) {
  if (key === "amount") {
    return record.total_amount ?? record.amount;
  }

  if (key === "total_amount") {
    return record.total_amount ?? record.amount;
  }

  return record[key];
}

function calculateMarksExtra(record) {
  const obtained = Number(record.marks_obtained || 0);
  const max = Number(record.max_marks || 0);
  const percentage = max > 0 ? (obtained / max) * 100 : 0;

  let resultStatus = "Needs Improvement";

  if (percentage >= 90) resultStatus = "Excellent";
  else if (percentage >= 75) resultStatus = "Very Good";
  else if (percentage >= 60) resultStatus = "Good";
  else if (percentage >= 40) resultStatus = "Pass";

  return {
    ...record,
    percentage: `${percentage.toFixed(2)}%`,
    result_status: resultStatus,
  };
}

function buildStudentMap(students = []) {
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
}

function buildClassStudentCountMap(students = []) {
  const map = {};

  students.forEach((student) => {
    if (student.class_id) {
      map[student.class_id] = (map[student.class_id] || 0) + 1;
      return;
    }

    const fallbackKey = `${student.class_name || ""}-${student.section || ""}`;
    map[fallbackKey] = (map[fallbackKey] || 0) + 1;
  });

  return map;
}

function buildExamMap(exams = []) {
  const map = {};

  exams.forEach((exam) => {
    map[exam.id] = exam.exam_name || `Exam ID: ${exam.id}`;
  });

  return map;
}

function enrichRecord(moduleName, record, lookupData) {
  const studentMap = lookupData.studentMap || {};
  const examMap = lookupData.examMap || {};
  const classStudentCountMap = lookupData.classStudentCountMap || {};

  const fullName = `${record.first_name || ""} ${record.last_name || ""}`.trim();

  const enriched = {
    ...record,
    full_name: fullName || record.name || "-",
    class_display:
      record.class_name || record.section
        ? `${record.class_name || ""} ${record.section || ""}`.trim()
        : "-",
  };

  if (["Fees", "Attendance", "Marks"].includes(moduleName)) {
    enriched.student_name =
      studentMap[record.student_id] || `Student ID: ${record.student_id || "-"}`;
    enriched.class_display =
      record.class_name_snapshot || record.section_snapshot
        ? `${record.class_name_snapshot || ""} ${record.section_snapshot || ""}`.trim()
        : enriched.class_display;
  }

  if (moduleName === "Marks") {
    enriched.exam_name =
      record.exam_name_snapshot || examMap[record.exam_id] || `Exam ID: ${record.exam_id || "-"}`;
  }

  if (moduleName === "Classes") {
    if (record.id && classStudentCountMap[record.id] !== undefined) {
      enriched.student_count = classStudentCountMap[record.id];
    } else {
      const fallbackKey = `${record.class_name || ""}-${record.section || ""}`;
      enriched.student_count = classStudentCountMap[fallbackKey] || 0;
    }
  }

  if (moduleName === "Fees") {
    const total = Number(record.total_amount ?? record.amount ?? 0);
    const paid = Number(record.paid_amount ?? 0);

    enriched.total_amount = total;
    enriched.paid_amount = paid;
    enriched.balance_amount = Number(record.due_amount ?? Math.max(total - paid, 0));
    enriched.status = record.payment_status || record.status || "Unpaid";
  }

  if (moduleName === "Marks") {
    return calculateMarksExtra(enriched);
  }

  return enriched;
}

function convertCustomFieldValue(item) {
  if (item.field_type === "checkbox") {
    return item.field_value === "true" ? "Yes" : "No";
  }

  return item.field_value || "";
}

function mergeColumns(baseColumns, layoutFields, customColumns) {
  const map = new Map();

  baseColumns.forEach((column) => {
    map.set(column.key, column);
  });

  layoutFields.forEach((field) => {
    if (!field.name) return;

    if (field.name === "amount" && map.has("total_amount")) return;
    if (field.name === "student_id" && map.has("student_name")) return;
    if (field.name === "exam_id" && map.has("exam_name")) return;

    if (!map.has(field.name)) {
      map.set(field.name, {
        key: field.name,
        label: field.label || field.name,
      });
    }
  });

  customColumns.forEach((column) => {
    if (!map.has(column.key)) {
      map.set(column.key, column);
    }
  });

  return Array.from(map.values());
}

export default function Reports() {
  const { settings } = useSchoolSettings() || {};
  setReportCurrency(settings?.currency);

  const [selectedModule, setSelectedModule] = useState("Students");
  const [records, setRecords] = useState([]);
  const [columns, setColumns] = useState(MODULES.Students.columns);

  const [visibleColumns, setVisibleColumns] = useState(
    MODULES.Students.columns.map((column) => column.key)
  );

  const [searchText, setSearchText] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [academicYearFilter, setAcademicYearFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!message) return undefined;

    const timeoutId = window.setTimeout(() => {
      setMessage("");
    }, 2000);

    return () => window.clearTimeout(timeoutId);
  }, [message]);

  function moduleSupportsAcademicYear(moduleName) {
    return ["StudentEnrollments", "Fees", "Attendance", "Marks"].includes(moduleName);
  }

  async function loadRecordsFromPath(config, moduleName) {
    try {
      const params =
        academicYearFilter && moduleSupportsAcademicYear(moduleName)
          ? { academic_year: academicYearFilter }
          : {};
      const response = await API.get(config.apiPath, { params });
      return response.data || [];
    } catch (error) {
      if (config.fallbackApiPath) {
        const params =
          academicYearFilter && moduleSupportsAcademicYear(moduleName)
            ? { academic_year: academicYearFilter }
            : {};
        const fallbackResponse = await API.get(config.fallbackApiPath, { params });
        return fallbackResponse.data || [];
      }

      throw error;
    }
  }

  async function loadLookupData(moduleName) {
    const needsStudents = ["Fees", "Attendance", "Marks", "Classes"].includes(
      moduleName
    );

    const needsExams = moduleName === "Marks";

    const [studentsResponse, examsResponse] = await Promise.all([
      needsStudents ? API.get("/students/") : Promise.resolve({ data: [] }),
      needsExams ? API.get("/exams/") : Promise.resolve({ data: [] }),
    ]);

    const students = studentsResponse.data || [];
    const exams = examsResponse.data || [];

    return {
      studentMap: buildStudentMap(students),
      examMap: buildExamMap(exams),
      classStudentCountMap: buildClassStudentCountMap(students),
    };
  }

  async function loadLayoutFields(moduleName) {
    try {
      const layout = await getModuleLayout(moduleName);

      if (!layout || !Array.isArray(layout)) return [];

      return getAllLayoutFields(layout);
    } catch {
      return [];
    }
  }

  async function loadLegacyStudentCustomFields(recordId) {
    try {
      const response = await API.get(`/students/${recordId}/custom-fields`);
      return response.data || [];
    } catch {
      return [];
    }
  }

  async function loadCustomValuesForRecord(moduleName, recordId) {
    try {
      const genericValues = await getModuleCustomFields(moduleName, recordId);

      if (genericValues && genericValues.length > 0) {
        return genericValues;
      }

      if (moduleName === "Students") {
        return await loadLegacyStudentCustomFields(recordId);
      }

      return [];
    } catch {
      if (moduleName === "Students") {
        return await loadLegacyStudentCustomFields(recordId);
      }

      return [];
    }
  }

  async function mergeCustomFields(moduleName, baseRecords) {
    const customColumnMap = new Map();

    const recordsWithCustomFields = await Promise.all(
      baseRecords.map(async (record) => {
        const values = await loadCustomValuesForRecord(moduleName, record.id);

        const customData = {};

        values.forEach((item) => {
          const key = item.field_key;
          const label = item.field_label || item.field_key;

          customColumnMap.set(key, {
            key,
            label,
          });

          customData[key] = convertCustomFieldValue(item);
        });

        return {
          ...record,
          ...customData,
        };
      })
    );

    return {
      records: recordsWithCustomFields,
      customColumns: Array.from(customColumnMap.values()),
    };
  }

  async function loadReportData(moduleName = selectedModule) {
    try {
      setLoading(true);
      setMessage("");

      const config = MODULES[moduleName];

      const [rawRecords, layoutFields, lookupData] = await Promise.all([
        loadRecordsFromPath(config, moduleName),
        loadLayoutFields(config.layoutModuleName),
        loadLookupData(moduleName),
      ]);

      let baseRecords = rawRecords.map((record) =>
        enrichRecord(moduleName, record, lookupData)
      );

      const customResult = await mergeCustomFields(
        config.layoutModuleName,
        baseRecords
      );

      baseRecords = customResult.records;

      const finalColumns = mergeColumns(
        config.columns,
        layoutFields,
        customResult.customColumns
      );

      setRecords(baseRecords);
      setColumns(finalColumns);
      setVisibleColumns(finalColumns.map((column) => column.key));
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load report data."));
      setRecords([]);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadReportData(selectedModule);
  }, [selectedModule, academicYearFilter]);

  const statusOptions = useMemo(() => {
    const values = records.map((record) => record.status).filter(Boolean);
    return Array.from(new Set(values));
  }, [records]);

  const academicYearOptions = useMemo(() => {
    const values = records
      .map((record) => record.academic_year)
      .filter(Boolean);
    return Array.from(new Set(values)).sort().reverse();
  }, [records]);

  const filteredRecords = useMemo(() => {
    return records.filter((record) => {
      const searchableText = columns
        .map((column) => getRawRecordValue(record, column.key))
        .join(" ")
        .toLowerCase();

      const matchSearch = searchableText.includes(searchText.toLowerCase());

      const matchStatus = statusFilter
        ? String(record.status || "") === statusFilter
        : true;

      const matchAcademicYear =
        academicYearFilter && moduleSupportsAcademicYear(selectedModule)
          ? String(record.academic_year || "") === academicYearFilter
          : true;

      return matchSearch && matchStatus && matchAcademicYear;
    });
  }, [records, columns, searchText, statusFilter, academicYearFilter, selectedModule]);

  const activeColumns = columns.filter((column) =>
    visibleColumns.includes(column.key)
  );

  const summary = useMemo(() => {
    if (selectedModule === "Fees") {
      const total = filteredRecords.reduce(
        (sum, record) => sum + Number(record.total_amount || 0),
        0
      );

      const paid = filteredRecords.reduce(
        (sum, record) => sum + Number(record.paid_amount || 0),
        0
      );

      return {
        firstLabel: "Total Amount",
        firstValue: formatCurrency(total),
        secondLabel: "Paid Amount",
        secondValue: formatCurrency(paid),
        thirdLabel: "Balance",
        thirdValue: formatCurrency(Math.max(total - paid, 0)),
      };
    }

    if (selectedModule === "Attendance") {
      const present = filteredRecords.filter(
        (record) => String(record.status || "").toLowerCase() === "present"
      ).length;

      const absent = filteredRecords.filter(
        (record) => String(record.status || "").toLowerCase() === "absent"
      ).length;

      return {
        firstLabel: "Present",
        firstValue: present,
        secondLabel: "Absent",
        secondValue: absent,
        thirdLabel: "Other",
        thirdValue: Math.max(filteredRecords.length - present - absent, 0),
      };
    }

    if (selectedModule === "Marks") {
      const pass = filteredRecords.filter((record) =>
        ["Excellent", "Very Good", "Good", "Pass"].includes(
          record.result_status
        )
      ).length;

      return {
        firstLabel: "Pass Records",
        firstValue: pass,
        secondLabel: "Needs Improvement",
        secondValue: filteredRecords.length - pass,
        thirdLabel: "Total Marks Records",
        thirdValue: filteredRecords.length,
      };
    }

    return {
      firstLabel: "Total Records",
      firstValue: filteredRecords.length,
      secondLabel: "Visible Columns",
      secondValue: activeColumns.length,
      thirdLabel: "Module",
      thirdValue: MODULES[selectedModule].label,
    };
  }, [selectedModule, filteredRecords, activeColumns]);

  function toggleColumn(columnKey) {
    setVisibleColumns((prev) => {
      if (prev.includes(columnKey)) {
        return prev.filter((item) => item !== columnKey);
      }

      return [...prev, columnKey];
    });
  }

  function exportCsv() {
    if (filteredRecords.length === 0) {
      setMessage("No records available to export.");
      return;
    }

    const header = activeColumns.map((column) => column.label);

    const rows = filteredRecords.map((record) =>
      activeColumns.map((column) => {
        const value = formatValue(
          column.key,
          getRawRecordValue(record, column.key)
        );

        return `"${String(value).replaceAll('"', '""')}"`;
      })
    );

    const csvContent = [header, ...rows]
      .map((row) => row.join(","))
      .join("\n");

    const blob = new Blob([csvContent], {
      type: "text/csv;charset=utf-8;",
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    link.href = url;
    link.download = `${selectedModule}_Report.csv`;
    link.click();

    URL.revokeObjectURL(url);
  }

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Reports</p>
          <h2>Reports Center</h2>
          <p>
            View module-wise reports with layout fields, lookup values and
            custom fields.
          </p>
        </div>

        <div className="module-header-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={() => loadReportData(selectedModule)}
          >
            <RefreshCcw size={17} />
            Refresh
          </button>

          <button
            type="button"
            className="primary-button"
            onClick={exportCsv}
          >
            <Download size={17} />
            Export CSV
          </button>
        </div>
      </section>

      {message && <div className="toast-notification">{message}</div>}

      <section className="summary-strip report-summary-grid">
        <div className="summary-card">
          <BarChart3 size={22} />
          <div>
            <span>Records</span>
            <strong>{filteredRecords.length}</strong>
          </div>
        </div>

        <div className="summary-card">
          <BarChart3 size={22} />
          <div>
            <span>{summary.firstLabel}</span>
            <strong>{summary.firstValue}</strong>
          </div>
        </div>

        <div className="summary-card">
          <BarChart3 size={22} />
          <div>
            <span>{summary.secondLabel}</span>
            <strong>{summary.secondValue}</strong>
          </div>
        </div>

        <div className="summary-card warning">
          <BarChart3 size={22} />
          <div>
            <span>{summary.thirdLabel}</span>
            <strong>{summary.thirdValue}</strong>
          </div>
        </div>
      </section>

      <section className="table-panel module-filter-panel">
        <div className="filter-row sis-filter-row">
          <div className="form-field">
            <label>Module</label>
            <select
              value={selectedModule}
              onChange={(e) => {
                setSelectedModule(e.target.value);
                setSearchText("");
                setStatusFilter("");
                setAcademicYearFilter("");
              }}
            >
              {Object.keys(MODULES).map((moduleName) => (
                <option key={moduleName} value={moduleName}>
                  {MODULES[moduleName].label}
                </option>
              ))}
            </select>
          </div>

          {moduleSupportsAcademicYear(selectedModule) && (
            <div className="form-field">
              <label>Academic Year</label>
              <select
                value={academicYearFilter}
                onChange={(e) => setAcademicYearFilter(e.target.value)}
              >
                <option value="">All Years</option>

                {academicYearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="form-field">
            <label>Status</label>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
            >
              <option value="">All Status</option>

              {statusOptions.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className="light-button"
            onClick={() => {
              setSearchText("");
              setStatusFilter("");
              setAcademicYearFilter("");
            }}
          >
            <X size={16} />
            Clear Filters
          </button>
        </div>

        <div className="report-column-box">
          <div className="report-column-title">
            <Filter size={16} />
            Columns
          </div>

          <div className="report-column-list">
            {columns.map((column) => (
              <label key={column.key} className="report-column-check">
                <input
                  type="checkbox"
                  checked={visibleColumns.includes(column.key)}
                  onChange={() => toggleColumn(column.key)}
                />
                <span>{column.label}</span>
              </label>
            ))}
          </div>
        </div>

      </section>

      <ManagedRecordsTable
        count={filteredRecords.length}
        emptyText="No records found."
        headers={activeColumns.map((column) => column.label)}
        loading={loading}
        loadingText="Loading report..."
        searchPlaceholder="Search report..."
        searchText={searchText}
        setSearchText={setSearchText}
      >
        {filteredRecords.map((record, index) => (
                    <tr key={record.id || index}>
                      {activeColumns.map((column) => (
                        <td key={column.key}>
                          {formatValue(
                            column.key,
                            getRawRecordValue(record, column.key)
                          )}
                        </td>
                      ))}
                    </tr>
        ))}
      </ManagedRecordsTable>
    </div>
  );
}
