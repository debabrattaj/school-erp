import { useEffect, useMemo, useState } from "react";
import {
  Layers,
  NotebookPen,
  TrendingDown,
  Percent,
  PlusCircle,
  Plus,
  Trash2,
  Edit,
  Check,
  X,
  Undo2,
  Copy,
  Send,
  Ban,
  ChevronDown,
  ChevronRight,
  CheckCircle2,
  Circle,
  PlayCircle,
} from "lucide-react";

import API from "../api";
import { hasAccess } from "../auth";
import { todayLocalDate } from "../utils/date";

const REVIEWER_ROLES = ["Admin", "Principal"];

const emptyUnitForm = {
  title: "",
  sequence_no: "",
  description: "",
  planned_periods: "",
  planned_start: "",
  planned_end: "",
};

const emptyTopicForm = {
  title: "",
  sequence_no: "",
  description: "",
  planned_periods: 1,
};

const emptyPlanForm = {
  plan_date: "",
  title: "",
  teacher_id: "",
  topic_id: "",
  period_no: "",
  objectives: "",
  teaching_method: "",
  resources: "",
  homework: "",
};

function getApiErrorMessage(error, fallbackMessage) {
  const detail = error.response?.data?.detail;

  if (Array.isArray(detail)) return detail.map((item) => item.msg).join(" | ");
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object") return detail.msg || JSON.stringify(detail);

  return fallbackMessage;
}

function unitStatusClass(status) {
  if (status === "Completed") return "status active";
  if (status === "In Progress") return "status warning";
  return "status pending"; // Pending
}

function topicStatusIcon(status) {
  if (status === "Completed") return <CheckCircle2 size={15} />;
  if (status === "In Progress") return <PlayCircle size={15} />;
  return <Circle size={15} />;
}

function planStatusClass(status) {
  if (status === "Delivered") return "status active";
  if (status === "Deferred") return "status warning";
  if (status === "Cancelled") return "status danger";
  return "status pending"; // Planned
}

function reviewStatusClass(status) {
  if (status === "Approved") return "status active";
  if (status === "Changes Requested") return "status danger";
  return "status pending"; // Pending
}

