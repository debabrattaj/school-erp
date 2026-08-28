import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Edit,
  Trash2,
  PlusCircle,
  FileQuestion,
  ListChecks,
  BarChart3,
  ShieldCheck,
} from "lucide-react";

import API from "../api";
import EnhancedRecordsTable from "../components/EnhancedRecordsTable";
import { isFeatureEnabled } from "../auth";

const emptyTestForm = {
  academic_year: "",
  class_name: "",
  section: "",
  subject: "",
  title: "",
  description: "",
  duration_minutes: "",
  teacher_id: "",
  shuffle_questions: false,
  shuffle_options: false,
  proctoring_enabled: false,
  proctoring_policy_id: "",
};

const emptyQuestionForm = {
  question_type: "mcq_single",
  question_text: "",
  options: ["", "", "", ""],
  correct_option: "",
  marks: 1,
};

const emptyPolicyForm = {
  name: "",
  require_fullscreen: true,
  block_copy_paste: true,
  max_violations_before_autosubmit: 5,
  retention_days: 90,
  require_webcam: false,
  capture_interval_seconds: 30,
};

function getApiErrorMessage(error, fallback) {
  return error.response?.data?.detail || fallback;
}

export default function OnlineTests() {
  const proctoringAvailable = isFeatureEnabled("online_test_proctoring");

  const [tests, setTests] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [searchText, setSearchText] = useState("");

  // list | form | questions | results | policies | proctoring
  const [pageMode, setPageMode] = useState("list");
  const [testForm, setTestForm] = useState(emptyTestForm);
  const [editingId, setEditingId] = useState(null);

  const [activeTest, setActiveTest] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [questionForm, setQuestionForm] = useState(emptyQuestionForm);
  const [results, setResults] = useState([]);

  const [policyForm, setPolicyForm] = useState(emptyPolicyForm);
  const [editingPolicyId, setEditingPolicyId] = useState(null);
  const [proctoringDetail, setProctoringDetail] = useState(null);
  const [activeAttemptId, setActiveAttemptId] = useState(null);
  const [reviewNotes, setReviewNotes] = useState("");
  // snapshot id -> local object URL. Images are never linked to directly --
  // the endpoint requires an Authorization header a plain <img src> can't
  // send, so each one is fetched as a blob and given a local URL instead.
  const [snapshotUrls, setSnapshotUrls] = useState({});
  const [snapshotsLoaded, setSnapshotsLoaded] = useState(false);

  useEffect(() => {
    if (!message) return undefined;
    const timeoutId = window.setTimeout(() => setMessage(""), 2500);
    return () => window.clearTimeout(timeoutId);
  }, [message]);

  async function loadTests() {
    try {
      setLoading(true);
      const response = await API.get("/online-tests/");
      setTests(response.data || []);
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to load online tests."));
    } finally {
      setLoading(false);
    }
  }

  async function loadTeachers() {
    try {
      const response = await API.get("/teachers/");
      setTeachers(response.data || []);
    } catch {
      setTeachers([]);
    }
  }

  // Class, section, subject and academic year all come from their own modules
  // rather than being typed in, so a test can only ever be attached to a class
  // that exists — a typo here would otherwise hide the test from every student.
  async function loadPickLists() {
    const [classesRes, subjectsRes, yearsRes] = await Promise.allSettled([
      API.get("/classes/"),
      API.get("/subjects/"),
      API.get("/academic-years/"),
    ]);
    setClasses(classesRes.status === "fulfilled" ? classesRes.value.data || [] : []);
    setSubjects(subjectsRes.status === "fulfilled" ? subjectsRes.value.data || [] : []);
    setAcademicYears(yearsRes.status === "fulfilled" ? yearsRes.value.data || [] : []);
  }

  async function loadPolicies() {
    if (!proctoringAvailable) return;
    try {
      const response = await API.get("/online-tests/proctoring-policies");
      setPolicies(response.data || []);
    } catch {
      setPolicies([]);
    }
  }

  useEffect(() => {
    loadTests();
    loadTeachers();
    loadPickLists();
    loadPolicies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Distinct class names, in the order the Classes module lists them.
  const classNames = [...new Set(classes.map((c) => c.class_name).filter(Boolean))];

  // Sections offered by the chosen class. Blank stays available and means
  // "every section", which is how the backend already treats a null section.
  const sectionsForClass = [
    ...new Set(
      classes
        .filter((c) => c.class_name === testForm.class_name)
        .map((c) => c.section)
        .filter(Boolean)
    ),
  ];

  function handleTestChange(e) {
    const { name, value, type, checked } = e.target;
    setTestForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  }

  function handleAddTest() {
    setEditingId(null);
    setTestForm(emptyTestForm);
    setMessage("");
    setPageMode("form");
  }

  function handleEditTest(test) {
    setEditingId(test.id);
    setTestForm({
      academic_year: test.academic_year || "",
      class_name: test.class_name || "",
      section: test.section || "",
      subject: test.subject || "",
      title: test.title || "",
      description: test.description || "",
      duration_minutes: test.duration_minutes || "",
      teacher_id: test.teacher_id || "",
      shuffle_questions: Boolean(test.shuffle_questions),
      shuffle_options: Boolean(test.shuffle_options),
      proctoring_enabled: Boolean(test.proctoring_enabled),
      proctoring_policy_id: test.proctoring_policy_id || "",
    });
    setMessage("");
    setPageMode("form");
  }

  async function handleSubmitTest(e) {
    e.preventDefault();
    const payload = {
      academic_year: testForm.academic_year.trim() || null,
      class_name: testForm.class_name.trim(),
      section: testForm.section.trim() || null,
      subject: testForm.subject.trim() || null,
      title: testForm.title.trim(),
      description: testForm.description.trim() || null,
      duration_minutes: testForm.duration_minutes ? Number(testForm.duration_minutes) : null,
      teacher_id: testForm.teacher_id ? Number(testForm.teacher_id) : null,
      shuffle_questions: Boolean(testForm.shuffle_questions),
      shuffle_options: Boolean(testForm.shuffle_options),
      proctoring_enabled: proctoringAvailable ? Boolean(testForm.proctoring_enabled) : false,
      proctoring_policy_id:
        proctoringAvailable && testForm.proctoring_enabled && testForm.proctoring_policy_id
          ? Number(testForm.proctoring_policy_id)
          : null,
    };
    if (!payload.class_name) {
      setMessage("Class is required.");
      return;
    }
    if (!payload.title) {
      setMessage("Title is required.");
      return;
    }

    try {
      if (editingId) {
        await API.put(`/online-tests/${editingId}`, payload);
        setMessage("Test updated successfully.");
      } else {
        await API.post("/online-tests/", payload);
        setMessage("Test created as Draft. Add questions, then publish it.");
      }
      setPageMode("list");
      await loadTests();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to save test."));
    }
  }

  async function handleDeleteTest(id) {
    if (!window.confirm("Delete this test and all of its attempts?")) return;
    try {
      await API.delete(`/online-tests/${id}`);
      setMessage("Test deleted successfully.");
      await loadTests();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to delete test."));
    }
  }

  async function handleStatusChange(test, status) {
    try {
      await API.put(`/online-tests/${test.id}`, { status });
      setMessage(`Test ${status.toLowerCase()}.`);
      await loadTests();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to update status."));
    }
  }

  async function openQuestions(test) {
    setActiveTest(test);
    setMessage("");
    setQuestionForm(emptyQuestionForm);
    setPageMode("questions");
    await loadQuestionsFor(test.id);
  }

  async function loadQuestionsFor(testId) {
    try {
      const [testRes, questionsRes] = await Promise.all([
        API.get(`/online-tests/${testId}`),
        API.get(`/online-tests/${testId}/questions`),
      ]);
      setActiveTest(testRes.data);
      setQuestions(questionsRes.data || []);
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to load test."));
    }
  }

  function handleQuestionFormChange(e) {
    const { name, value } = e.target;
    setQuestionForm((prev) => ({ ...prev, [name]: value }));
  }

  function handleOptionChange(index, value) {
    setQuestionForm((prev) => {
      const options = [...prev.options];
      options[index] = value;
      return { ...prev, options };
    });
  }

  async function handleAddQuestion(e) {
    e.preventDefault();
    if (!activeTest) return;

    const payload = {
      question_type: questionForm.question_type,
      question_text: questionForm.question_text.trim(),
      correct_option: questionForm.correct_option,
      marks: Number(questionForm.marks) || 1,
      sort_order: questions.length,
    };
    if (payload.question_type === "mcq_single") {
      payload.options = questionForm.options.map((o) => o.trim()).filter(Boolean);
    }

    if (!payload.question_text) {
      setMessage("Question text is required.");
      return;
    }
    if (!payload.correct_option) {
      setMessage("Pick the correct option.");
      return;
    }

    try {
      await API.post(`/online-tests/${activeTest.id}/questions`, payload);
      setMessage("Question added.");
      setQuestionForm(emptyQuestionForm);
      await loadQuestionsFor(activeTest.id);
      await loadTests();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to add question."));
    }
  }

  async function handleDeleteQuestion(questionId) {
    if (!activeTest) return;
    if (!window.confirm("Delete this question?")) return;
    try {
      await API.delete(`/online-tests/${activeTest.id}/questions/${questionId}`);
      setMessage("Question deleted.");
      await loadQuestionsFor(activeTest.id);
      await loadTests();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to delete question."));
    }
  }

  async function openResults(test) {
    setActiveTest(test);
    setMessage("");
    setPageMode("results");
    try {
      const response = await API.get(`/online-tests/${test.id}/results`);
      setResults(response.data || []);
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to load results."));
    }
  }

  function backToList() {
    setPageMode("list");
    setActiveTest(null);
    setQuestions([]);
    setResults([]);
    setProctoringDetail(null);
    setActiveAttemptId(null);
  }

  function openPolicies() {
    setEditingPolicyId(null);
    setPolicyForm(emptyPolicyForm);
    setMessage("");
    setPageMode("policies");
  }

  function handlePolicyFormChange(e) {
    const { name, value, type, checked } = e.target;
    setPolicyForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  }

  function handleEditPolicy(policy) {
    setEditingPolicyId(policy.id);
    setPolicyForm({
      name: policy.name || "",
      require_fullscreen: Boolean(policy.require_fullscreen),
      block_copy_paste: Boolean(policy.block_copy_paste),
      max_violations_before_autosubmit: policy.max_violations_before_autosubmit,
      retention_days: policy.retention_days,
      require_webcam: Boolean(policy.require_webcam),
      capture_interval_seconds: policy.capture_interval_seconds || 30,
    });
    setMessage("");
  }

  async function handleSubmitPolicy(e) {
    e.preventDefault();
    const payload = {
      name: policyForm.name.trim(),
      require_fullscreen: Boolean(policyForm.require_fullscreen),
      block_copy_paste: Boolean(policyForm.block_copy_paste),
      max_violations_before_autosubmit: Number(policyForm.max_violations_before_autosubmit) || 5,
      retention_days: Number(policyForm.retention_days) || 90,
      require_webcam: Boolean(policyForm.require_webcam),
      capture_interval_seconds: policyForm.require_webcam
        ? Number(policyForm.capture_interval_seconds) || 30
        : null,
    };
    if (!payload.name) {
      setMessage("Policy name is required.");
      return;
    }
    try {
      if (editingPolicyId) {
        await API.put(`/online-tests/proctoring-policies/${editingPolicyId}`, payload);
        setMessage("Policy updated.");
      } else {
        await API.post("/online-tests/proctoring-policies", payload);
        setMessage("Policy created.");
      }
      setEditingPolicyId(null);
      setPolicyForm(emptyPolicyForm);
      await loadPolicies();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to save policy."));
    }
  }

  async function handleDeletePolicy(policyId) {
    if (!window.confirm("Delete this proctoring policy? Tests using it fall back to strict defaults.")) return;
    try {
      await API.delete(`/online-tests/proctoring-policies/${policyId}`);
      setMessage("Policy deleted.");
      await loadPolicies();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to delete policy."));
    }
  }

  async function openProctoringDetail(attemptId) {
    if (!activeTest) return;
    setActiveAttemptId(attemptId);
    setMessage("");
    setPageMode("proctoring");
    setSnapshotUrls({});
    setSnapshotsLoaded(false);
    try {
      const response = await API.get(`/online-tests/${activeTest.id}/results/${attemptId}/proctoring`);
      setProctoringDetail(response.data);
      setReviewNotes(response.data.reviewer_notes || "");
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to load the proctoring timeline."));
    }
  }

  async function backToResults() {
    setPageMode("results");
    setProctoringDetail(null);
    setActiveAttemptId(null);
    setSnapshotUrls({});
    setSnapshotsLoaded(false);
    if (activeTest) {
      try {
        const response = await API.get(`/online-tests/${activeTest.id}/results`);
        setResults(response.data || []);
      } catch {
        // keep whatever results were already loaded
      }
    }
  }

  async function handleReviewSubmit(reviewStatus) {
    if (!activeTest || !activeAttemptId) return;
    try {
      const response = await API.put(
        `/online-tests/${activeTest.id}/results/${activeAttemptId}/proctoring/review`,
        { review_status: reviewStatus, reviewer_notes: reviewNotes.trim() || null }
      );
      setProctoringDetail((prev) => (prev ? { ...prev, ...response.data } : prev));
      setMessage(`Session marked ${reviewStatus}.`);
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to save the review."));
    }
  }

  // Fetch each snapshot's image once (blob + local object URL, never a plain
  // <img src> since the endpoint is authenticated), and revoke the object
  // URLs on cleanup so viewing several sessions in a row doesn't leak memory.
  useEffect(() => {
    if (!proctoringDetail?.snapshots?.length || !activeTest || !activeAttemptId) {
      return undefined;
    }
    let cancelled = false;
    const urls = {};
    (async () => {
      for (const snap of proctoringDetail.snapshots) {
        try {
          const response = await API.get(
            `/online-tests/${activeTest.id}/results/${activeAttemptId}/proctoring/snapshots/${snap.id}`,
            { responseType: "blob" }
          );
          if (cancelled) return;
          urls[snap.id] = URL.createObjectURL(response.data);
        } catch {
          // Skip -- most likely purged by retention already.
        }
      }
      if (!cancelled) {
        setSnapshotUrls({ ...urls });
        setSnapshotsLoaded(true);
      }
    })();
    return () => {
      cancelled = true;
      Object.values(urls).forEach((url) => URL.revokeObjectURL(url));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [proctoringDetail?.id, proctoringDetail?.snapshots?.length]);

  const filteredTests = tests.filter((t) => {
    const fullText = `${t.class_name} ${t.section} ${t.subject} ${t.title} ${t.status}`.toLowerCase();
    return fullText.includes(searchText.toLowerCase());
  });

  if (pageMode === "form") {
    return (
      <div className="management-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Academics</p>
            <h2>{editingId ? "Edit Test" : "Create Online Test"}</h2>
          </div>
          <button type="button" className="light-button" onClick={backToList}>
            <ArrowLeft size={17} />
            Back
          </button>
        </section>

        {message && <div className="toast-notification">{message}</div>}

        <section className="form-panel">
          <form className="classic-form" onSubmit={handleSubmitTest}>
            <div className="form-grid">
              <div className="form-field">
                <label>Class *</label>
                <select
                  name="class_name"
                  value={testForm.class_name}
                  onChange={(e) => {
                    handleTestChange(e);
                    // The old section may not exist in the newly-chosen class.
                    setTestForm((prev) => ({ ...prev, section: "" }));
                  }}
                  required
                >
                  <option value="">Select Class</option>
                  {classNames.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
                {!classNames.length && <small>No classes set up yet — add them under Classes.</small>}
              </div>
              <div className="form-field">
                <label>Section</label>
                <select
                  name="section"
                  value={testForm.section}
                  onChange={handleTestChange}
                  disabled={!testForm.class_name}
                >
                  <option value="">All sections</option>
                  {sectionsForClass.map((section) => (
                    <option key={section} value={section}>{section}</option>
                  ))}
                </select>
                <small>{testForm.class_name ? "Blank covers every section." : "Pick a class first."}</small>
              </div>
              <div className="form-field">
                <label>Academic Year</label>
                <select name="academic_year" value={testForm.academic_year} onChange={handleTestChange}>
                  <option value="">Select Academic Year</option>
                  {academicYears.map((year) => (
                    <option key={year.id} value={year.name}>{year.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>Subject</label>
                <select name="subject" value={testForm.subject} onChange={handleTestChange}>
                  <option value="">Select Subject</option>
                  {subjects
                    .filter((subject) => subject.is_active !== false)
                    .map((subject) => (
                      <option key={subject.id} value={subject.subject_name}>
                        {subject.subject_name}
                      </option>
                    ))}
                </select>
              </div>
              <div className="form-field">
                <label>Teacher</label>
                <select name="teacher_id" value={testForm.teacher_id} onChange={handleTestChange}>
                  <option value="">Select Teacher</option>
                  {teachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>{teacher.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>Duration (minutes)</label>
                <input type="number" name="duration_minutes" value={testForm.duration_minutes} onChange={handleTestChange} min="1" placeholder="blank = untimed" />
              </div>
              <div className="form-field">
                <label>Title *</label>
                <input type="text" name="title" value={testForm.title} onChange={handleTestChange} required />
              </div>
              <div className="form-field">
                <label>Description</label>
                <textarea name="description" value={testForm.description} onChange={handleTestChange} rows={3} />
              </div>
              <div className="form-field">
                <label>Anti-copying</label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400 }}>
                  <input
                    type="checkbox"
                    name="shuffle_questions"
                    checked={testForm.shuffle_questions}
                    onChange={handleTestChange}
                  />
                  Shuffle question order per student
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400 }}>
                  <input
                    type="checkbox"
                    name="shuffle_options"
                    checked={testForm.shuffle_options}
                    onChange={handleTestChange}
                  />
                  Shuffle answer options per student
                </label>
                <small>Each student gets a different order, kept stable if they reload.</small>
              </div>
              {proctoringAvailable && (
                <div className="form-field">
                  <label>Proctoring (add-on)</label>
                  <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400 }}>
                    <input
                      type="checkbox"
                      name="proctoring_enabled"
                      checked={testForm.proctoring_enabled}
                      onChange={handleTestChange}
                    />
                    Require fullscreen and report browser activity during this test
                  </label>
                  {testForm.proctoring_enabled && (
                    <>
                      <select
                        name="proctoring_policy_id"
                        value={testForm.proctoring_policy_id}
                        onChange={handleTestChange}
                      >
                        <option value="">Strict defaults (no policy assigned)</option>
                        {policies.map((policy) => (
                          <option key={policy.id} value={policy.id}>{policy.name}</option>
                        ))}
                      </select>
                      <small>
                        Each student's guardian must grant consent before this test can be started
                        — see the Proctoring Policies screen to manage policies.
                      </small>
                    </>
                  )}
                </div>
              )}
            </div>
            <div className="form-actions">
              <button type="submit" className="primary-button">
                <PlusCircle size={18} />
                {editingId ? "Update Test" : "Create Test"}
              </button>
              <button type="button" className="light-button" onClick={backToList}>
                Cancel
              </button>
            </div>
          </form>
        </section>
      </div>
    );
  }

  if (pageMode === "questions" && activeTest) {
    const questionList = questions;
    return (
      <div className="management-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Academics</p>
            <h2>Questions — {activeTest.title}</h2>
            <p>{activeTest.question_count || 0} question(s), {activeTest.total_marks || 0} marks total. Status: {activeTest.status}</p>
          </div>
          <button type="button" className="light-button" onClick={backToList}>
            <ArrowLeft size={17} />
            Back
          </button>
        </section>

        {message && <div className="toast-notification">{message}</div>}

        <section className="form-panel">
          <div className="panel-header">
            <div>
              <h3>Add Question</h3>
              <p>Only auto-graded types are supported: multiple choice or true/false.</p>
            </div>
          </div>
          <form className="classic-form" onSubmit={handleAddQuestion}>
            <div className="form-grid">
              <div className="form-field">
                <label>Type</label>
                <select
                  name="question_type"
                  value={questionForm.question_type}
                  onChange={(e) => {
                    handleQuestionFormChange(e);
                    setQuestionForm((prev) => ({ ...prev, correct_option: "" }));
                  }}
                >
                  <option value="mcq_single">Multiple Choice</option>
                  <option value="true_false">True / False</option>
                </select>
              </div>
              <div className="form-field">
                <label>Marks</label>
                <input type="number" name="marks" value={questionForm.marks} onChange={handleQuestionFormChange} min="0.5" step="0.5" />
              </div>
              <div className="form-field">
                <label>Question Text *</label>
                <input type="text" name="question_text" value={questionForm.question_text} onChange={handleQuestionFormChange} required />
              </div>

              {questionForm.question_type === "mcq_single" ? (
                <>
                  {questionForm.options.map((option, index) => (
                    <div className="form-field" key={index}>
                      <label>Option {index + 1}</label>
                      <input type="text" value={option} onChange={(e) => handleOptionChange(index, e.target.value)} />
                    </div>
                  ))}
                  <div className="form-field">
                    <label>Correct Option *</label>
                    <select name="correct_option" value={questionForm.correct_option} onChange={handleQuestionFormChange}>
                      <option value="">Select correct option</option>
                      {questionForm.options.filter((o) => o.trim()).map((option) => (
                        <option key={option} value={option}>{option}</option>
                      ))}
                    </select>
                  </div>
                </>
              ) : (
                <div className="form-field">
                  <label>Correct Answer *</label>
                  <select name="correct_option" value={questionForm.correct_option} onChange={handleQuestionFormChange}>
                    <option value="">Select correct answer</option>
                    <option value="True">True</option>
                    <option value="False">False</option>
                  </select>
                </div>
              )}
            </div>
            <div className="form-actions">
              <button type="submit" className="primary-button">
                <PlusCircle size={18} />
                Add Question
              </button>
            </div>
          </form>
        </section>

        <section className="table-panel">
          <div className="panel-header">
            <div>
              <h3>Questions</h3>
            </div>
          </div>
          <div className="table-wrapper">
            <table className="classic-table">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Question</th>
                  <th>Type</th>
                  <th>Correct Answer</th>
                  <th>Marks</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {questionList.map((q, index) => (
                  <tr key={q.id}>
                    <td>{index + 1}</td>
                    <td>{q.question_text}</td>
                    <td>{q.question_type === "mcq_single" ? "Multiple Choice" : "True / False"}</td>
                    <td>{q.correct_option}</td>
                    <td>{q.marks}</td>
                    <td>
                      <button type="button" className="delete-button" onClick={() => handleDeleteQuestion(q.id)} title="Delete">
                        <Trash2 size={15} />
                      </button>
                    </td>
                  </tr>
                ))}
                {!questionList.length && (
                  <tr>
                    <td colSpan={6}>No questions added yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        {activeTest.status === "Draft" && (
          <div className="form-actions">
            <button type="button" className="primary-button" onClick={() => handleStatusChange(activeTest, "Published")}>
              Publish Test
            </button>
          </div>
        )}
      </div>
    );
  }

  if (pageMode === "results" && activeTest) {
    return (
      <div className="management-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Academics</p>
            <h2>Results — {activeTest.title}</h2>
          </div>
          <button type="button" className="light-button" onClick={backToList}>
            <ArrowLeft size={17} />
            Back
          </button>
        </section>

        {message && <div className="toast-notification">{message}</div>}

        <div className="table-wrapper">
          <table className="classic-table">
            <thead>
              <tr>
                <th>Student</th>
                <th>Admission No</th>
                <th>Status</th>
                <th>Score</th>
                <th>Submitted At</th>
                {proctoringAvailable && <th>Proctoring</th>}
              </tr>
            </thead>
            <tbody>
              {results.map((r) => (
                <tr key={r.id}>
                  <td>{r.student_name}</td>
                  <td>{r.admission_no || "-"}</td>
                  <td>{r.status}</td>
                  <td>{r.score !== null ? `${r.score} / ${r.max_score}` : "-"}</td>
                  <td>{r.submitted_at || "-"}</td>
                  {proctoringAvailable && (
                    <td>
                      {r.proctoring_review_status ? (
                        <button
                          type="button"
                          className={
                            r.proctoring_review_status === "Flagged"
                              ? "status danger"
                              : r.proctoring_review_status === "Cleared"
                              ? "status active"
                              : "status pending"
                          }
                          style={{ border: "none", cursor: "pointer" }}
                          onClick={() => openProctoringDetail(r.id)}
                        >
                          {r.proctoring_flag_count} flag{r.proctoring_flag_count === 1 ? "" : "s"} — {r.proctoring_review_status}
                        </button>
                      ) : (
                        "-"
                      )}
                    </td>
                  )}
                </tr>
              ))}
              {!results.length && (
                <tr>
                  <td colSpan={proctoringAvailable ? 6 : 5}>No attempts yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  if (pageMode === "proctoring" && activeTest) {
    return (
      <div className="management-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Academics</p>
            <h2>Proctoring Timeline — {activeTest.title}</h2>
          </div>
          <button type="button" className="light-button" onClick={backToResults}>
            <ArrowLeft size={17} />
            Back to Results
          </button>
        </section>

        {message && <div className="toast-notification">{message}</div>}

        {!proctoringDetail ? (
          <p>Loading...</p>
        ) : (
          <>
            <section className="form-panel">
              <p>
                <strong>Started:</strong> {proctoringDetail.started_at || "-"}
                {" · "}
                <strong>Ended:</strong> {proctoringDetail.ended_at || "still open"}
                {" · "}
                <strong>Flags:</strong> {proctoringDetail.flag_count}
              </p>
              <p style={{ fontWeight: 400 }}>
                These are browser-reported signals, not proof of misconduct — review the
                timeline below and use your judgement before marking a verdict.
              </p>
            </section>

            <section className="table-panel">
              <div className="panel-header">
                <div>
                  <h3>Event Timeline</h3>
                </div>
              </div>
              <div className="table-wrapper">
                <table className="classic-table">
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Event</th>
                      <th>Severity</th>
                      <th>Confidence</th>
                      <th>Detail</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proctoringDetail.events.map((event) => (
                      <tr key={event.id}>
                        <td>{event.occurred_at || "-"}</td>
                        <td>{event.event_type}</td>
                        <td>
                          <span
                            className={
                              event.severity === "critical"
                                ? "status danger"
                                : event.severity === "warning"
                                ? "status pending"
                                : "status"
                            }
                          >
                            {event.severity}
                          </span>
                        </td>
                        <td>{event.confidence !== null && event.confidence !== undefined ? `${Math.round(event.confidence * 100)}%` : "-"}</td>
                        <td>{event.detail || "-"}</td>
                      </tr>
                    ))}
                    {!proctoringDetail.events.length && (
                      <tr>
                        <td colSpan={5}>No events reported for this attempt.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            {proctoringDetail.snapshots.length > 0 && (
              <section className="table-panel">
                <div className="panel-header">
                  <div>
                    <h3>Webcam Snapshots</h3>
                    <p>Periodic still photos, not a continuous recording. Each view of an image is logged.</p>
                  </div>
                </div>
                <div className="proctoring-snapshot-grid">
                  {proctoringDetail.snapshots.map((snap) => (
                    <div key={snap.id} className="proctoring-snapshot-item">
                      {snapshotUrls[snap.id] ? (
                        <img src={snapshotUrls[snap.id]} alt={`Webcam snapshot at ${snap.captured_at}`} />
                      ) : (
                        <div className="proctoring-snapshot-placeholder">
                          {snapshotsLoaded ? "Purged by retention" : "Loading..."}
                        </div>
                      )}
                      <small>{snap.captured_at || "-"}</small>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section className="form-panel">
              <div className="panel-header">
                <div>
                  <h3>Review</h3>
                  <p>
                    Current verdict: <strong>{proctoringDetail.review_status}</strong>
                    {proctoringDetail.reviewed_by && ` — by ${proctoringDetail.reviewed_by}`}
                  </p>
                </div>
              </div>
              <div className="form-field">
                <label>Notes</label>
                <textarea
                  rows={3}
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Optional notes about this session"
                />
              </div>
              <div className="form-actions">
                <button type="button" className="primary-button" onClick={() => handleReviewSubmit("Cleared")}>
                  Mark Cleared
                </button>
                <button
                  type="button"
                  className="light-button"
                  style={{ color: "var(--danger-600)", borderColor: "var(--danger-100)" }}
                  onClick={() => handleReviewSubmit("Flagged")}
                >
                  Mark Flagged
                </button>
                <button type="button" className="light-button" onClick={() => handleReviewSubmit("Pending")}>
                  Reset to Pending
                </button>
              </div>
            </section>
          </>
        )}
      </div>
    );
  }

  if (pageMode === "policies") {
    return (
      <div className="management-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Academics</p>
            <h2>Proctoring Policies</h2>
            <p>Reusable fullscreen / copy-paste / violation-threshold / retention configs, attached to a test when you create or edit it.</p>
          </div>
          <button type="button" className="light-button" onClick={backToList}>
            <ArrowLeft size={17} />
            Back
          </button>
        </section>

        {message && <div className="toast-notification">{message}</div>}

        <section className="form-panel">
          <div className="panel-header">
            <div>
              <h3>{editingPolicyId ? "Edit Policy" : "Add Policy"}</h3>
            </div>
          </div>
          <form className="classic-form" onSubmit={handleSubmitPolicy}>
            <div className="form-grid">
              <div className="form-field">
                <label>Name *</label>
                <input type="text" name="name" value={policyForm.name} onChange={handlePolicyFormChange} required />
              </div>
              <div className="form-field">
                <label>Violations before auto-submit</label>
                <input
                  type="number"
                  name="max_violations_before_autosubmit"
                  value={policyForm.max_violations_before_autosubmit}
                  onChange={handlePolicyFormChange}
                  min="1"
                />
              </div>
              <div className="form-field">
                <label>Retention (days)</label>
                <input
                  type="number"
                  name="retention_days"
                  value={policyForm.retention_days}
                  onChange={handlePolicyFormChange}
                  min="1"
                />
              </div>
              <div className="form-field">
                <label>Enforcement</label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400 }}>
                  <input
                    type="checkbox"
                    name="require_fullscreen"
                    checked={policyForm.require_fullscreen}
                    onChange={handlePolicyFormChange}
                  />
                  Require fullscreen
                </label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400 }}>
                  <input
                    type="checkbox"
                    name="block_copy_paste"
                    checked={policyForm.block_copy_paste}
                    onChange={handlePolicyFormChange}
                  />
                  Block copy / paste / right-click
                </label>
              </div>
              <div className="form-field">
                <label>Webcam (Phase 2)</label>
                <label style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 400 }}>
                  <input
                    type="checkbox"
                    name="require_webcam"
                    checked={policyForm.require_webcam}
                    onChange={handlePolicyFormChange}
                  />
                  Capture periodic webcam snapshots
                </label>
                <small>
                  Still photos only, not continuous recording. Requires the student's browser
                  permission and the same guardian consent as the other proctoring signals.
                </small>
              </div>
              {policyForm.require_webcam && (
                <div className="form-field">
                  <label>Snapshot interval (seconds)</label>
                  <input
                    type="number"
                    name="capture_interval_seconds"
                    value={policyForm.capture_interval_seconds}
                    onChange={handlePolicyFormChange}
                    min="10"
                  />
                </div>
              )}
            </div>
            <div className="form-actions">
              <button type="submit" className="primary-button">
                <PlusCircle size={18} />
                {editingPolicyId ? "Update Policy" : "Add Policy"}
              </button>
              {editingPolicyId && (
                <button
                  type="button"
                  className="light-button"
                  onClick={() => {
                    setEditingPolicyId(null);
                    setPolicyForm(emptyPolicyForm);
                  }}
                >
                  Cancel Edit
                </button>
              )}
            </div>
          </form>
        </section>

        <section className="table-panel">
          <div className="panel-header">
            <div>
              <h3>Policies</h3>
            </div>
          </div>
          <div className="table-wrapper">
            <table className="classic-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Fullscreen</th>
                  <th>Block Copy/Paste</th>
                  <th>Webcam</th>
                  <th>Violations → Auto-submit</th>
                  <th>Retention (days)</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {policies.map((policy) => (
                  <tr key={policy.id}>
                    <td>{policy.name}</td>
                    <td>{policy.require_fullscreen ? "Yes" : "No"}</td>
                    <td>{policy.block_copy_paste ? "Yes" : "No"}</td>
                    <td>{policy.require_webcam ? `Every ${policy.capture_interval_seconds}s` : "No"}</td>
                    <td>{policy.max_violations_before_autosubmit}</td>
                    <td>{policy.retention_days}</td>
                    <td>
                      <div className="action-buttons">
                        <button type="button" className="edit-button" onClick={() => handleEditPolicy(policy)} title="Edit">
                          <Edit size={15} />
                        </button>
                        <button type="button" className="delete-button" onClick={() => handleDeletePolicy(policy.id)} title="Delete">
                          <Trash2 size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {!policies.length && (
                  <tr>
                    <td colSpan={7}>No proctoring policies yet — proctored tests use strict defaults until you add one.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Academics</p>
          <h2>Online Tests</h2>
          <p>Auto-graded multiple-choice and true/false quizzes, taken by students through the portal.</p>
        </div>
        <div className="module-header-actions">
          {proctoringAvailable && (
            <button type="button" className="light-button" onClick={openPolicies}>
              <ShieldCheck size={18} />
              Proctoring Policies
            </button>
          )}
          <button type="button" className="primary-button" onClick={handleAddTest}>
            <PlusCircle size={18} />
            Create Test
          </button>
        </div>
      </section>

      <section className="summary-strip report-summary-grid">
        <div className="summary-card">
          <FileQuestion size={22} />
          <div>
            <span>Total Tests</span>
            <strong>{tests.length}</strong>
          </div>
        </div>
        <div className="summary-card">
          <ListChecks size={22} />
          <div>
            <span>Published</span>
            <strong>{tests.filter((t) => t.status === "Published").length}</strong>
          </div>
        </div>
      </section>

      {message && <div className="toast-notification">{message}</div>}

      <EnhancedRecordsTable
        data={filteredTests}
        emptyText="No online tests created yet."
        loading={loading}
        loadingText="Loading tests..."
        searchPlaceholder="Search class, subject, title, status..."
        searchText={searchText}
        setSearchText={setSearchText}
        columns={[
          { key: "class_name", label: "Class", render: (t) => [t.class_name, t.section].filter(Boolean).join(" - ") || "-" },
          {
            key: "title",
            label: "Title",
            render: (t) => (
              <>
                {t.title}
                {t.proctoring_enabled && <span className="status pending online-test-proctored-badge">Proctored</span>}
              </>
            ),
          },
          { key: "subject", label: "Subject", render: (t) => t.subject || "-" },
          { key: "question_count", label: "Questions", render: (t) => t.question_count },
          { key: "total_marks", label: "Marks", render: (t) => t.total_marks },
          {
            key: "status",
            label: "Status",
            render: (t) => (
              <span className={t.status === "Published" ? "status active" : t.status === "Closed" ? "status danger" : "status pending"}>
                {t.status}
              </span>
            ),
            value: (t) => t.status,
          },
          {
            key: "actions",
            label: "Actions",
            hideable: false,
            actions: false,
            render: (t) => (
              <div className="action-buttons">
                <button type="button" className="edit-button" onClick={() => openQuestions(t)} title="Manage Questions">
                  <FileQuestion size={15} />
                </button>
                <button type="button" className="edit-button" onClick={() => openResults(t)} title="View Results">
                  <BarChart3 size={15} />
                </button>
                <button type="button" className="edit-button" onClick={() => handleEditTest(t)} title="Edit">
                  <Edit size={15} />
                </button>
                {t.status === "Published" && (
                  <button type="button" className="edit-button" onClick={() => handleStatusChange(t, "Closed")} title="Close">
                    Close
                  </button>
                )}
                <button type="button" className="delete-button" onClick={() => handleDeleteTest(t.id)} title="Delete">
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
