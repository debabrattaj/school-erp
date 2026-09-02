import { useEffect, useState } from "react";
import { ArrowLeft, EyeOff, Eye, Lock, LockOpen, MessageCircle, Pin, PlusCircle, Send, Trash2 } from "lucide-react";

import API from "../api";
import EnhancedRecordsTable from "../components/EnhancedRecordsTable";

function getApiErrorMessage(error, fallback) {
  return error.response?.data?.detail || fallback;
}

const emptyForm = {
  title: "",
  body: "",
  course_id: "",
  class_name: "",
  section: "",
  subject: "",
};

export default function Discussions() {
  const [topics, setTopics] = useState([]);
  const [courses, setCourses] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);

  const [formData, setFormData] = useState(emptyForm);
  const [pageMode, setPageMode] = useState("list");
  const [activeTopic, setActiveTopic] = useState(null);
  const [thread, setThread] = useState(null);
  const [reply, setReply] = useState("");
  const [replyingTo, setReplyingTo] = useState(null);
  const [searchText, setSearchText] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!message) return undefined;
    const timeoutId = window.setTimeout(() => setMessage(""), 2500);
    return () => window.clearTimeout(timeoutId);
  }, [message]);

  async function loadTopics() {
    try {
      setLoading(true);
      const response = await API.get("/discussions/");
      setTopics(response.data || []);
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to load discussions."));
    } finally {
      setLoading(false);
    }
  }

  async function loadPickLists() {
    const [coursesRes, classesRes, subjectsRes] = await Promise.allSettled([
      API.get("/courses/"), API.get("/classes/"), API.get("/subjects/"),
    ]);
    setCourses(coursesRes.status === "fulfilled" ? coursesRes.value.data || [] : []);
    setClasses(classesRes.status === "fulfilled" ? classesRes.value.data || [] : []);
    setSubjects(subjectsRes.status === "fulfilled" ? subjectsRes.value.data || [] : []);
  }

  useEffect(() => {
    loadTopics();
    loadPickLists();
  }, []);

  const classNames = [...new Set(classes.map((c) => c.class_name).filter(Boolean))];

  function handleChange(e) {
    const { name, value } = e.target;
    setFormData((prev) => ({ ...prev, [name]: value }));
  }

  async function createTopic(e) {
    e.preventDefault();
    if (!formData.title.trim()) {
      setMessage("Title is required.");
      return;
    }
    if (!formData.course_id && !formData.class_name) {
      setMessage("Pick a course or a class for this topic to belong to.");
      return;
    }
    try {
      await API.post("/discussions/", {
        title: formData.title.trim(),
        body: formData.body.trim() || null,
        course_id: formData.course_id ? Number(formData.course_id) : null,
        class_name: formData.class_name || null,
        section: formData.section || null,
        subject: formData.subject || null,
      });
      setMessage("Topic opened.");
      setFormData(emptyForm);
      setPageMode("list");
      await loadTopics();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to open topic."));
    }
  }

  async function openThread(topic) {
    setActiveTopic(topic);
    setThread(null);
    setReply("");
    setReplyingTo(null);
    setPageMode("thread");
    try {
      const response = await API.get(`/discussions/${topic.id}`);
      setThread(response.data);
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to load the thread."));
    }
  }

  async function postReply(e) {
    e.preventDefault();
    if (!reply.trim()) return;
    try {
      await API.post(`/discussions/${activeTopic.id}/posts`, {
        body: reply.trim(),
        parent_post_id: replyingTo,
      });
      setReply("");
      setReplyingTo(null);
      const response = await API.get(`/discussions/${activeTopic.id}`);
      setThread(response.data);
      await loadTopics();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to post."));
    }
  }

  async function toggleHidden(post) {
    const hiding = !post.is_hidden;
    let reason = null;
    if (hiding) {
      reason = window.prompt("Why is this being hidden? (optional)") || null;
    }
    try {
      await API.post(`/discussions/${activeTopic.id}/posts/${post.id}/hide`, {
        hidden: hiding,
        reason,
      });
      const response = await API.get(`/discussions/${activeTopic.id}`);
      setThread(response.data);
      await loadTopics();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to update that post."));
    }
  }

  async function toggleTopicFlag(topic, field) {
    try {
      await API.put(`/discussions/${topic.id}`, { [field]: !topic[field] });
      await loadTopics();
      if (activeTopic?.id === topic.id) {
        setActiveTopic({ ...topic, [field]: !topic[field] });
      }
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to update the topic."));
    }
  }

  async function deleteTopic(id) {
    if (!window.confirm("Delete this topic and every post in it?")) return;
    try {
      await API.delete(`/discussions/${id}`);
      setMessage("Topic deleted.");
      setPageMode("list");
      await loadTopics();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to delete."));
    }
  }

  const filtered = topics.filter((t) =>
    `${t.title} ${t.class_name} ${t.subject} ${t.course_title} ${t.created_by_name}`
      .toLowerCase()
      .includes(searchText.toLowerCase())
  );

  if (pageMode === "form") {
    return (
      <div className="management-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Academics</p>
            <h2>New Discussion Topic</h2>
          </div>
          <button type="button" className="light-button" onClick={() => setPageMode("list")}>
            <ArrowLeft size={17} /> Back
          </button>
        </section>
        {message && <div className="toast-notification">{message}</div>}

        <section className="form-panel">
          <div className="panel-header">
            <div>
              <h3>Topic</h3>
              <p>A course topic is visible to everyone enrolled; a class topic to that whole class.</p>
            </div>
          </div>
          <form className="classic-form" onSubmit={createTopic}>
            <div className="form-grid">
              <div className="form-field">
                <label>Title *</label>
                <input type="text" name="title" value={formData.title} onChange={handleChange} required />
              </div>
              <div className="form-field">
                <label>Course</label>
                <select name="course_id" value={formData.course_id} onChange={handleChange}>
                  <option value="">Not tied to a course</option>
                  {courses.map((course) => (
                    <option key={course.id} value={course.id}>{course.title}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>Class</label>
                <select name="class_name" value={formData.class_name} onChange={handleChange}>
                  <option value="">No class</option>
                  {classNames.map((name) => <option key={name} value={name}>{name}</option>)}
                </select>
                <small>Needed unless the topic belongs to a course.</small>
              </div>
              <div className="form-field">
                <label>Subject</label>
                <select name="subject" value={formData.subject} onChange={handleChange}>
                  <option value="">Select Subject</option>
                  {subjects.filter((s) => s.is_active !== false).map((s) => (
                    <option key={s.id} value={s.subject_name}>{s.subject_name}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>Opening message</label>
                <textarea name="body" value={formData.body} onChange={handleChange} rows={4} />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="primary-button"><PlusCircle size={18} /> Open Topic</button>
              <button type="button" className="light-button" onClick={() => setPageMode("list")}>Cancel</button>
            </div>
          </form>
        </section>
      </div>
    );
  }

  if (pageMode === "thread" && activeTopic) {
    return (
      <div className="management-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Academics</p>
            <h2>{activeTopic.title}</h2>
            <p>
              {activeTopic.course_title || [activeTopic.class_name, activeTopic.section].filter(Boolean).join(" - ")}
              {activeTopic.is_locked ? " · Locked" : ""}
            </p>
          </div>
          <div className="module-header-actions">
            <button type="button" className="secondary-button" onClick={() => toggleTopicFlag(activeTopic, "is_pinned")}>
              <Pin size={16} /> {activeTopic.is_pinned ? "Unpin" : "Pin"}
            </button>
            <button type="button" className="secondary-button" onClick={() => toggleTopicFlag(activeTopic, "is_locked")}>
              {activeTopic.is_locked ? <LockOpen size={16} /> : <Lock size={16} />}
              {activeTopic.is_locked ? "Unlock" : "Lock"}
            </button>
            <button type="button" className="light-button" onClick={() => setPageMode("list")}>
              <ArrowLeft size={17} /> Back
            </button>
          </div>
        </section>
        {message && <div className="toast-notification">{message}</div>}

        {!thread ? (
          <div className="message-box">Loading…</div>
        ) : (
          <div className="portal-stack">
            {thread.posts.map((post) => (
              <div
                className="portal-card"
                key={post.id}
                style={{ marginLeft: post.parent_post_id ? 28 : 0, opacity: post.is_hidden ? 0.6 : 1 }}
              >
                <div className="portal-card-title">
                  <strong>{post.author_name}</strong>
                  <span className="status pending">{post.author_role}</span>
                  {post.is_hidden && <span className="status danger">Hidden</span>}
                </div>
                <div className="portal-card-meta">
                  {post.created_at ? new Date(`${post.created_at}Z`).toLocaleString() : ""}
                  {post.is_hidden && post.hidden_by ? ` · hidden by ${post.hidden_by}` : ""}
                  {post.hidden_reason ? ` — ${post.hidden_reason}` : ""}
                </div>
                <p>{post.body}</p>
                <div className="portal-card-actions">
                  <button type="button" className="secondary-button" onClick={() => setReplyingTo(post.parent_post_id || post.id)}>
                    Reply
                  </button>
                  <button type="button" className="secondary-button" onClick={() => toggleHidden(post)}>
                    {post.is_hidden ? <Eye size={15} /> : <EyeOff size={15} />}
                    {post.is_hidden ? " Unhide" : " Hide"}
                  </button>
                </div>
              </div>
            ))}
            {!thread.posts.length && <div className="portal-card">Nothing posted yet.</div>}

            <form className="form-panel" onSubmit={postReply}>
              <div className="panel-header">
                <div>
                  <h3>{replyingTo ? "Reply" : "Post to this topic"}</h3>
                  {activeTopic.is_locked && <p>This topic is locked — the class cannot reply, but staff can.</p>}
                </div>
              </div>
              <div className="form-grid">
                <div className="form-field">
                  <label>Message</label>
                  <textarea rows={3} value={reply} onChange={(e) => setReply(e.target.value)} />
                </div>
              </div>
              <div className="form-actions">
                <button type="submit" className="primary-button"><Send size={16} /> Post</button>
                {replyingTo && (
                  <button type="button" className="light-button" onClick={() => setReplyingTo(null)}>
                    Cancel reply
                  </button>
                )}
                <button type="button" className="delete-button" onClick={() => deleteTopic(activeTopic.id)}>
                  <Trash2 size={15} /> Delete topic
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Academics</p>
          <h2>Discussion Forums</h2>
          <p>Course and class discussion, with moderation that hides rather than destroys.</p>
        </div>
        <div className="module-header-actions">
          <button type="button" className="primary-button" onClick={() => { setFormData(emptyForm); setPageMode("form"); }}>
            <PlusCircle size={18} /> New Topic
          </button>
        </div>
      </section>

      <section className="summary-strip report-summary-grid">
        <div className="summary-card">
          <MessageCircle size={22} />
          <div><span>Topics</span><strong>{topics.length}</strong></div>
        </div>
        <div className="summary-card">
          <Send size={22} />
          <div><span>Posts</span><strong>{topics.reduce((sum, t) => sum + (t.post_count || 0), 0)}</strong></div>
        </div>
      </section>

      {message && <div className="toast-notification">{message}</div>}

      <EnhancedRecordsTable
        data={filtered}
        emptyText="No discussion topics yet."
        loading={loading}
        loadingText="Loading topics..."
        searchPlaceholder="Search title, course, class..."
        searchText={searchText}
        setSearchText={setSearchText}
        columns={[
          {
            key: "title",
            label: "Topic",
            render: (t) => (
              <button type="button" className="text-link-button" onClick={() => openThread(t)}>
                {t.is_pinned ? "📌 " : ""}{t.title}
              </button>
            ),
            value: (t) => t.title,
          },
          { key: "course_title", label: "Course", render: (t) => t.course_title || "-" },
          { key: "class_name", label: "Class", render: (t) => [t.class_name, t.section].filter(Boolean).join(" - ") || "-" },
          { key: "created_by_name", label: "Opened by", render: (t) => t.created_by_name },
          { key: "post_count", label: "Posts", render: (t) => t.post_count },
          {
            key: "last_post_at",
            label: "Last activity",
            render: (t) => (t.last_post_at ? new Date(`${t.last_post_at}Z`).toLocaleString() : "-"),
          },
          {
            key: "is_locked",
            label: "State",
            render: (t) => (t.is_locked ? <span className="status inactive">Locked</span> : <span className="status active">Open</span>),
            value: (t) => (t.is_locked ? "Locked" : "Open"),
          },
          {
            key: "actions",
            label: "Actions",
            hideable: false,
            actions: false,
            render: (t) => (
              <div className="action-buttons">
                <button type="button" className="edit-button" onClick={() => toggleTopicFlag(t, "is_pinned")} title="Pin/unpin">
                  <Pin size={15} />
                </button>
                <button type="button" className="edit-button" onClick={() => toggleTopicFlag(t, "is_locked")} title="Lock/unlock">
                  {t.is_locked ? <LockOpen size={15} /> : <Lock size={15} />}
                </button>
                <button type="button" className="delete-button" onClick={() => deleteTopic(t.id)} title="Delete">
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
