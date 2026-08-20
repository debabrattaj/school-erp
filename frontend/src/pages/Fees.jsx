import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { todayLocalDate } from "../utils/date";
import { useMoney } from "../utils/money";
import { useT } from "../i18n";
import {
  ArrowLeft,
  Edit,
  Trash2,
  PlusCircle,
  Eye,
  Upload,
  X,
  Wallet,
  Settings2,
  Download,
  History,
  Bell,
  Send,
  Percent,
  Check,
  Undo2,
  RefreshCcw,
} from "lucide-react";

import API from "../api";
import { isFeatureEnabled, hasAccess } from "../auth";
import StudentPicker from "../components/StudentPicker";
import ManagedRecordsTable from "../components/ManagedRecordsTable";
import BulkImportModal from "../components/BulkImportModal";
import { getMasterValues } from "../services/masterDataService";

const emptyFeeForm = {
  student_id: "",
  class_name: "",
  section: "",
  fee_type: "",
  academic_year: "",
  total_amount: "",
  paid_amount: "",
  payment_date: "",
  due_date: "",
  receipt_no: "",
  remarks: "",
};

const emptyStructureForm = {
  academic_year: "",
  class_name: "",
  residential_type: "",
  fee_type: "",
  amount: "",
  due_date: "",
  remarks: "",
  auto_generate: false,
  recurrence: "",
  next_run_date: "",
};

const residentialTypeOptions = ["Day Scholar", "Hosteller"];

// Mirrors backend/app/fee_scheduling.py's MAX_SCHEDULE_DAY — next_run_date's
// day-of-month is capped so every recurrence lines up in shorter months too.
const MAX_SCHEDULE_DAY = 28;

const recurrenceOptions = [
  { value: "monthly", label: "Monthly" },
  { value: "quarterly", label: "Quarterly" },
  { value: "annually", label: "Annually" },
  { value: "once", label: "One-time" },
];

function recurrenceLabel(value) {
  return recurrenceOptions.find((option) => option.value === value)?.label || value || "-";
}

function uniqueSorted(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) =>
    String(a).localeCompare(String(b), undefined, { numeric: true })
  );
}

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
  "Paid",
  "Partial",
  "Unpaid",
];

const emptyReminderForm = {
  name: "",
  offset_days: "-3",
  channel: "Email",
  template_id: "",
  min_due_amount: "0",
  is_active: true,
  remarks: "",
};

const reminderChannelOptions = ["Email", "SMS", "WhatsApp", "In App"];
const reminderStatusOptions = ["Sent", "Failed", "Skipped", "Superseded"];

function offsetDaysLabel(days) {
  const n = Number(days || 0);
  if (n < 0) return `${Math.abs(n)} day(s) before due`;
  if (n === 0) return "On the due date";
  return `${n} day(s) after due (overdue)`;
}

function reminderStatusClass(status) {
  const text = String(status || "").toLowerCase();
  if (text === "sent") return "status active";
  if (text === "failed") return "status danger";
  if (text === "superseded") return "status pending";
  return "status warning"; // Skipped
}

const emptySchemeForm = {
  code: "",
  name: "",
  category: "",
  discount_type: "percent",
  discount_value: "0",
  applies_to_fee_type: "",
  is_active: true,
  remarks: "",
};

const emptyGrantForm = {
  student_id: "",
  scheme_id: "",
  academic_year: "",
  discount_type: "",
  discount_value: "",
  reason: "",
  valid_from: "",
  valid_to: "",
};

const grantStatusOptions = ["Requested", "Approved", "Rejected", "Revoked"];

function discountLabel(discountType, value, money) {
  const v = Number(value || 0);
  if (String(discountType || "percent").toLowerCase() === "fixed") return money(v);
  return `${v}%`;
}

function grantStatusClass(status) {
  const text = String(status || "").toLowerCase();
  if (text === "approved") return "status active";
  if (text === "rejected" || text === "revoked") return "status danger";
  return "status warning"; // Requested
}

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

function getTodayDateString() {
  return todayLocalDate();
}

function normalizeDateInput(value) {
  if (!value) return "";
  return String(value).split("T")[0];
}

function resolveDefaultAcademicYear(years) {
  if (!years || !years.length) return "";

  const current = years.find((year) => year.is_current);
  if (current) return current.name;

  // Nobody has explicitly marked a year "current" yet — fall back to
  // whichever year's date range covers today, if any.
  const today = new Date();
  const inRange = years.find((year) => {
    if (!year.start_date || !year.end_date) return false;
    return today >= new Date(year.start_date) && today <= new Date(year.end_date);
  });
  if (inRange) return inRange.name;

  // Last resort: the most recent year (the list is sorted name-desc).
  return years[0]?.name || "";
}

function getFeeAmount(fee) {
  return Number(fee.total_amount ?? fee.amount ?? 0);
}

function getPaidAmount(fee) {
  return Number(fee.paid_amount ?? 0);
}

function getBalanceAmount(fee) {
  return Number(fee.due_amount ?? Math.max(getFeeAmount(fee) - getPaidAmount(fee), 0));
}

function calculateFeeStatus(totalAmount, paidAmount) {
  const total = Number(totalAmount || 0);
  const paid = Number(paidAmount || 0);

  if (total > 0 && paid >= total) {
    return "Paid";
  }

  if (paid > 0 && paid < total) {
    return "Partial";
  }

  return "Unpaid";
}

function getStatusClass(status) {
  const text = String(status || "").toLowerCase();

  if (text === "paid") return "status active";
  if (text === "unpaid") return "status danger";

  return "status warning";
}

function runStatusClass(status) {
  const text = String(status || "").toLowerCase();

  if (text === "success") return "status active";
  if (text === "failed") return "status danger";

  return "status pending"; // "partial"
}

