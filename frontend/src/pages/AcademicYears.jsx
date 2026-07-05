import { useEffect, useMemo, useState } from "react";
import { CalendarPlus, CheckCircle2, Lock, RefreshCcw, Send, Star } from "lucide-react";

import API from "../api";
import { getMasterValues } from "../services/masterDataService";

const emptyYearForm = {
  name: "",
  start_date: "",
  end_date: "",
  remarks: "",
};

function getApiErrorMessage(error, fallback) {
  return error?.response?.data?.detail || fallback;
}

function getClassLabel(classRecord) {
  if (!classRecord) return "-";
  return [classRecord.class_name, classRecord.section].filter(Boolean).join(" - ");
}

export default function AcademicYears() {
  const [years, setYears] = useState([]);
  const [classes, setClasses] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [yearNameOptions, setYearNameOptions] = useState([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!message) return undefined;

    const timeoutId = window.setTimeout(() => {
      setMessage("");
    }, 2000);

    return () => window.clearTimeout(timeoutId);
  }, [message]);

  const [yearForm, setYearForm] = useState(emptyYearForm);
  const [saving, setSaving] = useState(false);

  // Year-end state
  const [fromYear, setFromYear] = useState("");
  const [toYear, setToYear] = useState("");
  const [startDate, setStartDate] = useState("");
  const [carryForwardFees, setCarryForwardFees] = useState(true);
  const [rowActions, setRowActions] = useState({}); // student_id -> {action, to_class_id}
  const [processing, setProcessing] = useState(false);
  const [yearEndResult, setYearEndResult] = useState(null);
  const [suggestions, setSuggestions] = useState({});
  const [suggesting, setSuggesting] = useState(false);

  async function loadPageData() {
    try {
      const [yearsRes, classesRes, enrollmentsRes] = await Promise.all([
        API.get("/academic-years/"),
        API.get("/classes/"),
        API.get("/student-enrollments/"),
      ]);
      setYears(yearsRes.data || []);
      setClasses(classesRes.data || []);
      setEnrollments(enrollmentsRes.data || []);
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to load academic years."));
    }

    try {
      const values = await getMasterValues("AcademicYear");
      setYearNameOptions(values || []);
    } catch (error) {
      console.error(error);
    }
  }

  useEffect(() => {
    loadPageData();
  }, []);

  const activeEnrollments = useMemo(() => {
    if (!fromYear) return [];
    return enrollments.filter(
      (item) =>
        item.academic_year === fromYear && item.enrollment_status === "Active"
    );
  }, [enrollments, fromYear]);

  const openYears = useMemo(
    () => years.filter((year) => year.status !== "Closed"),
    [years]
  );

  const availableYearNameOptions = useMemo(() => {
    const existingNames = years.map((year) => year.name);
    return yearNameOptions.filter((name) => !existingNames.includes(name));
  }, [yearNameOptions, years]);

  function handleYearFormChange(event) {
    const { name, value } = event.target;
    setYearForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleCreateYear(event) {
    event.preventDefault();
    setSaving(true);
    try {
      await API.post("/academic-years/", {
        ...yearForm,
        start_date: yearForm.start_date || null,
        end_date: yearForm.end_date || null,
        remarks: yearForm.remarks || null,
      });
      setMessage(`Academic year ${yearForm.name} created.`);
      setYearForm(emptyYearForm);
      await loadPageData();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to create academic year."));
    } finally {
      setSaving(false);
    }
  }

  async function handleSetCurrent(yearId) {
    try {
      await API.post(`/academic-years/${yearId}/set-current`);
      setMessage("Current academic year updated.");
      await loadPageData();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to set current year."));
    }
  }

  async function handleCloseYear(yearId, force = false) {
    try {
      await API.post(`/academic-years/${yearId}/close`, null, {
        params: force ? { force: true } : {},
      });
      setMessage("Academic year closed.");
      await loadPageData();
    } catch (error) {
      const detail = getApiErrorMessage(error, "Unable to close year.");
      if (!force && detail.includes("active enrollment")) {
        const confirmForce = window.confirm(
          `${detail}\n\nClose anyway? Remaining active enrollments will stay open under a closed year.`
        );
        if (confirmForce) {
          await handleCloseYear(yearId, true);
          return;
        }
      }
      setMessage(detail);
    }
  }

  function setRowAction(studentId, patch) {
    setRowActions((prev) => ({
      ...prev,
      [studentId]: { ...(prev[studentId] || { action: "" }), ...patch },
    }));
  }

  function applyActionToAll(action) {
    const next = {};
    activeEnrollments.forEach((item) => {
      next[item.student_id] = {
        ...(rowActions[item.student_id] || {}),
        action,
      };
    });
    setRowActions(next);
  }

  async function handleSuggestFromResults() {
    if (!fromYear) return;
    setSuggesting(true);
    try {
      const response = await API.get(
        "/student-enrollments/year-end/suggestions",
        { params: { academic_year: fromYear } }
      );
      const map = {};
      const actions = {};
      (response.data.suggestions || []).forEach((item) => {
        map[item.student_id] = item;
        if (item.suggestion) {
          actions[item.student_id] = {
            action: item.suggestion,
            to_class_id: item.suggested_to_class_id
              ? String(item.suggested_to_class_id)
              : "",
          };
        }
      });
      setSuggestions(map);
      setRowActions(actions);
      setMessage(
        `Suggestions applied using pass mark ${response.data.pass_percentage}%. Review and adjust before running.`
      );
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to load suggestions."));
    } finally {
      setSuggesting(false);
    }
  }

  async function handleRunYearEnd(event) {
    event.preventDefault();
    setYearEndResult(null);

    const actions = activeEnrollments
      .map((item) => {
        const row = rowActions[item.student_id];
        if (!row || !row.action) return null;
        return {
          student_id: item.student_id,
          action: row.action,
          to_class_id:
            row.action === "promote" && row.to_class_id
              ? Number(row.to_class_id)
              : null,
        };
      })
      .filter(Boolean);

    if (!actions.length) {
      setMessage("Choose an action for at least one student.");
      return;
    }

    const missingClass = actions.find(
      (item) => item.action === "promote" && !item.to_class_id
    );
    if (missingClass) {
      setMessage("Every promoted student needs a target class.");
      return;
    }

    const needsToYear = actions.some((item) =>
      ["promote", "detain"].includes(item.action)
    );
    if (needsToYear && !toYear) {
      setMessage("Select the target academic year.");
      return;
    }

    setProcessing(true);
    try {
      const response = await API.post("/student-enrollments/year-end", {
        from_academic_year: fromYear,
        to_academic_year: toYear || null,
        start_date: startDate || null,
        carry_forward_fees: carryForwardFees,
        actions,
      });
      setYearEndResult(response.data);
      setMessage("Year-end processing completed.");
      setRowActions({});
      await loadPageData();
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Year-end processing failed."));
    } finally {
      setProcessing(false);
    }
  }

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Academic Progression</p>
          <h2>Academic Years</h2>
          <p>Create academic years, set the current year, and run year-end promotion.</p>
        </div>

        <button type="button" className="secondary-button" onClick={loadPageData}>
          <RefreshCcw size={17} />
          Refresh
        </button>
      </section>

      {message && <div className="toast-notification">{message}</div>}

      <section className="form-panel">
        <div className="panel-header">
          <div>
            <h3>Add Academic Year</h3>
            <p>Years created here also become available across enrollment, fees, marks and attendance.</p>
          </div>
        </div>

        <form className="classic-form" onSubmit={handleCreateYear}>
          <div className="form-grid">
            <div className="form-field">
              <label>Name *</label>
              <select
                name="name"
                value={yearForm.name}
                onChange={handleYearFormChange}
                required
              >
                <option value="">Select academic year</option>
                {availableYearNameOptions.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
              {yearNameOptions.length === 0 && (
                <small>
                  No Academic Year values found in Master Data. Add them under
                  Master Data → Academic Year first.
                </small>
              )}
            </div>

            <div className="form-field">
              <label>Start Date</label>
              <input
                type="date"
                name="start_date"
                value={yearForm.start_date}
                onChange={handleYearFormChange}
              />
            </div>

            <div className="form-field">
              <label>End Date</label>
              <input
                type="date"
                name="end_date"
                value={yearForm.end_date}
                onChange={handleYearFormChange}
              />
            </div>

            <div className="form-field">
              <label>Remarks</label>
              <input
                name="remarks"
                value={yearForm.remarks}
                onChange={handleYearFormChange}
              />
            </div>
          </div>

          <button type="submit" className="primary-button" disabled={saving}>
            <CalendarPlus size={17} />
            {saving ? "Saving..." : "Add Year"}
          </button>
        </form>
      </section>

      <section className="form-panel">
        <div className="panel-header">
          <div>
            <h3>All Years</h3>
            <p>Only one year can be current at a time. Closed years become read-only.</p>
          </div>
        </div>

        <div className="table-wrapper"><table className="classic-table">
          <thead>
            <tr>
              <th>Year</th>
              <th>Start</th>
              <th>End</th>
              <th>Status</th>
              <th>Current</th>
              <th>Actions</th>
            </tr>
          </thead>
          <tbody>
            {years.map((year) => (
              <tr key={year.id}>
                <td>{year.name}</td>
                <td>{year.start_date || "-"}</td>
                <td>{year.end_date || "-"}</td>
                <td>{year.status}</td>
                <td>{year.is_current ? <CheckCircle2 size={17} color="#16a34a" /> : "-"}</td>
                <td>
                  {year.status !== "Closed" && (
                    <>
                      {!year.is_current && (
                        <button
                          type="button"
                          className="secondary-button"
                          onClick={() => handleSetCurrent(year.id)}
                        >
                          <Star size={15} />
                          Set Current
                        </button>
                      )}{" "}
                      <button
                        type="button"
                        className="secondary-button"
                        onClick={() => handleCloseYear(year.id)}
                      >
                        <Lock size={15} />
                        Close
                      </button>
                    </>
                  )}
                </td>
              </tr>
            ))}
            {!years.length && (
              <tr>
                <td colSpan={6}>No academic years yet. Add your first year above.</td>
              </tr>
            )}
          </tbody>
        </table></div>
      </section>

      <section className="form-panel">
        <div className="panel-header">
          <div>
            <h3>Year-End Processing</h3>
            <p>
              Promote, detain (repeat class), or graduate each active student.
              Unpaid fee balances can be carried into the new year.
            </p>
          </div>
        </div>

        <form className="classic-form" onSubmit={handleRunYearEnd}>
          <div className="form-grid">
            <div className="form-field">
              <label>From Year *</label>
              <select
                value={fromYear}
                onChange={(event) => {
                  setFromYear(event.target.value);
                  setRowActions({});
                  setSuggestions({});
                  setYearEndResult(null);
                }}
                required
              >
                <option value="">Select Year</option>
                {years.map((year) => (
                  <option key={year.id} value={year.name}>
                    {year.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="form-field">
              <label>To Year (for promote/detain)</label>
              <select value={toYear} onChange={(event) => setToYear(event.target.value)}>
                <option value="">Select Year</option>
                {openYears
                  .filter((year) => year.name !== fromYear)
                  .map((year) => (
                    <option key={year.id} value={year.name}>
                      {year.name}
                    </option>
                  ))}
              </select>
            </div>

            <div className="form-field">
              <label>New Year Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(event) => setStartDate(event.target.value)}
              />
            </div>

            <div className="form-field">
              <label>
                <input
                  type="checkbox"
                  checked={carryForwardFees}
                  onChange={(event) => setCarryForwardFees(event.target.checked)}
                />{" "}
                Carry forward unpaid fee balances
              </label>
            </div>
          </div>

          {fromYear && (
            <>
              <div className="panel-header" style={{ marginTop: "1rem" }}>
                <div>
                  <h3>
                    Active students in {fromYear} ({activeEnrollments.length})
                  </h3>
                  <p>
                    <button type="button" className="primary-button" onClick={handleSuggestFromResults} disabled={suggesting}>
                      {suggesting ? "Analysing..." : "Suggest from Results"}
                    </button>{" "}
                    Quick fill:{" "}
                    <button type="button" className="secondary-button" onClick={() => applyActionToAll("promote")}>
                      All Promote
                    </button>{" "}
                    <button type="button" className="secondary-button" onClick={() => applyActionToAll("detain")}>
                      All Detain
                    </button>{" "}
                    <button type="button" className="secondary-button" onClick={() => applyActionToAll("graduate")}>
                      All Graduate
                    </button>{" "}
                    <button type="button" className="secondary-button" onClick={() => setRowActions({})}>
                      Clear
                    </button>
                  </p>
                </div>
              </div>

              <div className="table-wrapper"><table className="classic-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Current Class</th>
                    <th>Roll No</th>
                    <th>Result %</th>
                    <th>Action</th>
                    <th>Promote To</th>
                  </tr>
                </thead>
                <tbody>
                  {activeEnrollments.map((item) => {
                    const row = rowActions[item.student_id] || {};
                    return (
                      <tr key={item.id}>
                        <td>{item.student_name || `#${item.student_id}`}</td>
                        <td>
                          {[item.class_name_snapshot, item.section_snapshot]
                            .filter(Boolean)
                            .join(" - ") || "-"}
                        </td>
                        <td>{item.roll_no || "-"}</td>
                        <td title={suggestions[item.student_id]?.reason || ""}>
                          {suggestions[item.student_id]?.percentage != null
                            ? `${suggestions[item.student_id].percentage}%`
                            : "-"}
                        </td>
                        <td>
                          <select
                            value={row.action || ""}
                            onChange={(event) =>
                              setRowAction(item.student_id, { action: event.target.value })
                            }
                          >
                            <option value="">No change</option>
                            <option value="promote">Promote</option>
                            <option value="detain">Detain (repeat)</option>
                            <option value="graduate">Graduate</option>
                          </select>
                        </td>
                        <td>
                          {row.action === "promote" ? (
                            <select
                              value={row.to_class_id || ""}
                              onChange={(event) =>
                                setRowAction(item.student_id, { to_class_id: event.target.value })
                              }
                            >
                              <option value="">Select Class</option>
                              {classes.map((classRecord) => (
                                <option key={classRecord.id} value={classRecord.id}>
                                  {getClassLabel(classRecord)}
                                </option>
                              ))}
                            </select>
                          ) : (
                            "-"
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!activeEnrollments.length && (
                    <tr>
                      <td colSpan={6}>
                        No active enrollments in {fromYear}. Use Student Enrollments &gt; Sync
                        Current first if needed.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table></div>
            </>
          )}

          <button type="submit" className="primary-button" disabled={processing || !fromYear}>
            <Send size={17} />
            {processing ? "Processing..." : "Run Year-End Processing"}
          </button>
        </form>

        {yearEndResult && (
          <div className="message-box" style={{ marginTop: "1rem" }}>
            Promoted: {yearEndResult.promoted_count} | Detained: {yearEndResult.detained_count} |
            Graduated: {yearEndResult.graduated_count} | Skipped: {yearEndResult.skipped_count} |
            Fee balances carried: {yearEndResult.fees_carried_forward}
            {yearEndResult.details?.skipped?.length > 0 && (
              <ul>
                {yearEndResult.details.skipped.map((item, index) => (
                  <li key={index}>
                    Student #{item.student_id}: {item.reason}
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
