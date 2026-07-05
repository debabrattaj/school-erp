import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Bell,
  Building2,
  CreditCard,
  KeyRound,
  LogOut,
  Plus,
  RefreshCcw,
  Send,
  Settings2,
} from "lucide-react";

import PlatformAPI, { getPlatformOwner, platformLogout } from "../platformApi";

const emptySchoolForm = {
  school_name: "",
  account_code: "",
  admin_name: "",
  admin_email: "",
  admin_password: "",
  curriculum: "CBSE",
  country: "India",
  timezone: "Asia/Calcutta",
};

function getErr(error, fb) {
  return error?.response?.data?.detail || fb;
}

function fmt(amount, currency = "INR") {
  return `${currency} ${(amount || 0).toLocaleString()}`;
}

const TABS = [
  ["schools", "Schools"],
  ["billing", "Billing"],
  ["plans", "Plans"],
  ["notifications", "Notifications"],
];

export default function PlatformConsole() {
  const navigate = useNavigate();
  const owner = getPlatformOwner();

  const [tab, setTab] = useState("schools");
  const [schools, setSchools] = useState([]);
  const [catalog, setCatalog] = useState([]);
  const [plans, setPlans] = useState([]);
  const [subs, setSubs] = useState([]);
  const [billingSummary, setBillingSummary] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!message) return undefined;

    const timeoutId = window.setTimeout(() => {
      setMessage("");
    }, 2000);

    return () => window.clearTimeout(timeoutId);
  }, [message]);

  const [loading, setLoading] = useState(true);

  // school management
  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState(emptySchoolForm);
  const [saving, setSaving] = useState(false);
  const [managedId, setManagedId] = useState(null);
  const [featureDraft, setFeatureDraft] = useState({});
  const [resetForm, setResetForm] = useState({ admin_email: "", new_password: "" });

  // subscription form
  const [subForm, setSubForm] = useState({ account_id: "", plan_id: "", billing_cycle: "yearly", start_date: "", months: "12", amount_paid: "", payment_reference: "", remarks: "" });

  // notification form
  const [notifForm, setNotifForm] = useState({ account_id: "", title: "", message: "", notification_type: "info" });

  const managedSchool = useMemo(
    () => schools.find((s) => s.id === managedId) || null,
    [schools, managedId]
  );

  async function loadData() {
    setLoading(true);
    try {
      const [schoolsRes, catalogRes, plansRes, subsRes, billingRes, notifsRes] = await Promise.all([
        PlatformAPI.get("/platform/schools"),
        PlatformAPI.get("/platform/feature-catalog"),
        PlatformAPI.get("/platform/plans"),
        PlatformAPI.get("/platform/subscriptions"),
        PlatformAPI.get("/platform/billing/summary"),
        PlatformAPI.get("/platform/notifications"),
      ]);
      setSchools(schoolsRes.data || []);
      setCatalog(catalogRes.data || []);
      setPlans(plansRes.data || []);
      setSubs(subsRes.data || []);
      setBillingSummary(billingRes.data || null);
      setNotifications(notifsRes.data || []);
    } catch (error) {
      if (error?.response?.status === 401 || error?.response?.status === 403) {
        platformLogout();
        navigate("/platform-login");
        return;
      }
      setMessage(getErr(error, "Unable to load data."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadData(); }, []);

  // ---- school mgmt ----
  function openManage(school) { setManagedId(school.id); setFeatureDraft({ ...school.features }); setResetForm({ admin_email: "", new_password: "" }); setMessage(""); }

  async function handleCreate(e) {
    e.preventDefault(); setSaving(true);
    try { await PlatformAPI.post("/platform/schools", createForm); setMessage(`School "${createForm.school_name}" created.`); setCreateForm(emptySchoolForm); setShowCreate(false); await loadData(); }
    catch (error) { setMessage(getErr(error, "Unable to create school.")); }
    finally { setSaving(false); }
  }

  async function handleToggleStatus(school) {
    const next = school.status === "Active" ? "Suspended" : "Active";
    if (next === "Suspended" && !window.confirm(`Suspend ${school.school_name}? All logins will stop.`)) return;
    try { await PlatformAPI.put(`/platform/schools/${school.id}`, { status: next }); setMessage(`${school.school_name} is now ${next}.`); await loadData(); }
    catch (error) { setMessage(getErr(error, "Unable to update status.")); }
  }

  async function handleSaveFeatures() {
    if (!managedSchool) return;
    try { await PlatformAPI.put(`/platform/schools/${managedSchool.id}/features`, { features: featureDraft }); setMessage(`Modules updated for ${managedSchool.school_name}.`); await loadData(); }
    catch (error) { setMessage(getErr(error, "Unable to update modules.")); }
  }

  async function handleResetAdmin(e) {
    e.preventDefault(); if (!managedSchool) return;
    try { const r = await PlatformAPI.post(`/platform/schools/${managedSchool.id}/reset-admin`, resetForm); setMessage(r.data.message); setResetForm({ admin_email: "", new_password: "" }); }
    catch (error) { setMessage(getErr(error, "Unable to reset admin.")); }
  }

  // ---- billing ----
  async function handleCreateSub(e) {
    e.preventDefault();
    try {
      await PlatformAPI.post("/platform/subscriptions", {
        ...subForm,
        account_id: Number(subForm.account_id),
        plan_id: Number(subForm.plan_id),
        months: Number(subForm.months),
        amount_paid: subForm.amount_paid ? Number(subForm.amount_paid) : 0,
      });
      setMessage("Subscription created.");
      setSubForm({ account_id: "", plan_id: "", billing_cycle: "yearly", start_date: "", months: "12", amount_paid: "", payment_reference: "", remarks: "" });
      await loadData();
    } catch (error) { setMessage(getErr(error, "Unable to create subscription.")); }
  }

  // ---- notifications ----
  async function handleSendNotif(e) {
    e.preventDefault();
    try {
      await PlatformAPI.post("/platform/notifications", {
        ...notifForm,
        account_id: notifForm.account_id ? Number(notifForm.account_id) : null,
      });
      setMessage("Notification sent.");
      setNotifForm({ account_id: "", title: "", message: "", notification_type: "info" });
      await loadData();
    } catch (error) { setMessage(getErr(error, "Unable to send notification.")); }
  }

  async function handleAutoReminders() {
    try {
      const r = await PlatformAPI.post("/platform/notifications/expiry-reminders");
      setMessage(r.data.message);
      await loadData();
    } catch (error) { setMessage(getErr(error, "Unable to send reminders.")); }
  }

  function handleLogout() { platformLogout(); navigate("/platform-login"); }

  return (
    <div style={{ minHeight: "100vh", background: "var(--saas-bg)" }}>
      {/* Top bar */}
      <div style={{ background: "var(--saas-primary)", color: "#fff", padding: "0.9rem 1.5rem", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.75rem" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
          <Building2 size={22} />
          <div>
            <div style={{ fontWeight: 700 }}>School ERP — Owner Console</div>
            <div style={{ fontSize: "0.75rem", opacity: 0.75 }}>{owner?.name} ({owner?.email})</div>
          </div>
        </div>
        <button type="button" className="secondary-button" onClick={handleLogout}><LogOut size={16} /> Logout</button>
      </div>

      <div style={{ maxWidth: "1200px", margin: "0 auto", padding: "1.5rem" }}>
        <div className="management-page">
          {/* Tabs */}
          <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1rem", flexWrap: "wrap" }}>
            {TABS.map(([key, label]) => (
              <button key={key} type="button" className={tab === key ? "primary-button" : "secondary-button"} onClick={() => { setTab(key); setMessage(""); }}>
                {key === "billing" && <CreditCard size={16} />}
                {key === "notifications" && <Bell size={16} />}
                {label}
              </button>
            ))}
            <div style={{ flex: 1 }} />
            <button type="button" className="secondary-button" onClick={loadData}><RefreshCcw size={16} /> Refresh</button>
          </div>

          {message && <div className="toast-notification">{message}</div>}

          {/* =================== SCHOOLS TAB =================== */}
          {tab === "schools" && (
            <>
              <section className="page-heading">
                <div>
                  <p className="eyebrow">Platform Administration</p>
                  <h2>Tenant Schools</h2>
                  <p>Create schools, control modules, suspend access.</p>
                </div>
                <button type="button" className="primary-button" onClick={() => setShowCreate((p) => !p)}><Plus size={16} /> New School</button>
              </section>

              {showCreate && (
                <section className="form-panel">
                  <div className="panel-header"><div><h3>Create School</h3></div></div>
                  <form className="classic-form" onSubmit={handleCreate}>
                    <div className="form-grid">
                      <div className="form-field"><label>School Name *</label><input required value={createForm.school_name} onChange={(e) => setCreateForm({ ...createForm, school_name: e.target.value })} /></div>
                      <div className="form-field"><label>Account Code *</label><input required value={createForm.account_code} onChange={(e) => setCreateForm({ ...createForm, account_code: e.target.value })} /></div>
                      <div className="form-field"><label>Admin Name *</label><input required value={createForm.admin_name} onChange={(e) => setCreateForm({ ...createForm, admin_name: e.target.value })} /></div>
                      <div className="form-field"><label>Admin Email *</label><input type="email" required value={createForm.admin_email} onChange={(e) => setCreateForm({ ...createForm, admin_email: e.target.value })} /></div>
                      <div className="form-field"><label>Admin Password *</label><input type="password" required value={createForm.admin_password} onChange={(e) => setCreateForm({ ...createForm, admin_password: e.target.value })} /></div>
                      <div className="form-field"><label>Curriculum</label><input value={createForm.curriculum} onChange={(e) => setCreateForm({ ...createForm, curriculum: e.target.value })} /></div>
                    </div>
                    <button type="submit" className="primary-button" disabled={saving}><Plus size={16} /> {saving ? "Creating..." : "Create School"}</button>
                  </form>
                </section>
              )}

              <section className="form-panel">
                <div className="panel-header"><div><h3>All Schools ({schools.length})</h3></div></div>
                {loading ? <p>Loading...</p> : (
                  <div className="table-wrapper"><table className="classic-table">
                    <thead>
                      <tr><th>School</th><th>Code</th><th>Plan</th><th>Expiry</th><th>Status</th><th>Students</th><th>Modules</th><th>Actions</th></tr>
                    </thead>
                    <tbody>
                      {schools.map((s) => {
                        const sub = s.subscription;
                        return (
                          <tr key={s.id}>
                            <td>{s.school_name}</td>
                            <td>{s.account_code}</td>
                            <td>{sub ? sub.plan_name : <span style={{ color: "var(--saas-muted)" }}>No plan</span>}</td>
                            <td>
                              {sub ? (
                                <span style={{ color: sub.is_expired ? "#be123c" : sub.is_expiring_soon ? "#d97706" : "inherit", fontWeight: sub.is_expired || sub.is_expiring_soon ? 600 : 400 }}>
                                  {sub.days_left < 0 ? `Expired ${Math.abs(sub.days_left)}d ago` : `${sub.days_left}d left`}
                                </span>
                              ) : "-"}
                            </td>
                            <td>{s.status}</td>
                            <td>{s.stats?.students ?? "-"}</td>
                            <td>{s.features_enabled}/{s.features_total}</td>
                            <td>
                              <button type="button" className="secondary-button" onClick={() => openManage(s)}><Settings2 size={15} /> Manage</button>{" "}
                              <button type="button" className="light-button" onClick={() => handleToggleStatus(s)}>{s.status === "Active" ? "Suspend" : "Activate"}</button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table></div>
                )}
              </section>

              {managedSchool && (
                <section className="form-panel">
                  <div className="panel-header"><div><h3>Modules — {managedSchool.school_name}</h3></div>
                    <button type="button" className="primary-button" onClick={handleSaveFeatures}>Save Modules</button>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: "0.5rem" }}>
                    {catalog.map((f) => (
                      <label key={f.key} style={{ display: "flex", alignItems: "center", gap: "0.5rem", padding: "0.55rem 0.75rem", border: "1px solid var(--saas-border)", borderRadius: "10px", background: featureDraft[f.key] ? "var(--saas-accent-soft)" : "var(--saas-surface)", cursor: "pointer" }}>
                        <input type="checkbox" checked={Boolean(featureDraft[f.key])} onChange={(e) => setFeatureDraft({ ...featureDraft, [f.key]: e.target.checked })} />
                        {f.label}
                      </label>
                    ))}
                  </div>
                  <div className="panel-header" style={{ marginTop: "1.5rem" }}><div><h3>Reset School Admin Login</h3></div></div>
                  <form className="classic-form" onSubmit={handleResetAdmin}>
                    <div className="form-grid">
                      <div className="form-field"><label>Admin Email *</label><input type="email" required value={resetForm.admin_email} onChange={(e) => setResetForm({ ...resetForm, admin_email: e.target.value })} /></div>
                      <div className="form-field"><label>New Password *</label><input type="password" required value={resetForm.new_password} onChange={(e) => setResetForm({ ...resetForm, new_password: e.target.value })} /></div>
                    </div>
                    <button type="submit" className="secondary-button"><KeyRound size={15} /> Reset Password</button>
                  </form>
                </section>
              )}
            </>
          )}

          {/* =================== BILLING TAB =================== */}
          {tab === "billing" && (
            <>
              <section className="page-heading"><div><p className="eyebrow">Revenue & Subscriptions</p><h2>Billing</h2><p>Track payments, assign plans, and monitor expiring subscriptions.</p></div></section>

              {billingSummary && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "1rem", marginBottom: "1.5rem" }}>
                  {[
                    { label: "Total Revenue", value: fmt(billingSummary.total_revenue), color: "var(--saas-primary)" },
                    { label: "Active Subscriptions", value: billingSummary.active_subscriptions, color: "#16a34a" },
                    { label: "Expiring Soon (≤30d)", value: billingSummary.expiring_soon_count, color: "#d97706" },
                    { label: "Expired", value: billingSummary.expired_count, color: "#be123c" },
                  ].map((card) => (
                    <div key={card.label} className="form-panel" style={{ padding: "1rem 1.25rem", textAlign: "center" }}>
                      <div style={{ fontSize: "0.85rem", color: "var(--saas-muted)" }}>{card.label}</div>
                      <div style={{ fontSize: "1.5rem", fontWeight: 700, color: card.color, marginTop: "0.25rem" }}>{card.value}</div>
                    </div>
                  ))}
                </div>
              )}

              {billingSummary?.expiring_soon?.length > 0 && (
                <section className="form-panel" style={{ marginBottom: "1rem" }}>
                  <div className="panel-header"><div><h3>Expiring Soon</h3></div></div>
                  <div className="table-wrapper"><table className="classic-table"><thead><tr><th>School</th><th>Plan</th><th>Expires</th><th>Days Left</th></tr></thead>
                    <tbody>{billingSummary.expiring_soon.map((s, i) => (
                      <tr key={i}><td>{s.school_name}</td><td>{s.plan}</td><td>{s.expiry_date?.slice(0, 10)}</td><td style={{ color: "#d97706", fontWeight: 600 }}>{s.days_left}</td></tr>
                    ))}</tbody></table></div>
                </section>
              )}

              {billingSummary?.expired?.length > 0 && (
                <section className="form-panel" style={{ marginBottom: "1rem" }}>
                  <div className="panel-header"><div><h3>Expired</h3></div></div>
                  <div className="table-wrapper"><table className="classic-table"><thead><tr><th>School</th><th>Plan</th><th>Overdue By</th></tr></thead>
                    <tbody>{billingSummary.expired.map((s, i) => (
                      <tr key={i}><td>{s.school_name}</td><td>{s.plan}</td><td style={{ color: "#be123c", fontWeight: 600 }}>{s.days_overdue} days</td></tr>
                    ))}</tbody></table></div>
                </section>
              )}

              <section className="form-panel">
                <div className="panel-header"><div><h3>Assign Subscription</h3><p>Record a payment and activate a plan for a school.</p></div></div>
                <form className="classic-form" onSubmit={handleCreateSub}>
                  <div className="form-grid">
                    <div className="form-field"><label>School *</label>
                      <select required value={subForm.account_id} onChange={(e) => setSubForm({ ...subForm, account_id: e.target.value })}>
                        <option value="">Select</option>{schools.map((s) => <option key={s.id} value={s.id}>{s.school_name} ({s.account_code})</option>)}
                      </select></div>
                    <div className="form-field"><label>Plan *</label>
                      <select required value={subForm.plan_id} onChange={(e) => setSubForm({ ...subForm, plan_id: e.target.value })}>
                        <option value="">Select</option>{plans.filter((p) => p.is_active).map((p) => <option key={p.id} value={p.id}>{p.name} — {fmt(p.price_yearly)}/yr</option>)}
                      </select></div>
                    <div className="form-field"><label>Cycle</label>
                      <select value={subForm.billing_cycle} onChange={(e) => setSubForm({ ...subForm, billing_cycle: e.target.value })}>
                        <option value="yearly">Yearly</option><option value="monthly">Monthly</option>
                      </select></div>
                    <div className="form-field"><label>Start Date *</label><input type="date" required value={subForm.start_date} onChange={(e) => setSubForm({ ...subForm, start_date: e.target.value })} /></div>
                    <div className="form-field"><label>Duration (months)</label><input type="number" value={subForm.months} onChange={(e) => setSubForm({ ...subForm, months: e.target.value })} /></div>
                    <div className="form-field"><label>Amount Paid (0 = plan price)</label><input type="number" value={subForm.amount_paid} onChange={(e) => setSubForm({ ...subForm, amount_paid: e.target.value })} /></div>
                    <div className="form-field"><label>Payment Ref</label><input value={subForm.payment_reference} onChange={(e) => setSubForm({ ...subForm, payment_reference: e.target.value })} /></div>
                    <div className="form-field"><label>Remarks</label><input value={subForm.remarks} onChange={(e) => setSubForm({ ...subForm, remarks: e.target.value })} /></div>
                  </div>
                  <button type="submit" className="primary-button"><CreditCard size={16} /> Record Payment</button>
                </form>
              </section>

              <section className="form-panel">
                <div className="panel-header"><div><h3>Payment History ({subs.length})</h3></div></div>
                <div className="table-wrapper"><table className="classic-table">
                  <thead><tr><th>School</th><th>Plan</th><th>Amount</th><th>Start</th><th>Expiry</th><th>Days Left</th><th>Ref</th><th>Status</th></tr></thead>
                  <tbody>
                    {subs.map((s) => (
                      <tr key={s.id}>
                        <td>{s.school_name}</td><td>{s.plan_name}</td><td>{fmt(s.amount_paid, s.currency)}</td>
                        <td>{s.start_date?.slice(0, 10)}</td><td>{s.expiry_date?.slice(0, 10)}</td>
                        <td style={{ color: s.is_expired ? "#be123c" : s.is_expiring_soon ? "#d97706" : "inherit", fontWeight: s.is_expired || s.is_expiring_soon ? 600 : 400 }}>
                          {s.days_left < 0 ? `${Math.abs(s.days_left)}d overdue` : `${s.days_left}d`}
                        </td>
                        <td>{s.payment_reference || "-"}</td><td>{s.status}</td>
                      </tr>
                    ))}
                    {!subs.length && <tr><td colSpan={8}>No subscriptions yet.</td></tr>}
                  </tbody>
                </table></div>
              </section>
            </>
          )}

          {/* =================== PLANS TAB =================== */}
          {tab === "plans" && (
            <>
              <section className="page-heading"><div><p className="eyebrow">Product Catalog</p><h2>Subscription Plans</h2><p>Define the plans schools can purchase.</p></div></section>
              <section className="form-panel">
                <div className="table-wrapper"><table className="classic-table">
                  <thead><tr><th>Plan</th><th>Monthly</th><th>Yearly</th><th>Max Students</th><th>Max Users</th><th>Description</th><th>Active</th></tr></thead>
                  <tbody>
                    {plans.map((p) => (
                      <tr key={p.id}>
                        <td style={{ fontWeight: 600 }}>{p.name}</td><td>{fmt(p.price_monthly)}</td><td>{fmt(p.price_yearly)}</td>
                        <td>{p.max_students ?? "Unlimited"}</td><td>{p.max_users ?? "Unlimited"}</td>
                        <td>{p.description || "-"}</td><td>{p.is_active ? "Yes" : "No"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table></div>
              </section>
            </>
          )}

          {/* =================== NOTIFICATIONS TAB =================== */}
          {tab === "notifications" && (
            <>
              <section className="page-heading">
                <div><p className="eyebrow">Communications</p><h2>Notifications</h2><p>Push messages to school admins. Broadcasts go to all schools.</p></div>
                <button type="button" className="secondary-button" onClick={handleAutoReminders}><Bell size={16} /> Send Expiry Reminders</button>
              </section>

              <section className="form-panel">
                <div className="panel-header"><div><h3>Send Notification</h3></div></div>
                <form className="classic-form" onSubmit={handleSendNotif}>
                  <div className="form-grid">
                    <div className="form-field"><label>School (leave empty = broadcast to all)</label>
                      <select value={notifForm.account_id} onChange={(e) => setNotifForm({ ...notifForm, account_id: e.target.value })}>
                        <option value="">All Schools (Broadcast)</option>{schools.map((s) => <option key={s.id} value={s.id}>{s.school_name}</option>)}
                      </select></div>
                    <div className="form-field"><label>Type</label>
                      <select value={notifForm.notification_type} onChange={(e) => setNotifForm({ ...notifForm, notification_type: e.target.value })}>
                        <option value="info">Info</option><option value="warning">Warning</option><option value="urgent">Urgent</option>
                      </select></div>
                    <div className="form-field"><label>Title *</label><input required value={notifForm.title} onChange={(e) => setNotifForm({ ...notifForm, title: e.target.value })} /></div>
                    <div className="form-field"><label>Message *</label><input required value={notifForm.message} onChange={(e) => setNotifForm({ ...notifForm, message: e.target.value })} /></div>
                  </div>
                  <button type="submit" className="primary-button"><Send size={16} /> Send</button>
                </form>
              </section>

              <section className="form-panel">
                <div className="panel-header"><div><h3>Sent ({notifications.length})</h3></div></div>
                <div className="table-wrapper"><table className="classic-table">
                  <thead><tr><th>Date</th><th>To</th><th>Type</th><th>Title</th><th>Message</th></tr></thead>
                  <tbody>
                    {notifications.map((n) => (
                      <tr key={n.id}>
                        <td>{n.created_at?.slice(0, 10)}</td>
                        <td>{n.school_name || "All Schools"}</td>
                        <td><span style={{ color: n.notification_type === "urgent" ? "#be123c" : n.notification_type === "warning" ? "#d97706" : "inherit", fontWeight: n.notification_type !== "info" ? 600 : 400 }}>{n.notification_type}</span></td>
                        <td>{n.title}</td><td>{n.message}</td>
                      </tr>
                    ))}
                    {!notifications.length && <tr><td colSpan={5}>No notifications sent yet.</td></tr>}
                  </tbody>
                </table></div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
