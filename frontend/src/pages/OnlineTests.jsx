import { useEffect, useState } from "react";
import {
  ArrowLeft,
  Edit,
  Trash2,
  PlusCircle,
  FileQuestion,
  ListChecks,
  BarChart3,
} from "lucide-react";

import API from "../api";
import EnhancedRecordsTable from "../components/EnhancedRecordsTable";

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
};

const emptyQuestionForm = {
  question_type: "mcq_single",
  question_text: "",
  options: ["", "", "", ""],
  correct_option: "",
  marks: 1,
};

function getApiErrorMessage(error, fallback) {
  return error.response?.data?.detail || fallback;
}

export default function OnlineTests() {
  const [tests, setTests] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [searchText, setSearchText] = useState("");

  const [pageMode, setPageMode] = useState("list"); // list | form | questions | results
  const [testForm, setTestForm] = useState(emptyTestForm);
  const [editingId, setEditingId] = useState(null);

  const [activeTest, setActiveTest] = useState(null);
  const [questions, setQuestions] = useState([]);
  const [questionForm, setQuestionForm] = useState(emptyQuestionForm);
  const [results, setResults] = useState([]);

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

  useEffect(() => {
    loadTests();
    loadTeachers();
  }, []);

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
  }

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
                <input type="text" name="class_name" value={testForm.class_name} onChange={handleTestChange} placeholder="e.g. 8" required />
              </div>
              <div className="form-field">
                <label>Section</label>
                <input type="text" name="section" value={testForm.section} onChange={handleTestChange} placeholder="blank = all sections" />
              </div>
              <div className="form-field">
                <label>Academic Year</label>
                <input type="text" name="academic_year" value={testForm.academic_year} onChange={handleTestChange} placeholder="2026-27" />
              </div>
              <div className="form-field">
                <label>Subject</label>
                <input type="text" name="subject" value={testForm.subject} onChange={handleTestChange} />
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
                </tr>
              ))}
              {!results.length && (
                <tr>
                  <td colSpan={5}>No attempts yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
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
          { key: "title", label: "Title", render: (t) => t.title },
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
