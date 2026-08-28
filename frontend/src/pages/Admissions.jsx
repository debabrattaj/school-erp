import { useEffect, useMemo, useState } from "react";
import { todayLocalDate } from "../utils/date";
import {
  AlertTriangle,
  ArrowLeft,
  BarChart3,
  CalendarClock,
  CheckCircle,
  ClipboardCheck,
  ClipboardList,
  Clock,
  Edit,
  LayoutGrid,
  ListChecks,
  Paperclip,
  PlusCircle,
  Trash2,
  Upload,
  UserPlus,
  MessageCircle,
  Settings,
  ArrowUp,
  ArrowDown,
  Copy,
  Percent,
} from "lucide-react";

import API from "../api";
import EnhancedRecordsTable from "../components/EnhancedRecordsTable";
import BulkImportModal from "../components/BulkImportModal";
import { isFeatureEnabled } from "../auth";
import { resolveFileUrl, uploadFile } from "../utils/files";

const emptyAdmissionForm = {
  inquiry_no: "",
  student_name: "",
  grade_applying: "",
  academic_year: "2026-27",
  guardian_name: "",
  guardian_phone: "",
  guardian_email: "",
  source: "Website",
  stage: "Inquiry",
  follow_up_date: "",
  assigned_to: "",
  assigned_to_user_id: "",
  notes: "",
};

const emptyTaskForm = { title: "", due_date: "", assigned_to_user_id: "" };
const emptyTemplateForm = { title: "", due_in_days: 2 };
const CLOSED_STAGES = ["Enrolled", "Lost"];

const emptyFollowUpForm = {
  activity_date: todayLocalDate(),
  activity_type: "Call",
  notes: "",
  next_action: "",
  next_follow_up_date: "",
  owner: "",
  outcome: "Open",
};

const emptyAssessmentForm = {
  assessment_type: "Entrance Test",
  scheduled_date: "",
  scheduled_time: "",
  mode: "On Campus",
  location: "",
};

const assessmentTypeOptions = [
  "Entrance Test",
  "Student Interview",
  "Parent Interview",
  "Portfolio Review",
  "Language Assessment",
  "Counselor Meeting",
];

const assessmentModeOptions = ["On Campus", "Online", "Hybrid", "Phone"];

const documentTypeOptions = ["ID Proof", "Report Card", "Photo", "Birth Certificate", "Other"];

const emptyDocumentForm = { document_type: "ID Proof" };

const emptyConvertForm = {
  admission_no: "",
  first_name: "",
  last_name: "",
  class_name: "",
  section: "",
  admission_date: todayLocalDate(),
  student_status: "Active",
  guardian_name: "",
  guardian_phone: "",
  guardian_email: "",
};

const fallbackStageOptions = [
  "Inquiry",
  "Contacted",
  "Visit Scheduled",
  "Assessment",
  "Offered",
  "Enrolled",
  "Lost",
];

const activityTypeOptions = [
  "Call",
  "Email",
  "Campus Visit",
  "Assessment",
  "Document Review",
  "Meeting",
  "Other",
];

const sourceOptions = [
  "Website",
  "Referral",
  "Walk-in",
  "Education Fair",
  "Social Media",
  "Agency",
  "Other",
];

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

  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object") return detail.msg || JSON.stringify(detail);

  return fallbackMessage;
}

const VIEW_TABS = [
  ["list", "Inquiries", ClipboardList],
  ["pipeline", "Pipeline", LayoutGrid],
  ["queue", "My Queue", ListChecks],
  ["analytics", "Analytics", BarChart3],
];

function ViewTabs({ pageMode, setPageMode }) {
  return (
    <section className="table-panel">
      <div className="student-profile-tabs">
        {VIEW_TABS.map(([mode, label, Icon]) => (
          <button
            key={mode}
            type="button"
            className={pageMode === mode ? "active" : ""}
            onClick={() => setPageMode(mode)}
          >
            <Icon size={15} style={{ verticalAlign: "middle", marginRight: 6 }} />
            {label}
          </button>
        ))}
      </div>
    </section>
  );
}

