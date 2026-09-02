import { useEffect, useState } from "react";
import {
  ArrowLeft,
  BookOpen,
  CheckCircle2,
  Edit,
  GraduationCap,
  Layers,
  PlusCircle,
  Star,
  Trash2,
  Users,
} from "lucide-react";

import API from "../api";
import EnhancedRecordsTable from "../components/EnhancedRecordsTable";
import { isFeatureEnabled } from "../auth";

const COURSE_TYPES = [
  ["self_paced", "Self-paced"],
  ["blended", "Blended (with sessions)"],
  ["e_material", "E-material shelf"],
];
const STATUSES = ["Draft", "Published", "Archived"];
const CONTENT_TYPES = [
  ["text", "Text"],
  ["link", "Link"],
  ["video", "Video"],
  ["document", "Document"],
  ["resource", "Learning resource"],
  ["scorm", "SCORM package"],
  ["online_test", "Online test"],
  ["assignment", "Assignment"],
  ["session", "Instructor-led session"],
];
const COMPLETION_RULES = [
  ["view", "Opening it is enough"],
  ["submit", "Submit / attempt it"],
  ["score", "Reach a minimum score"],
  ["manual", "Learner ticks it off"],
];
// Lessons that point at something rather than carrying it.
const POINTER_FIELD = {
  resource: "resource_id",
  scorm: "scorm_package_id",
  online_test: "online_test_id",
  assignment: "assignment_id",
  session: "session_id",
};

const emptyCourse = {
  code: "",
  title: "",
  description: "",
  course_type: "self_paced",
  academic_year: "",
  class_name: "",
  section: "",
  subject: "",
  trainer_teacher_id: "",
  status: "Draft",
  available_from: "",
  allow_self_enrollment: false,
  auto_enroll_class: false,
  prerequisite_course_id: "",
  enforce_lesson_order: true,
  duration_minutes: "",
  is_mandatory: false,
};

const emptyLesson = {
  title: "",
  description: "",
  content_type: "text",
  content: "",
  url: "",
  resource_id: "",
  scorm_package_id: "",
  online_test_id: "",
  assignment_id: "",
  session_id: "",
  completion_rule: "view",
  is_required: true,
  min_score: "",
  estimated_minutes: "",
  prerequisite_lesson_id: "",
};

function getApiErrorMessage(error, fallback) {
  return error.response?.data?.detail || fallback;
}

function numberOrNull(value) {
  return value === "" || value === null || value === undefined ? null : Number(value);
}