// last_generated_at / run_at come from the backend as naive-UTC timestamps
// (no "Z" suffix) — treat them as UTC explicitly before converting to the
// viewer's local time, otherwise the browser reads them as already-local.
function formatDateTime(value) {
  if (!value) return "-";
  const iso = /[zZ]|[+-]\d\d:\d\d$/.test(value) ? value : `${value}Z`;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return value;

  return date.toLocaleString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function Fees() {
  const navigate = useNavigate();
  const money = useMoney();
  const t = useT();

  const [fees, setFees] = useState([]);
  const [students, setStudents] = useState([]);
  const [feeTypes, setFeeTypes] = useState(fallbackFeeTypes);
  const [academicYears, setAcademicYears] = useState([]);
  const [classOptionsMaster, setClassOptionsMaster] = useState([]);
  const [feeStructures, setFeeStructures] = useState([]);
  const [showBulkImport, setShowBulkImport] = useState(false);

  const [formData, setFormData] = useState(emptyFeeForm);
  const [editingId, setEditingId] = useState(null);
  const [pageMode, setPageMode] = useState("list");
  const [feeMode, setFeeMode] = useState("student");
  const [selectedFee, setSelectedFee] = useState(null);
  const [structureLookupMessage, setStructureLookupMessage] = useState("");
  const [structureFound, setStructureFound] = useState(false);
  const [classStructureLookup, setClassStructureLookup] = useState(null);

  const [structureForm, setStructureForm] = useState(emptyStructureForm);
  const [editingStructureId, setEditingStructureId] = useState(null);
  const feeAutoGenEnabled = isFeatureEnabled("fee_auto_generation");

  const [showGenerationHistory, setShowGenerationHistory] = useState(false);
  const [generationRuns, setGenerationRuns] = useState([]);
  const [generationRunsLoading, setGenerationRunsLoading] = useState(false);

  const feeRemindersEnabled = isFeatureEnabled("fee_reminders");
  const canRunRemindersNow = hasAccess(["Admin", "Principal"]);

  const [reminderView, setReminderView] = useState("rules");
  const [reminderRules, setReminderRules] = useState([]);
  const [reminderRulesLoading, setReminderRulesLoading] = useState(false);
  const [reminderForm, setReminderForm] = useState(emptyReminderForm);
  const [editingReminderRuleId, setEditingReminderRuleId] = useState(null);
  const [communicationTemplates, setCommunicationTemplates] = useState([]);

  const [reminderPreviewDate, setReminderPreviewDate] = useState(getTodayDateString());
  const [reminderPreview, setReminderPreview] = useState(null);
  const [reminderPreviewLoading, setReminderPreviewLoading] = useState(false);
  const [reminderRunResult, setReminderRunResult] = useState(null);
  const [reminderRunning, setReminderRunning] = useState(false);

  const [reminderHistory, setReminderHistory] = useState([]);
  const [reminderHistoryLoading, setReminderHistoryLoading] = useState(false);
  const [reminderHistoryStatusFilter, setReminderHistoryStatusFilter] = useState("");

  const canApproveConcessions = hasAccess(["Admin", "Principal"]);

  const [concessionView, setConcessionView] = useState("schemes");

  const [concessionSchemes, setConcessionSchemes] = useState([]);
  const [concessionSchemesLoading, setConcessionSchemesLoading] = useState(false);
  const [schemeForm, setSchemeForm] = useState(emptySchemeForm);
  const [editingSchemeId, setEditingSchemeId] = useState(null);

  const [concessionGrants, setConcessionGrants] = useState([]);
  const [concessionGrantsLoading, setConcessionGrantsLoading] = useState(false);
  const [grantForm, setGrantForm] = useState(emptyGrantForm);
  const [grantStatusFilter, setGrantStatusFilter] = useState("");

  const [previewStudentId, setPreviewStudentId] = useState("");
  const [previewAmount, setPreviewAmount] = useState("");
  const [previewFeeType, setPreviewFeeType] = useState("");
  const [previewAcademicYear, setPreviewAcademicYear] = useState("");
  const [concessionPreview, setConcessionPreview] = useState(null);
  const [concessionPreviewLoading, setConcessionPreviewLoading] = useState(false);
  const [recalculating, setRecalculating] = useState(false);

  const [searchText, setSearchText] = useState("");
  const [feeTypeFilter, setFeeTypeFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [academicYearFilter, setAcademicYearFilter] = useState("");
  const [classFilter, setClassFilter] = useState("");
  const [sectionFilter, setSectionFilter] = useState("");

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!message) return undefined;

    const timeoutId = window.setTimeout(() => {
      setMessage("");
    }, 2000);

    return () => window.clearTimeout(timeoutId);
  }, [message]);

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

  async function loadAcademicYears() {
    try {
      const response = await API.get("/academic-years/");
      setAcademicYears(response.data || []);
    } catch (error) {
      console.error(error);
    }
  }

  async function loadClassOptionsMaster() {
    try {
      const values = await getMasterValues("Class");
      setClassOptionsMaster(values || []);
    } catch (error) {
      console.error(error);
    }
  }

  async function loadFeeStructures() {
    try {
      const response = await API.get("/fee-structures/");
      setFeeStructures(response.data || []);
    } catch (error) {
      console.error(error);
    }
  }

  async function loadGenerationRuns() {
    try {
      setGenerationRunsLoading(true);
      const response = await API.get("/fee-structures/generation-runs");
      setGenerationRuns(response.data || []);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load auto-generation history."));
    } finally {
      setGenerationRunsLoading(false);
    }
  }

  function openGenerationHistory() {
    setShowGenerationHistory(true);
    loadGenerationRuns();
  }

  async function loadReminderRules() {
    try {
      setReminderRulesLoading(true);
      const response = await API.get("/fee-reminders/rules");
      setReminderRules(response.data || []);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load fee reminder rules."));
    } finally {
      setReminderRulesLoading(false);
    }
  }

  async function loadCommunicationTemplates() {
    try {
      const response = await API.get("/communications/templates/");
      setCommunicationTemplates(response.data || []);
    } catch (error) {
      console.error(error);
    }
  }

  async function loadReminderHistory() {
    try {
      setReminderHistoryLoading(true);
      const response = await API.get("/fee-reminders/history", {
        params: { status: reminderHistoryStatusFilter || undefined, limit: 200 },
      });
      setReminderHistory(response.data || []);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load reminder history."));
    } finally {
      setReminderHistoryLoading(false);
    }
  }

  async function loadConcessionSchemes() {
    try {
      setConcessionSchemesLoading(true);
      const response = await API.get("/concessions/schemes");
      setConcessionSchemes(response.data || []);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load concession schemes."));
    } finally {
      setConcessionSchemesLoading(false);
    }
  }

  async function loadConcessionGrants() {
    try {
      setConcessionGrantsLoading(true);
      const response = await API.get("/concessions/grants", {
        params: { status: grantStatusFilter || undefined },
      });
      setConcessionGrants(response.data || []);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load concession grants."));
    } finally {
      setConcessionGrantsLoading(false);
    }
  }

  async function loadPageData() {
    try {
      setLoading(true);
      setMessage("");

      await Promise.all([
        loadFees(),
        loadStudents(),
        loadFeeTypes(),
        loadAcademicYears(),
        loadClassOptionsMaster(),
        loadFeeStructures(),
      ]);
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

  useEffect(() => {
    if (pageMode !== "reminders" || !feeRemindersEnabled) return;
    loadReminderRules();
    loadCommunicationTemplates();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageMode, feeRemindersEnabled]);

  useEffect(() => {
    if (pageMode !== "reminders" || !feeRemindersEnabled || reminderView !== "history") return;
    loadReminderHistory();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageMode, feeRemindersEnabled, reminderView, reminderHistoryStatusFilter]);

  useEffect(() => {
    if (pageMode !== "concessions") return;
    loadConcessionSchemes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageMode]);

  useEffect(() => {
    if (pageMode !== "concessions" || concessionView !== "grants") return;
    loadConcessionGrants();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageMode, concessionView, grantStatusFilter]);

  const studentMap = useMemo(() => {
    const map = {};

    students.forEach((student) => {
      map[student.id] = student;
    });

    return map;
  }, [students]);

  function getStudentName(studentId) {
    if (!studentId) return "-";
    const student = studentMap[studentId];

    if (!student) return `Student ID: ${studentId}`;

    const name =
      student.name ||
      student.student_name ||
      `${student.first_name || ""} ${student.last_name || ""}`.trim() ||
      `Student ID: ${student.id}`;

    return student.admission_no ? `${student.admission_no} - ${name}` : name;
  }

  function getClassLabel(fee) {
    const student = studentMap[fee.student_id];
    const className = fee.class_name_snapshot || student?.class_name || "";
    const section = fee.section_snapshot || student?.section || "";

    if (className && section) return `${className} - Section ${section}`;
    if (className) return className;
    if (fee.class_id || student?.class_id) {
      return `Class ID: ${fee.class_id || student.class_id}`;
    }

    return "-";
  }

  const academicYearOptions = useMemo(() => {
    return Array.from(new Set(fees.map((fee) => fee.academic_year).filter(Boolean)));
  }, [fees]);

  const classFilterOptions = useMemo(
    () => uniqueSorted(students.map((student) => student.class_name)),
    [students]
  );

  const sectionFilterOptions = useMemo(() => {
    return uniqueSorted(
      students
        .filter((student) => !classFilter || student.class_name === classFilter)
        .map((student) => student.section)
    );
  }, [students, classFilter]);

  const formClassOptions = classFilterOptions;

  const formSectionOptions = useMemo(() => {
    return uniqueSorted(
      students
        .filter((student) => !formData.class_name || student.class_name === formData.class_name)
        .map((student) => student.section)
    );
  }, [students, formData.class_name]);

  const classGroupCounts = useMemo(() => {
    const matching = students.filter(
      (student) =>
        student.class_name === formData.class_name &&
        (!formData.section || student.section === formData.section)
    );

    return {
      total: matching.length,
      hosteller: matching.filter((student) => student.residential_type === "Hosteller").length,
      dayScholar: matching.filter((student) => student.residential_type === "Day Scholar").length,
    };
  }, [students, formData.class_name, formData.section]);

  useEffect(() => {
    if (editingId) return undefined;
    if (!formData.fee_type || !formData.academic_year) {
      setStructureLookupMessage("");
      setStructureFound(false);
      setClassStructureLookup(null);
      return undefined;
    }

    let cancelled = false;

    if (feeMode === "class") {
      if (!formData.class_name) {
        setStructureLookupMessage("");
        setStructureFound(false);
        setClassStructureLookup(null);
        return undefined;
      }

      API.get("/fee-structures/lookup-class", {
        params: {
          academic_year: formData.academic_year,
          fee_type: formData.fee_type,
          class_name: formData.class_name,
        },
      })
        .then((response) => {
          if (cancelled) return;
          const data = response.data;
          setClassStructureLookup(data);
          setStructureFound(true);
          setStructureLookupMessage("");
          setFormData((prev) => ({
            ...prev,
            total_amount: data.mode === "single" ? String(data.amount) : "",
            due_date: data.mode === "single" ? normalizeDateInput(data.due_date) : "",
          }));
        })
        .catch((error) => {
          if (cancelled) return;
          setClassStructureLookup(null);
          setStructureFound(false);
          if (error.response?.status === 404) {
            setStructureLookupMessage(
              `No fee structure configured yet for ${formData.fee_type} / Class ${formData.class_name} in ${formData.academic_year}. Enter the amount manually, or add one under "Fee Structure".`
            );
          }
        });

      return () => {
        cancelled = true;
      };
    }

    const student = studentMap[formData.student_id];

    API.get("/fee-structures/lookup", {
      params: {
        academic_year: formData.academic_year,
        fee_type: formData.fee_type,
        class_name: student?.class_name || undefined,
        residential_type: student?.residential_type || undefined,
      },
    })
      .then((response) => {
        if (cancelled) return;
        const structure = response.data;
        setClassStructureLookup(null);
        setFormData((prev) => ({
          ...prev,
          total_amount: String(structure.amount),
          due_date: structure.due_date || "",
        }));
        setStructureFound(true);
        setStructureLookupMessage("");
      })
      .catch((error) => {
        if (cancelled) return;
        setStructureFound(false);
        setClassStructureLookup(null);
        if (error.response?.status === 404) {
          setStructureLookupMessage(
            `No fee structure configured yet for ${formData.fee_type}${
              student?.class_name ? ` / Class ${student.class_name}` : ""
            }${
              student?.residential_type ? ` / ${student.residential_type}` : ""
            } in ${formData.academic_year}. Enter the amount manually, or add one under "Fee Structure".`
          );
        }
      });

    return () => {
      cancelled = true;
    };
  }, [
    formData.fee_type,
    formData.academic_year,
    formData.student_id,
    formData.class_name,
    feeMode,
    editingId,
    studentMap,
  ]);

  const structureLookupFields = [
    "fee_type",
    "academic_year",
    "student_id",
    "class_name",
    "section",
  ];

  function handleInputChange(e) {
    const { name, value } = e.target;

    if (structureLookupFields.includes(name)) {
      setStructureFound(false);
      setStructureLookupMessage("");
    }

    setFormData((prev) => {
      const updated = {
        ...prev,
        [name]: value,
      };

      if (name === "class_name") {
        updated.section = "";
      }

      if (structureLookupFields.includes(name) && !editingId) {
        updated.total_amount = "";
        updated.due_date = "";
      }

      if (
        name === "total_amount" ||
        name === "paid_amount"
      ) {
        updated.payment_status = calculateFeeStatus(updated.total_amount, updated.paid_amount);
      }

      return updated;
    });
  }

  function handleFeeModeChange(nextMode) {
    if (nextMode === feeMode || editingId) return;
    setFeeMode(nextMode);
    setStructureFound(false);
    setStructureLookupMessage("");
    setClassStructureLookup(null);
    setFormData((prev) => ({
      ...prev,
      student_id: "",
      class_name: "",
      section: "",
      total_amount: "",
      due_date: "",
    }));
  }

  function buildPayload() {
    const totalAmount =
      formData.total_amount !== "" ? Number(formData.total_amount) : 0;

    const paidAmount =
      formData.paid_amount !== "" ? Number(formData.paid_amount) : 0;

    if (feeMode === "class") {
      return {
        class_name: formData.class_name || "",
        section: formData.section || null,
        fee_type: formData.fee_type || "",
        academic_year: formData.academic_year || null,
        total_amount: formData.total_amount !== "" ? totalAmount : null,
        paid_amount: paidAmount,
        payment_date: formData.payment_date || null,
        due_date: formData.due_date || null,
        remarks: formData.remarks || null,
      };
    }

    return {
      student_id: formData.student_id ? Number(formData.student_id) : null,
      fee_type: formData.fee_type || "",
      academic_year: formData.academic_year || null,
      total_amount: totalAmount,
      paid_amount: paidAmount,
      payment_date: formData.payment_date || null,
      due_date: formData.due_date || null,
      receipt_no: formData.receipt_no || null,
      remarks: formData.remarks || null,
    };
  }

  function validatePayload(payload) {
    if (feeMode === "class") {
      if (!payload.class_name) {
        return "Class is required.";
      }
    } else if (!payload.student_id) {
      return "Student is required.";
    }

    if (!payload.fee_type) {
      return "Fee Type is required.";
    }

    // In Class View, once a Fee Structure resolves the amount(s) — whether a
    // single class-wide amount or split by residential type — the server
    // derives total_amount per student and the manual field is disabled.
    const amountAutoResolved = feeMode === "class" && Boolean(classStructureLookup);

    if (!amountAutoResolved) {
      if (!payload.total_amount || payload.total_amount <= 0) {
        return "Total Amount must be greater than 0.";
      }

      if (payload.paid_amount > payload.total_amount) {
        return "Paid Amount cannot be greater than Total Amount.";
      }
    }

    if (payload.paid_amount < 0) {
      return "Paid Amount cannot be negative.";
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
      } else if (feeMode === "class") {
        const response = await API.post("/fees/bulk-class", payload);
        const count = response.data?.created_count || 0;
        const groups = response.data?.groups || [];
        const groupText =
          groups.length > 1
            ? groups
                .map((g) => `${g.residential_type || "All"}: ${g.student_count} × ${money(g.amount)}`)
                .join(", ")
            : "";
        const scope = `${payload.class_name}${payload.section ? ` - Section ${payload.section}` : ""}`;
        setMessage(
          `Fee added for ${count} student${count === 1 ? "" : "s"} in ${scope}${
            groupText ? ` (${groupText})` : ""
          }.`
        );
      } else {
        await API.post("/fees/", payload);
        setMessage("Fee added successfully.");
      }

      setFormData(emptyFeeForm);
      setEditingId(null);
      setFeeMode("student");
      setPageMode("list");
      await loadFees();
    } catch (error) {
      console.error(error);
      setMessage(
        getApiErrorMessage(error, "Something went wrong while saving fee.")
      );
    }
  }

  function handleEdit(fee) {
    const totalAmount = getFeeAmount(fee);
    const paidAmount = getPaidAmount(fee);
    const status = calculateFeeStatus(totalAmount, paidAmount);

    if (status === "Paid") {
      setMessage("Fully paid fees cannot be edited.");
      return;
    }

    setEditingId(fee.id);
    setPageMode("form");
    setFeeMode("student");
    setStructureFound(false);
    setStructureLookupMessage("");
    setClassStructureLookup(null);

    setFormData({
      student_id: fee.student_id || "",
      class_name: "",
      section: "",
      fee_type: fee.fee_type || "",
      academic_year: fee.academic_year || "",
      total_amount: totalAmount || "",
      paid_amount: paidAmount || "",
      payment_date: getTodayDateString(),
      due_date: normalizeDateInput(fee.due_date),
      receipt_no: fee.receipt_no || "",
      remarks: fee.remarks || "",
    });

    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function downloadReceipt(fee) {
    try {
      const response = await API.get(`/fees/${fee.id}/receipt`, {
        responseType: "blob",
      });
      const url = window.URL.createObjectURL(
        new Blob([response.data], { type: "application/pdf" })
      );
      const link = document.createElement("a");
      link.href = url;
      link.download = `receipt_${fee.receipt_no || fee.id}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to download receipt."));
    }
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
    setFeeMode("student");
    setMessage("");
    setStructureLookupMessage("");
    setStructureFound(false);
    setClassStructureLookup(null);
    setPageMode("list");
  }

  function handleAddFee() {
    setEditingId(null);
    setFeeMode("student");
    setFormData({
      ...emptyFeeForm,
      academic_year: resolveDefaultAcademicYear(academicYears),
      payment_date: getTodayDateString(),
    });
    setMessage("");
    setStructureFound(false);
    setClassStructureLookup(null);
    setPageMode("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleStructureFormChange(e) {
    const { name, value, type, checked } = e.target;

    setStructureForm((prev) => {
      const updated = { ...prev, [name]: type === "checkbox" ? checked : value };

      if (name === "auto_generate" && !checked) {
        updated.recurrence = "";
        updated.next_run_date = "";
      }

      return updated;
    });
  }

  function handleAddStructure() {
    setEditingStructureId(null);
    setStructureForm(emptyStructureForm);
    setMessage("");
    setPageMode("structure");
  }

  function handleEditStructure(structure) {
    setEditingStructureId(structure.id);
    setStructureForm({
      academic_year: structure.academic_year || "",
      class_name: structure.class_name || "",
      residential_type: structure.residential_type || "",
      fee_type: structure.fee_type || "",
      amount: structure.amount ?? "",
      due_date: normalizeDateInput(structure.due_date),
      remarks: structure.remarks || "",
      auto_generate: Boolean(structure.auto_generate),
      recurrence: structure.recurrence || "",
      next_run_date: normalizeDateInput(structure.next_run_date),
    });
    setPageMode("structure");
  }

  async function handleStructureSubmit(e) {
    e.preventDefault();
    setMessage("");

    if (!structureForm.academic_year || !structureForm.fee_type || !structureForm.amount) {
      setMessage("Academic Year, Fee Type and Amount are required.");
      return;
    }

    if (structureForm.auto_generate) {
      if (!structureForm.recurrence) {
        setMessage("Choose how often the auto-generated fee should repeat.");
        return;
      }

      if (!structureForm.next_run_date) {
        setMessage("Set the next generation date.");
        return;
      }

      const day = Number(structureForm.next_run_date.split("-")[2]);
      if (day > MAX_SCHEDULE_DAY) {
        setMessage(`Next Generation Date's day-of-month must be ${MAX_SCHEDULE_DAY} or earlier.`);
        return;
      }
    }

    const payload = {
      academic_year: structureForm.academic_year,
      class_name: structureForm.class_name || null,
      residential_type: structureForm.residential_type || null,
      fee_type: structureForm.fee_type,
      amount: Number(structureForm.amount),
      due_date: structureForm.due_date || null,
      remarks: structureForm.remarks || null,
      auto_generate: structureForm.auto_generate,
      recurrence: structureForm.auto_generate ? structureForm.recurrence : null,
      next_run_date: structureForm.auto_generate ? structureForm.next_run_date : null,
    };

    try {
      if (editingStructureId) {
        await API.put(`/fee-structures/${editingStructureId}`, payload);
        setMessage("Fee structure updated successfully.");
      } else {
        await API.post("/fee-structures/", payload);
        setMessage("Fee structure added successfully.");
      }
      setStructureForm(emptyStructureForm);
      setEditingStructureId(null);
      await loadFeeStructures();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to save fee structure."));
    }
  }

  async function handleDeleteStructure(structureId) {
    const confirmDelete = window.confirm(
      "Are you sure you want to delete this fee structure entry?"
    );
    if (!confirmDelete) return;

    try {
      await API.delete(`/fee-structures/${structureId}`);
      setMessage("Fee structure deleted successfully.");
      await loadFeeStructures();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to delete fee structure."));
    }
  }

  function handleReminderFormChange(e) {
    const { name, value, type, checked } = e.target;
    setReminderForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  }

  function handleEditReminderRule(rule) {
    setEditingReminderRuleId(rule.id);
    setReminderForm({
      name: rule.name || "",
      offset_days: String(rule.offset_days ?? 0),
      channel: rule.channel || "Email",
      template_id: rule.template_id ? String(rule.template_id) : "",
      min_due_amount: String(rule.min_due_amount ?? 0),
      is_active: rule.is_active !== false,
      remarks: rule.remarks || "",
    });
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleCancelReminderForm() {
    setEditingReminderRuleId(null);
    setReminderForm(emptyReminderForm);
    setMessage("");
  }

  async function handleReminderRuleSubmit(e) {
    e.preventDefault();
    setMessage("");

    if (!reminderForm.name.trim()) {
      setMessage("A rule name is required.");
      return;
    }

    const payload = {
      name: reminderForm.name.trim(),
      offset_days: Number(reminderForm.offset_days || 0),
      channel: reminderForm.channel,
      template_id: reminderForm.template_id ? Number(reminderForm.template_id) : null,
      min_due_amount: Number(reminderForm.min_due_amount || 0),
      is_active: reminderForm.is_active,
      remarks: reminderForm.remarks || null,
    };

    try {
      if (editingReminderRuleId) {
        await API.put(`/fee-reminders/rules/${editingReminderRuleId}`, payload);
        setMessage("Reminder rule updated.");
      } else {
        await API.post("/fee-reminders/rules", payload);
        setMessage("Reminder rule added.");
      }
      handleCancelReminderForm();
      await loadReminderRules();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to save reminder rule."));
    }
  }

  async function handleDeleteReminderRule(rule) {
    const confirmDelete = window.confirm(`Delete the reminder rule "${rule.name}"?`);
    if (!confirmDelete) return;

    try {
      await API.delete(`/fee-reminders/rules/${rule.id}`);
      setMessage("Reminder rule deleted.");
      await loadReminderRules();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to delete reminder rule."));
    }
  }

  async function runReminderPreview() {
    try {
      setReminderPreviewLoading(true);
      setReminderPreview(null);
      setReminderRunResult(null);
      const response = await API.get("/fee-reminders/preview", {
        params: { as_of: reminderPreviewDate || undefined, limit: 200 },
      });
      setReminderPreview(response.data);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to preview reminders."));
    } finally {
      setReminderPreviewLoading(false);
    }
  }

  async function runRemindersNow() {
    const confirmRun = window.confirm(
      "This sends real reminders to parents/guardians right now — it is not a preview. Continue?"
    );
    if (!confirmRun) return;

    try {
      setReminderRunning(true);
      setReminderRunResult(null);
      setReminderPreview(null);
      const response = await API.post("/fee-reminders/run", null, {
        params: { as_of: reminderPreviewDate || undefined },
      });
      setReminderRunResult(response.data);
      setMessage(
        `Reminders sent: ${response.data.sent}, failed: ${response.data.failed}, skipped: ${response.data.skipped}.`
      );
      if (reminderView === "history") await loadReminderHistory();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to run reminders."));
    } finally {
      setReminderRunning(false);
    }
  }

  const templateOptionsForChannel = useMemo(() => {
    return communicationTemplates.filter(
      (tpl) => tpl.status === "Active" && (!reminderForm.channel || tpl.channel === reminderForm.channel)
    );
  }, [communicationTemplates, reminderForm.channel]);

  function handleSchemeFormChange(e) {
    const { name, value, type, checked } = e.target;
    setSchemeForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  }

  function handleEditScheme(scheme) {
    setEditingSchemeId(scheme.id);
    setSchemeForm({
      code: scheme.code || "",
      name: scheme.name || "",
      category: scheme.category || "",
      discount_type: scheme.discount_type || "percent",
      discount_value: String(scheme.discount_value ?? 0),
      applies_to_fee_type: scheme.applies_to_fee_type || "",
      is_active: scheme.is_active !== false,
      remarks: scheme.remarks || "",
    });
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleCancelSchemeForm() {
    setEditingSchemeId(null);
    setSchemeForm(emptySchemeForm);
    setMessage("");
  }

  async function handleSchemeSubmit(e) {
    e.preventDefault();
    setMessage("");

    if (!schemeForm.code.trim() || !schemeForm.name.trim()) {
      setMessage("Code and name are required.");
      return;
    }

    const payload = {
      name: schemeForm.name.trim(),
      category: schemeForm.category || null,
      discount_type: schemeForm.discount_type,
      discount_value: Number(schemeForm.discount_value || 0),
      applies_to_fee_type: schemeForm.applies_to_fee_type || null,
      is_active: schemeForm.is_active,
      remarks: schemeForm.remarks || null,
    };

    try {
      if (editingSchemeId) {
        await API.put(`/concessions/schemes/${editingSchemeId}`, payload);
        setMessage("Scheme updated.");
      } else {
        await API.post("/concessions/schemes", { ...payload, code: schemeForm.code.trim() });
        setMessage("Scheme added.");
      }
      handleCancelSchemeForm();
      await loadConcessionSchemes();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to save scheme."));
    }
  }

  async function handleDeleteScheme(scheme) {
    const confirmDelete = window.confirm(`Delete the concession scheme "${scheme.name}"?`);
    if (!confirmDelete) return;

    try {
      await API.delete(`/concessions/schemes/${scheme.id}`);
      setMessage("Scheme deleted.");
      await loadConcessionSchemes();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to delete scheme."));
    }
  }

  function handleGrantFormChange(e) {
    const { name, value } = e.target;
    setGrantForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleCancelGrantForm() {
    setGrantForm(emptyGrantForm);
    setMessage("");
  }

  async function handleGrantSubmit(e) {
    e.preventDefault();
    setMessage("");

    if (!grantForm.student_id || !grantForm.scheme_id) {
      setMessage("Student and Scheme are required.");
      return;
    }

    const payload = {
      student_id: Number(grantForm.student_id),
      scheme_id: Number(grantForm.scheme_id),
      academic_year: grantForm.academic_year || null,
      discount_type: grantForm.discount_type || null,
      discount_value: grantForm.discount_value !== "" ? Number(grantForm.discount_value) : null,
      reason: grantForm.reason || null,
      valid_from: grantForm.valid_from || null,
      valid_to: grantForm.valid_to || null,
    };

    try {
      await API.post("/concessions/grants", payload);
      setMessage("Concession requested — awaiting approval.");
      handleCancelGrantForm();
      await loadConcessionGrants();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to request concession."));
    }
  }

  async function decideGrant(grant, action) {
    const verb = action === "approve" ? "approve" : action === "reject" ? "reject" : "revoke";
    const confirmDecide = window.confirm(
      `${verb.charAt(0).toUpperCase()}${verb.slice(1)} the concession for ${getStudentName(grant.student_id)} (${grant.scheme_name})?`
    );
    if (!confirmDecide) return;

    const note = window.prompt("Decision note (optional):") || undefined;

    try {
      const response = await API.post(`/concessions/grants/${grant.id}/${action}`, { note });
      const updatedCount = response.data?.fees_updated?.length || 0;
      setMessage(
        updatedCount
          ? `Grant ${verb}d — ${updatedCount} unpaid fee(s) recalculated.`
          : `Grant ${verb}d.`
      );
      await loadConcessionGrants();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, `Unable to ${verb} grant.`));
    }
  }

  async function runConcessionPreview() {
    if (!previewStudentId || !previewAmount) {
      setMessage("Select a student and enter an amount to preview.");
      return;
    }

    try {
      setConcessionPreviewLoading(true);
      setConcessionPreview(null);
      const response = await API.get("/concessions/preview", {
        params: {
          student_id: Number(previewStudentId),
          amount: Number(previewAmount),
          fee_type: previewFeeType || undefined,
          academic_year: previewAcademicYear || undefined,
        },
      });
      setConcessionPreview(response.data);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to preview concession."));
    } finally {
      setConcessionPreviewLoading(false);
    }
  }

  async function runRecalculateAll() {
    const confirmRecalc = window.confirm(
      previewStudentId
        ? `Recalculate concessions on every unpaid fee for ${getStudentName(previewStudentId)}?`
        : "Recalculate concessions on every unpaid fee, for every student? This can affect a lot of records."
    );
    if (!confirmRecalc) return;

    try {
      setRecalculating(true);
      const response = await API.post("/concessions/recalculate", null, {
        params: { student_id: previewStudentId ? Number(previewStudentId) : undefined },
      });
      setMessage(
        `Recalculated: ${response.data.changed} fee(s) changed, ${response.data.skipped} skipped` +
        (response.data.part_paid_skipped?.length
          ? ` (${response.data.part_paid_skipped.length} already part-paid).`
          : ".")
      );
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to recalculate concessions."));
    } finally {
      setRecalculating(false);
    }
  }

  const activeConcessionSchemes = useMemo(
    () => concessionSchemes.filter((s) => s.is_active),
    [concessionSchemes]
  );

  // Auto-generate metadata (last_generated_at) isn't part of the editable
  // form state — read it straight from the loaded list when editing.
  const editingStructure = editingStructureId
    ? feeStructures.find((structure) => structure.id === editingStructureId)
    : null;

  const filteredFees = fees.filter((fee) => {
    const studentName = getStudentName(fee.student_id);

    const searchableText = `
      ${studentName}
      ${fee.fee_type}
      ${getFeeAmount(fee)}
      ${getPaidAmount(fee)}
      ${getBalanceAmount(fee)}
      ${fee.academic_year}
      ${getClassLabel(fee)}
      ${fee.payment_date}
      ${fee.due_date}
      ${fee.payment_status}
      ${fee.receipt_no}
      ${fee.remarks}
    `.toLowerCase();

    const student = studentMap[fee.student_id];
    const feeClassName = fee.class_name_snapshot || student?.class_name || "";
    const feeSection = fee.section_snapshot || student?.section || "";

    const matchSearch = searchableText.includes(searchText.toLowerCase());
    const matchFeeType = feeTypeFilter ? fee.fee_type === feeTypeFilter : true;
    const matchStatus = statusFilter ? fee.payment_status === statusFilter : true;
    const matchAcademicYear = academicYearFilter
      ? fee.academic_year === academicYearFilter
      : true;
    const matchClass = classFilter ? feeClassName === classFilter : true;
    const matchSection = sectionFilter ? feeSection === sectionFilter : true;

    return (
      matchSearch &&
      matchFeeType &&
      matchStatus &&
      matchAcademicYear &&
      matchClass &&
      matchSection
    );
  });

  const totalAmount = fees.reduce((sum, fee) => sum + getFeeAmount(fee), 0);
  const paidAmount = fees.reduce((sum, fee) => sum + getPaidAmount(fee), 0);
  const balanceAmount = Math.max(totalAmount - paidAmount, 0);

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Fees Management</p>
          <h2>{t("Fees Management")}</h2>
          <p>Manage total amount, paid amount, balance and payment status.</p>
        </div>

        <div className="module-header-actions">

          <button type="button" className="secondary-button" onClick={handleAddStructure}>
            <Settings2 size={17} />
            Fee Structure
          </button>

          <button type="button" className="secondary-button" onClick={() => setPageMode("reminders")}>
            <Bell size={17} />
            Fee Reminders
          </button>

          <button type="button" className="secondary-button" onClick={() => setPageMode("concessions")}>
            <Percent size={17} />
            Concessions
          </button>

          <button type="button" className="primary-button" onClick={handleAddFee}>
            <PlusCircle size={18} />
            Add Fee
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
            <strong>{money(totalAmount)}</strong>
          </div>
        </div>

        <div className="summary-card">
          <Wallet size={22} />
          <div>
            <span>Paid Amount</span>
            <strong>{money(paidAmount)}</strong>
          </div>
        </div>

        <div className="summary-card warning">
          <Wallet size={22} />
          <div>
            <span>Balance Amount</span>
            <strong>{money(balanceAmount)}</strong>
          </div>
        </div>
      </section>

      {message && <div className="toast-notification">{message}</div>}

      {pageMode === "form" && (
      <section className="form-panel">
        <div className="panel-header">
          <div>
            <div className="panel-header-title-row">
              <h3>{editingId ? "Edit Fee" : "Add Fee"}</h3>
              <Link to="/fees/layout" className="panel-header-link">
                Customize Layout
              </Link>
            </div>
            <p>Fee status is calculated automatically from payment amount.</p>
          </div>

          {!editingId && (
            <div className="fee-mode-toggle" data-active={feeMode}>
              <button
                type="button"
                className={feeMode === "student" ? "active" : ""}
                onClick={() => handleFeeModeChange("student")}
              >
                Student View
              </button>
              <button
                type="button"
                className={feeMode === "class" ? "active" : ""}
                onClick={() => handleFeeModeChange("class")}
              >
                Class View
              </button>
            </div>
          )}
        </div>

        <form className="classic-form" onSubmit={handleSubmit}>
          <div className="sis-section-title">Fee Information</div>

          <div className="form-grid">
            {feeMode === "class" ? (
              <>
                <div className="form-field">
                  <label>Class *</label>
                  <select
                    name="class_name"
                    value={formData.class_name}
                    onChange={handleInputChange}
                    required
                  >
                    <option value="">Select Class</option>
                    {formClassOptions.map((className) => (
                      <option key={className} value={className}>
                        {className}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-field">
                  <label>Section</label>
                  <select
                    name="section"
                    value={formData.section}
                    onChange={handleInputChange}
                  >
                    <option value="">All Sections</option>
                    {formSectionOptions.map((section) => (
                      <option key={section} value={section}>
                        {section}
                      </option>
                    ))}
                  </select>
                  {formData.class_name && (
                    <small>
                      Fee will be added for {classGroupCounts.total} student
                      {classGroupCounts.total === 1 ? "" : "s"} in this class/section.
                    </small>
                  )}
                </div>
              </>
            ) : (
              <StudentPicker
                students={students}
                value={formData.student_id}
                onChange={handleInputChange}
                disabled={Boolean(editingId)}
              />
            )}

            <div className="form-field">
              <label>Fee Type *</label>
              <select
                name="fee_type"
                value={formData.fee_type}
                onChange={handleInputChange}
                required
                disabled={Boolean(editingId)}
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
              <label>Academic Year</label>
              <select
                name="academic_year"
                value={formData.academic_year}
                onChange={handleInputChange}
                disabled={Boolean(formData.academic_year) || Boolean(editingId)}
              >
                <option value="">Select academic year</option>
                {academicYears.map((year) => (
                  <option key={year.id} value={year.name}>
                    {year.name}
                  </option>
                ))}
              </select>
              <small>
                {formData.academic_year
                  ? "Set automatically to the current academic year."
                  : "No academic year is marked current — set one under Academic Years, or select one here."}
              </small>
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
                placeholder={
                  feeMode === "class" && classStructureLookup?.mode === "split"
                    ? "Auto-calculated per residential type"
                    : undefined
                }
                disabled={structureFound || Boolean(editingId)}
              />
              <small>
                {editingId
                  ? "Locked while editing — only Payment Amount can be updated."
                  : feeMode === "class" && classStructureLookup?.mode === "split"
                  ? `This fee differs by residential type — Hosteller: ${money(
                      classStructureLookup.hosteller_amount || 0
                    )} (${classGroupCounts.hosteller} student${classGroupCounts.hosteller === 1 ? "" : "s"}), Day Scholar: ${money(
                      classStructureLookup.day_scholar_amount || 0
                    )} (${classGroupCounts.dayScholar} student${classGroupCounts.dayScholar === 1 ? "" : "s"}). Both are billed automatically.`
                  : feeMode === "class" && classStructureLookup?.mode === "single"
                  ? `Auto-filled from Fee Structure for all ${classGroupCounts.total} students in this class/section.`
                  : structureLookupMessage ||
                    "Auto-filled from Fee Structure once Fee Type and Academic Year are set."}
                {" "}
                <button
                  type="button"
                  className="link-button"
                  onClick={() => setPageMode("structure")}
                  style={{ padding: 0, border: "none", background: "none", color: "var(--saas-primary)", textDecoration: "underline", cursor: "pointer", font: "inherit" }}
                >
                  Manage Fee Structures
                </button>
              </small>
            </div>

            <div className="form-field">
              <label>Due Date</label>
              <input
                type="date"
                name="due_date"
                value={formData.due_date}
                onChange={handleInputChange}
                disabled={structureFound || Boolean(editingId)}
              />
              <small>
                {feeMode === "class" && classStructureLookup?.mode === "split"
                  ? "Due dates are auto-applied per residential type from Fee Structure."
                  : "Auto-filled from Fee Structure when configured."}
              </small>
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
              <label>Payment Date</label>
              <input
                type="date"
                name="payment_date"
                value={formData.payment_date}
                onChange={handleInputChange}
                disabled={Boolean(editingId)}
              />
              {editingId && (
                <small>Automatically set to today's date.</small>
              )}
            </div>

            <div className="form-field">
              <label>Balance Amount</label>
              <input
                type="text"
                value={money(
                  Math.max(
                    Number(formData.total_amount || 0) -
                      Number(formData.paid_amount || 0),
                    0
                  )
                )}
                disabled
              />
            </div>

            {feeMode !== "class" && (
              <div className="form-field">
                <label>Receipt No</label>
                <input
                  type="text"
                  name="receipt_no"
                  value={formData.receipt_no}
                  onChange={handleInputChange}
                  placeholder="Auto generated when paid"
                  disabled={Boolean(editingId)}
                />
              </div>
            )}

            <div className="form-field full-width">
              <label>Remarks</label>
              <textarea
                name="remarks"
                rows="3"
                value={formData.remarks}
                onChange={handleInputChange}
                disabled={Boolean(editingId)}
              ></textarea>
            </div>
          </div>

          <div className="form-actions">
            <button type="submit" className="primary-button">
              <PlusCircle size={18} />
              {editingId ? "Update Fee" : feeMode === "class" ? "Add Fee for Class" : "Add Fee"}
            </button>

            <button
              type="button"
              className="light-button"
              onClick={handleCancelEdit}
            >
              Cancel
            </button>
          </div>
        </form>
      </section>
      )}

      {pageMode === "structure" && (
        <>
          <section className="form-panel">
            <div className="panel-header">
              <div>
                <h3>{editingStructureId ? "Edit Fee Structure" : "Add Fee Structure"}</h3>
                <p>
                  Define the amount and due date per academic year, class, and fee type.
                  Leave Class as "All Classes" for fee types that don't vary by grade
                  (e.g. Transport, Library). Leave Residential Type as "Both" unless
                  Day Scholars and Hostellers pay different amounts (e.g. Tuition Fee
                  is usually higher for boarders) &mdash; a specific match always wins
                  over a "Both"/"All Classes" entry.
                </p>
              </div>
            </div>

            <form className="classic-form" onSubmit={handleStructureSubmit}>
              <div className="form-grid">
                <div className="form-field">
                  <label>Academic Year *</label>
                  <select
                    name="academic_year"
                    value={structureForm.academic_year}
                    onChange={handleStructureFormChange}
                    required
                  >
                    <option value="">Select academic year</option>
                    {academicYears.map((year) => (
                      <option key={year.id} value={year.name}>{year.name}</option>
                    ))}
                  </select>
                </div>

                <div className="form-field">
                  <label>Class</label>
                  <select
                    name="class_name"
                    value={structureForm.class_name}
                    onChange={handleStructureFormChange}
                  >
                    <option value="">All Classes</option>
                    {classOptionsMaster.map((className) => (
                      <option key={className} value={className}>{className}</option>
                    ))}
                  </select>
                </div>

                <div className="form-field">
                  <label>Residential Type</label>
                  <select
                    name="residential_type"
                    value={structureForm.residential_type}
                    onChange={handleStructureFormChange}
                  >
                    <option value="">Both (Day Scholar &amp; Hosteller)</option>
                    {residentialTypeOptions.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </div>

                <div className="form-field">
                  <label>Fee Type *</label>
                  <select
                    name="fee_type"
                    value={structureForm.fee_type}
                    onChange={handleStructureFormChange}
                    required
                  >
                    <option value="">Select Fee Type</option>
                    {feeTypes.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </div>

                <div className="form-field">
                  <label>Amount *</label>
                  <input
                    type="number"
                    name="amount"
                    value={structureForm.amount}
                    onChange={handleStructureFormChange}
                    min="0"
                    step="0.01"
                    required
                  />
                </div>

                <div className="form-field">
                  <label>Due Date</label>
                  <input
                    type="date"
                    name="due_date"
                    value={structureForm.due_date}
                    onChange={handleStructureFormChange}
                  />
                </div>
              </div>

              <div className="sis-section-title">Automatic Generation</div>

              <div className="form-grid">
                <div className="form-field">
                  <label>Auto-generate on a schedule</label>
                  <label
                    className="switch-row"
                    title={
                      feeAutoGenEnabled
                        ? undefined
                        : "The platform owner hasn't enabled automatic fee generation for this school yet."
                    }
                  >
                    <input
                      type="checkbox"
                      name="auto_generate"
                      checked={structureForm.auto_generate}
                      disabled={!feeAutoGenEnabled}
                      onChange={handleStructureFormChange}
                    />
                    <span>{structureForm.auto_generate ? "On" : "Off"}</span>
                  </label>
                  <small>
                    {feeAutoGenEnabled ? (
                      <>
                        When on, this fee is billed automatically to every matching
                        student — no one needs to run "Add Fee for Class" by hand.
                      </>
                    ) : (
                      "Disabled by platform owner — ask them to enable automatic fee generation for this school first."
                    )}
                  </small>
                </div>

                {structureForm.auto_generate && (
                  <>
                    <div className="form-field">
                      <label>Repeats *</label>
                      <select
                        name="recurrence"
                        value={structureForm.recurrence}
                        onChange={handleStructureFormChange}
                        required
                      >
                        <option value="">Select frequency</option>
                        {recurrenceOptions.map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                      <small>
                        "One-time" fires once on the date below, then turns
                        itself back off.
                      </small>
                    </div>

                    <div className="form-field">
                      <label>Next Generation Date *</label>
                      <input
                        type="date"
                        name="next_run_date"
                        value={structureForm.next_run_date}
                        onChange={handleStructureFormChange}
                        required
                      />
                      <small>
                        Day-of-month must be {MAX_SCHEDULE_DAY} or earlier, so
                        every month lines up.
                      </small>
                    </div>

                    {editingStructure?.last_generated_at && (
                      <div className="form-field">
                        <label>Last Generated</label>
                        <input type="text" value={formatDateTime(editingStructure.last_generated_at)} disabled />
                      </div>
                    )}
                  </>
                )}
              </div>

              <div className="form-grid">
                <div className="form-field full-width">
                  <label>Remarks</label>
                  <textarea
                    name="remarks"
                    rows="2"
                    value={structureForm.remarks}
                    onChange={handleStructureFormChange}
                  ></textarea>
                </div>
              </div>

              <div className="form-actions">
                <button type="submit" className="primary-button">
                  <PlusCircle size={18} />
                  {editingStructureId ? "Update Structure" : "Add Structure"}
                </button>

                <button
                  type="button"
                  className="light-button"
                  onClick={() => {
                    setEditingStructureId(null);
                    setStructureForm(emptyStructureForm);
                    setPageMode("list");
                  }}
                >
                  <ArrowLeft size={17} />
                  Back
                </button>
              </div>
            </form>
          </section>

          <section className="table-panel">
            <div className="panel-header">
              <div>
                <h3>Configured Fee Structures ({feeStructures.length})</h3>
              </div>

              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  type="button"
                  className="secondary-button"
                  onClick={() => setShowBulkImport(true)}
                >
                  <Upload size={17} />
                  Import CSV
                </button>
                <button type="button" className="secondary-button" onClick={openGenerationHistory}>
                  <History size={17} />
                  Auto-Generation History
                </button>
              </div>
            </div>

            {showBulkImport && (
              <BulkImportModal
                title="Bulk Import Fee Structures"
                description="Upload a CSV file to create multiple fee structures at once. Auto-generation stays off for imported rows — turn it on per structure afterward."
                templateUrl="/fee-structures/bulk-import-template"
                templateFilename="fee_structures_import_template.csv"
                importUrl="/fee-structures/bulk-import"
                onClose={() => setShowBulkImport(false)}
                onImported={loadFeeStructures}
              />
            )}

            <div className="table-wrapper">
              <table className="classic-table">
                <thead>
                  <tr>
                    <th>Academic Year</th>
                    <th>Class</th>
                    <th>Residential Type</th>
                    <th>Fee Type</th>
                    <th>Amount</th>
                    <th>Due Date</th>
                    <th>Schedule</th>
                    <th>Remarks</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {feeStructures.map((structure) => (
                    <tr key={structure.id}>
                      <td>{structure.academic_year}</td>
                      <td>{structure.class_name || "All Classes"}</td>
                      <td>{structure.residential_type || "Both"}</td>
                      <td>{structure.fee_type}</td>
                      <td>{money(Number(structure.amount))}</td>
                      <td>{normalizeDateInput(structure.due_date) || "-"}</td>
                      <td>
                        {structure.auto_generate ? (
                          <div className="schedule-cell">
                            <span className="status active">{recurrenceLabel(structure.recurrence)}</span>
                            <small>Next: {normalizeDateInput(structure.next_run_date) || "-"}</small>
                            {structure.last_generated_at && (
                              <small>Last run: {formatDateTime(structure.last_generated_at)}</small>
                            )}
                          </div>
                        ) : (
                          "Manual"
                        )}
                      </td>
                      <td>{structure.remarks || "-"}</td>
                      <td>
                        <div className="action-buttons">
                          <button
                            type="button"
                            className="edit-button"
                            onClick={() => handleEditStructure(structure)}
                            title="Edit"
                          >
                            <Edit size={15} />
                          </button>
                          <button
                            type="button"
                            className="delete-button"
                            onClick={() => handleDeleteStructure(structure.id)}
                            title="Delete"
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!feeStructures.length && (
                    <tr>
                      <td colSpan={9}>No fee structures configured yet.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {pageMode === "reminders" && (
        <section className="table-panel">
          <div className="panel-header">
            <div>
              <h3>Fee Reminders</h3>
              <p>Automatically chase overdue fees on a schedule you define.</p>
            </div>
            <button type="button" className="light-button" onClick={() => setPageMode("list")}>
              <ArrowLeft size={17} />
              Back
            </button>
          </div>

          {!feeRemindersEnabled ? (
            <div className="empty-state">
              Fee Reminders isn't enabled for your school yet. Ask your platform
              administrator to turn on "Automated Fee Reminders" first.
            </div>
          ) : (
            <>
              <div className="student-profile-tabs">
                <button type="button" className={reminderView === "rules" ? "active" : ""} onClick={() => setReminderView("rules")}>Rules</button>
                <button type="button" className={reminderView === "preview" ? "active" : ""} onClick={() => setReminderView("preview")}>Preview &amp; Run</button>
                <button type="button" className={reminderView === "history" ? "active" : ""} onClick={() => setReminderView("history")}>Sent History</button>
              </div>

              {reminderView === "rules" && (
                <>
                  <form className="classic-form" onSubmit={handleReminderRuleSubmit} style={{ marginTop: 16 }}>
                    <div className="sis-section-title">{editingReminderRuleId ? "Edit Rule" : "Add Reminder Rule"}</div>
                    <div className="form-grid">
                      <div className="form-field">
                        <label>Rule Name *</label>
                        <input type="text" name="name" value={reminderForm.name} onChange={handleReminderFormChange} required />
                      </div>

                      <div className="form-field">
                        <label>Timing (days) *</label>
                        <input type="number" name="offset_days" value={reminderForm.offset_days} onChange={handleReminderFormChange} required />
                        <small>
                          Negative = before the due date, 0 = on the due date, positive = after (overdue).
                          Currently: {offsetDaysLabel(reminderForm.offset_days)}.
                        </small>
                      </div>

                      <div className="form-field">
                        <label>Channel *</label>
                        <select name="channel" value={reminderForm.channel} onChange={handleReminderFormChange} required>
                          {reminderChannelOptions.map((c) => (
                            <option key={c} value={c}>{c}</option>
                          ))}
                        </select>
                      </div>

                      <div className="form-field">
                        <label>Message Template</label>
                        <select name="template_id" value={reminderForm.template_id} onChange={handleReminderFormChange}>
                          <option value="">Default system message</option>
                          {templateOptionsForChannel.map((tpl) => (
                            <option key={tpl.id} value={tpl.id}>{tpl.template_name}</option>
                          ))}
                        </select>
                        <small>Only Active templates for the selected channel are shown.</small>
                      </div>

                      <div className="form-field">
                        <label>Minimum Due Amount</label>
                        <input type="number" name="min_due_amount" min="0" step="0.01" value={reminderForm.min_due_amount} onChange={handleReminderFormChange} />
                        <small>Don't chase balances smaller than this.</small>
                      </div>

                      <div className="form-field">
                        <label>Status</label>
                        <label className="switch-row">
                          <input type="checkbox" name="is_active" checked={reminderForm.is_active} onChange={handleReminderFormChange} />
                          <span>{reminderForm.is_active ? "Active" : "Inactive"}</span>
                        </label>
                      </div>

                      <div className="form-field full-width">
                        <label>Remarks</label>
                        <textarea name="remarks" rows="2" value={reminderForm.remarks} onChange={handleReminderFormChange}></textarea>
                      </div>
                    </div>

                    <div className="form-actions">
                      <button type="submit" className="primary-button">
                        <PlusCircle size={18} />
                        {editingReminderRuleId ? "Update Rule" : "Add Rule"}
                      </button>
                      {editingReminderRuleId && (
                        <button type="button" className="light-button" onClick={handleCancelReminderForm}>
                          Cancel
                        </button>
                      )}
                    </div>
                  </form>

                  <div className="table-wrapper" style={{ marginTop: 20 }}>
                    <table className="classic-table">
                      <thead>
                        <tr>
                          <th>Name</th><th>When</th><th>Channel</th><th>Template</th>
                          <th>Min Due</th><th>Status</th><th>Remarks</th><th>Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reminderRulesLoading && (
                          <tr><td colSpan={8}>Loading...</td></tr>
                        )}
                        {!reminderRulesLoading && reminderRules.map((rule) => (
                          <tr key={rule.id}>
                            <td>{rule.name}</td>
                            <td>{rule.when}</td>
                            <td>{rule.channel}</td>
                            <td>{communicationTemplates.find((t) => t.id === rule.template_id)?.template_name || "Default"}</td>
                            <td>{money(Number(rule.min_due_amount || 0))}</td>
                            <td>
                              <span className={rule.is_active ? "status active" : "status warning"}>
                                {rule.is_active ? "Active" : "Inactive"}
                              </span>
                            </td>
                            <td>{rule.remarks || "-"}</td>
                            <td>
                              <div className="action-buttons">
                                <button type="button" className="edit-button" onClick={() => handleEditReminderRule(rule)} title="Edit">
                                  <Edit size={15} />
                                </button>
                                <button type="button" className="delete-button" onClick={() => handleDeleteReminderRule(rule)} title="Delete">
                                  <Trash2 size={15} />
                                </button>
                              </div>
                            </td>
                          </tr>
                        ))}
                        {!reminderRulesLoading && !reminderRules.length && (
                          <tr><td colSpan={8}>No reminder rules configured yet.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}

              {reminderView === "preview" && (
                <div style={{ marginTop: 16 }}>
                  <div className="filter-row sis-filter-row">
                    <div className="form-field">
                      <label>As Of Date</label>
                      <input
                        type="date"
                        value={reminderPreviewDate}
                        onChange={(e) => setReminderPreviewDate(e.target.value)}
                      />
                    </div>

                    <button type="button" className="secondary-button" onClick={runReminderPreview} disabled={reminderPreviewLoading}>
                      {reminderPreviewLoading ? "Checking..." : "Preview"}
                    </button>

                    {canRunRemindersNow && (
                      <button type="button" className="primary-button" onClick={runRemindersNow} disabled={reminderRunning}>
                        <Send size={17} />
                        {reminderRunning ? "Sending..." : "Run Now (sends real messages)"}
                      </button>
                    )}
                  </div>

                  {(reminderPreview || reminderRunResult) && (() => {
                    const result = reminderRunResult || reminderPreview;
                    return (
                      <>
                        <section className="summary-strip report-summary-grid" style={{ marginTop: 16 }}>
                          <div className="summary-card">
                            <Bell size={20} />
                            <div><span>Rules Considered</span><strong>{result.rules}</strong></div>
                          </div>
                          <div className="summary-card">
                            <Bell size={20} />
                            <div><span>{reminderRunResult ? "Sent" : "Would Send"}</span><strong>{result.sent}</strong></div>
                          </div>
                          <div className="summary-card warning">
                            <Bell size={20} />
                            <div><span>Skipped</span><strong>{result.skipped}</strong></div>
                          </div>
                          <div className="summary-card">
                            <Bell size={20} />
                            <div><span>Failed</span><strong>{result.failed}</strong></div>
                          </div>
                        </section>

                        {result.note && <p className="hint-text">{result.note}</p>}

                        {result.detail && (
                          <div className="table-wrapper" style={{ marginTop: 16 }}>
                            <table className="classic-table">
                              <thead>
                                <tr><th>Student</th><th>Rule</th><th>Timing</th><th>Channel</th><th>Outstanding</th></tr>
                              </thead>
                              <tbody>
                                {result.detail.map((row, i) => (
                                  <tr key={`${row.fee_id}-${i}`}>
                                    <td>{getStudentName(row.student_id)}</td>
                                    <td>{row.rule}</td>
                                    <td>{offsetDaysLabel(row.offset_days)}</td>
                                    <td>{row.channel}</td>
                                    <td>{money(Number(row.outstanding || 0))}</td>
                                  </tr>
                                ))}
                                {!result.detail.length && (
                                  <tr><td colSpan={5}>Nobody would be contacted right now.</td></tr>
                                )}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </>
                    );
                  })()}
                </div>
              )}

              {reminderView === "history" && (
                <div style={{ marginTop: 16 }}>
                  <div className="filter-row sis-filter-row">
                    <div className="form-field">
                      <label>Status</label>
                      <select value={reminderHistoryStatusFilter} onChange={(e) => setReminderHistoryStatusFilter(e.target.value)}>
                        <option value="">All Statuses</option>
                        {reminderStatusOptions.map((s) => (
                          <option key={s} value={s}>{s}</option>
                        ))}
                      </select>
                    </div>

                    <button type="button" className="light-button" onClick={loadReminderHistory}>
                      Refresh
                    </button>
                  </div>

                  <div className="table-wrapper" style={{ marginTop: 12 }}>
                    <table className="classic-table">
                      <thead>
                        <tr>
                          <th>Student</th><th>Rule</th><th>Status</th><th>Recipient</th>
                          <th>Outstanding</th><th>Sent At</th><th>Detail</th>
                        </tr>
                      </thead>
                      <tbody>
                        {reminderHistoryLoading && (
                          <tr><td colSpan={7}>Loading...</td></tr>
                        )}
                        {!reminderHistoryLoading && reminderHistory.map((entry) => (
                          <tr key={entry.id}>
                            <td>{entry.student || getStudentName(entry.student_id)}</td>
                            <td>{reminderRules.find((r) => r.id === entry.rule_id)?.name || `Rule #${entry.rule_id}`}</td>
                            <td>
                              <span className={reminderStatusClass(entry.status)}>{entry.status}</span>
                            </td>
                            <td>{entry.recipient || "-"}</td>
                            <td>{money(Number(entry.outstanding_amount || 0))}</td>
                            <td>{formatDateTime(entry.sent_at)}</td>
                            <td>{entry.error_message || entry.skip_reason || "-"}</td>
                          </tr>
                        ))}
                        {!reminderHistoryLoading && !reminderHistory.length && (
                          <tr><td colSpan={7}>No reminders sent yet.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {pageMode === "concessions" && (
        <section className="table-panel">
          <div className="panel-header">
            <div>
              <h3>Fee Concessions &amp; Scholarships</h3>
              <p>Define what the school offers, and grant it to individual students with approval.</p>
            </div>
            <button type="button" className="light-button" onClick={() => setPageMode("list")}>
              <ArrowLeft size={17} />
              Back
            </button>
          </div>

          <div className="student-profile-tabs">
            <button type="button" className={concessionView === "schemes" ? "active" : ""} onClick={() => setConcessionView("schemes")}>Schemes</button>
            <button type="button" className={concessionView === "grants" ? "active" : ""} onClick={() => setConcessionView("grants")}>Grants</button>
            <button type="button" className={concessionView === "preview" ? "active" : ""} onClick={() => setConcessionView("preview")}>Preview &amp; Recalculate</button>
          </div>

          {concessionView === "schemes" && (
            <>
              <form className="classic-form" onSubmit={handleSchemeSubmit} style={{ marginTop: 16 }}>
                <div className="sis-section-title">{editingSchemeId ? "Edit Scheme" : "Add Concession Scheme"}</div>
                <div className="form-grid">
                  <div className="form-field">
                    <label>Code *</label>
                    <input
                      type="text"
                      name="code"
                      value={schemeForm.code}
                      onChange={handleSchemeFormChange}
                      required
                      disabled={Boolean(editingSchemeId)}
                    />
                    {editingSchemeId && <small>Code cannot be changed after creation.</small>}
                  </div>

                  <div className="form-field">
                    <label>Name *</label>
                    <input type="text" name="name" value={schemeForm.name} onChange={handleSchemeFormChange} required />
                  </div>

                  <div className="form-field">
                    <label>Category</label>
                    <input
                      type="text"
                      name="category"
                      value={schemeForm.category}
                      onChange={handleSchemeFormChange}
                      placeholder="e.g. Sibling, Merit, Staff Ward"
                    />
                  </div>

                  <div className="form-field">
                    <label>Discount Type *</label>
                    <select name="discount_type" value={schemeForm.discount_type} onChange={handleSchemeFormChange} required>
                      <option value="percent">Percentage</option>
                      <option value="fixed">Fixed Amount</option>
                    </select>
                  </div>

                  <div className="form-field">
                    <label>Discount Value *</label>
                    <input
                      type="number"
                      name="discount_value"
                      min="0"
                      step="0.01"
                      max={schemeForm.discount_type === "percent" ? 100 : undefined}
                      value={schemeForm.discount_value}
                      onChange={handleSchemeFormChange}
                      required
                    />
                  </div>

                  <div className="form-field">
                    <label>Applies To Fee Type</label>
                    <select name="applies_to_fee_type" value={schemeForm.applies_to_fee_type} onChange={handleSchemeFormChange}>
                      <option value="">All Fee Types</option>
                      {feeTypes.map((item) => (
                        <option key={item} value={item}>{item}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-field">
                    <label>Status</label>
                    <label className="switch-row">
                      <input type="checkbox" name="is_active" checked={schemeForm.is_active} onChange={handleSchemeFormChange} />
                      <span>{schemeForm.is_active ? "Active" : "Inactive"}</span>
                    </label>
                  </div>

                  <div className="form-field full-width">
                    <label>Remarks</label>
                    <textarea name="remarks" rows="2" value={schemeForm.remarks} onChange={handleSchemeFormChange}></textarea>
                  </div>
                </div>

                <div className="form-actions">
                  <button type="submit" className="primary-button">
                    <PlusCircle size={18} />
                    {editingSchemeId ? "Update Scheme" : "Add Scheme"}
                  </button>
                  {editingSchemeId && (
                    <button type="button" className="light-button" onClick={handleCancelSchemeForm}>
                      Cancel
                    </button>
                  )}
                </div>
              </form>

              <div className="table-wrapper" style={{ marginTop: 20 }}>
                <table className="classic-table">
                  <thead>
                    <tr>
                      <th>Code</th><th>Name</th><th>Category</th><th>Discount</th>
                      <th>Applies To</th><th>Status</th><th>Remarks</th><th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {concessionSchemesLoading && (
                      <tr><td colSpan={8}>Loading...</td></tr>
                    )}
                    {!concessionSchemesLoading && concessionSchemes.map((scheme) => (
                      <tr key={scheme.id}>
                        <td>{scheme.code}</td>
                        <td>{scheme.name}</td>
                        <td>{scheme.category || "-"}</td>
                        <td>{discountLabel(scheme.discount_type, scheme.discount_value, money)}</td>
                        <td>{scheme.applies_to_fee_type || "All"}</td>
                        <td>
                          <span className={scheme.is_active ? "status active" : "status warning"}>
                            {scheme.is_active ? "Active" : "Inactive"}
                          </span>
                        </td>
                        <td>{scheme.remarks || "-"}</td>
                        <td>
                          <div className="action-buttons">
                            <button type="button" className="edit-button" onClick={() => handleEditScheme(scheme)} title="Edit">
                              <Edit size={15} />
                            </button>
                            <button type="button" className="delete-button" onClick={() => handleDeleteScheme(scheme)} title="Delete">
                              <Trash2 size={15} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                    {!concessionSchemesLoading && !concessionSchemes.length && (
                      <tr><td colSpan={8}>No concession schemes configured yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {concessionView === "grants" && (
            <>
              <form className="classic-form" onSubmit={handleGrantSubmit} style={{ marginTop: 16 }}>
                <div className="sis-section-title">Request a Concession</div>
                <div className="form-grid">
                  <StudentPicker students={students} value={grantForm.student_id} onChange={handleGrantFormChange} />

                  <div className="form-field">
                    <label>Scheme *</label>
                    <select name="scheme_id" value={grantForm.scheme_id} onChange={handleGrantFormChange} required>
                      <option value="">Select Scheme</option>
                      {activeConcessionSchemes.map((scheme) => (
                        <option key={scheme.id} value={scheme.id}>
                          {scheme.name} ({discountLabel(scheme.discount_type, scheme.discount_value, money)})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="form-field">
                    <label>Academic Year</label>
                    <select name="academic_year" value={grantForm.academic_year} onChange={handleGrantFormChange}>
                      <option value="">Select academic year</option>
                      {academicYears.map((year) => (
                        <option key={year.id} value={year.name}>{year.name}</option>
                      ))}
                    </select>
                  </div>

                  <div className="form-field">
                    <label>Override Discount Type</label>
                    <select name="discount_type" value={grantForm.discount_type} onChange={handleGrantFormChange}>
                      <option value="">Use scheme default</option>
                      <option value="percent">Percentage</option>
                      <option value="fixed">Fixed Amount</option>
                    </select>
                  </div>

                  <div className="form-field">
                    <label>Override Discount Value</label>
                    <input
                      type="number"
                      name="discount_value"
                      min="0"
                      step="0.01"
                      value={grantForm.discount_value}
                      onChange={handleGrantFormChange}
                      placeholder="Leave blank to use scheme default"
                    />
                  </div>

                  <div className="form-field">
                    <label>Valid From</label>
                    <input type="date" name="valid_from" value={grantForm.valid_from} onChange={handleGrantFormChange} />
                  </div>

                  <div className="form-field">
                    <label>Valid To</label>
                    <input type="date" name="valid_to" value={grantForm.valid_to} onChange={handleGrantFormChange} />
                  </div>

                  <div className="form-field full-width">
                    <label>Reason</label>
                    <textarea name="reason" rows="2" value={grantForm.reason} onChange={handleGrantFormChange}></textarea>
                  </div>
                </div>

                <div className="form-actions">
                  <button type="submit" className="primary-button">
                    <PlusCircle size={18} />
                    Request Concession
                  </button>
                </div>
              </form>

              <div className="filter-row sis-filter-row" style={{ marginTop: 20 }}>
                <div className="form-field">
                  <label>Status</label>
                  <select value={grantStatusFilter} onChange={(e) => setGrantStatusFilter(e.target.value)}>
                    <option value="">All Statuses</option>
                    {grantStatusOptions.map((s) => (
                      <option key={s} value={s}>{s}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="table-wrapper" style={{ marginTop: 12 }}>
                <table className="classic-table">
                  <thead>
                    <tr>
                      <th>Student</th><th>Scheme</th><th>Year</th><th>Discount</th>
                      <th>Status</th><th>Requested</th><th>Decided</th><th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {concessionGrantsLoading && (
                      <tr><td colSpan={8}>Loading...</td></tr>
                    )}
                    {!concessionGrantsLoading && concessionGrants.map((grant) => (
                      <tr key={grant.id}>
                        <td>{getStudentName(grant.student_id)}</td>
                        <td>{grant.scheme_name || `Scheme #${grant.scheme_id}`}</td>
                        <td>{grant.academic_year || "-"}</td>
                        <td>
                          {grant.discount_value != null
                            ? discountLabel(grant.discount_type, grant.discount_value, money)
                            : "Scheme default"}
                        </td>
                        <td>
                          <span className={grantStatusClass(grant.status)}>{grant.status}</span>
                        </td>
                        <td>
                          {grant.requested_by || "-"}
                          {grant.requested_at ? ` (${formatDateTime(grant.requested_at)})` : ""}
                        </td>
                        <td>
                          {grant.decided_by ? `${grant.decided_by} (${formatDateTime(grant.decided_at)})` : "-"}
                        </td>
                        <td>
                          {canApproveConcessions && grant.status === "Requested" && (
                            <div className="action-buttons">
                              <button type="button" className="edit-button" onClick={() => decideGrant(grant, "approve")} title="Approve">
                                <Check size={15} />
                              </button>
                              <button type="button" className="delete-button" onClick={() => decideGrant(grant, "reject")} title="Reject">
                                <X size={15} />
                              </button>
                            </div>
                          )}
                          {canApproveConcessions && grant.status === "Approved" && (
                            <div className="action-buttons">
                              <button type="button" className="delete-button" onClick={() => decideGrant(grant, "revoke")} title="Revoke">
                                <Undo2 size={15} />
                              </button>
                            </div>
                          )}
                          {(!canApproveConcessions || (grant.status !== "Requested" && grant.status !== "Approved")) && "-"}
                        </td>
                      </tr>
                    ))}
                    {!concessionGrantsLoading && !concessionGrants.length && (
                      <tr><td colSpan={8}>No concession grants yet.</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {concessionView === "preview" && (
            <div style={{ marginTop: 16 }}>
              <div className="form-grid">
                <StudentPicker
                  students={students}
                  value={previewStudentId}
                  onChange={(e) => setPreviewStudentId(e.target.value)}
                  label="Student"
                  required={false}
                />

                <div className="form-field">
                  <label>Amount *</label>
                  <input type="number" min="0" step="0.01" value={previewAmount} onChange={(e) => setPreviewAmount(e.target.value)} />
                </div>

                <div className="form-field">
                  <label>Fee Type</label>
                  <select value={previewFeeType} onChange={(e) => setPreviewFeeType(e.target.value)}>
                    <option value="">Any</option>
                    {feeTypes.map((item) => (
                      <option key={item} value={item}>{item}</option>
                    ))}
                  </select>
                </div>

                <div className="form-field">
                  <label>Academic Year</label>
                  <select value={previewAcademicYear} onChange={(e) => setPreviewAcademicYear(e.target.value)}>
                    <option value="">Any</option>
                    {academicYears.map((year) => (
                      <option key={year.id} value={year.name}>{year.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="form-actions">
                <button type="button" className="secondary-button" onClick={runConcessionPreview} disabled={concessionPreviewLoading}>
                  {concessionPreviewLoading ? "Checking..." : "Preview"}
                </button>
                {canApproveConcessions && (
                  <button type="button" className="primary-button" onClick={runRecalculateAll} disabled={recalculating}>
                    <RefreshCcw size={17} />
                    {recalculating
                      ? "Recalculating..."
                      : previewStudentId
                      ? "Recalculate This Student"
                      : "Recalculate All Unpaid Fees"}
                  </button>
                )}
              </div>

              {concessionPreview && (
                <>
                  <section className="summary-strip report-summary-grid" style={{ marginTop: 16 }}>
                    <div className="summary-card">
                      <Percent size={20} />
                      <div><span>Base Amount</span><strong>{money(concessionPreview.base_amount)}</strong></div>
                    </div>
                    <div className="summary-card warning">
                      <Percent size={20} />
                      <div><span>Concession</span><strong>{money(concessionPreview.concession_amount)}</strong></div>
                    </div>
                    <div className="summary-card">
                      <Percent size={20} />
                      <div><span>Payable</span><strong>{money(concessionPreview.payable_amount)}</strong></div>
                    </div>
                  </section>

                  {concessionPreview.capped && (
                    <p className="hint-text">
                      This student's schemes add up to more than the fee itself — the discount shown is capped at the full amount.
                    </p>
                  )}

                  <div className="table-wrapper" style={{ marginTop: 16 }}>
                    <table className="classic-table">
                      <thead>
                        <tr><th>Scheme</th><th>Category</th><th>Rate</th><th>Amount</th></tr>
                      </thead>
                      <tbody>
                        {concessionPreview.lines.map((line) => (
                          <tr key={line.grant_id}>
                            <td>{line.scheme_name}</td>
                            <td>{line.category || "-"}</td>
                            <td>{line.label}</td>
                            <td>{money(line.amount)}</td>
                          </tr>
                        ))}
                        {!concessionPreview.lines.length && (
                          <tr><td colSpan={4}>No approved concessions apply.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </div>
          )}
        </section>
      )}

      {pageMode === "list" && (
        <>
          <section className="table-panel module-filter-panel">
            <div className="filter-row sis-filter-row">
              <div className="form-field">
                <label>Fee Type</label>
                <select value={feeTypeFilter} onChange={(e) => setFeeTypeFilter(e.target.value)}>
                  <option value="">All Fee Types</option>
                  {feeTypes.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label>Status</label>
                <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                  <option value="">All Status</option>
                  {statusOptions.map((item) => (
                    <option key={item} value={item}>{item}</option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label>Academic Year</label>
                <select
                  value={academicYearFilter}
                  onChange={(e) => setAcademicYearFilter(e.target.value)}
                >
                  <option value="">All Years</option>
                  {academicYearOptions.map((year) => (
                    <option key={year} value={year}>{year}</option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label>Class</label>
                <select
                  value={classFilter}
                  onChange={(e) => {
                    setClassFilter(e.target.value);
                    setSectionFilter("");
                  }}
                >
                  <option value="">All Classes</option>
                  {classFilterOptions.map((className) => (
                    <option key={className} value={className}>{className}</option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label>Section</label>
                <select value={sectionFilter} onChange={(e) => setSectionFilter(e.target.value)}>
                  <option value="">All Sections</option>
                  {sectionFilterOptions.map((section) => (
                    <option key={section} value={section}>{section}</option>
                  ))}
                </select>
              </div>

              <button
                type="button"
                className="light-button"
                onClick={() => {
                  setFeeTypeFilter("");
                  setStatusFilter("");
                  setAcademicYearFilter("");
                  setClassFilter("");
                  setSectionFilter("");
                  setSearchText("");
                }}
              >
                Clear Filters
              </button>
            </div>
          </section>

          <ManagedRecordsTable
            count={filteredFees.length}
            emptyText="No fee records found."
            headers={["Student", "Class", "Academic Year", "Fee Type", "Total Amount", "Paid Amount", "Balance", "Due Date", "Payment Date", "Status", "Actions"]}
            loading={loading}
            loadingText="Loading fees..."
            searchPlaceholder="Search student, class, year, fee type, status..."
            searchText={searchText}
            setSearchText={setSearchText}
          >
            {filteredFees.map((fee) => (
                    <tr key={fee.id}>
                      <td>{getStudentName(fee.student_id)}</td>
                      <td>{getClassLabel(fee)}</td>
                      <td>{fee.academic_year || "-"}</td>
                      <td>{fee.fee_type || "-"}</td>
                      <td>{money(getFeeAmount(fee))}</td>
                      <td>{money(getPaidAmount(fee))}</td>
                      <td>{money(getBalanceAmount(fee))}</td>
                      <td>{normalizeDateInput(fee.due_date) || "-"}</td>
                      <td>{normalizeDateInput(fee.payment_date) || "-"}</td>
                      <td>
                        <span className={getStatusClass(fee.payment_status)}>
                          {fee.payment_status || "Unpaid"}
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
                            disabled={fee.payment_status === "Paid"}
                            title={
                              fee.payment_status === "Paid"
                                ? "Fully paid fees cannot be edited"
                                : "Edit"
                            }
                          >
                            <Edit size={15} />
                          </button>

                          {getPaidAmount(fee) > 0 && (
                            <button
                              type="button"
                              className="edit-button"
                              onClick={() => downloadReceipt(fee)}
                              title="Download receipt (PDF)"
                            >
                              <Download size={15} />
                            </button>
                          )}

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
            ))}
          </ManagedRecordsTable>
        </>
      )}

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
              <p>Class: {getClassLabel(selectedFee)}</p>
              <p>Academic Year: {selectedFee.academic_year || "-"}</p>
              <p>Fee Type: {selectedFee.fee_type || "-"}</p>
              <p>Total Amount: {money(getFeeAmount(selectedFee))}</p>
              <p>Paid Amount: {money(getPaidAmount(selectedFee))}</p>
              <p>Balance: {money(getBalanceAmount(selectedFee))}</p>
              <p>Due Date: {normalizeDateInput(selectedFee.due_date) || "-"}</p>
              <p>Payment Date: {normalizeDateInput(selectedFee.payment_date) || "-"}</p>
              <p>Receipt No: {selectedFee.receipt_no || "-"}</p>
              <p>Status: {selectedFee.payment_status || "Unpaid"}</p>
              <p>Remarks: {selectedFee.remarks || "-"}</p>
            </div>
          </aside>
        </div>
      )}

      {showGenerationHistory && (
        <div className="student-drawer-backdrop">
          <aside className="student-drawer">
            <button
              type="button"
              className="drawer-close"
              onClick={() => setShowGenerationHistory(false)}
            >
              <X size={18} />
            </button>

            <div className="student-profile-head">
              <div className="student-avatar">
                <History size={42} />
              </div>

              <h3>Auto-Generation History</h3>
              <p>Most recent scheduled fee runs, across every Fee Structure.</p>
            </div>

            {generationRunsLoading && <div className="drawer-section">Loading...</div>}

            {!generationRunsLoading && !generationRuns.length && (
              <div className="drawer-section">
                No scheduled runs yet — this fills in once a Fee Structure with
                Auto-Generate on has a run date in the past and
                run_scheduled_fees.py has run at least once.
              </div>
            )}

            {generationRuns.map((run) => (
              <div className="drawer-section" key={run.id}>
                <h4>
                  {run.fee_type} — {run.class_name || "All Classes"}
                </h4>
                <p>Period: {run.billing_period}</p>
                <p>
                  Status: <span className={runStatusClass(run.status)}>{run.status}</span>
                </p>
                <p>
                  Billed: {run.students_billed} student{run.students_billed === 1 ? "" : "s"}
                  {run.students_skipped ? ` · Skipped ${run.students_skipped} (already billed)` : ""}
                </p>
                <p>Run at: {formatDateTime(run.run_at)}</p>
                {run.error_message && <p>Error: {run.error_message}</p>}
              </div>
            ))}
          </aside>
        </div>
      )}

    </div>
  );
}

