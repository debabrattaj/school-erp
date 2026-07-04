import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle,
  Edit,
  MessageCircle,
  PlusCircle,
  RefreshCcw,
  Send,
  Trash2,
} from "lucide-react";

import API from "../api";
import EnhancedRecordsTable from "../components/EnhancedRecordsTable";

const emptyTemplateForm = {
  template_name: "",
  channel: "WhatsApp",
  category: "Admissions",
  audience: "Parents",
  subject: "",
  body: "",
  variables: "{student_name}, {guardian_name}, {school_name}",
  language: "English",
  status: "Active",
  remarks: "",
};

const emptyMessageForm = {
  template_id: "",
  channel: "WhatsApp",
  category: "Admissions",
  recipient_name: "",
  recipient_phone: "",
  recipient_email: "",
  message_body: "",
  related_module: "",
  related_record_id: "",
  status: "Queued",
};

const channels = ["WhatsApp", "SMS", "Email", "In App"];
const categories = ["Admissions", "Fees", "Attendance", "Documents", "Academics", "General"];
const templateStatuses = ["Active", "Inactive", "Draft"];
const logStatuses = ["Queued", "Sent", "Failed"];

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

export default function Communications() {
  const [templates, setTemplates] = useState([]);
  const [logs, setLogs] = useState([]);
  const [templateForm, setTemplateForm] = useState(emptyTemplateForm);
  const [messageForm, setMessageForm] = useState(emptyMessageForm);
  const [editingTemplateId, setEditingTemplateId] = useState(null);
  const [pageMode, setPageMode] = useState("list");
  const [activeView, setActiveView] = useState("templates");
  const [searchText, setSearchText] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function loadTemplates() {
    try {
      setLoading(true);
      setMessage("");
      const response = await API.get("/communications/templates/");
      setTemplates(response.data || []);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load communication templates."));
    } finally {
      setLoading(false);
    }
  }

  async function loadLogs() {
    try {
      setLoading(true);
      setMessage("");
      const response = await API.get("/communications/logs/");
      setLogs(response.data || []);
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to load communication logs."));
    } finally {
      setLoading(false);
    }
  }

  async function loadAll() {
    await Promise.all([loadTemplates(), loadLogs()]);
  }

  useEffect(() => {
    loadAll();
  }, []);

  function handleTemplateChange(event) {
    const { name, value } = event.target;
    setTemplateForm((current) => ({ ...current, [name]: value }));
  }

  function handleMessageChange(event) {
    const { name, value } = event.target;
    setMessageForm((current) => ({ ...current, [name]: value }));
  }

  function applyTemplate(templateId) {
    const template = templates.find((item) => String(item.id) === String(templateId));

    setMessageForm((current) => ({
      ...current,
      template_id: templateId,
      channel: template?.channel || current.channel,
      category: template?.category || current.category,
      message_body: template?.body || current.message_body,
    }));
  }

  function buildTemplatePayload() {
    return {
      template_name: templateForm.template_name.trim(),
      channel: templateForm.channel,
      category: templateForm.category,
      audience: templateForm.audience.trim() || "Parents",
      subject: templateForm.subject.trim() || null,
      body: templateForm.body.trim(),
      variables: templateForm.variables.trim() || null,
      language: templateForm.language.trim() || "English",
      status: templateForm.status || "Active",
      remarks: templateForm.remarks.trim() || null,
    };
  }

  function buildMessagePayload() {
    return {
      template_id: messageForm.template_id ? Number(messageForm.template_id) : null,
      channel: messageForm.channel,
      category: messageForm.category,
      recipient_name: messageForm.recipient_name.trim(),
      recipient_phone: messageForm.recipient_phone.trim() || null,
      recipient_email: messageForm.recipient_email.trim() || null,
      message_body: messageForm.message_body.trim(),
      related_module: messageForm.related_module.trim() || null,
      related_record_id: messageForm.related_record_id ? Number(messageForm.related_record_id) : null,
      status: messageForm.status || "Queued",
    };
  }

  async function handleTemplateSubmit(event) {
    event.preventDefault();
    setMessage("");

    try {
      const payload = buildTemplatePayload();

      if (!payload.template_name || !payload.body) {
        setMessage("Template name and body are required.");
        return;
      }

      if (editingTemplateId) {
        await API.put(`/communications/templates/${editingTemplateId}`, payload);
        setMessage("Communication template updated successfully.");
      } else {
        await API.post("/communications/templates/", payload);
        setMessage("Communication template added successfully.");
      }

      setTemplateForm(emptyTemplateForm);
      setEditingTemplateId(null);
      setPageMode("list");
      setActiveView("templates");
      await loadTemplates();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to save communication template."));
    }
  }

  async function handleMessageSubmit(event) {
    event.preventDefault();
    setMessage("");

    try {
      const payload = buildMessagePayload();

      if (!payload.recipient_name || !payload.message_body) {
        setMessage("Recipient name and message body are required.");
        return;
      }

      await API.post("/communications/logs/", payload);
      setMessage(
        payload.status === "Sent"
          ? "Message marked as sent successfully."
          : "Message queued successfully."
      );
      setMessageForm(emptyMessageForm);
      setPageMode("list");
      setActiveView("logs");
      await loadLogs();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to save communication log."));
    }
  }

  function handleAddTemplate() {
    setEditingTemplateId(null);
    setTemplateForm(emptyTemplateForm);
    setMessage("");
    setPageMode("template-form");
  }

  function handleComposeMessage() {
    setMessageForm(emptyMessageForm);
    setMessage("");
    setPageMode("message-form");
  }

  function handleEditTemplate(template) {
    setEditingTemplateId(template.id);
    setTemplateForm({
      template_name: template.template_name || "",
      channel: template.channel || "WhatsApp",
      category: template.category || "Admissions",
      audience: template.audience || "Parents",
      subject: template.subject || "",
      body: template.body || "",
      variables: template.variables || "",
      language: template.language || "English",
      status: template.status || "Active",
      remarks: template.remarks || "",
    });
    setPageMode("template-form");
  }

  async function handleDeleteTemplate(templateId) {
    if (!window.confirm("Are you sure you want to delete this communication template?")) {
      return;
    }

    try {
      await API.delete(`/communications/templates/${templateId}`);
      setMessage("Communication template deleted successfully.");
      await loadTemplates();
    } catch (error) {
      console.error(error);
      setMessage(getApiErrorMessage(error, "Unable to delete communication template."));
    }
  }

  function handleCancel() {
    setTemplateForm(emptyTemplateForm);
    setMessageForm(emptyMessageForm);
    setEditingTemplateId(null);
    setMessage("");
    setPageMode("list");
  }

  const visibleRecords = activeView === "templates" ? templates : logs;
  const filteredRecords = visibleRecords.filter((record) => {
    const matchCategory = categoryFilter ? record.category === categoryFilter : true;
    const matchStatus = statusFilter ? record.status === statusFilter : true;
    const fullText = JSON.stringify(record).toLowerCase();
    return matchCategory && matchStatus && fullText.includes(searchText.toLowerCase());
  });

  const activeTemplateCount = useMemo(
    () => templates.filter((template) => template.status === "Active").length,
    [templates]
  );
  const sentCount = useMemo(
    () => logs.filter((log) => log.status === "Sent").length,
    [logs]
  );
  const queuedCount = useMemo(
    () => logs.filter((log) => log.status === "Queued").length,
    [logs]
  );

  if (pageMode === "template-form") {
    return (
      <div className="management-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Communication</p>
            <h2>{editingTemplateId ? "Edit Template" : "Add Template"}</h2>
            <p>Create reusable WhatsApp, SMS, email, and in-app message templates.</p>
          </div>
          <button type="button" className="light-button" onClick={handleCancel}>
            Back to Communication Center
          </button>
        </section>

        {message && <div className="message-box">{message}</div>}

        <section className="form-panel">
          <form className="classic-form" onSubmit={handleTemplateSubmit}>
            <div className="form-grid">
              <div className="form-field">
                <label>Template Name *</label>
                <input name="template_name" value={templateForm.template_name} onChange={handleTemplateChange} required />
              </div>
              <div className="form-field">
                <label>Channel</label>
                <select name="channel" value={templateForm.channel} onChange={handleTemplateChange}>
                  {channels.map((channel) => <option key={channel} value={channel}>{channel}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>Category</label>
                <select name="category" value={templateForm.category} onChange={handleTemplateChange}>
                  {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>Audience</label>
                <input name="audience" value={templateForm.audience} onChange={handleTemplateChange} />
              </div>
              <div className="form-field">
                <label>Language</label>
                <input name="language" value={templateForm.language} onChange={handleTemplateChange} />
              </div>
              <div className="form-field">
                <label>Status</label>
                <select name="status" value={templateForm.status} onChange={handleTemplateChange}>
                  {templateStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </div>
              <div className="form-field span-2">
                <label>Subject</label>
                <input name="subject" value={templateForm.subject} onChange={handleTemplateChange} />
              </div>
              <div className="form-field span-2">
                <label>Body *</label>
                <textarea name="body" value={templateForm.body} onChange={handleTemplateChange} rows="5" required />
              </div>
              <div className="form-field span-2">
                <label>Variables</label>
                <input name="variables" value={templateForm.variables} onChange={handleTemplateChange} />
              </div>
              <div className="form-field span-2">
                <label>Remarks</label>
                <textarea name="remarks" value={templateForm.remarks} onChange={handleTemplateChange} rows="3" />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="primary-button"><PlusCircle size={18} />{editingTemplateId ? "Update Template" : "Add Template"}</button>
              <button type="button" className="light-button" onClick={handleCancel}>Cancel</button>
            </div>
          </form>
        </section>
      </div>
    );
  }

  if (pageMode === "message-form") {
    return (
      <div className="management-page">
        <section className="page-heading">
          <div>
            <p className="eyebrow">Communication</p>
            <h2>Compose Message</h2>
            <p>Queue or record parent messages for admissions, fees, attendance, and documents.</p>
          </div>
          <button type="button" className="light-button" onClick={handleCancel}>
            Back to Communication Center
          </button>
        </section>

        {message && <div className="message-box">{message}</div>}

        <section className="form-panel">
          <form className="classic-form" onSubmit={handleMessageSubmit}>
            <div className="form-grid">
              <div className="form-field span-2">
                <label>Template</label>
                <select value={messageForm.template_id} onChange={(event) => applyTemplate(event.target.value)}>
                  <option value="">No template</option>
                  {templates.filter((template) => template.status === "Active").map((template) => (
                    <option key={template.id} value={template.id}>{template.template_name}</option>
                  ))}
                </select>
              </div>
              <div className="form-field">
                <label>Channel</label>
                <select name="channel" value={messageForm.channel} onChange={handleMessageChange}>
                  {channels.map((channel) => <option key={channel} value={channel}>{channel}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>Category</label>
                <select name="category" value={messageForm.category} onChange={handleMessageChange}>
                  {categories.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>Recipient Name *</label>
                <input name="recipient_name" value={messageForm.recipient_name} onChange={handleMessageChange} required />
              </div>
              <div className="form-field">
                <label>Recipient Phone</label>
                <input name="recipient_phone" value={messageForm.recipient_phone} onChange={handleMessageChange} />
              </div>
              <div className="form-field">
                <label>Recipient Email</label>
                <input type="email" name="recipient_email" value={messageForm.recipient_email} onChange={handleMessageChange} />
              </div>
              <div className="form-field">
                <label>Status</label>
                <select name="status" value={messageForm.status} onChange={handleMessageChange}>
                  {logStatuses.map((status) => <option key={status} value={status}>{status}</option>)}
                </select>
              </div>
              <div className="form-field">
                <label>Related Module</label>
                <input name="related_module" value={messageForm.related_module} onChange={handleMessageChange} placeholder="Admissions, Fees..." />
              </div>
              <div className="form-field">
                <label>Related Record ID</label>
                <input type="number" name="related_record_id" value={messageForm.related_record_id} onChange={handleMessageChange} />
              </div>
              <div className="form-field span-2">
                <label>Message *</label>
                <textarea name="message_body" value={messageForm.message_body} onChange={handleMessageChange} rows="5" required />
              </div>
            </div>
            <div className="form-actions">
              <button type="submit" className="primary-button"><Send size={18} />Save Message</button>
              <button type="button" className="light-button" onClick={handleCancel}>Cancel</button>
            </div>
          </form>
        </section>
      </div>
    );
  }

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Communication</p>
          <h2>Parent Communication</h2>
          <p>Manage message templates and WhatsApp-ready communication logs.</p>
        </div>
        <div className="module-header-actions">
          <button type="button" className="secondary-button" onClick={loadAll}><RefreshCcw size={17} />Refresh</button>
          <button type="button" className="secondary-button" onClick={handleComposeMessage}><Send size={17} />Compose</button>
          <button type="button" className="primary-button" onClick={handleAddTemplate}><PlusCircle size={18} />Add Template</button>
        </div>
      </section>

      <section className="summary-strip report-summary-grid">
        <div className="summary-card"><MessageCircle size={22} /><div><span>Templates</span><strong>{templates.length}</strong></div></div>
        <div className="summary-card"><CheckCircle size={22} /><div><span>Active Templates</span><strong>{activeTemplateCount}</strong></div></div>
        <div className="summary-card"><Send size={22} /><div><span>Sent Messages</span><strong>{sentCount}</strong></div></div>
        <div className="summary-card warning"><MessageCircle size={22} /><div><span>Queued</span><strong>{queuedCount}</strong></div></div>
      </section>

      {message && <div className="message-box">{message}</div>}

      <section className="table-panel module-filter-panel">
        <div className="filter-row sis-filter-row">
          <div className="form-field">
            <label>View</label>
            <select value={activeView} onChange={(event) => { setActiveView(event.target.value); setSearchText(""); setStatusFilter(""); }}>
              <option value="templates">Templates</option>
              <option value="logs">Message Logs</option>
            </select>
          </div>
          <div className="form-field">
            <label>Category</label>
            <select value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}>
              <option value="">All Categories</option>
              {categories.map((category) => <option key={category} value={category}>{category}</option>)}
            </select>
          </div>
          <div className="form-field">
            <label>Status</label>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)}>
              <option value="">All Status</option>
              {(activeView === "templates" ? templateStatuses : logStatuses).map((status) => <option key={status} value={status}>{status}</option>)}
            </select>
          </div>
          <button type="button" className="light-button" onClick={() => { setSearchText(""); setCategoryFilter(""); setStatusFilter(""); }}>Clear Filters</button>
        </div>
      </section>

      <EnhancedRecordsTable
        data={filteredRecords}
        emptyText={activeView === "templates" ? "No communication templates found." : "No communication logs found."}
        loading={loading}
        loadingText="Loading communications..."
        searchPlaceholder="Search communication records..."
        searchText={searchText}
        setSearchText={setSearchText}
        columns={activeView === "templates" ? [
          { key: "template_name", label: "Template", render: (template) => template.template_name || "-" },
          { key: "channel", label: "Channel", render: (template) => template.channel || "-" },
          { key: "category", label: "Category", render: (template) => template.category || "-" },
          { key: "audience", label: "Audience", render: (template) => template.audience || "-" },
          { key: "language", label: "Language", render: (template) => template.language || "-" },
          { key: "body", label: "Body", render: (template) => template.body || "-" },
          {
            key: "status",
            label: "Status",
            render: (template) => <span className={template.status === "Active" ? "status active" : "status danger"}>{template.status || "Active"}</span>,
            value: (template) => template.status || "Active",
          },
          {
            key: "actions",
            label: "Actions",
            hideable: false,
            actions: false,
            render: (template) => (
              <div className="action-buttons">
                <button type="button" className="edit-button" onClick={() => handleEditTemplate(template)} title="Edit"><Edit size={15} /></button>
                <button type="button" className="delete-button" onClick={() => handleDeleteTemplate(template.id)} title="Delete"><Trash2 size={15} /></button>
              </div>
            ),
            value: () => "",
          },
        ] : [
          { key: "template_name", label: "Template", render: (log) => log.template_name || "-" },
          { key: "channel", label: "Channel", render: (log) => log.channel || "-" },
          { key: "category", label: "Category", render: (log) => log.category || "-" },
          { key: "recipient_name", label: "Recipient", render: (log) => log.recipient_name || "-" },
          { key: "recipient_phone", label: "Phone", render: (log) => log.recipient_phone || "-" },
          { key: "related_module", label: "Module", render: (log) => log.related_module || "-" },
          { key: "message_body", label: "Message", render: (log) => log.message_body || "-" },
          {
            key: "status",
            label: "Status",
            render: (log) => <span className={log.status === "Failed" ? "status danger" : "status active"}>{log.status || "Queued"}</span>,
            value: (log) => log.status || "Queued",
          },
          { key: "sent_at", label: "Sent At", render: (log) => log.sent_at || "-" },
        ]}
      />
    </div>
  );
}