export default function Admissions() {
  const [inquiries, setInquiries] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [formData, setFormData] = useState(emptyAdmissionForm);
  const [editingId, setEditingId] = useState(null);
  const [selectedInquiry, setSelectedInquiry] = useState(null);
  const [followUps, setFollowUps] = useState([]);
  const [followUpForm, setFollowUpForm] = useState(emptyFollowUpForm);
  const [convertForm, setConvertForm] = useState(emptyConvertForm);
  const [pageMode, setPageMode] = useState("list");
  const [searchText, setSearchText] = useState("");
  const [stageFilter, setStageFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [stages, setStages] = useState([]);
  const [showStageManager, setShowStageManager] = useState(false);
  const [newStageName, setNewStageName] = useState("");
  const [stageEdits, setStageEdits] = useState({});

  const [users, setUsers] = useState([]);
  const [duplicateWarning, setDuplicateWarning] = useState(null);

  const [tasks, setTasks] = useState([]);
  const [taskForm, setTaskForm] = useState(emptyTaskForm);

  const [assessments, setAssessments] = useState([]);
  const [inquiryAssessments, setInquiryAssessments] = useState([]);
  const [assessmentForm, setAssessmentForm] = useState(emptyAssessmentForm);

  const [documents, setDocuments] = useState([]);
  const [documentForm, setDocumentForm] = useState(emptyDocumentForm);
  const [documentFile, setDocumentFile] = useState(null);
  const [documentUploading, setDocumentUploading] = useState(false);

  const [showBulkImport, setShowBulkImport] = useState(false);

  const [pipelineTasks, setPipelineTasks] = useState({});
  const [draggedInquiryId, setDraggedInquiryId] = useState(null);

  const [reminderPreview, setReminderPreview] = useState(null);
  const admissionRemindersEnabled = isFeatureEnabled("admission_reminders");

  const [expandedStageId, setExpandedStageId] = useState(null);
  const [stageTemplates, setStageTemplates] = useState({});
  const [templateForm, setTemplateForm] = useState(emptyTemplateForm);

  const [queueTasks, setQueueTasks] = useState([]);
  const [queueLoading, setQueueLoading] = useState(false);
  const [queueAssigneeFilter, setQueueAssigneeFilter] = useState("");

  const [funnel, setFunnel] = useState(null);
  const [sources, setSources] = useState([]);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsYear, setAnalyticsYear] = useState("");

  const stageOptions = stages.length ? stages.map((stage) => stage.name) : fallbackStageOptions;

  const accountCode = localStorage.getItem("school_erp_account_code") || "default";
  const applyLink = `${window.location.origin}${import.meta.env.BASE_URL}apply?school=${accountCode}`;

  function copyApplyLink() {
    navigator.clipboard.writeText(applyLink).then(
      () => setMessage("Apply link copied to clipboard."),
      () => setMessage(`Apply link: ${applyLink}`)
    );
  }

  useEffect(() => {
    if (!message) return undefined;

    const timeoutId = window.setTimeout(() => {
      setMessage("");
    }, 2000);

    return () => window.clearTimeout(timeoutId);
  }, [message]);

  async function loadInquiries() {
    try {
      setLoading(true);
      setMessage("");
      const response = await API.get("/admissions/");
      setInquiries(response.data || []);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load admission inquiries."));
    } finally {
      setLoading(false);
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

  async function loadStages() {
    try {
      const response = await API.get("/admission-workflow-stages/");
      setStages(response.data || []);
    } catch (error) {
      console.error(error);
    }
  }

  async function loadUsers() {
    try {
      const response = await API.get("/users/");
      setUsers(response.data || []);
    } catch (error) {
      console.error(error);
    }
  }

  async function loadAssessmentsAll() {
    try {
      const response = await API.get("/admission-assessments/");
      setAssessments(response.data || []);
    } catch (error) {
      console.error(error);
    }
  }

  async function loadReminderPreview() {
    if (!admissionRemindersEnabled) return;
    try {
      const response = await API.get("/admission-reminders/preview");
      setReminderPreview(response.data);
    } catch (error) {
      console.error(error);
    }
  }

  useEffect(() => {
    loadInquiries();
    loadAcademicYears();
    loadStages();
    loadUsers();
    loadAssessmentsAll();
    loadReminderPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function loadPipelineTasks() {
    try {
      const response = await API.get("/admissions/tasks/queue", { params: { status: "Pending" } });
      const grouped = {};
      (response.data || []).forEach((task) => {
        const bucket = grouped[task.inquiry_id] || { count: 0, earliestDue: null };
        bucket.count += 1;
        if (task.due_date && (!bucket.earliestDue || task.due_date < bucket.earliestDue)) {
          bucket.earliestDue = task.due_date;
        }
        grouped[task.inquiry_id] = bucket;
      });
      setPipelineTasks(grouped);
    } catch (error) {
      console.error(error);
    }
  }

  function userName(userId) {
    if (!userId) return null;
    const user = users.find((item) => String(item.id) === String(userId));
    return user ? user.name : null;
  }

  async function addStage() {
    const name = newStageName.trim();
    if (!name) return;
    try {
      await API.post("/admission-workflow-stages/", { name, sort_order: stages.length + 1 });
      setNewStageName("");
      await loadStages();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to add stage."));
    }
  }

  async function renameStage(stage) {
    const nextName = (stageEdits[stage.id] ?? stage.name).trim();
    if (!nextName || nextName === stage.name) return;
    try {
      await API.put(`/admission-workflow-stages/${stage.id}`, { name: nextName });
      await Promise.all([loadStages(), loadInquiries()]);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to rename stage."));
    }
  }

  async function moveStage(index, direction) {
    const target = index + direction;
    if (target < 0 || target >= stages.length) return;
    const a = stages[index];
    const b = stages[target];
    try {
      await Promise.all([
        API.put(`/admission-workflow-stages/${a.id}`, { sort_order: b.sort_order }),
        API.put(`/admission-workflow-stages/${b.id}`, { sort_order: a.sort_order }),
      ]);
      await loadStages();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to reorder stages."));
    }
  }

  async function deleteStage(stage) {
    if (!window.confirm(`Delete stage "${stage.name}"?`)) return;
    try {
      await API.delete(`/admission-workflow-stages/${stage.id}`);
      await loadStages();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to delete stage."));
    }
  }

  async function loadStageTemplates(stageId) {
    try {
      const response = await API.get(`/admission-workflow-stages/${stageId}/task-templates`);
      setStageTemplates((current) => ({ ...current, [stageId]: response.data || [] }));
    } catch (error) {
      console.error(error);
    }
  }

  function toggleStageTemplates(stage) {
    if (expandedStageId === stage.id) {
      setExpandedStageId(null);
      return;
    }
    setExpandedStageId(stage.id);
    setTemplateForm(emptyTemplateForm);
    loadStageTemplates(stage.id);
  }

  async function addStageTemplate(stage) {
    if (!templateForm.title.trim()) return;
    try {
      await API.post(`/admission-workflow-stages/${stage.id}/task-templates`, {
        stage: stage.name,
        title: templateForm.title.trim(),
        due_in_days: Number(templateForm.due_in_days) || 0,
      });
      setTemplateForm(emptyTemplateForm);
      await loadStageTemplates(stage.id);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to add task template."));
    }
  }

  async function deleteStageTemplate(stageId, templateId) {
    try {
      await API.delete(`/admission-workflow-stages/task-templates/${templateId}`);
      await loadStageTemplates(stageId);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to remove task template."));
    }
  }

  const academicYearOptions = useMemo(() => {
    const names = academicYears.map((year) => year.name);
    if (formData.academic_year && !names.includes(formData.academic_year)) {
      return [formData.academic_year, ...names];
    }
    return names;
  }, [academicYears, formData.academic_year]);

  function handleChange(event) {
    const { name, value } = event.target;
    setFormData((current) => ({ ...current, [name]: value }));
  }

  async function checkDuplicate() {
    if (!formData.guardian_phone.trim() && !formData.guardian_email.trim()) {
      setDuplicateWarning(null);
      return;
    }
    try {
      const response = await API.get("/admissions/check-duplicate", {
        params: {
          phone: formData.guardian_phone.trim() || undefined,
          email: formData.guardian_email.trim() || undefined,
          exclude_id: editingId || undefined,
        },
      });
      setDuplicateWarning((response.data || [])[0] || null);
    } catch (error) {
      console.error(error);
    }
  }

  function handleFollowUpChange(event) {
    const { name, value } = event.target;
    setFollowUpForm((current) => ({ ...current, [name]: value }));
  }

  function handleConvertChange(event) {
    const { name, value } = event.target;
    setConvertForm((current) => ({ ...current, [name]: value }));
  }

  function splitStudentName(fullName = "") {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);
    return {
      first_name: parts[0] || "",
      last_name: parts.slice(1).join(" "),
    };
  }

  async function loadFollowUps(inquiryId) {
    const response = await API.get(`/admissions/${inquiryId}/follow-ups`);
    setFollowUps(response.data || []);
  }

  async function loadTasks(inquiryId) {
    const response = await API.get(`/admissions/${inquiryId}/tasks`);
    setTasks(response.data || []);
  }

  async function loadInquiryAssessments(inquiryId) {
    const response = await API.get("/admission-assessments/", { params: { inquiry_id: inquiryId } });
    setInquiryAssessments(response.data || []);
  }

  async function loadDocuments(inquiryId) {
    const response = await API.get(`/admissions/${inquiryId}/documents`);
    setDocuments(response.data || []);
  }

  async function openFollowUps(inquiry) {
    try {
      setSelectedInquiry(inquiry);
      setFollowUpForm({
        ...emptyFollowUpForm,
        owner: inquiry.assigned_to || "",
        next_follow_up_date: inquiry.follow_up_date || "",
      });
      setTaskForm(emptyTaskForm);
      setAssessmentForm(emptyAssessmentForm);
      setDocumentForm(emptyDocumentForm);
      setDocumentFile(null);
      setMessage("");
      setPageMode("followups");
      await Promise.all([
        loadFollowUps(inquiry.id),
        loadTasks(inquiry.id),
        loadInquiryAssessments(inquiry.id),
        loadDocuments(inquiry.id),
      ]);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load follow-up history."));
    }
  }

  function handleAssessmentFormChange(event) {
    const { name, value } = event.target;
    setAssessmentForm((current) => ({ ...current, [name]: value }));
  }

  async function scheduleAssessment(event) {
    event.preventDefault();
    if (!selectedInquiry?.id) return;
    if (!assessmentForm.scheduled_date) {
      setMessage("Scheduled date is required.");
      return;
    }
    try {
      await API.post("/admission-assessments/", {
        inquiry_id: selectedInquiry.id,
        assessment_type: assessmentForm.assessment_type,
        scheduled_date: assessmentForm.scheduled_date,
        scheduled_time: assessmentForm.scheduled_time || null,
        mode: assessmentForm.mode,
        location: assessmentForm.location.trim() || null,
      });
      setAssessmentForm(emptyAssessmentForm);
      setMessage("Assessment scheduled.");
      await Promise.all([loadInquiryAssessments(selectedInquiry.id), loadAssessmentsAll()]);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to schedule assessment."));
    }
  }

  async function deleteInquiryAssessment(assessmentId) {
    if (!window.confirm("Remove this assessment schedule?")) return;
    try {
      await API.delete(`/admission-assessments/${assessmentId}`);
      await Promise.all([loadInquiryAssessments(selectedInquiry.id), loadAssessmentsAll()]);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to remove assessment."));
    }
  }

  function handleDocumentFormChange(event) {
    const { name, value } = event.target;
    setDocumentForm((current) => ({ ...current, [name]: value }));
  }

  async function uploadDocument(event) {
    event.preventDefault();
    if (!selectedInquiry?.id || !documentFile) {
      setMessage("Choose a file to upload.");
      return;
    }
    try {
      setDocumentUploading(true);
      const fileUrl = await uploadFile(documentFile);
      await API.post(`/admissions/${selectedInquiry.id}/documents`, {
        document_type: documentForm.document_type,
        file_name: documentFile.name,
        file_url: fileUrl,
      });
      setDocumentForm(emptyDocumentForm);
      setDocumentFile(null);
      setMessage("Document uploaded.");
      await loadDocuments(selectedInquiry.id);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to upload document."));
    } finally {
      setDocumentUploading(false);
    }
  }

  async function deleteDocument(documentId) {
    if (!window.confirm("Delete this document?")) return;
    try {
      await API.delete(`/admissions/documents/${documentId}`);
      await loadDocuments(selectedInquiry.id);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to delete document."));
    }
  }

  function handleTaskFormChange(event) {
    const { name, value } = event.target;
    setTaskForm((current) => ({ ...current, [name]: value }));
  }

  async function handleTaskSubmit(event) {
    event.preventDefault();
    setMessage("");
    if (!selectedInquiry?.id) return;
    if (!taskForm.title.trim()) {
      setMessage("Task title is required.");
      return;
    }

    try {
      await API.post(`/admissions/${selectedInquiry.id}/tasks`, {
        title: taskForm.title.trim(),
        due_date: taskForm.due_date || null,
        assigned_to_user_id: taskForm.assigned_to_user_id ? Number(taskForm.assigned_to_user_id) : null,
      });
      setTaskForm(emptyTaskForm);
      setMessage("Task added.");
      await loadTasks(selectedInquiry.id);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to add task."));
    }
  }

  async function toggleTaskDone(task) {
    try {
      await API.put(`/admissions/tasks/${task.id}`, {
        status: task.status === "Done" ? "Pending" : "Done",
      });
      await loadTasks(selectedInquiry.id);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to update task."));
    }
  }

  async function deleteTask(taskId) {
    if (!window.confirm("Remove this task?")) return;
    try {
      await API.delete(`/admissions/tasks/${taskId}`);
      await loadTasks(selectedInquiry.id);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to remove task."));
    }
  }

  async function handleFollowUpSubmit(event) {
    event.preventDefault();
    setMessage("");

    if (!selectedInquiry?.id) return;

    try {
      if (!followUpForm.notes.trim()) {
        setMessage("Follow-up notes are required.");
        return;
      }

      await API.post(`/admissions/${selectedInquiry.id}/follow-ups`, {
        inquiry_id: selectedInquiry.id,
        activity_date: followUpForm.activity_date,
        activity_type: followUpForm.activity_type,
        notes: followUpForm.notes.trim(),
        next_action: followUpForm.next_action.trim() || null,
        next_follow_up_date: followUpForm.next_follow_up_date || null,
        owner: followUpForm.owner.trim() || null,
        outcome: followUpForm.outcome || null,
      });

      setFollowUpForm({
        ...emptyFollowUpForm,
        owner: followUpForm.owner,
        next_follow_up_date: followUpForm.next_follow_up_date,
      });
      setMessage("Follow-up added successfully.");
      await Promise.all([loadFollowUps(selectedInquiry.id), loadInquiries()]);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to save follow-up."));
    }
  }

  async function getNextAdmissionNo() {
    const response = await API.get("/admissions/next-admission-no");
    return response.data?.admission_no || "";
  }

  async function moveInquiryStage(inquiry, newStage) {
    try {
      await API.put(`/admissions/${inquiry.id}`, {
        inquiry_no: inquiry.inquiry_no,
        student_name: inquiry.student_name,
        grade_applying: inquiry.grade_applying,
        academic_year: inquiry.academic_year,
        guardian_name: inquiry.guardian_name,
        guardian_phone: inquiry.guardian_phone,
        guardian_email: inquiry.guardian_email,
        source: inquiry.source,
        stage: newStage,
        follow_up_date: inquiry.follow_up_date,
        assigned_to: inquiry.assigned_to,
        assigned_to_user_id: inquiry.assigned_to_user_id,
        converted_student_id: inquiry.converted_student_id,
        notes: inquiry.notes,
      });
      setMessage(`Moved to ${newStage}.`);
      await loadInquiries();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to move inquiry."));
    }
  }

  function handleCardDragStart(event, inquiry) {
    setDraggedInquiryId(inquiry.id);
    event.dataTransfer.effectAllowed = "move";
    // Firefox requires setData to be called for a drag to actually start.
    event.dataTransfer.setData("text/plain", String(inquiry.id));
  }

  function handleCardDragEnd() {
    setDraggedInquiryId(null);
  }

  function handleColumnDragOver(event) {
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
  }

  function handleColumnDrop(event, stageName) {
    event.preventDefault();
    const inquiry = inquiries.find((item) => item.id === draggedInquiryId);
    setDraggedInquiryId(null);
    if (!inquiry || inquiry.stage === stageName) return;
    moveInquiryStage(inquiry, stageName);
  }

  async function loadQueue() {
    try {
      setQueueLoading(true);
      const response = await API.get("/admissions/tasks/queue", {
        params: { assigned_to_user_id: queueAssigneeFilter || undefined },
      });
      setQueueTasks(response.data || []);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load the task queue."));
    } finally {
      setQueueLoading(false);
    }
  }

  async function completeQueueTask(task) {
    try {
      await API.put(`/admissions/tasks/${task.id}`, { status: "Done" });
      await loadQueue();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to update task."));
    }
  }

  async function loadAnalytics() {
    try {
      setAnalyticsLoading(true);
      const [funnelResponse, sourcesResponse] = await Promise.all([
        API.get("/admissions/analytics/funnel", { params: { academic_year: analyticsYear || undefined } }),
        API.get("/admissions/analytics/sources", { params: { academic_year: analyticsYear || undefined } }),
      ]);
      setFunnel(funnelResponse.data);
      setSources(sourcesResponse.data || []);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load analytics."));
    } finally {
      setAnalyticsLoading(false);
    }
  }

  useEffect(() => {
    if (pageMode === "queue") loadQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageMode, queueAssigneeFilter]);

  useEffect(() => {
    if (pageMode === "pipeline") {
      loadPipelineTasks();
      loadAssessmentsAll();
    }
  }, [pageMode]);

  useEffect(() => {
    if (pageMode === "analytics") loadAnalytics();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageMode, analyticsYear]);

  async function openConvertInquiry(inquiry) {
    const splitName = splitStudentName(inquiry.student_name);
    let nextAdmissionNo = "";

    try {
      nextAdmissionNo = await getNextAdmissionNo();
    } catch (error) {
      console.error("Unable to generate next admission number", error);
    }

    setSelectedInquiry(inquiry);
    setConvertForm({
      ...emptyConvertForm,
      admission_no: nextAdmissionNo,
      first_name: splitName.first_name,
      last_name: splitName.last_name,
      class_name: inquiry.grade_applying || "",
      guardian_name: inquiry.guardian_name || "",
      guardian_phone: inquiry.guardian_phone || "",
      guardian_email: inquiry.guardian_email || "",
    });
    setMessage("");
    setPageMode("convert");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleConvertSubmit(event) {
    event.preventDefault();
    setMessage("");

    if (!selectedInquiry?.id) return;

    try {
      if (!convertForm.admission_no.trim() || !convertForm.first_name.trim()) {
        setMessage("Admission number and first name are required.");
        return;
      }

      await API.post(`/admissions/${selectedInquiry.id}/convert`, {
        admission_no: convertForm.admission_no.trim(),
        first_name: convertForm.first_name.trim(),
        last_name: convertForm.last_name.trim() || null,
        class_name: convertForm.class_name.trim() || null,
        section: convertForm.section.trim() || null,
        admission_date: convertForm.admission_date || null,
        student_status: convertForm.student_status || "Active",
        guardian_name: convertForm.guardian_name.trim() || null,
        guardian_phone: convertForm.guardian_phone.trim() || null,
        guardian_email: convertForm.guardian_email.trim() || null,
      });

      setMessage("Inquiry converted to student successfully.");
      setSelectedInquiry(null);
      setConvertForm(emptyConvertForm);
      setPageMode("list");
      await loadInquiries();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to convert inquiry."));
    }
  }

  function buildPayload() {
    return {
      inquiry_no: formData.inquiry_no.trim(),
      student_name: formData.student_name.trim(),
      grade_applying: formData.grade_applying.trim(),
      academic_year: formData.academic_year.trim(),
      guardian_name: formData.guardian_name.trim(),
      guardian_phone: formData.guardian_phone.trim(),
      guardian_email: formData.guardian_email.trim() || null,
      source: formData.source || "Website",
      stage: formData.stage || "Inquiry",
      follow_up_date: formData.follow_up_date || null,
      assigned_to: formData.assigned_to.trim() || null,
      assigned_to_user_id: formData.assigned_to_user_id ? Number(formData.assigned_to_user_id) : null,
      notes: formData.notes.trim() || null,
    };
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setMessage("");

    try {
      const payload = buildPayload();

      if (!payload.student_name || !payload.grade_applying || !payload.academic_year) {
        setMessage("Student name, grade, and academic year are required.");
        return;
      }

      if (!payload.guardian_name || !payload.guardian_phone) {
        setMessage("Guardian name and phone are required.");
        return;
      }

      if (editingId) {
        await API.put(`/admissions/${editingId}`, payload);
        setMessage("Admission inquiry updated successfully.");
      } else {
        await API.post("/admissions/", payload);
        setMessage("Admission inquiry added successfully.");
      }

      setFormData(emptyAdmissionForm);
      setEditingId(null);
      setPageMode("list");
      await loadInquiries();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to save admission inquiry."));
    }
  }

  function handleAddInquiry() {
    setEditingId(null);
    setFormData(emptyAdmissionForm);
    setDuplicateWarning(null);
    setMessage("");
    setPageMode("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function handleEdit(inquiry) {
    setEditingId(inquiry.id);
    setFormData({
      inquiry_no: inquiry.inquiry_no || "",
      student_name: inquiry.student_name || "",
      grade_applying: inquiry.grade_applying || "",
      academic_year: inquiry.academic_year || "2026-27",
      guardian_name: inquiry.guardian_name || "",
      guardian_phone: inquiry.guardian_phone || "",
      guardian_email: inquiry.guardian_email || "",
      source: inquiry.source || "Website",
      stage: inquiry.stage || "Inquiry",
      follow_up_date: inquiry.follow_up_date || "",
      assigned_to: inquiry.assigned_to || "",
      assigned_to_user_id: inquiry.assigned_to_user_id || "",
      notes: inquiry.notes || "",
    });
    setDuplicateWarning(null);
    setMessage("");
    setPageMode("form");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(inquiryId) {
    if (!window.confirm("Are you sure you want to delete this admission inquiry?")) {
      return;
    }

    try {
      await API.delete(`/admissions/${inquiryId}`);
      setMessage("Admission inquiry deleted successfully.");
      await loadInquiries();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to delete admission inquiry."));
    }
  }

  function handleCancel() {
    setEditingId(null);
    setFormData(emptyAdmissionForm);
    setMessage("");
    setPageMode("list");
  }

  const filteredInquiries = inquiries.filter((inquiry) => {
    const matchStage = stageFilter ? inquiry.stage === stageFilter : true;
    const fullText = `
      ${inquiry.inquiry_no}
      ${inquiry.student_name}
      ${inquiry.grade_applying}
      ${inquiry.guardian_name}
      ${inquiry.guardian_phone}
      ${inquiry.guardian_email}
      ${inquiry.source}
      ${inquiry.stage}
      ${inquiry.assigned_to}
    `.toLowerCase();

    return matchStage && fullText.includes(searchText.toLowerCase());
  });

  const admittedCount = useMemo(
    () => inquiries.filter((inquiry) => ["Enrolled", "Admitted"].includes(inquiry.stage)).length,
    [inquiries]
  );
  const activePipelineCount = useMemo(
    () =>
      inquiries.filter(
        (inquiry) => !["Enrolled", "Admitted", "Lost", "Rejected", "Withdrawn"].includes(inquiry.stage)
      ).length,
    [inquiries]
  );
  const followUpCount = useMemo(
    () => inquiries.filter((inquiry) => inquiry.follow_up_date).length,
    [inquiries]
  );

  const admissionForm = (
    <section className="form-panel">
      <div className="panel-header">
        <div>
          <h3>{editingId ? "Edit Admission Inquiry" : "Add Admission Inquiry"}</h3>
          <p>Track admissions from first inquiry through enrollment.</p>
        </div>
      </div>

      <form className="classic-form" onSubmit={handleSubmit}>
        <div className="form-grid">
          <div className="form-field">
            <label>Inquiry No</label>
            <input
              type="text"
              name="inquiry_no"
              value={formData.inquiry_no}
              onChange={handleChange}
              placeholder="Auto generated if blank"
            />
          </div>

          <div className="form-field">
            <label>Student Name *</label>
            <input
              type="text"
              name="student_name"
              value={formData.student_name}
              onChange={handleChange}
              placeholder="Student full name"
              required
            />
          </div>

          <div className="form-field">
            <label>Grade Applying *</label>
            <input
              type="text"
              name="grade_applying"
              value={formData.grade_applying}
              onChange={handleChange}
              placeholder="Example: Grade 8"
              required
            />
          </div>

          <div className="form-field">
            <label>Academic Year *</label>
            <select
              name="academic_year"
              value={formData.academic_year}
              onChange={handleChange}
              required
            >
              <option value="">Select academic year</option>
              {academicYearOptions.map((year) => (
                <option key={year} value={year}>
                  {year}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Guardian Name *</label>
            <input
              type="text"
              name="guardian_name"
              value={formData.guardian_name}
              onChange={handleChange}
              required
            />
          </div>

          <div className="form-field">
            <label>Guardian Phone *</label>
            <input
              type="text"
              name="guardian_phone"
              value={formData.guardian_phone}
              onChange={handleChange}
              onBlur={checkDuplicate}
              required
            />
          </div>

          <div className="form-field">
            <label>Guardian Email</label>
            <input
              type="email"
              name="guardian_email"
              value={formData.guardian_email}
              onChange={handleChange}
              onBlur={checkDuplicate}
            />
          </div>

          <div className="form-field">
            <label>Source</label>
            <select name="source" value={formData.source} onChange={handleChange}>
              {sourceOptions.map((source) => (
                <option key={source} value={source}>
                  {source}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Stage</label>
            <select name="stage" value={formData.stage} onChange={handleChange}>
              {stageOptions.map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </select>
          </div>

          <div className="form-field">
            <label>Follow Up Date</label>
            <input
              type="date"
              name="follow_up_date"
              value={formData.follow_up_date}
              onChange={handleChange}
            />
          </div>

          <div className="form-field">
            <label>Assigned To (staff account)</label>
            <select
              name="assigned_to_user_id"
              value={formData.assigned_to_user_id}
              onChange={(event) => {
                const userId = event.target.value;
                const user = users.find((item) => String(item.id) === userId);
                setFormData((current) => ({
                  ...current,
                  assigned_to_user_id: userId,
                  assigned_to: user ? user.name : current.assigned_to,
                }));
              }}
            >
              <option value="">Unassigned</option>
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} ({user.role})
                </option>
              ))}
            </select>
            <small>Linking a staff account is what lets daily admissions reminders reach this inquiry's owner.</small>
          </div>

          <div className="form-field">
            <label>Owner Name (if not a system user)</label>
            <input
              type="text"
              name="assigned_to"
              value={formData.assigned_to}
              onChange={handleChange}
              placeholder="Admissions counselor"
              disabled={Boolean(formData.assigned_to_user_id)}
            />
            {formData.assigned_to_user_id ? (
              <small>Set from the linked staff account above.</small>
            ) : (
              <small style={{ color: "var(--warning-600)" }}>
                A free-text owner has no address to remind — link a staff account above to include this inquiry in reminders.
              </small>
            )}
          </div>

          <div className="form-field span-2">
            <label>Notes</label>
            <textarea
              name="notes"
              value={formData.notes}
              onChange={handleChange}
              rows="3"
              placeholder="Parent preferences, visit notes, document status..."
            />
          </div>
        </div>

        <div className="form-actions">
          <button type="submit" className="primary-button">
            <PlusCircle size={18} />
            {editingId ? "Update Inquiry" : "Add Inquiry"}
          </button>
          <button type="button" className="light-button" onClick={handleCancel}>
            Cancel
          </button>
        </div>
      </form>
    </section>
  );

  if (pageMode === "form") {
    return (
      <div className="management-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Admissions</p>
            <h2>{editingId ? "Edit Admission Inquiry" : "Add Admission Inquiry"}</h2>
            <p>Capture international admissions interest and follow-up details.</p>
          </div>

          <button type="button" className="light-button" onClick={handleCancel}>
            <ArrowLeft size={17} />
            Back
          </button>
        </section>

        {message && <div className="toast-notification">{message}</div>}

        {duplicateWarning && (
          <section className="form-panel" style={{ borderColor: "var(--warning-600)" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: 10, padding: "14px 18px" }}>
              <AlertTriangle size={20} style={{ color: "var(--warning-600)", flexShrink: 0, marginTop: 2 }} />
              <div>
                <strong>Possible duplicate</strong>
                <p style={{ margin: "4px 0 0" }}>
                  {duplicateWarning.student_name} ({duplicateWarning.inquiry_no}), guardian{" "}
                  {duplicateWarning.guardian_name}, stage {duplicateWarning.stage} — matched on{" "}
                  {duplicateWarning.matched_on}. You can still save; this is a warning, not a block.
                </p>
              </div>
            </div>
          </section>
        )}

        {admissionForm}
      </div>
    );
  }

  if (pageMode === "followups" && selectedInquiry) {
    return (
      <div className="management-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Admissions CRM</p>
            <h2>{selectedInquiry.student_name}</h2>
            <p>
              {selectedInquiry.inquiry_no} | {selectedInquiry.grade_applying} |{" "}
              {selectedInquiry.guardian_name}
            </p>
          </div>

          <button
            type="button"
            className="light-button"
            onClick={() => {
              setSelectedInquiry(null);
              setFollowUps([]);
              setTasks([]);
              setPageMode("list");
            }}
          >
            <ArrowLeft size={17} />
            Back
          </button>
        </section>

        {message && <div className="toast-notification">{message}</div>}

        <section className="form-panel">
          <div className="panel-header">
            <div>
              <h3>Add Follow-up</h3>
              <p>Log calls, visits, next actions, and owner handoffs.</p>
            </div>
          </div>

          <form className="classic-form" onSubmit={handleFollowUpSubmit}>
            <div className="form-grid">
              <div className="form-field">
                <label>Activity Date *</label>
                <input
                  type="date"
                  name="activity_date"
                  value={followUpForm.activity_date}
                  onChange={handleFollowUpChange}
                  required
                />
              </div>

              <div className="form-field">
                <label>Activity Type</label>
                <select
                  name="activity_type"
                  value={followUpForm.activity_type}
                  onChange={handleFollowUpChange}
                >
                  {activityTypeOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>

              <div className="form-field">
                <label>Owner</label>
                <input
                  name="owner"
                  value={followUpForm.owner}
                  onChange={handleFollowUpChange}
                  placeholder="Admissions counselor"
                />
              </div>

              <div className="form-field full-width">
                <label>Notes *</label>
                <textarea
                  name="notes"
                  value={followUpForm.notes}
                  onChange={handleFollowUpChange}
                  rows="3"
                  placeholder="Conversation summary, objections, documents requested..."
                  required
                />
              </div>

              <div className="form-field">
                <label>Next Action</label>
                <input
                  name="next_action"
                  value={followUpForm.next_action}
                  onChange={handleFollowUpChange}
                  placeholder="Schedule campus tour"
                />
              </div>

              <div className="form-field">
                <label>Next Follow-up Date</label>
                <input
                  type="date"
                  name="next_follow_up_date"
                  value={followUpForm.next_follow_up_date}
                  onChange={handleFollowUpChange}
                />
              </div>

              <div className="form-field">
                <label>Outcome</label>
                <select
                  name="outcome"
                  value={followUpForm.outcome}
                  onChange={handleFollowUpChange}
                >
                  {["Open", "Positive", "Needs Info", "No Response", "Closed"].map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" className="primary-button">
                <MessageCircle size={18} />
                Add Follow-up
              </button>
            </div>
          </form>
        </section>

        <section className="table-panel">
          <div className="table-toolbar">
            <div>
              <h3>Follow-up History</h3>
              <p>{followUps.length} touchpoint(s) recorded</p>
            </div>
          </div>

          <div className="table-wrapper">
            <table className="classic-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Notes</th>
                  <th>Next Action</th>
                  <th>Next Follow-up</th>
                  <th>Owner</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {followUps.length === 0 ? (
                  <tr>
                    <td className="empty-table" colSpan="7">
                      No follow-ups recorded.
                    </td>
                  </tr>
                ) : (
                  followUps.map((item) => (
                    <tr key={item.id}>
                      <td>{item.activity_date || "-"}</td>
                      <td>{item.activity_type || "-"}</td>
                      <td>{item.notes || "-"}</td>
                      <td>{item.next_action || "-"}</td>
                      <td>{item.next_follow_up_date || "-"}</td>
                      <td>{item.owner || "-"}</td>
                      <td>
                        <span className="status active">{item.outcome || "Open"}</span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="form-panel">
          <div className="panel-header">
            <div>
              <h3>Tasks</h3>
              <p>Ad-hoc or stamped out automatically when this inquiry entered its current stage.</p>
            </div>
          </div>

          <form className="classic-form" onSubmit={handleTaskSubmit}>
            <div className="form-grid">
              <div className="form-field">
                <label>Title *</label>
                <input
                  name="title"
                  value={taskForm.title}
                  onChange={handleTaskFormChange}
                  placeholder="Collect documents"
                  required
                />
              </div>
              <div className="form-field">
                <label>Due Date</label>
                <input type="date" name="due_date" value={taskForm.due_date} onChange={handleTaskFormChange} />
              </div>
              <div className="form-field">
                <label>Assign To</label>
                <select name="assigned_to_user_id" value={taskForm.assigned_to_user_id} onChange={handleTaskFormChange}>
                  <option value="">Unassigned</option>
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>{user.name}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="primary-button">
                <PlusCircle size={18} />
                Add Task
              </button>
            </div>
          </form>

          <div className="table-wrapper" style={{ marginTop: 14 }}>
            <table className="classic-table">
              <thead>
                <tr>
                  <th></th>
                  <th>Title</th>
                  <th>Due</th>
                  <th>Assigned To</th>
                  <th>Stage</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {tasks.length === 0 ? (
                  <tr>
                    <td className="empty-table" colSpan="6">No tasks yet.</td>
                  </tr>
                ) : (
                  tasks.map((task) => (
                    <tr key={task.id} style={task.status === "Done" ? { opacity: 0.6 } : undefined}>
                      <td>
                        <input
                          type="checkbox"
                          checked={task.status === "Done"}
                          onChange={() => toggleTaskDone(task)}
                          title={task.status === "Done" ? "Mark pending" : "Mark done"}
                        />
                      </td>
                      <td style={task.status === "Done" ? { textDecoration: "line-through" } : undefined}>
                        {task.title}
                      </td>
                      <td>{task.due_date || "-"}</td>
                      <td>{task.assigned_to_user_name || "-"}</td>
                      <td>{task.stage || "-"}</td>
                      <td>
                        <button type="button" className="delete-button" onClick={() => deleteTask(task.id)} title="Remove">
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="form-panel">
          <div className="panel-header">
            <div>
              <h3>Assessments</h3>
              <p>Entrance tests, interviews, and reviews scheduled for this inquiry.</p>
            </div>
          </div>

          <form className="classic-form" onSubmit={scheduleAssessment}>
            <div className="form-grid">
              <div className="form-field">
                <label>Type</label>
                <select name="assessment_type" value={assessmentForm.assessment_type} onChange={handleAssessmentFormChange}>
                  {assessmentTypeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>Date *</label>
                <input type="date" name="scheduled_date" value={assessmentForm.scheduled_date} onChange={handleAssessmentFormChange} required />
              </div>
              <div className="form-field">
                <label>Time</label>
                <input type="time" name="scheduled_time" value={assessmentForm.scheduled_time} onChange={handleAssessmentFormChange} />
              </div>
              <div className="form-field">
                <label>Mode</label>
                <select name="mode" value={assessmentForm.mode} onChange={handleAssessmentFormChange}>
                  {assessmentModeOptions.map((mode) => <option key={mode} value={mode}>{mode}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>Location / Link</label>
                <input name="location" value={assessmentForm.location} onChange={handleAssessmentFormChange} placeholder="Room, campus, or meeting link" />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="primary-button">
                <CalendarClock size={18} />
                Schedule Assessment
              </button>
            </div>
          </form>

          <div className="table-wrapper" style={{ marginTop: 14 }}>
            <table className="classic-table">
              <thead>
                <tr><th>Type</th><th>Date</th><th>Mode</th><th>Status</th><th>Outcome</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {inquiryAssessments.length === 0 ? (
                  <tr><td className="empty-table" colSpan="6">No assessments scheduled yet.</td></tr>
                ) : (
                  inquiryAssessments.map((assessment) => (
                    <tr key={assessment.id}>
                      <td>{assessment.assessment_type}</td>
                      <td>{assessment.scheduled_date}{assessment.scheduled_time ? ` ${assessment.scheduled_time}` : ""}</td>
                      <td>{assessment.mode}</td>
                      <td>
                        <span className={["Cancelled", "No Show"].includes(assessment.status) ? "status danger" : "status active"}>
                          {assessment.status}
                        </span>
                      </td>
                      <td>{assessment.outcome}</td>
                      <td>
                        <button type="button" className="delete-button" onClick={() => deleteInquiryAssessment(assessment.id)} title="Remove">
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
          <p className="hint-text" style={{ marginTop: 8 }}>
            Full scoring, panel, and outcome editing is on the Admission Tests page.
          </p>
        </section>

        <section className="form-panel">
          <div className="panel-header">
            <div>
              <h3>Documents</h3>
              <p>ID proofs, report cards, and other files attached to this inquiry.</p>
            </div>
          </div>

          <form className="classic-form" onSubmit={uploadDocument}>
            <div className="form-grid">
              <div className="form-field">
                <label>Document Type</label>
                <select name="document_type" value={documentForm.document_type} onChange={handleDocumentFormChange}>
                  {documentTypeOptions.map((type) => <option key={type} value={type}>{type}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>File *</label>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  onChange={(event) => setDocumentFile(event.target.files?.[0] || null)}
                />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="primary-button" disabled={documentUploading}>
                <Upload size={18} />
                {documentUploading ? "Uploading…" : "Upload"}
              </button>
            </div>
          </form>

          <div className="table-wrapper" style={{ marginTop: 14 }}>
            <table className="classic-table">
              <thead>
                <tr><th>Type</th><th>File</th><th>Uploaded By</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {documents.length === 0 ? (
                  <tr><td className="empty-table" colSpan="4">No documents uploaded yet.</td></tr>
                ) : (
                  documents.map((document) => (
                    <tr key={document.id}>
                      <td>{document.document_type}</td>
                      <td>
                        <a href={resolveFileUrl(document.file_url)} target="_blank" rel="noreferrer">
                          <Paperclip size={13} style={{ verticalAlign: "middle", marginRight: 4 }} />
                          {document.file_name || "View file"}
                        </a>
                      </td>
                      <td>{document.uploaded_by || "-"}</td>
                      <td>
                        <button type="button" className="delete-button" onClick={() => deleteDocument(document.id)} title="Remove">
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
  }

  if (pageMode === "convert" && selectedInquiry) {
    return (
      <div className="management-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Admissions CRM</p>
            <h2>Convert to Student</h2>
            <p>
              {selectedInquiry.inquiry_no} | {selectedInquiry.student_name} |{" "}
              {selectedInquiry.grade_applying}
            </p>
          </div>

          <button
            type="button"
            className="light-button"
            onClick={() => {
              setSelectedInquiry(null);
              setConvertForm(emptyConvertForm);
              setPageMode("list");
            }}
          >
            <ArrowLeft size={17} />
            Back
          </button>
        </section>

        {message && <div className="toast-notification">{message}</div>}

        <section className="form-panel">
          <div className="panel-header">
            <div>
              <h3>Student Admission</h3>
              <p>Create a Student record from this admission inquiry.</p>
            </div>
          </div>

          <form className="classic-form" onSubmit={handleConvertSubmit}>
            <div className="form-grid">
              <div className="form-field">
                <label>Admission No *</label>
                <input
                  name="admission_no"
                  value={convertForm.admission_no}
                  onChange={handleConvertChange}
                  placeholder="ADM2026001"
                  required
                />
              </div>

              <div className="form-field">
                <label>First Name *</label>
                <input
                  name="first_name"
                  value={convertForm.first_name}
                  onChange={handleConvertChange}
                  required
                />
              </div>

              <div className="form-field">
                <label>Last Name</label>
                <input
                  name="last_name"
                  value={convertForm.last_name}
                  onChange={handleConvertChange}
                />
              </div>

              <div className="form-field">
                <label>Class</label>
                <input
                  name="class_name"
                  value={convertForm.class_name}
                  onChange={handleConvertChange}
                />
              </div>

              <div className="form-field">
                <label>Section</label>
                <input
                  name="section"
                  value={convertForm.section}
                  onChange={handleConvertChange}
                />
              </div>

              <div className="form-field">
                <label>Admission Date</label>
                <input
                  type="date"
                  name="admission_date"
                  value={convertForm.admission_date}
                  onChange={handleConvertChange}
                />
              </div>

              <div className="form-field">
                <label>Guardian Name</label>
                <input
                  name="guardian_name"
                  value={convertForm.guardian_name}
                  onChange={handleConvertChange}
                />
              </div>

              <div className="form-field">
                <label>Guardian Phone</label>
                <input
                  name="guardian_phone"
                  value={convertForm.guardian_phone}
                  onChange={handleConvertChange}
                />
              </div>

              <div className="form-field">
                <label>Guardian Email</label>
                <input
                  type="email"
                  name="guardian_email"
                  value={convertForm.guardian_email}
                  onChange={handleConvertChange}
                />
              </div>
            </div>

            <div className="form-actions">
              <button type="submit" className="primary-button">
                <UserPlus size={18} />
                Convert to Student
              </button>
            </div>
          </form>
        </section>
      </div>
    );
  }

  if (pageMode === "pipeline") {
    const grouped = {};
    stageOptions.forEach((stageName) => { grouped[stageName] = []; });
    inquiries.forEach((inquiry) => {
      const key = inquiry.stage || "Inquiry";
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(inquiry);
    });
    const today = todayLocalDate();

    const assessmentsByInquiry = {};
    assessments.forEach((assessment) => {
      const existing = assessmentsByInquiry[assessment.inquiry_id];
      if (!existing || assessment.scheduled_date > existing.scheduled_date) {
        assessmentsByInquiry[assessment.inquiry_id] = assessment;
      }
    });

    return (
      <div className="management-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Admissions</p>
            <h2>Pipeline</h2>
            <p>Drag a card to a new stage, or use its stage picker.</p>
          </div>
        </section>

        <ViewTabs pageMode={pageMode} setPageMode={setPageMode} />

        {message && <div className="toast-notification">{message}</div>}

        <div className="admissions-pipeline-board">
          {stageOptions.map((stageName) => (
            <div
              key={stageName}
              className="admissions-pipeline-column"
              onDragOver={handleColumnDragOver}
              onDrop={(event) => handleColumnDrop(event, stageName)}
            >
              <div className="admissions-pipeline-column-header">
                <span>{stageName}</span>
                <span className="admissions-pipeline-count">{(grouped[stageName] || []).length}</span>
              </div>
              <div className="admissions-pipeline-cards">
                {(grouped[stageName] || []).map((inquiry) => {
                  const overdue = inquiry.follow_up_date && inquiry.follow_up_date < today;
                  const taskInfo = pipelineTasks[inquiry.id];
                  const assessment = assessmentsByInquiry[inquiry.id];
                  return (
                    <div
                      key={inquiry.id}
                      className="admissions-pipeline-card"
                      draggable
                      onDragStart={(event) => handleCardDragStart(event, inquiry)}
                      onDragEnd={handleCardDragEnd}
                      onClick={() => openFollowUps(inquiry)}
                      style={draggedInquiryId === inquiry.id ? { opacity: 0.5 } : undefined}
                    >
                      <strong>{inquiry.student_name}</strong>
                      <div className="hint-text">{inquiry.grade_applying} · {inquiry.guardian_name}</div>
                      {(inquiry.assigned_to_user_id || inquiry.assigned_to) && (
                        <div className="hint-text">
                          Owner: {userName(inquiry.assigned_to_user_id) || inquiry.assigned_to}
                        </div>
                      )}
                      {inquiry.follow_up_date && (
                        <div className={overdue ? "status danger" : "status pending"} style={{ marginTop: 4 }}>
                          <Clock size={12} style={{ verticalAlign: "middle", marginRight: 3 }} />
                          Follow up {inquiry.follow_up_date}
                        </div>
                      )}
                      {taskInfo && taskInfo.count > 0 && (
                        <div className="status pending" style={{ marginTop: 4 }}>
                          <ListChecks size={12} style={{ verticalAlign: "middle", marginRight: 3 }} />
                          {taskInfo.count} open task{taskInfo.count > 1 ? "s" : ""}
                          {taskInfo.earliestDue ? ` · due ${taskInfo.earliestDue}` : ""}
                        </div>
                      )}
                      {assessment && (
                        <div
                          className={["Cancelled", "No Show"].includes(assessment.status) ? "status danger" : "status active"}
                          style={{ marginTop: 4 }}
                        >
                          <ClipboardCheck size={12} style={{ verticalAlign: "middle", marginRight: 3 }} />
                          {assessment.assessment_type}: {assessment.scheduled_date} ({assessment.status})
                        </div>
                      )}
                      {inquiry.possible_duplicate_of_id && (
                        <div className="status warning" style={{ marginTop: 4 }}>
                          <AlertTriangle size={12} style={{ verticalAlign: "middle", marginRight: 3 }} />
                          Possible duplicate
                        </div>
                      )}
                      <select
                        value={inquiry.stage}
                        onClick={(event) => event.stopPropagation()}
                        onChange={(event) => moveInquiryStage(inquiry, event.target.value)}
                        style={{ marginTop: 8, width: "100%" }}
                      >
                        {stageOptions.map((option) => (
                          <option key={option} value={option}>{option}</option>
                        ))}
                      </select>
                    </div>
                  );
                })}
                {!(grouped[stageName] || []).length && (
                  <p className="hint-text" style={{ padding: 8 }}>Empty</p>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (pageMode === "queue") {
    const today = todayLocalDate();
    const dueFollowUps = inquiries.filter(
      (inquiry) =>
        inquiry.follow_up_date &&
        inquiry.follow_up_date <= today &&
        !inquiry.converted_student_id &&
        !CLOSED_STAGES.includes(inquiry.stage)
    );

    return (
      <div className="management-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Admissions</p>
            <h2>My Queue</h2>
            <p>Everything due today or overdue, across every inquiry.</p>
          </div>
        </section>

        <ViewTabs pageMode={pageMode} setPageMode={setPageMode} />

        {message && <div className="toast-notification">{message}</div>}

        <section className="table-panel">
          <div className="panel-header">
            <div><h3>Filter</h3></div>
            <div className="form-field" style={{ marginBottom: 0 }}>
              <label>Assignee</label>
              <select value={queueAssigneeFilter} onChange={(event) => setQueueAssigneeFilter(event.target.value)}>
                <option value="">Everyone</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>{user.name}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        <section className="table-panel">
          <div className="panel-header">
            <div><h3>Follow-ups Due</h3><p>{dueFollowUps.length} inquirie(s)</p></div>
          </div>
          <div className="table-wrapper">
            <table className="classic-table">
              <thead>
                <tr><th>Student</th><th>Stage</th><th>Guardian</th><th>Due</th><th>Owner</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {dueFollowUps.length === 0 ? (
                  <tr><td className="empty-table" colSpan="6">Nothing due.</td></tr>
                ) : (
                  dueFollowUps.map((inquiry) => (
                    <tr key={inquiry.id}>
                      <td>{inquiry.student_name}</td>
                      <td>{inquiry.stage}</td>
                      <td>{inquiry.guardian_name}</td>
                      <td>
                        <span className={inquiry.follow_up_date < today ? "status danger" : "status pending"}>
                          {inquiry.follow_up_date}
                        </span>
                      </td>
                      <td>{inquiry.assigned_to || "-"}</td>
                      <td>
                        <button type="button" className="edit-button" onClick={() => openFollowUps(inquiry)} title="Open">
                          <MessageCircle size={15} />
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="table-panel">
          <div className="panel-header">
            <div><h3>Tasks Due</h3><p>{queueTasks.length} task(s)</p></div>
          </div>
          <div className="table-wrapper">
            <table className="classic-table">
              <thead>
                <tr><th></th><th>Task</th><th>Inquiry</th><th>Due</th><th>Assigned To</th></tr>
              </thead>
              <tbody>
                {queueLoading && <tr><td colSpan="5">Loading...</td></tr>}
                {!queueLoading && queueTasks.length === 0 && (
                  <tr><td className="empty-table" colSpan="5">Nothing due.</td></tr>
                )}
                {!queueLoading && queueTasks.map((task) => (
                  <tr key={task.id}>
                    <td>
                      <input type="checkbox" onChange={() => completeQueueTask(task)} title="Mark done" />
                    </td>
                    <td>{task.title}</td>
                    <td>{task.student_name} ({task.inquiry_no})</td>
                    <td>
                      <span className={task.due_date && task.due_date < today ? "status danger" : "status pending"}>
                        {task.due_date || "-"}
                      </span>
                    </td>
                    <td>{task.assigned_to_user_name || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
  }

  if (pageMode === "analytics") {
    return (
      <div className="management-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Admissions</p>
            <h2>Analytics</h2>
            <p>Funnel shape, stage conversion, and where enrolled students actually came from.</p>
          </div>
        </section>

        <ViewTabs pageMode={pageMode} setPageMode={setPageMode} />

        {message && <div className="toast-notification">{message}</div>}

        <section className="table-panel">
          <div className="panel-header">
            <div><h3>Academic Year</h3></div>
            <div className="form-field" style={{ marginBottom: 0 }}>
              <select value={analyticsYear} onChange={(event) => setAnalyticsYear(event.target.value)}>
                <option value="">All Years</option>
                {academicYears.map((year) => (
                  <option key={year.id} value={year.name}>{year.name}</option>
                ))}
              </select>
            </div>
          </div>
        </section>

        {analyticsLoading && <p style={{ padding: 16 }}>Loading...</p>}

        {!analyticsLoading && funnel && (
          <>
            <section className="summary-strip report-summary-grid">
              <div className="summary-card">
                <ClipboardList size={22} />
                <div><span>Total Inquiries</span><strong>{funnel.total_inquiries}</strong></div>
              </div>
              <div className="summary-card">
                <CheckCircle size={22} />
                <div><span>Converted</span><strong>{funnel.converted}</strong></div>
              </div>
              <div className="summary-card">
                <Percent size={22} />
                <div>
                  <span>Overall Conversion</span>
                  <strong>{funnel.overall_conversion_rate != null ? `${funnel.overall_conversion_rate}%` : "-"}</strong>
                </div>
              </div>
            </section>

            <section className="table-panel">
              <div className="panel-header">
                <div>
                  <h3>Funnel</h3>
                  <p>How many inquiries have ever reached each stage, and how long they typically stay.</p>
                </div>
              </div>
              <div className="table-wrapper">
                <table className="classic-table">
                  <thead>
                    <tr>
                      <th>Stage</th><th>Currently Here</th><th>Ever Reached</th>
                      <th>Conversion From Previous</th><th>Avg Days In Stage</th>
                    </tr>
                  </thead>
                  <tbody>
                    {funnel.stages.map((stageRow) => (
                      <tr key={stageRow.stage}>
                        <td>{stageRow.stage}{stageRow.is_terminal ? " (terminal)" : ""}</td>
                        <td>{stageRow.current_count}</td>
                        <td>{stageRow.ever_reached}</td>
                        <td>{stageRow.conversion_from_previous != null ? `${stageRow.conversion_from_previous}%` : "-"}</td>
                        <td>{stageRow.avg_days_in_stage != null ? `${stageRow.avg_days_in_stage}d` : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}

        {!analyticsLoading && (
          <section className="table-panel">
            <div className="panel-header">
              <div><h3>Sources</h3><p>Which lead source actually converts.</p></div>
            </div>
            <div className="table-wrapper">
              <table className="classic-table">
                <thead>
                  <tr><th>Source</th><th>Inquiries</th><th>Converted</th><th>Conversion Rate</th></tr>
                </thead>
                <tbody>
                  {sources.length === 0 ? (
                    <tr><td className="empty-table" colSpan="4">No data yet.</td></tr>
                  ) : (
                    sources.map((sourceRow) => (
                      <tr key={sourceRow.source}>
                        <td>{sourceRow.source}</td>
                        <td>{sourceRow.inquiries}</td>
                        <td>{sourceRow.converted}</td>
                        <td>{sourceRow.conversion_rate != null ? `${sourceRow.conversion_rate}%` : "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    );
  }

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Admissions</p>
          <h2>Admissions CRM</h2>
          <p>Manage admission inquiries, follow-ups, and application stages.</p>
        </div>

        <div className="module-header-actions">
          <button
            type="button"
            className="secondary-button"
            onClick={copyApplyLink}
            title={applyLink}
          >
            <Copy size={17} />
            Copy Apply Link
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => setShowStageManager((prev) => !prev)}
          >
            <Settings size={17} />
            Manage Stages
          </button>
          <button type="button" className="secondary-button" onClick={() => setShowBulkImport(true)}>
            <Upload size={17} />
            Import CSV
          </button>
          <button type="button" className="primary-button" onClick={handleAddInquiry}>
            <UserPlus size={18} />
            Add Inquiry
          </button>
        </div>
      </section>

      {showBulkImport && (
        <BulkImportModal
          title="Bulk Import Admission Inquiries"
          description="Upload a CSV file to add multiple inquiries to the pipeline at once."
          templateUrl="/admissions/bulk-import-template"
          templateFilename="admission_inquiries_import_template.csv"
          importUrl="/admissions/bulk-import"
          onClose={() => setShowBulkImport(false)}
          onImported={loadInquiries}
        />
      )}

      {admissionRemindersEnabled && reminderPreview && reminderPreview.unreachable_count > 0 && (
        <div className="toast-notification" style={{ background: "var(--warning-100)", color: "var(--warning-700)" }}>
          <AlertTriangle size={16} style={{ verticalAlign: "middle", marginRight: 6 }} />
          {reminderPreview.unreachable_count} due task/follow-up{reminderPreview.unreachable_count > 1 ? "s have" : " has"} no
          linked staff account and won't receive a reminder.
        </div>
      )}

      <ViewTabs pageMode={pageMode} setPageMode={setPageMode} />

      {showStageManager && (
        <section className="table-panel stage-manager-panel">
          <div className="panel-header">
            <div>
              <h3>Admission Workflow Stages</h3>
              <p>Configure the stages inquiries move through. Renaming a stage updates all inquiries currently in it.</p>
            </div>
          </div>
          <div className="stage-manager-list">
            {stages.map((stage, index) => (
              <div key={stage.id}>
                <div
                  className={
                    stage.is_terminal
                      ? "stage-manager-row stage-manager-row-terminal"
                      : "stage-manager-row"
                  }
                >
                  <div className="stage-manager-node">
                    {stage.is_terminal ? <CheckCircle size={16} /> : index + 1}
                    {index < stages.length - 1 && <span className="stage-manager-connector" />}
                  </div>
                  <input
                    type="text"
                    value={stageEdits[stage.id] ?? stage.name}
                    onChange={(event) =>
                      setStageEdits((current) => ({ ...current, [stage.id]: event.target.value }))
                    }
                    onBlur={() => renameStage(stage)}
                  />
                  <div className="stage-manager-actions">
                    <button
                      type="button"
                      className="light-icon-button"
                      title="Default tasks for this stage"
                      onClick={() => toggleStageTemplates(stage)}
                    >
                      <ListChecks size={15} />
                    </button>
                    <button
                      type="button"
                      className="light-icon-button"
                      disabled={index === 0}
                      title="Move up"
                      onClick={() => moveStage(index, -1)}
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      type="button"
                      className="light-icon-button"
                      disabled={index === stages.length - 1}
                      title="Move down"
                      onClick={() => moveStage(index, 1)}
                    >
                      <ArrowDown size={14} />
                    </button>
                    <button
                      type="button"
                      className="light-icon-button stage-manager-delete"
                      title="Delete stage"
                      onClick={() => deleteStage(stage)}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                {expandedStageId === stage.id && (
                  <div style={{ padding: "10px 14px 16px 46px" }}>
                    <p className="hint-text" style={{ margin: "0 0 8px" }}>
                      Every inquiry that enters "{stage.name}" gets these tasks automatically.
                    </p>
                    {(stageTemplates[stage.id] || []).map((template) => (
                      <div
                        key={template.id}
                        style={{ display: "flex", alignItems: "center", gap: 10, padding: "4px 0" }}
                      >
                        <ListChecks size={14} />
                        <span style={{ flex: 1 }}>
                          {template.title} <span className="hint-text">— due {template.due_in_days}d after</span>
                        </span>
                        <button
                          type="button"
                          className="light-icon-button"
                          title="Remove"
                          onClick={() => deleteStageTemplate(stage.id, template.id)}
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ))}
                    {!(stageTemplates[stage.id] || []).length && (
                      <p className="hint-text">No default tasks configured yet.</p>
                    )}
                    <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                      <input
                        type="text"
                        placeholder="Task title"
                        value={templateForm.title}
                        onChange={(event) =>
                          setTemplateForm((current) => ({ ...current, title: event.target.value }))
                        }
                        style={{ flex: 1 }}
                      />
                      <input
                        type="number"
                        min="0"
                        title="Due N days after entering this stage"
                        value={templateForm.due_in_days}
                        onChange={(event) =>
                          setTemplateForm((current) => ({ ...current, due_in_days: event.target.value }))
                        }
                        style={{ width: 70 }}
                      />
                      <button type="button" className="light-button" onClick={() => addStageTemplate(stage)}>
                        <PlusCircle size={15} />
                        Add
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <div className="stage-manager-add">
            <input
              type="text"
              placeholder="New stage name"
              value={newStageName}
              onChange={(event) => setNewStageName(event.target.value)}
            />
            <button type="button" className="secondary-button" onClick={addStage}>
              <PlusCircle size={16} />
              Add Stage
            </button>
          </div>
        </section>
      )}

      <section className="summary-strip report-summary-grid">
        <div className="summary-card">
          <ClipboardList size={22} />
          <div>
            <span>Total Inquiries</span>
            <strong>{inquiries.length}</strong>
          </div>
        </div>
        <div className="summary-card">
          <UserPlus size={22} />
          <div>
            <span>Active Pipeline</span>
            <strong>{activePipelineCount}</strong>
          </div>
        </div>
        <div className="summary-card">
          <CheckCircle size={22} />
          <div>
            <span>Admitted</span>
            <strong>{admittedCount}</strong>
          </div>
        </div>
        <div className="summary-card warning">
          <ClipboardList size={22} />
          <div>
            <span>Follow Ups</span>
            <strong>{followUpCount}</strong>
          </div>
        </div>
      </section>

      {message && <div className="toast-notification">{message}</div>}

      <section className="table-panel module-filter-panel">
        <div className="filter-row sis-filter-row">
          <div className="form-field">
            <label>Stage</label>
            <select value={stageFilter} onChange={(event) => setStageFilter(event.target.value)}>
              <option value="">All Stages</option>
              {stageOptions.map((stage) => (
                <option key={stage} value={stage}>
                  {stage}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            className="light-button"
            onClick={() => {
              setSearchText("");
              setStageFilter("");
            }}
          >
            Clear Filters
          </button>
        </div>
      </section>

      <EnhancedRecordsTable
        data={filteredInquiries}
        emptyText="No admission inquiries found."
        loading={loading}
        loadingText="Loading admission inquiries..."
        searchPlaceholder="Search student, grade, guardian, phone..."
        searchText={searchText}
        setSearchText={setSearchText}
        columns={[
          { key: "inquiry_no", label: "Inquiry No", render: (inquiry) => inquiry.inquiry_no || "-" },
          { key: "student_name", label: "Student", render: (inquiry) => inquiry.student_name || "-" },
          { key: "grade_applying", label: "Grade", render: (inquiry) => inquiry.grade_applying || "-" },
          { key: "academic_year", label: "Year", render: (inquiry) => inquiry.academic_year || "-" },
          { key: "guardian_name", label: "Guardian", render: (inquiry) => inquiry.guardian_name || "-" },
          { key: "guardian_phone", label: "Phone", render: (inquiry) => inquiry.guardian_phone || "-" },
          { key: "source", label: "Source", render: (inquiry) => inquiry.source || "-" },
          {
            key: "stage",
            label: "Stage",
            render: (inquiry) => <span className="status active">{inquiry.stage || "Inquiry"}</span>,
            value: (inquiry) => inquiry.stage || "Inquiry",
          },
          { key: "follow_up_date", label: "Follow Up", render: (inquiry) => inquiry.follow_up_date || "-" },
          { key: "assigned_to", label: "Owner", render: (inquiry) => inquiry.assigned_to || "-" },
          {
            key: "converted",
            label: "Converted",
            render: (inquiry) =>
              inquiry.converted_student_id ? (
                <span className="status active">Yes</span>
              ) : (
                <span className="status">No</span>
              ),
            value: (inquiry) => (inquiry.converted_student_id ? "Yes" : "No"),
          },
          {
            key: "actions",
            label: "Actions",
            hideable: false,
            actions: false,
            render: (inquiry) => (
              <div className="action-buttons">
                <button
                  type="button"
                  className="edit-button"
                  onClick={() => openFollowUps(inquiry)}
                  title="Follow Ups"
                >
                  <MessageCircle size={15} />
                </button>
                {!inquiry.converted_student_id && (
                  <button
                    type="button"
                    className="edit-button"
                    onClick={() => openConvertInquiry(inquiry)}
                    title="Convert"
                  >
                    <UserPlus size={15} />
                  </button>
                )}
                <button type="button" className="edit-button" onClick={() => handleEdit(inquiry)} title="Edit">
                  <Edit size={15} />
                </button>
                <button
                  type="button"
                  className="delete-button"
                  onClick={() => handleDelete(inquiry.id)}
                  title="Delete"
                >
                  <Trash2 size={15} />
                </button>
              </div>
            ),
            value: () => "",
          },
        ]}
      />
    </div>
  );
}