export default function Courses() {
  const scormEnabled = isFeatureEnabled("scorm");

  const [courses, setCourses] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [academicYears, setAcademicYears] = useState([]);

  const [formData, setFormData] = useState(emptyCourse);
  const [editingId, setEditingId] = useState(null);
  const [pageMode, setPageMode] = useState("list");
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  // Builder state
  const [activeCourse, setActiveCourse] = useState(null);
  const [outline, setOutline] = useState(null);
  const [sectionTitle, setSectionTitle] = useState("");
  const [lessonForm, setLessonForm] = useState({ ...emptyLesson, sectionId: null });
  const [editingLessonId, setEditingLessonId] = useState(null);
  const [pickLists, setPickLists] = useState({ resources: [], packages: [], tests: [], assignments: [], sessions: [] });

  // Enrollment board
  const [board, setBoard] = useState(null);

  useEffect(() => {
    if (!message) return undefined;
    const timeoutId = window.setTimeout(() => setMessage(""), 2500);
    return () => window.clearTimeout(timeoutId);
  }, [message]);

  async function loadCourses() {
    try {
      setLoading(true);
      const response = await API.get("/courses/");
      setCourses(response.data || []);
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to load courses."));
    } finally {
      setLoading(false);
    }
  }

  async function loadPickLists() {
    const [classesRes, subjectsRes, yearsRes, teachersRes] = await Promise.allSettled([
      API.get("/classes/"),
      API.get("/subjects/"),
      API.get("/academic-years/"),
      API.get("/teachers/"),
    ]);
    setClasses(classesRes.status === "fulfilled" ? classesRes.value.data || [] : []);
    setSubjects(subjectsRes.status === "fulfilled" ? subjectsRes.value.data || [] : []);
    setAcademicYears(yearsRes.status === "fulfilled" ? yearsRes.value.data || [] : []);
    setTeachers(teachersRes.status === "fulfilled" ? teachersRes.value.data || [] : []);
  }

  useEffect(() => {
    loadCourses();
    loadPickLists();
  }, []);

  const classNames = [...new Set(classes.map((c) => c.class_name).filter(Boolean))];
  const sectionsForClass = [
    ...new Set(
      classes.filter((c) => c.class_name === formData.class_name).map((c) => c.section).filter(Boolean)
    ),
  ];

  function handleChange(e) {
    const { name, value, type, checked } = e.target;
    setFormData((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  }

  function buildCoursePayload() {
    return {
      code: formData.code.trim() || null,
      title: formData.title.trim(),
      description: formData.description.trim() || null,
      course_type: formData.course_type,
      academic_year: formData.academic_year.trim() || null,
      class_name: formData.class_name.trim() || null,
      section: formData.section.trim() || null,
      subject: formData.subject.trim() || null,
      trainer_teacher_id: numberOrNull(formData.trainer_teacher_id),
      status: formData.status,
      available_from: formData.available_from || null,
      allow_self_enrollment: !!formData.allow_self_enrollment,
      auto_enroll_class: !!formData.auto_enroll_class,
      prerequisite_course_id: numberOrNull(formData.prerequisite_course_id),
      enforce_lesson_order: !!formData.enforce_lesson_order,
      duration_minutes: numberOrNull(formData.duration_minutes),
      is_mandatory: !!formData.is_mandatory,
    };
  }

  async function handleSubmit(e) {
    e.preventDefault();
    const payload = buildCoursePayload();
    if (!payload.title) {
      setMessage("Title is required.");
      return;
    }
    try {
      if (editingId) {
        await API.put(`/courses/${editingId}`, payload);
        setMessage("Course updated.");
      } else {
        await API.post("/courses/", payload);
        setMessage("Course created — add sections and lessons next.");
      }
      setFormData(emptyCourse);
      setEditingId(null);
      setPageMode("list");
      await loadCourses();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to save course."));
    }
  }

  function handleEdit(course) {
    setEditingId(course.id);
    setPageMode("form");
    setFormData({
      code: course.code || "",
      title: course.title || "",
      description: course.description || "",
      course_type: course.course_type || "self_paced",
      academic_year: course.academic_year || "",
      class_name: course.class_name || "",
      section: course.section || "",
      subject: course.subject || "",
      trainer_teacher_id: course.trainer_teacher_id || "",
      status: course.status || "Draft",
      available_from: course.available_from || "",
      allow_self_enrollment: !!course.allow_self_enrollment,
      auto_enroll_class: !!course.auto_enroll_class,
      prerequisite_course_id: course.prerequisite_course_id || "",
      enforce_lesson_order: course.enforce_lesson_order !== false,
      duration_minutes: course.duration_minutes ?? "",
      is_mandatory: !!course.is_mandatory,
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleDelete(id) {
    if (!window.confirm("Delete this course, with its sections, lessons and enrollments?")) return;
    try {
      await API.delete(`/courses/${id}`);
      setMessage("Course deleted.");
      await loadCourses();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to delete course."));
    }
  }

  function resetToList() {
    setEditingId(null);
    setFormData(emptyCourse);
    setActiveCourse(null);
    setOutline(null);
    setBoard(null);
    setEditingLessonId(null);
    setLessonForm({ ...emptyLesson, sectionId: null });
    setMessage("");
    setPageMode("list");
  }

  // ---- Builder ----

  async function openBuilder(course) {
    setActiveCourse(course);
    setOutline(null);
    setPageMode("builder");
    await Promise.all([loadOutline(course.id), loadBuilderPickLists(course)]);
  }

  async function loadOutline(courseId) {
    try {
      const response = await API.get(`/courses/${courseId}`);
      setOutline(response.data);
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to load the course outline."));
    }
  }

  // Only what this course can actually point at: material for its own class,
  // so a teacher isn't scrolling the whole school's content.
  async function loadBuilderPickLists(course) {
    const params = course.class_name ? { class_name: course.class_name } : {};
    const [resources, packages, tests, assignments, sessions] = await Promise.allSettled([
      API.get("/lms/resources", { params }),
      scormEnabled ? API.get("/scorm/packages", { params }) : Promise.resolve({ data: [] }),
      API.get("/online-tests/", { params }),
      API.get("/homework/", { params }),
      API.get(`/courses/${course.id}/sessions`),
    ]);
    setPickLists({
      resources: resources.status === "fulfilled" ? resources.value.data || [] : [],
      packages: packages.status === "fulfilled" ? packages.value.data || [] : [],
      tests: tests.status === "fulfilled" ? tests.value.data || [] : [],
      assignments: assignments.status === "fulfilled" ? assignments.value.data || [] : [],
      sessions: sessions.status === "fulfilled" ? sessions.value.data || [] : [],
    });
  }

  async function addSection(e) {
    e.preventDefault();
    if (!sectionTitle.trim()) return;
    try {
      await API.post(`/courses/${activeCourse.id}/sections`, { title: sectionTitle.trim() });
      setSectionTitle("");
      await loadOutline(activeCourse.id);
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to add section."));
    }
  }

  async function deleteSection(sectionId) {
    if (!window.confirm("Delete this section and its lessons?")) return;
    try {
      await API.delete(`/courses/${activeCourse.id}/sections/${sectionId}`);
      await loadOutline(activeCourse.id);
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to delete section."));
    }
  }

  function startLesson(sectionId) {
    setEditingLessonId(null);
    setLessonForm({ ...emptyLesson, sectionId });
  }

  function editLesson(lesson) {
    setEditingLessonId(lesson.id);
    setLessonForm({
      sectionId: lesson.section_id,
      title: lesson.title || "",
      description: lesson.description || "",
      content_type: lesson.content_type || "text",
      content: lesson.content || "",
      url: lesson.url || "",
      resource_id: lesson.resource_id || "",
      scorm_package_id: lesson.scorm_package_id || "",
      online_test_id: lesson.online_test_id || "",
      assignment_id: lesson.assignment_id || "",
      session_id: lesson.session_id || "",
      completion_rule: lesson.completion_rule || "view",
      is_required: lesson.is_required !== false,
      min_score: lesson.min_score ?? "",
      estimated_minutes: lesson.estimated_minutes ?? "",
      prerequisite_lesson_id: lesson.prerequisite_lesson_id || "",
    });
  }

  async function saveLesson(e) {
    e.preventDefault();
    const pointer = POINTER_FIELD[lessonForm.content_type];
    const payload = {
      title: lessonForm.title.trim(),
      description: lessonForm.description.trim() || null,
      content_type: lessonForm.content_type,
      content: lessonForm.content_type === "text" ? lessonForm.content : null,
      url: ["link", "video", "document"].includes(lessonForm.content_type) ? lessonForm.url.trim() : null,
      resource_id: null,
      scorm_package_id: null,
      online_test_id: null,
      assignment_id: null,
      session_id: null,
      completion_rule: lessonForm.completion_rule,
      is_required: !!lessonForm.is_required,
      min_score: numberOrNull(lessonForm.min_score),
      estimated_minutes: numberOrNull(lessonForm.estimated_minutes),
      prerequisite_lesson_id: numberOrNull(lessonForm.prerequisite_lesson_id),
    };
    if (pointer) payload[pointer] = numberOrNull(lessonForm[pointer]);

    try {
      if (editingLessonId) {
        await API.put(`/courses/${activeCourse.id}/lessons/${editingLessonId}`, payload);
      } else {
        await API.post(
          `/courses/${activeCourse.id}/sections/${lessonForm.sectionId}/lessons`,
          payload
        );
      }
      setLessonForm({ ...emptyLesson, sectionId: null });
      setEditingLessonId(null);
      await loadOutline(activeCourse.id);
      await loadCourses();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to save lesson."));
    }
  }

  async function deleteLesson(lessonId) {
    if (!window.confirm("Delete this lesson?")) return;
    try {
      await API.delete(`/courses/${activeCourse.id}/lessons/${lessonId}`);
      await loadOutline(activeCourse.id);
      await loadCourses();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to delete lesson."));
    }
  }

  // ---- Enrollment ----

  async function openBoard(course) {
    setActiveCourse(course);
    setBoard(null);
    setPageMode("board");
    await loadBoard(course.id);
  }

  async function loadBoard(courseId) {
    try {
      const response = await API.get(`/courses/${courseId}/enrollments`);
      setBoard(response.data);
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to load enrollments."));
    }
  }

  async function enrollWholeClass() {
    try {
      const response = await API.post(`/courses/${activeCourse.id}/enrollments`, { whole_class: true });
      setMessage(`Enrolled ${response.data.enrolled} student(s).`);
      await loadBoard(activeCourse.id);
      await loadCourses();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to enroll the class."));
    }
  }

  async function enrollOne(studentId) {
    try {
      const response = await API.post(`/courses/${activeCourse.id}/enrollments`, {
        student_ids: [studentId],
      });
      if (response.data.skipped_prerequisite?.length) {
        setMessage(`${response.data.skipped_prerequisite.join(", ")} has not finished the prerequisite course.`);
      } else {
        setMessage("Enrolled.");
      }
      await loadBoard(activeCourse.id);
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to enroll."));
    }
  }

  async function removeEnrollment(enrollmentId) {
    if (!window.confirm("Remove this learner from the course? Their progress goes with it.")) return;
    try {
      await API.delete(`/courses/${activeCourse.id}/enrollments/${enrollmentId}`);
      await loadBoard(activeCourse.id);
      await loadCourses();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to remove enrollment."));
    }
  }

  const filteredCourses = courses.filter((course) => {
    const text = `${course.title} ${course.code} ${course.class_name} ${course.subject} ${course.course_type} ${course.status}`.toLowerCase();
    return text.includes(searchText.toLowerCase());
  });

  const lessonPointerOptions = {
    resource: pickLists.resources.map((r) => [r.id, `${r.title} (${r.resource_type})`]),
    scorm: pickLists.packages.map((p) => [p.id, p.title]),
    online_test: pickLists.tests.map((t) => [t.id, t.title]),
    assignment: pickLists.assignments.map((a) => [a.id, a.title]),
    session: pickLists.sessions.map((s) => [s.id, s.title]),
  };
  const allLessons = (outline?.sections || []).flatMap((section) => section.lessons || []);

  if (pageMode === "form") {
    return (
      <div className="management-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Academics</p>
            <h2>{editingId ? "Edit Course" : "New Course"}</h2>
          </div>
          <button type="button" className="light-button" onClick={resetToList}>
            <ArrowLeft size={17} /> Back
          </button>
        </section>
        {message && <div className="toast-notification">{message}</div>}

        <section className="form-panel">
          <div className="panel-header">
            <div>
              <h3>Course details</h3>
              <p>Learners see a published course from its release date. Sections and lessons come next.</p>
            </div>
          </div>
          <form className="classic-form" onSubmit={handleSubmit}>
            <div className="form-grid">
              <div className="form-field">
                <label>Title *</label>
                <input type="text" name="title" value={formData.title} onChange={handleChange} required />
              </div>
              <div className="form-field">
                <label>Course Code</label>
                <input type="text" name="code" value={formData.code} onChange={handleChange} placeholder="Optional, unique" />
              </div>
              <div className="form-field">
                <label>Type</label>
                <select name="course_type" value={formData.course_type} onChange={handleChange}>
                  {COURSE_TYPES.map(([value, label]) => (
                    <option key={value} value={value}>{label}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>Class</label>
                <select
                  name="class_name"
                  value={formData.class_name}
                  onChange={(e) => {
                    handleChange(e);
                    setFormData((prev) => ({ ...prev, section: "" }));
                  }}
                >
                  <option value="">School-wide (no class)</option>
                  {classNames.map((name) => (
                    <option key={name} value={name}>{name}</option>
                  ))}
                </select>
                <small>Blank means any student can be nominated onto it.</small>
              </div>
              <div className="form-field">
                <label>Section</label>
                <select name="section" value={formData.section} onChange={handleChange} disabled={!formData.class_name}>
                  <option value="">All sections</option>
                  {sectionsForClass.map((section) => (
                    <option key={section} value={section}>{section}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>Subject</label>
                <select name="subject" value={formData.subject} onChange={handleChange}>
                  <option value="">Select Subject</option>
                  {subjects.filter((s) => s.is_active !== false).map((subject) => (
                    <option key={subject.id} value={subject.subject_name}>{subject.subject_name}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>Trainer</label>
                <select name="trainer_teacher_id" value={formData.trainer_teacher_id} onChange={handleChange}>
                  <option value="">Select Teacher</option>
                  {teachers.map((teacher) => (
                    <option key={teacher.id} value={teacher.id}>{teacher.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>Academic Year</label>
                <select name="academic_year" value={formData.academic_year} onChange={handleChange}>
                  <option value="">Select Academic Year</option>
                  {academicYears.map((year) => (
                    <option key={year.id} value={year.name}>{year.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>Status</label>
                <select name="status" value={formData.status} onChange={handleChange}>
                  {STATUSES.map((status) => (
                    <option key={status} value={status}>{status}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>Release Date</label>
                <input type="date" name="available_from" value={formData.available_from} onChange={handleChange} />
                <small>Blank releases it as soon as it is published.</small>
              </div>
              <div className="form-field">
                <label>Prerequisite Course</label>
                <select name="prerequisite_course_id" value={formData.prerequisite_course_id} onChange={handleChange}>
                  <option value="">None</option>
                  {courses.filter((c) => c.id !== editingId).map((course) => (
                    <option key={course.id} value={course.id}>{course.title}</option>
                  ))}
                </select>
                <small>Must be completed before this course can be started.</small>
              </div>
              <div className="form-field">
                <label>Expected Duration (minutes)</label>
                <input type="number" name="duration_minutes" min="0" value={formData.duration_minutes} onChange={handleChange} />
              </div>
              <div className="form-field">
                <label>Enrollment &amp; sequencing</label>
                <label style={{ display: "flex", gap: 8, fontWeight: 400 }}>
                  <input type="checkbox" name="auto_enroll_class" checked={formData.auto_enroll_class} onChange={handleChange} />
                  Enroll the whole class when published
                </label>
                <label style={{ display: "flex", gap: 8, fontWeight: 400 }}>
                  <input type="checkbox" name="allow_self_enrollment" checked={formData.allow_self_enrollment} onChange={handleChange} />
                  Let learners join it themselves
                </label>
                <label style={{ display: "flex", gap: 8, fontWeight: 400 }}>
                  <input type="checkbox" name="enforce_lesson_order" checked={formData.enforce_lesson_order} onChange={handleChange} />
                  Lessons unlock in order
                </label>
                <label style={{ display: "flex", gap: 8, fontWeight: 400 }}>
                  <input type="checkbox" name="is_mandatory" checked={formData.is_mandatory} onChange={handleChange} />
                  Mandatory
                </label>
              </div>
              <div className="form-field">
                <label>Description</label>
                <textarea name="description" value={formData.description} onChange={handleChange} rows={3} />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="primary-button">
                <PlusCircle size={18} /> {editingId ? "Update Course" : "Create Course"}
              </button>
              <button type="button" className="light-button" onClick={resetToList}>Cancel</button>
            </div>
          </form>
        </section>
      </div>
    );
  }

  if (pageMode === "builder" && activeCourse) {
    return (
      <div className="management-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Academics</p>
            <h2>{activeCourse.title}</h2>
            <p>
              {[activeCourse.class_name, activeCourse.section].filter(Boolean).join(" - ") || "School-wide"}
              {activeCourse.subject ? ` · ${activeCourse.subject}` : ""}
              {` · ${activeCourse.enforce_lesson_order ? "Lessons unlock in order" : "Lessons open in any order"}`}
            </p>
          </div>
          <button type="button" className="light-button" onClick={resetToList}>
            <ArrowLeft size={17} /> Back
          </button>
        </section>
        {message && <div className="toast-notification">{message}</div>}

        <section className="form-panel">
          <div className="panel-header">
            <div>
              <h3>Add a section</h3>
              <p>Sections group lessons — a unit, a week, a topic.</p>
            </div>
          </div>
          <form className="classic-form" onSubmit={addSection}>
            <div className="form-grid">
              <div className="form-field">
                <label>Section title</label>
                <input type="text" value={sectionTitle} onChange={(e) => setSectionTitle(e.target.value)} placeholder="Unit 1 — Fractions" />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="primary-button"><PlusCircle size={18} /> Add Section</button>
            </div>
          </form>
        </section>

        {!outline && <div className="message-box">Loading outline…</div>}

        {(outline?.sections || []).map((section) => (
          <section className="form-panel" key={section.id}>
            <div className="panel-header">
              <div>
                <h3>{section.sequence_no}. {section.title}</h3>
                <p>{(section.lessons || []).length} lesson(s)</p>
              </div>
              <div className="module-header-actions">
                <button type="button" className="secondary-button" onClick={() => startLesson(section.id)}>
                  <PlusCircle size={16} /> Add Lesson
                </button>
                <button type="button" className="delete-button" onClick={() => deleteSection(section.id)}>
                  <Trash2 size={15} />
                </button>
              </div>
            </div>

            <div className="table-wrapper">
              <table className="classic-table">
                <thead>
                  <tr>
                    <th>#</th><th>Lesson</th><th>Type</th><th>Completion</th><th>Required</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {(section.lessons || []).map((lesson) => (
                    <tr key={lesson.id}>
                      <td>{lesson.sequence_no}</td>
                      <td>
                        {lesson.title}
                        {lesson.prerequisite_lesson_id && (
                          <small style={{ display: "block" }}>
                            After: {allLessons.find((l) => l.id === lesson.prerequisite_lesson_id)?.title || "—"}
                          </small>
                        )}
                      </td>
                      <td>{CONTENT_TYPES.find(([v]) => v === lesson.content_type)?.[1] || lesson.content_type}</td>
                      <td>
                        {COMPLETION_RULES.find(([v]) => v === lesson.completion_rule)?.[1]}
                        {lesson.min_score != null ? ` (${lesson.min_score})` : ""}
                      </td>
                      <td>{lesson.is_required ? "Yes" : "Optional"}</td>
                      <td>
                        <div className="action-buttons">
                          <button type="button" className="edit-button" onClick={() => editLesson(lesson)} title="Edit">
                            <Edit size={15} />
                          </button>
                          <button type="button" className="delete-button" onClick={() => deleteLesson(lesson.id)} title="Delete">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {!(section.lessons || []).length && (
                    <tr><td colSpan={6}>No lessons in this section yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {(lessonForm.sectionId === section.id || (editingLessonId && (section.lessons || []).some((l) => l.id === editingLessonId))) && (
              <form className="classic-form" onSubmit={saveLesson}>
                <div className="form-grid">
                  <div className="form-field">
                    <label>Lesson title *</label>
                    <input
                      type="text"
                      value={lessonForm.title}
                      onChange={(e) => setLessonForm((prev) => ({ ...prev, title: e.target.value }))}
                      required
                    />
                  </div>
                  <div className="form-field">
                    <label>Content type</label>
                    <select
                      value={lessonForm.content_type}
                      onChange={(e) => setLessonForm((prev) => ({ ...prev, content_type: e.target.value }))}
                    >
                      {CONTENT_TYPES.filter(([value]) => value !== "scorm" || scormEnabled).map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>

                  {lessonForm.content_type === "text" && (
                    <div className="form-field">
                      <label>Text *</label>
                      <textarea
                        rows={4}
                        value={lessonForm.content}
                        onChange={(e) => setLessonForm((prev) => ({ ...prev, content: e.target.value }))}
                      />
                    </div>
                  )}

                  {["link", "video", "document"].includes(lessonForm.content_type) && (
                    <div className="form-field">
                      <label>URL *</label>
                      <input
                        type="text"
                        value={lessonForm.url}
                        onChange={(e) => setLessonForm((prev) => ({ ...prev, url: e.target.value }))}
                        placeholder="https://…"
                      />
                    </div>
                  )}

                  {POINTER_FIELD[lessonForm.content_type] && (
                    <div className="form-field">
                      <label>Item *</label>
                      <select
                        value={lessonForm[POINTER_FIELD[lessonForm.content_type]]}
                        onChange={(e) =>
                          setLessonForm((prev) => ({
                            ...prev,
                            [POINTER_FIELD[lessonForm.content_type]]: e.target.value,
                          }))
                        }
                      >
                        <option value="">Select…</option>
                        {(lessonPointerOptions[lessonForm.content_type] || []).map(([id, label]) => (
                          <option key={id} value={id}>{label}</option>
                        ))}
                      </select>
                      {!(lessonPointerOptions[lessonForm.content_type] || []).length && (
                        <small>Nothing available for this class yet.</small>
                      )}
                    </div>
                  )}

                  <div className="form-field">
                    <label>Counts as complete when</label>
                    <select
                      value={lessonForm.completion_rule}
                      onChange={(e) => setLessonForm((prev) => ({ ...prev, completion_rule: e.target.value }))}
                    >
                      {COMPLETION_RULES.map(([value, label]) => (
                        <option key={value} value={value}>{label}</option>
                      ))}
                    </select>
                  </div>
                  {lessonForm.completion_rule === "score" && (
                    <div className="form-field">
                      <label>Minimum score *</label>
                      <input
                        type="number"
                        step="0.5"
                        value={lessonForm.min_score}
                        onChange={(e) => setLessonForm((prev) => ({ ...prev, min_score: e.target.value }))}
                      />
                    </div>
                  )}
                  <div className="form-field">
                    <label>Unlocks after</label>
                    <select
                      value={lessonForm.prerequisite_lesson_id}
                      onChange={(e) => setLessonForm((prev) => ({ ...prev, prerequisite_lesson_id: e.target.value }))}
                    >
                      <option value="">Nothing in particular</option>
                      {allLessons.filter((l) => l.id !== editingLessonId).map((lesson) => (
                        <option key={lesson.id} value={lesson.id}>{lesson.title}</option>
                      ))}
                    </select>
                  </div>
                  <div className="form-field">
                    <label>Options</label>
                    <label style={{ display: "flex", gap: 8, fontWeight: 400 }}>
                      <input
                        type="checkbox"
                        checked={lessonForm.is_required}
                        onChange={(e) => setLessonForm((prev) => ({ ...prev, is_required: e.target.checked }))}
                      />
                      Required to finish the course
                    </label>
                  </div>
                </div>
                <div className="form-actions">
                  <button type="submit" className="primary-button">
                    {editingLessonId ? "Update Lesson" : "Add Lesson"}
                  </button>
                  <button
                    type="button"
                    className="light-button"
                    onClick={() => {
                      setLessonForm({ ...emptyLesson, sectionId: null });
                      setEditingLessonId(null);
                    }}
                  >
                    Cancel
                  </button>
                </div>
              </form>
            )}
          </section>
        ))}

        {outline && !(outline.sections || []).length && (
          <div className="message-box">No sections yet — add one above to start building.</div>
        )}
      </div>
    );
  }

  if (pageMode === "board" && activeCourse) {
    return (
      <div className="management-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Academics</p>
            <h2>Learners — {activeCourse.title}</h2>
          </div>
          <button type="button" className="light-button" onClick={resetToList}>
            <ArrowLeft size={17} /> Back
          </button>
        </section>
        {message && <div className="toast-notification">{message}</div>}

        {!board ? (
          <div className="message-box">Loading…</div>
        ) : (
          <>
            <section className="summary-strip report-summary-grid">
              <div className="summary-card">
                <Users size={22} />
                <div><span>Enrolled</span><strong>{board.enrolled_count}</strong></div>
              </div>
              <div className="summary-card positive">
                <CheckCircle2 size={22} />
                <div><span>Completed</span><strong>{board.completed_count}</strong></div>
              </div>
              <div className="summary-card">
                <GraduationCap size={22} />
                <div><span>Average Progress</span><strong>{board.average_progress}%</strong></div>
              </div>
            </section>

            {!!board.not_enrolled.length && (
              <section className="form-panel">
                <div className="panel-header">
                  <div>
                    <h3>Not enrolled ({board.not_enrolled.length})</h3>
                    <p>Students in this class who are not on the course yet.</p>
                  </div>
                  <button type="button" className="primary-button" onClick={enrollWholeClass}>
                    Enroll whole class
                  </button>
                </div>
                <div className="table-wrapper">
                  <table className="classic-table">
                    <thead><tr><th>Student</th><th>Admission No</th><th>Action</th></tr></thead>
                    <tbody>
                      {board.not_enrolled.map((student) => (
                        <tr key={student.student_id}>
                          <td>{student.student_name}</td>
                          <td>{student.admission_no || "-"}</td>
                          <td>
                            <button type="button" className="secondary-button" onClick={() => enrollOne(student.student_id)}>
                              Enroll
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}

            <div className="table-wrapper">
              <table className="classic-table">
                <thead>
                  <tr>
                    <th>Student</th><th>Joined via</th><th>Status</th><th>Progress</th>
                    <th>Score</th><th>Completed</th><th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {board.enrollments.map((enrollment) => (
                    <tr key={enrollment.id}>
                      <td>{enrollment.student_name_snapshot}</td>
                      <td>{enrollment.enrolled_via.replace("_", " ")}</td>
                      <td>
                        <span className={enrollment.status === "Completed" ? "status active" : "status pending"}>
                          {enrollment.status}
                        </span>
                      </td>
                      <td>{enrollment.progress_percent}%</td>
                      <td>{enrollment.final_score ?? "-"}</td>
                      <td>{enrollment.completed_at ? new Date(`${enrollment.completed_at}Z`).toLocaleDateString() : "-"}</td>
                      <td>
                        <button type="button" className="delete-button" onClick={() => removeEnrollment(enrollment.id)} title="Remove">
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {!board.enrollments.length && (
                    <tr><td colSpan={7}>Nobody is enrolled yet.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    );
  }

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Academics</p>
          <h2>Courses</h2>
          <p>Sequenced courses of sections and lessons, with enrollment and progress.</p>
        </div>
        <div className="module-header-actions">
          <button
            type="button"
            className="primary-button"
            onClick={() => {
              setEditingId(null);
              setFormData(emptyCourse);
              setPageMode("form");
            }}
          >
            <PlusCircle size={18} /> New Course
          </button>
        </div>
      </section>

      <section className="summary-strip report-summary-grid">
        <div className="summary-card">
          <BookOpen size={22} />
          <div><span>Courses</span><strong>{courses.length}</strong></div>
        </div>
        <div className="summary-card positive">
          <Layers size={22} />
          <div><span>Published</span><strong>{courses.filter((c) => c.status === "Published").length}</strong></div>
        </div>
        <div className="summary-card">
          <Users size={22} />
          <div><span>Enrollments</span><strong>{courses.reduce((sum, c) => sum + (c.enrolled_count || 0), 0)}</strong></div>
        </div>
      </section>

      {message && <div className="toast-notification">{message}</div>}

      <EnhancedRecordsTable
        data={filteredCourses}
        emptyText="No courses yet."
        loading={loading}
        loadingText="Loading courses..."
        searchPlaceholder="Search title, code, class, subject..."
        searchText={searchText}
        setSearchText={setSearchText}
        columns={[
          { key: "title", label: "Course", render: (c) => c.title },
          { key: "code", label: "Code", render: (c) => c.code || "-" },
          {
            key: "course_type",
            label: "Type",
            render: (c) => COURSE_TYPES.find(([v]) => v === c.course_type)?.[1] || c.course_type,
          },
          {
            key: "class_name",
            label: "Class",
            render: (c) => [c.class_name, c.section].filter(Boolean).join(" - ") || "School-wide",
          },
          {
            key: "status",
            label: "Status",
            render: (c) => (
              <span className={c.status === "Published" ? "status active" : c.status === "Archived" ? "status inactive" : "status pending"}>
                {c.status}
              </span>
            ),
            value: (c) => c.status,
          },
          {
            key: "lesson_count",
            label: "Outline",
            render: (c) => (
              <button type="button" className="text-link-button" onClick={() => openBuilder(c)}>
                {c.section_count || 0} sections · {c.lesson_count || 0} lessons
              </button>
            ),
            value: (c) => c.lesson_count || 0,
          },
          {
            key: "enrolled_count",
            label: "Learners",
            render: (c) => (
              <button type="button" className="text-link-button" onClick={() => openBoard(c)}>
                {c.enrolled_count || 0} enrolled · {c.completed_count || 0} done
              </button>
            ),
            value: (c) => c.enrolled_count || 0,
          },
          {
            key: "average_rating",
            label: "Rating",
            render: (c) =>
              c.average_rating != null ? (
                <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                  <Star size={13} /> {c.average_rating} ({c.rating_count})
                </span>
              ) : "-",
            value: (c) => c.average_rating || 0,
          },
          {
            key: "actions",
            label: "Actions",
            hideable: false,
            actions: false,
            render: (c) => (
              <div className="action-buttons">
                <button type="button" className="edit-button" onClick={() => handleEdit(c)} title="Edit">
                  <Edit size={15} />
                </button>
                <button type="button" className="delete-button" onClick={() => handleDelete(c.id)} title="Delete">
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