export default function Syllabus() {
  const canReview = hasAccess(REVIEWER_ROLES, "manage");

  const [classes, setClasses] = useState([]);
  const [classSubjects, setClassSubjects] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState("");
  const [selectedClassSubjectId, setSelectedClassSubjectId] = useState("");

  const [activeTab, setActiveTab] = useState("units");
  const [message, setMessage] = useState("");
  const [behindCount, setBehindCount] = useState(0);

  const [units, setUnits] = useState([]);
  const [unitsLoading, setUnitsLoading] = useState(false);
  const [unitForm, setUnitForm] = useState(emptyUnitForm);
  const [editingUnitId, setEditingUnitId] = useState(null);
  const [expandedUnitIds, setExpandedUnitIds] = useState(new Set());
  const [topicForms, setTopicForms] = useState({});
  const [completeDrawer, setCompleteDrawer] = useState(null);

  const [showClone, setShowClone] = useState(false);
  const [cloneClassId, setCloneClassId] = useState("");
  const [cloneClassSubjects, setCloneClassSubjects] = useState([]);
  const [cloneClassSubjectId, setCloneClassSubjectId] = useState("");

  const [plans, setPlans] = useState([]);
  const [plansLoading, setPlansLoading] = useState(false);
  const [planForm, setPlanForm] = useState(emptyPlanForm);
  const [planStatusFilter, setPlanStatusFilter] = useState("");
  const [deliverDrawer, setDeliverDrawer] = useState(null);

  const [coverage, setCoverage] = useState(null);
  const [coverageLoading, setCoverageLoading] = useState(false);
  const [coverageAsOf, setCoverageAsOf] = useState(todayLocalDate());

  const [behind, setBehind] = useState([]);
  const [behindLoading, setBehindLoading] = useState(false);
  const [behindYear, setBehindYear] = useState("");
  const [behindAsOf, setBehindAsOf] = useState(todayLocalDate());

  useEffect(() => {
    if (!message) return undefined;
    const timeoutId = window.setTimeout(() => setMessage(""), 2500);
    return () => window.clearTimeout(timeoutId);
  }, [message]);

  useEffect(() => {
    async function loadBase() {
      try {
        const [classResponse, teacherResponse, behindResponse] = await Promise.all([
          API.get("/classes/"),
          API.get("/teachers/"),
          API.get("/syllabus/behind"),
        ]);
        setClasses(classResponse.data || []);
        setTeachers(teacherResponse.data || []);
        setBehindCount((behindResponse.data || []).length);
      } catch (error) {
        console.error(error);
        setMessage(getApiErrorMessage(error, "Unable to load classes and staff."));
      }
    }
    loadBase();
  }, []);

  useEffect(() => {
    setSelectedClassSubjectId("");
    if (!selectedClassId) {
      setClassSubjects([]);
      return;
    }
    async function loadSubjects() {
      try {
        const response = await API.get("/class-subjects/", {
          params: { class_id: selectedClassId, active_only: true },
        });
        setClassSubjects(response.data || []);
      } catch (error) {
        console.error(error);
        setMessage(getApiErrorMessage(error, "Unable to load subjects for this class."));
      }
    }
    loadSubjects();
  }, [selectedClassId]);

  async function loadUnits() {
    if (!selectedClassSubjectId) return;
    try {
      setUnitsLoading(true);
      const response = await API.get("/syllabus/units", {
        params: { class_subject_id: selectedClassSubjectId },
      });
      setUnits(response.data || []);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load syllabus units."));
    } finally {
      setUnitsLoading(false);
    }
  }

  useEffect(() => {
    setUnits([]);
    setPlans([]);
    setCoverage(null);
    resetUnitForm();
    if (selectedClassSubjectId) {
      loadUnits();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedClassSubjectId]);

  async function loadPlans() {
    if (!selectedClassSubjectId) return;
    try {
      setPlansLoading(true);
      const response = await API.get("/syllabus/lesson-plans", {
        params: {
          class_subject_id: selectedClassSubjectId,
          status: planStatusFilter || undefined,
        },
      });
      setPlans(response.data || []);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load lesson plans."));
    } finally {
      setPlansLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab !== "plans" || !selectedClassSubjectId) return;
    loadPlans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, selectedClassSubjectId, planStatusFilter]);

  async function loadCoverage() {
    if (!selectedClassSubjectId) return;
    try {
      setCoverageLoading(true);
      const response = await API.get("/syllabus/coverage", {
        params: { class_subject_id: selectedClassSubjectId, as_of: coverageAsOf || undefined },
      });
      setCoverage(response.data);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load coverage."));
    } finally {
      setCoverageLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab !== "coverage" || !selectedClassSubjectId) return;
    loadCoverage();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, selectedClassSubjectId, coverageAsOf]);

  async function loadBehind() {
    try {
      setBehindLoading(true);
      const response = await API.get("/syllabus/behind", {
        params: { academic_year: behindYear || undefined, as_of: behindAsOf || undefined },
      });
      setBehind(response.data || []);
      setBehindCount((response.data || []).length);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load the behind-schedule report."));
    } finally {
      setBehindLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab !== "behind") return;
    loadBehind();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab, behindYear, behindAsOf]);

  function handleUnitFormChange(e) {
    const { name, value } = e.target;
    setUnitForm((prev) => ({ ...prev, [name]: value }));
  }

  function resetUnitForm() {
    setUnitForm(emptyUnitForm);
    setEditingUnitId(null);
  }

  async function submitUnit(e) {
    e.preventDefault();
    setMessage("");

    if (!unitForm.title.trim()) {
      setMessage("A unit title is required.");
      return;
    }

    const payload = {
      title: unitForm.title.trim(),
      sequence_no: unitForm.sequence_no ? Number(unitForm.sequence_no) : null,
      description: unitForm.description || null,
      planned_periods: unitForm.planned_periods ? Number(unitForm.planned_periods) : null,
      planned_start: unitForm.planned_start || null,
      planned_end: unitForm.planned_end || null,
    };

    try {
      if (editingUnitId) {
        await API.put(`/syllabus/units/${editingUnitId}`, payload);
        setMessage("Unit updated.");
      } else {
        await API.post("/syllabus/units", {
          ...payload,
          class_subject_id: Number(selectedClassSubjectId),
        });
        setMessage("Unit added.");
      }
      resetUnitForm();
      await loadUnits();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to save unit."));
    }
  }

  function editUnit(unit) {
    setEditingUnitId(unit.id);
    setUnitForm({
      title: unit.title || "",
      sequence_no: unit.sequence_no ?? "",
      description: unit.description || "",
      planned_periods: unit.planned_periods ?? "",
      planned_start: unit.planned_start || "",
      planned_end: unit.planned_end || "",
    });
  }

  async function deleteUnit(unit) {
    const confirmDelete = window.confirm(`Delete unit "${unit.title}"? This cannot be undone.`);
    if (!confirmDelete) return;

    try {
      await API.delete(`/syllabus/units/${unit.id}`);
      setMessage("Unit deleted.");
      await loadUnits();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to delete unit."));
    }
  }

  function toggleUnit(unitId) {
    setExpandedUnitIds((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) next.delete(unitId);
      else next.add(unitId);
      return next;
    });
  }

  function handleTopicFormChange(unitId, e) {
    const { name, value } = e.target;
    setTopicForms((prev) => ({
      ...prev,
      [unitId]: { ...(prev[unitId] || emptyTopicForm), [name]: value },
    }));
  }

  async function submitTopic(unitId, e) {
    e.preventDefault();
    setMessage("");
    const form = topicForms[unitId] || emptyTopicForm;

    if (!form.title || !form.title.trim()) {
      setMessage("A topic title is required.");
      return;
    }

    const payload = {
      title: form.title.trim(),
      sequence_no: form.sequence_no ? Number(form.sequence_no) : null,
      description: form.description || null,
      planned_periods: Number(form.planned_periods || 1),
    };

    try {
      await API.post(`/syllabus/units/${unitId}/topics`, payload);
      setMessage("Topic added.");
      setTopicForms((prev) => ({ ...prev, [unitId]: emptyTopicForm }));
      setExpandedUnitIds((prev) => new Set(prev).add(unitId));
      await loadUnits();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to add topic."));
    }
  }

  async function markTopicStatus(topic, status) {
    try {
      await API.post(`/syllabus/topics/${topic.id}/mark`, { status });
      setMessage(`Topic marked ${status}.`);
      await loadUnits();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to update topic."));
    }
  }

  function openCompleteDrawer(topic) {
    setCompleteDrawer({
      topic,
      on_date: todayLocalDate(),
      periods_taken: topic.planned_periods || "",
      notes: topic.notes || "",
    });
  }

  async function submitComplete(e) {
    e.preventDefault();
    if (!completeDrawer) return;

    try {
      await API.post(`/syllabus/topics/${completeDrawer.topic.id}/mark`, {
        status: "Completed",
        on_date: completeDrawer.on_date || undefined,
        periods_taken: completeDrawer.periods_taken ? Number(completeDrawer.periods_taken) : undefined,
        notes: completeDrawer.notes || undefined,
      });
      setMessage("Topic marked completed.");
      setCompleteDrawer(null);
      await loadUnits();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to mark topic completed."));
    }
  }

  async function deleteTopic(topic) {
    const confirmDelete = window.confirm(`Delete topic "${topic.title}"?`);
    if (!confirmDelete) return;

    try {
      await API.delete(`/syllabus/topics/${topic.id}`);
      setMessage("Topic deleted.");
      await loadUnits();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to delete topic."));
    }
  }

  useEffect(() => {
    setCloneClassSubjectId("");
    if (!cloneClassId) {
      setCloneClassSubjects([]);
      return;
    }
    async function loadCloneSubjects() {
      try {
        const response = await API.get("/class-subjects/", {
          params: { class_id: cloneClassId, active_only: true },
        });
        setCloneClassSubjects(response.data || []);
      } catch (error) {
        console.error(error);
      }
    }
    loadCloneSubjects();
  }, [cloneClassId]);

  async function submitClone(e) {
    e.preventDefault();
    setMessage("");

    if (!cloneClassSubjectId) {
      setMessage("Select a source class and subject.");
      return;
    }

    try {
      const response = await API.post("/syllabus/clone", {
        source_class_subject_id: Number(cloneClassSubjectId),
        target_class_subject_id: Number(selectedClassSubjectId),
      });
      setMessage(`Copied ${response.data.units_copied} unit(s).`);
      setShowClone(false);
      setCloneClassId("");
      await loadUnits();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to clone syllabus."));
    }
  }

  function handlePlanFormChange(e) {
    const { name, value } = e.target;
    setPlanForm((prev) => ({ ...prev, [name]: value }));
  }

  async function submitPlan(e) {
    e.preventDefault();
    setMessage("");

    if (!planForm.plan_date || !planForm.title.trim()) {
      setMessage("A date and title are required.");
      return;
    }

    const payload = {
      class_subject_id: Number(selectedClassSubjectId),
      plan_date: planForm.plan_date,
      title: planForm.title.trim(),
      teacher_id: planForm.teacher_id ? Number(planForm.teacher_id) : null,
      topic_id: planForm.topic_id ? Number(planForm.topic_id) : null,
      period_no: planForm.period_no ? Number(planForm.period_no) : null,
      objectives: planForm.objectives || null,
      teaching_method: planForm.teaching_method || null,
      resources: planForm.resources || null,
      homework: planForm.homework || null,
    };

    try {
      await API.post("/syllabus/lesson-plans", payload);
      setMessage("Lesson plan created.");
      setPlanForm(emptyPlanForm);
      await loadPlans();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to create lesson plan."));
    }
  }

  function openDeliverDrawer(plan) {
    setDeliverDrawer({ plan, note: "", complete_topic: false, periods_taken: "" });
  }

  async function submitDeliver(e) {
    e.preventDefault();
    if (!deliverDrawer) return;

    try {
      await API.post(`/syllabus/lesson-plans/${deliverDrawer.plan.id}/deliver`, {
        note: deliverDrawer.note || undefined,
        complete_topic: Boolean(deliverDrawer.complete_topic),
        periods_taken: deliverDrawer.periods_taken ? Number(deliverDrawer.periods_taken) : undefined,
      });
      setMessage("Lesson marked delivered.");
      setDeliverDrawer(null);
      await loadPlans();
      if (activeTab === "units" || deliverDrawer.complete_topic) {
        await loadUnits();
      }
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to mark lesson delivered."));
    }
  }

  async function deferPlan(plan) {
    const note = window.prompt("Why was this lesson deferred?") || undefined;
    try {
      await API.post(`/syllabus/lesson-plans/${plan.id}/defer`, { note });
      setMessage("Lesson deferred.");
      await loadPlans();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to defer lesson."));
    }
  }

  async function reviewPlan(plan, review_status) {
    const note = window.prompt(`Note for "${review_status}" (optional):`) || undefined;
    try {
      await API.post(`/syllabus/lesson-plans/${plan.id}/review`, { review_status, note });
      setMessage(`Lesson plan marked ${review_status}.`);
      await loadPlans();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to review lesson plan."));
    }
  }

  async function deletePlan(plan) {
    const confirmDelete = window.confirm(`Delete the lesson plan "${plan.title}"?`);
    if (!confirmDelete) return;

    try {
      await API.delete(`/syllabus/lesson-plans/${plan.id}`);
      setMessage("Lesson plan deleted.");
      await loadPlans();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to delete lesson plan."));
    }
  }

  const allTopics = useMemo(
    () => units.flatMap((u) => u.topics.map((t) => ({ ...t, unit_title: u.title }))),
    [units]
  );

  const selectedMapping = classSubjects.find((cs) => String(cs.id) === String(selectedClassSubjectId));

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Academics</p>
          <h2>Syllabus & Lesson Plans</h2>
          <p>Track syllabus coverage unit by unit, and plan, deliver and review lessons.</p>
        </div>
      </section>

      <section className="summary-strip report-summary-grid">
        <div className="summary-card">
          <Layers size={22} />
          <div>
            <span>Units</span>
            <strong>{units.length}</strong>
          </div>
        </div>
        <div className="summary-card">
          <CheckCircle2 size={22} />
          <div>
            <span>Topics Completed</span>
            <strong>{allTopics.filter((t) => t.status === "Completed").length} / {allTopics.length}</strong>
          </div>
        </div>
        <div className="summary-card">
          <NotebookPen size={22} />
          <div>
            <span>Lesson Plans</span>
            <strong>{plans.length}</strong>
          </div>
        </div>
        <div className="summary-card negative">
          <TrendingDown size={22} />
          <div>
            <span>Classes Behind (school-wide)</span>
            <strong>{behindCount}</strong>
          </div>
        </div>
      </section>

      {message && <div className="toast-notification">{message}</div>}

      <section className="form-panel">
        <PanelTitle title="Class & Subject" text="Choose a class and subject to work on its syllabus." />
        <div className="form-grid">
          <div className="form-field">
            <label>Class *</label>
            <select value={selectedClassId} onChange={(e) => setSelectedClassId(e.target.value)}>
              <option value="">Select Class</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.class_name} - {c.section}</option>
              ))}
            </select>
          </div>
          <div className="form-field">
            <label>Subject *</label>
            <select
              value={selectedClassSubjectId}
              onChange={(e) => setSelectedClassSubjectId(e.target.value)}
              disabled={!selectedClassId}
            >
              <option value="">Select Subject</option>
              {classSubjects.map((cs) => (
                <option key={cs.id} value={cs.id}>{cs.subject_name} | {cs.academic_year}</option>
              ))}
            </select>
          </div>
        </div>
      </section>

      <section className="table-panel">
        <div className="student-profile-tabs">
          {[
            ["units", "Syllabus"],
            ["plans", "Lesson Plans"],
            ["coverage", "Coverage"],
            ["behind", "Behind Schedule"],
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

      {activeTab !== "behind" && !selectedClassSubjectId && (
        <section className="table-panel">
          <p style={{ padding: 20 }}>Select a class and subject above to continue.</p>
        </section>
      )}

      {activeTab === "units" && selectedClassSubjectId && (
        <>
          <section className="form-panel">
            <PanelTitle
              title={editingUnitId ? "Edit Unit" : "Add Unit"}
              text="Break the syllabus into teaching units."
              actions={
                !editingUnitId && (
                  <button type="button" className="secondary-button" onClick={() => setShowClone((v) => !v)}>
                    <Copy size={17} />
                    Clone From Another Class
                  </button>
                )
              }
            />

            {showClone && (
              <form className="classic-form" onSubmit={submitClone} style={{ marginBottom: 16 }}>
                <div className="form-grid">
                  <div className="form-field">
                    <label>Source Class</label>
                    <select value={cloneClassId} onChange={(e) => setCloneClassId(e.target.value)}>
                      <option value="">Select Class</option>
                      {classes.map((c) => (
                        <option key={c.id} value={c.id}>{c.class_name} - {c.section}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Source Subject</label>
                    <select
                      value={cloneClassSubjectId}
                      onChange={(e) => setCloneClassSubjectId(e.target.value)}
                      disabled={!cloneClassId}
                    >
                      <option value="">Select Subject</option>
                      {cloneClassSubjects
                        .filter((cs) => String(cs.id) !== String(selectedClassSubjectId))
                        .map((cs) => (
                          <option key={cs.id} value={cs.id}>{cs.subject_name} | {cs.academic_year}</option>
                        ))}
                    </select>
                  </div>
                </div>
                <div className="form-actions">
                  <button type="submit" className="primary-button">
                    <Copy size={18} />
                    Clone Units & Topics
                  </button>
                  <button type="button" className="light-button" onClick={() => setShowClone(false)}>
                    Cancel
                  </button>
                </div>
              </form>
            )}

            <form className="classic-form" onSubmit={submitUnit}>
              <div className="form-grid">
                <TextField label="Title *" name="title" value={unitForm.title} onChange={handleUnitFormChange} required />
                <TextField label="Sequence No" type="number" name="sequence_no" value={unitForm.sequence_no} onChange={handleUnitFormChange} />
                <TextField label="Planned Periods" type="number" name="planned_periods" value={unitForm.planned_periods} onChange={handleUnitFormChange} min="0" />
                <TextField label="Planned Start" type="date" name="planned_start" value={unitForm.planned_start} onChange={handleUnitFormChange} />
                <TextField label="Planned End" type="date" name="planned_end" value={unitForm.planned_end} onChange={handleUnitFormChange} />
                <div className="form-field full-width">
                  <label>Description</label>
                  <textarea name="description" value={unitForm.description} onChange={handleUnitFormChange} rows="2"></textarea>
                </div>
              </div>
              <div className="form-actions">
                <button type="submit" className="primary-button">
                  <PlusCircle size={18} />
                  {editingUnitId ? "Update Unit" : "Add Unit"}
                </button>
                {editingUnitId && (
                  <button type="button" className="light-button" onClick={resetUnitForm}>
                    Cancel Edit
                  </button>
                )}
              </div>
            </form>
          </section>

          <section className="table-panel">
            <div className="panel-header">
              <div>
                <h3>Units</h3>
                <p>{selectedMapping ? `${selectedMapping.subject_name} — ${selectedMapping.academic_year}` : ""}</p>
              </div>
            </div>

            {unitsLoading && <p style={{ padding: 16 }}>Loading...</p>}
            {!unitsLoading && !units.length && (
              <p style={{ padding: 16 }}>No units yet — add one above, or clone from another class.</p>
            )}

            {!unitsLoading && units.map((unit) => {
              const expanded = expandedUnitIds.has(unit.id);
              const topicForm = topicForms[unit.id] || emptyTopicForm;
              return (
                <div key={unit.id} className="syllabus-unit-card">
                  <button type="button" className="syllabus-unit-header" onClick={() => toggleUnit(unit.id)}>
                    {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                    <span className="syllabus-unit-title">
                      {unit.sequence_no != null ? `${unit.sequence_no}. ` : ""}{unit.title}
                    </span>
                    <span className={unitStatusClass(unit.status)}>{unit.status}</span>
                    <span className="syllabus-unit-progress">
                      {unit.progress.percent}% · {unit.progress.completed_topics}/{unit.progress.total_topics} topics
                    </span>
                    <span className="syllabus-unit-actions" onClick={(e) => e.stopPropagation()}>
                      <button type="button" className="edit-button" onClick={() => editUnit(unit)} title="Edit">
                        <Edit size={15} />
                      </button>
                      {canReview && (
                        <button type="button" className="delete-button" onClick={() => deleteUnit(unit)} title="Delete">
                          <Trash2 size={15} />
                        </button>
                      )}
                    </span>
                  </button>

                  {expanded && (
                    <div className="syllabus-unit-body">
                      {unit.description && <p>{unit.description}</p>}
                      <p className="hint-text">
                        {unit.planned_periods ? `${unit.planned_periods} planned period(s)` : "No period estimate"}
                        {unit.planned_start ? ` · ${unit.planned_start} to ${unit.planned_end || "?"}` : ""}
                      </p>

                      <div className="table-wrapper">
                        <table className="classic-table">
                          <thead>
                            <tr><th></th><th>Topic</th><th>Planned</th><th>Taken</th><th>Completed</th><th>Actions</th></tr>
                          </thead>
                          <tbody>
                            {unit.topics.map((topic) => (
                              <tr key={topic.id}>
                                <td>{topicStatusIcon(topic.status)}</td>
                                <td>
                                  {topic.title}
                                  {topic.notes ? <div className="hint-text">{topic.notes}</div> : null}
                                </td>
                                <td>{topic.planned_periods}</td>
                                <td>{topic.periods_taken ?? "-"}</td>
                                <td>{topic.completed_on ? `${topic.completed_on} (${topic.completed_by || "-"})` : "-"}</td>
                                <td>
                                  <div className="action-buttons">
                                    {topic.status === "Pending" && (
                                      <button type="button" className="edit-button" onClick={() => markTopicStatus(topic, "In Progress")} title="Start">
                                        <PlayCircle size={15} />
                                      </button>
                                    )}
                                    {topic.status !== "Completed" && (
                                      <button type="button" className="edit-button" onClick={() => openCompleteDrawer(topic)} title="Mark Complete">
                                        <Check size={15} />
                                      </button>
                                    )}
                                    {topic.status === "In Progress" && (
                                      <button type="button" className="light-button" onClick={() => markTopicStatus(topic, "Pending")} title="Reopen to Pending">
                                        <Undo2 size={15} />
                                      </button>
                                    )}
                                    {topic.status === "Completed" && (
                                      <button type="button" className="light-button" onClick={() => markTopicStatus(topic, "In Progress")} title="Reopen">
                                        <Undo2 size={15} />
                                      </button>
                                    )}
                                    {canReview && (
                                      <button type="button" className="delete-button" onClick={() => deleteTopic(topic)} title="Delete">
                                        <Trash2 size={15} />
                                      </button>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                            {!unit.topics.length && <tr><td colSpan={6}>No topics yet.</td></tr>}
                          </tbody>
                        </table>
                      </div>

                      <form className="classic-form" onSubmit={(e) => submitTopic(unit.id, e)} style={{ marginTop: 10 }}>
                        <div className="form-grid">
                          <TextField
                            label="New Topic *"
                            name="title"
                            value={topicForm.title}
                            onChange={(e) => handleTopicFormChange(unit.id, e)}
                            required
                          />
                          <TextField
                            label="Planned Periods"
                            type="number"
                            name="planned_periods"
                            value={topicForm.planned_periods}
                            onChange={(e) => handleTopicFormChange(unit.id, e)}
                            min="1"
                          />
                          <TextField
                            label="Sequence No"
                            type="number"
                            name="sequence_no"
                            value={topicForm.sequence_no}
                            onChange={(e) => handleTopicFormChange(unit.id, e)}
                          />
                        </div>
                        <div className="form-actions">
                          <button type="submit" className="light-button">
                            <Plus size={16} />
                            Add Topic
                          </button>
                        </div>
                      </form>
                    </div>
                  )}
                </div>
              );
            })}
          </section>
        </>
      )}

      {activeTab === "plans" && selectedClassSubjectId && (
        <>
          <section className="form-panel">
            <PanelTitle title="Plan a Lesson" text="Create a lesson plan for this class subject." />
            <form className="classic-form" onSubmit={submitPlan}>
              <div className="form-grid">
                <TextField label="Date *" type="date" name="plan_date" value={planForm.plan_date} onChange={handlePlanFormChange} required />
                <TextField label="Title *" name="title" value={planForm.title} onChange={handlePlanFormChange} required />
                <div className="form-field">
                  <label>Teacher</label>
                  <select name="teacher_id" value={planForm.teacher_id} onChange={handlePlanFormChange}>
                    <option value="">Use class subject's teacher</option>
                    {teachers.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
                <div className="form-field">
                  <label>Topic</label>
                  <select name="topic_id" value={planForm.topic_id} onChange={handlePlanFormChange}>
                    <option value="">No specific topic</option>
                    {allTopics.map((t) => <option key={t.id} value={t.id}>{t.unit_title} — {t.title}</option>)}
                  </select>
                </div>
                <TextField label="Period No" type="number" name="period_no" value={planForm.period_no} onChange={handlePlanFormChange} min="1" />
                <div className="form-field full-width">
                  <label>Objectives</label>
                  <textarea name="objectives" value={planForm.objectives} onChange={handlePlanFormChange} rows="2"></textarea>
                </div>
                <TextField label="Teaching Method" name="teaching_method" value={planForm.teaching_method} onChange={handlePlanFormChange} />
                <div className="form-field full-width">
                  <label>Resources</label>
                  <textarea name="resources" value={planForm.resources} onChange={handlePlanFormChange} rows="2"></textarea>
                </div>
                <div className="form-field full-width">
                  <label>Homework</label>
                  <textarea name="homework" value={planForm.homework} onChange={handlePlanFormChange} rows="2"></textarea>
                </div>
              </div>
              <div className="form-actions">
                <button type="submit" className="primary-button">
                  <PlusCircle size={18} />
                  Create Lesson Plan
                </button>
              </div>
            </form>
          </section>

          <section className="table-panel">
            <div className="panel-header">
              <div><h3>Lesson Plans</h3></div>
              <div className="form-field" style={{ marginBottom: 0 }}>
                <label>Status</label>
                <select value={planStatusFilter} onChange={(e) => setPlanStatusFilter(e.target.value)}>
                  <option value="">All Statuses</option>
                  <option value="Planned">Planned</option>
                  <option value="Delivered">Delivered</option>
                  <option value="Deferred">Deferred</option>
                  <option value="Cancelled">Cancelled</option>
                </select>
              </div>
            </div>
            <div className="table-wrapper">
              <table className="classic-table">
                <thead>
                  <tr><th>Date</th><th>Title</th><th>Teacher</th><th>Topic</th><th>Status</th><th>Review</th><th>Actions</th></tr>
                </thead>
                <tbody>
                  {plansLoading && <tr><td colSpan={7}>Loading...</td></tr>}
                  {!plansLoading && plans.map((plan) => (
                    <tr key={plan.id}>
                      <td>{plan.plan_date}{plan.period_no ? ` (P${plan.period_no})` : ""}</td>
                      <td>{plan.title}</td>
                      <td>{plan.teacher || "-"}</td>
                      <td>{plan.topic || "-"}</td>
                      <td><span className={planStatusClass(plan.status)}>{plan.status}</span></td>
                      <td><span className={reviewStatusClass(plan.review_status)}>{plan.review_status}</span></td>
                      <td>
                        <div className="action-buttons">
                          {plan.status === "Planned" && (
                            <>
                              <button type="button" className="edit-button" onClick={() => openDeliverDrawer(plan)} title="Deliver">
                                <Send size={15} />
                              </button>
                              <button type="button" className="delete-button" onClick={() => deferPlan(plan)} title="Defer">
                                <Ban size={15} />
                              </button>
                            </>
                          )}
                          {canReview && plan.status === "Delivered" && plan.review_status !== "Approved" && (
                            <button type="button" className="edit-button" onClick={() => reviewPlan(plan, "Approved")} title="Approve">
                              <Check size={15} />
                            </button>
                          )}
                          {canReview && plan.status === "Delivered" && plan.review_status !== "Changes Requested" && (
                            <button type="button" className="delete-button" onClick={() => reviewPlan(plan, "Changes Requested")} title="Request Changes">
                              <X size={15} />
                            </button>
                          )}
                          {plan.status !== "Delivered" && (
                            <button type="button" className="delete-button" onClick={() => deletePlan(plan)} title="Delete">
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!plansLoading && !plans.length && <tr><td colSpan={7}>No lesson plans yet.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {activeTab === "coverage" && selectedClassSubjectId && (
        <section className="table-panel">
          <div className="panel-header">
            <div><h3>Coverage — {selectedMapping?.subject_name}</h3></div>
            <div className="form-field" style={{ marginBottom: 0 }}>
              <label>As Of</label>
              <input type="date" value={coverageAsOf} onChange={(e) => setCoverageAsOf(e.target.value)} />
            </div>
          </div>

          {coverageLoading && <p style={{ padding: 16 }}>Loading...</p>}

          {!coverageLoading && coverage && (
            <>
              <div className="summary-strip report-summary-grid" style={{ padding: "0 16px 16px" }}>
                <div className="summary-card">
                  <Percent size={22} />
                  <div><span>Covered</span><strong>{coverage.percent_covered}%</strong></div>
                </div>
                <div className="summary-card">
                  <Layers size={22} />
                  <div><span>Units Completed</span><strong>{coverage.units_completed} / {coverage.units}</strong></div>
                </div>
                {coverage.expected_percent != null && (
                  <div className="summary-card">
                    <TrendingDown size={22} />
                    <div><span>Expected By Now</span><strong>{coverage.expected_percent}%</strong></div>
                  </div>
                )}
                <div className={coverage.on_schedule === false ? "summary-card negative" : "summary-card"}>
                  <CheckCircle2 size={22} />
                  <div>
                    <span>On Schedule</span>
                    <strong>{coverage.on_schedule === null ? "No dates set" : coverage.on_schedule ? "Yes" : "No"}</strong>
                  </div>
                </div>
              </div>

              {coverage.overdue_units.length > 0 && (
                <div className="table-wrapper">
                  <table className="classic-table">
                    <thead><tr><th>Overdue Unit</th><th>Planned End</th><th>Days Late</th><th>Progress</th></tr></thead>
                    <tbody>
                      {coverage.overdue_units.map((u) => (
                        <tr key={u.unit_id}>
                          <td>{u.title}</td>
                          <td>{u.planned_end}</td>
                          <td>{u.days_late}</td>
                          <td>{u.percent}%</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </>
          )}
        </section>
      )}

      {activeTab === "behind" && (
        <section className="table-panel">
          <div className="panel-header">
            <div>
              <h3>Behind Schedule</h3>
              <p>Every class subject with a unit past its planned end and unfinished, worst first.</p>
            </div>
          </div>
          <div className="filter-row sis-filter-row">
            <div className="form-field">
              <label>Academic Year</label>
              <input value={behindYear} onChange={(e) => setBehindYear(e.target.value)} placeholder="2026-27" />
            </div>
            <div className="form-field">
              <label>As Of</label>
              <input type="date" value={behindAsOf} onChange={(e) => setBehindAsOf(e.target.value)} />
            </div>
          </div>
          <div className="table-wrapper">
            <table className="classic-table">
              <thead>
                <tr><th>Class</th><th>Subject</th><th>Covered</th><th>Expected</th><th>Worst Days Late</th><th>Overdue Units</th></tr>
              </thead>
              <tbody>
                {behindLoading && <tr><td colSpan={6}>Loading...</td></tr>}
                {!behindLoading && behind.map((row) => {
                  const cls = classes.find((c) => c.id === row.class_id);
                  return (
                    <tr key={row.class_subject_id}>
                      <td>{cls ? `${cls.class_name} - ${cls.section}` : row.class_id}</td>
                      <td>{row.subject_name}</td>
                      <td>{row.percent_covered}%</td>
                      <td>{row.expected_percent != null ? `${row.expected_percent}%` : "-"}</td>
                      <td>{row.worst_days_late}</td>
                      <td>{row.overdue_units.map((u) => u.title).join(", ")}</td>
                    </tr>
                  );
                })}
                {!behindLoading && !behind.length && <tr><td colSpan={6}>Nothing behind schedule.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {completeDrawer && (
        <div className="student-drawer-backdrop">
          <aside className="student-drawer">
            <button type="button" className="drawer-close" onClick={() => setCompleteDrawer(null)}>
              <X size={18} />
            </button>
            <div className="student-profile-head">
              <div className="student-avatar"><CheckCircle2 size={42} /></div>
              <h3>Mark Complete</h3>
              <p>{completeDrawer.topic.title}</p>
            </div>
            <form className="classic-form drawer-section" onSubmit={submitComplete}>
              <div className="form-grid">
                <TextField
                  label="Taught On"
                  type="date"
                  value={completeDrawer.on_date}
                  onChange={(e) => setCompleteDrawer((prev) => ({ ...prev, on_date: e.target.value }))}
                  max={todayLocalDate()}
                />
                <TextField
                  label="Periods Taken"
                  type="number"
                  value={completeDrawer.periods_taken}
                  onChange={(e) => setCompleteDrawer((prev) => ({ ...prev, periods_taken: e.target.value }))}
                  min="0"
                />
                <div className="form-field full-width">
                  <label>Notes</label>
                  <textarea
                    value={completeDrawer.notes}
                    onChange={(e) => setCompleteDrawer((prev) => ({ ...prev, notes: e.target.value }))}
                    rows="3"
                  ></textarea>
                </div>
              </div>
              <div className="form-actions">
                <button type="submit" className="primary-button">
                  <Check size={18} />
                  Mark Complete
                </button>
              </div>
            </form>
          </aside>
        </div>
      )}

      {deliverDrawer && (
        <div className="student-drawer-backdrop">
          <aside className="student-drawer">
            <button type="button" className="drawer-close" onClick={() => setDeliverDrawer(null)}>
              <X size={18} />
            </button>
            <div className="student-profile-head">
              <div className="student-avatar"><Send size={42} /></div>
              <h3>Deliver Lesson</h3>
              <p>{deliverDrawer.plan.title}</p>
            </div>
            <form className="classic-form drawer-section" onSubmit={submitDeliver}>
              <div className="form-grid">
                {deliverDrawer.plan.topic_id && (
                  <>
                    <div className="form-field">
                      <label>Complete Linked Topic</label>
                      <label className="switch-row">
                        <input
                          type="checkbox"
                          checked={deliverDrawer.complete_topic}
                          onChange={(e) => setDeliverDrawer((prev) => ({ ...prev, complete_topic: e.target.checked }))}
                        />
                        <span>{deliverDrawer.complete_topic ? "Yes" : "No"}</span>
                      </label>
                    </div>
                    <TextField
                      label="Periods Taken"
                      type="number"
                      value={deliverDrawer.periods_taken}
                      onChange={(e) => setDeliverDrawer((prev) => ({ ...prev, periods_taken: e.target.value }))}
                      min="0"
                    />
                  </>
                )}
                <div className="form-field full-width">
                  <label>Note</label>
                  <textarea
                    value={deliverDrawer.note}
                    onChange={(e) => setDeliverDrawer((prev) => ({ ...prev, note: e.target.value }))}
                    rows="3"
                  ></textarea>
                </div>
              </div>
              <div className="form-actions">
                <button type="submit" className="primary-button">
                  <Send size={18} />
                  Mark Delivered
                </button>
              </div>
            </form>
          </aside>
        </div>
      )}
    </div>
  );
}

function PanelTitle({ title, text, actions }) {
  return (
    <div className="panel-header">
      <div>
        <h3>{title}</h3>
        <p>{text}</p>
      </div>
      {actions}
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
