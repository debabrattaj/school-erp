import { useEffect, useState } from "react";
import API from "../api";

export default function FamilyNotices({ studentId }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    API.get(`/portal/students/${studentId}/notices`).then(r => { if (active) setRows(r.data); }).catch(() => { if (active) setError("Unable to load notices."); });
    return () => { active = false; };
  }, [studentId]);
  async function acknowledge(row) {
    try {
      await API.post(`/portal/students/${studentId}/notices/${row.id}/acknowledge`);
      setRows(prev => prev.map(r => r.id === row.id ? { ...r, acknowledged: true } : r));
    } catch { setError("Could not acknowledge this notice. Please try again."); }
  }
  return <section aria-label="School notices"><h3>School notices</h3>{error && <p role="alert">{error}</p>}{!rows.length && !error && <p>No notices.</p>}{rows.map(r => <article key={r.id} className="portal-card"><p>{r.message}</p><small>{r.sent_at?.slice(0, 10)}</small>{r.acknowledged ? <p>Acknowledged</p> : <button className="secondary-button" onClick={() => acknowledge(r)}>Acknowledge</button>}</article>)}</section>;
}

export function FamilyPaymentReports({ studentId }) {
  const [rows, setRows] = useState([]);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    API.get(`/portal/students/${studentId}/payment-reports`).then(r => { if (active) setRows(r.data); }).catch(() => { if (active) setError("Unable to load payment verification status."); });
    return () => { active = false; };
  }, [studentId]);
  return <section><h4>Reported UPI payments</h4>{error && <p role="status">{error}</p>}{rows.map(r => <p key={r.id}>{r.reference} · {r.amount} · {r.status === "Pending" ? "Awaiting bank verification" : r.status}</p>)}{!rows.length && !error && <p>No payment references reported.</p>}</section>;
}
