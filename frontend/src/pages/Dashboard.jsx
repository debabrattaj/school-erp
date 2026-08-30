import { useEffect, useState } from "react";
import {
  Users,
  GraduationCap,
  BookOpen,
  ClipboardCheck,
  Wallet,
  TrendingUp,
  CalendarDays,
  Award,
  School,
  Clock,
} from "lucide-react";
import API from "../api";
import { isFeatureEnabled } from "../auth";
import { useSchoolSettings } from "../SettingsContext";
import { formatMoney as formatMoneyUtil } from "../utils/money";
import {
  AttendanceDonut,
  RadialGauge,
  TrendArea,
  CategoryBarChart,
} from "../components/DashboardCharts";
import DashboardBuilder from "../components/DashboardBuilder";

const GRADE_ORDER = ["A+", "A", "B", "C", "D", "F"];

export default function Dashboard() {
  const { settings } = useSchoolSettings();
  const canUseHouse = isFeatureEnabled("house_system");

  const [view, setView] = useState("overview");
  const [summary, setSummary] = useState(null);
  const [trends, setTrends] = useState(null);
  const [students, setStudents] = useState([]);
  const [exams, setExams] = useState([]);
  const [marks, setMarks] = useState([]);
  const [loading, setLoading] = useState(false);

  function formatMoney(value) {
    return formatMoneyUtil(value, settings?.currency);
  }

  async function loadDashboard() {
    try {
      setLoading(true);

      const [summaryRes, studentsRes, examsRes, marksRes] = await Promise.all([
        API.get("/dashboard/summary"),
        API.get("/students/"),
        API.get("/exams/"),
        API.get("/marks/"),
      ]);

      setSummary(summaryRes.data);
      setStudents(studentsRes.data);
      setExams(examsRes.data);
      setMarks(marksRes.data);

      // Trends are optional — an older backend may not expose this endpoint, so
      // fetch separately and never let it fail the rest of the dashboard.
      try {
        const trendsRes = await API.get("/dashboard/trends", { params: { days: 14 } });
        setTrends(trendsRes.data);
      } catch {
        setTrends(null);
      }
    } catch (error) {
      console.error("Dashboard load error:", error);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadDashboard();
  }, []);

  function getStudent(studentId) {
    return students.find((student) => student.id === Number(studentId));
  }

  function getStudentName(studentId) {
    const student = getStudent(studentId);
    if (!student) return "Unknown Student";
    return `${student.first_name} ${student.last_name || ""}`.trim();
  }

  function getStudentClass(studentId) {
    const student = getStudent(studentId);
    if (!student) return "-";
    return `${student.class_name || "-"}-${student.section || "-"}`;
  }

  function getExamName(examId) {
    return exams.find((exam) => exam.id === Number(examId))?.exam_name || "-";
  }

  const studentsByClass = (() => {
    const counts = {};
    students.forEach((student) => {
      const label = student.class_name || "Unassigned";
      counts[label] = (counts[label] || 0) + 1;
    });
    return Object.entries(counts)
      .map(([label, value]) => ({ label, value }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { numeric: true }))
      .slice(0, 14);
  })();

  const gradeDistribution = (() => {
    const counts = {};
    marks.forEach((mark) => {
      const grade = mark.grade && mark.grade !== "-" ? mark.grade : "Ungraded";
      counts[grade] = (counts[grade] || 0) + 1;
    });
    const order = [...GRADE_ORDER, "Ungraded"];
    return order
      .filter((grade) => counts[grade])
      .map((grade) => ({ label: grade, value: counts[grade] }));
  })();

  // Colour carries meaning here rather than decorating: counts take the
  // brand, money takes green when collected and red when owed. Eight
  // different hues said nothing and made the page read as a template.
  const cards = [
    {
      title: "Total Students",
      value: summary?.total_students || 0,
      note: "Complete student records",
      icon: Users,
      accent: "var(--brand-600)",
      accent2: "var(--brand-500)",
    },
    {
      title: "Active Students",
      value: summary?.active_students || 0,
      note: "Currently enrolled",
      icon: Users,
      accent: "var(--brand-600)",
      accent2: "var(--brand-500)",
    },
    {
      title: "Faculty Strength",
      value: summary?.total_teachers || 0,
      note: "Registered faculty",
      icon: GraduationCap,
      accent: "var(--brand-600)",
      accent2: "var(--brand-500)",
    },
    {
      title: "Class Sections",
      value: summary?.total_classes || 0,
      note: "Academic sections",
      icon: BookOpen,
      accent: "var(--brand-600)",
      accent2: "var(--brand-500)",
    },
    {
      title: "Fee Collection",
      value: formatMoney(summary?.total_collection),
      note: `${summary?.collection_percentage || 0}% collected`,
      icon: Wallet,
      accent: "var(--success-600)",
      accent2: "var(--success-600)",
    },
    {
      title: "Outstanding Due",
      value: formatMoney(summary?.total_due),
      note: "Pending receivables",
      icon: TrendingUp,
      accent: "var(--danger-600)",
      accent2: "var(--danger-600)",
    },
    {
      title: "Today Attendance",
      value: `${summary?.attendance_percentage || 0}%`,
      note: "Present percentage",
      icon: ClipboardCheck,
      accent: "var(--brand-600)",
      accent2: "var(--brand-500)",
    },
    {
      title: "International Students",
      value: summary?.international_students || 0,
      note: "Non-local nationality records",
      icon: School,
      accent: "var(--brand-600)",
      accent2: "var(--brand-500)",
    },
    {
      title: "Library Overdue",
      value: summary?.library_overdue_count || 0,
      note: `${summary?.library_issued_count || 0} book(s) currently issued`,
      icon: Clock,
      accent: "var(--danger-600)",
      accent2: "var(--danger-600)",
    },
  ];

  return (
    <div className="dashboard international-dashboard">
      <header className="page-head">
        <div className="page-head-text">
          <h1>{settings?.school_name || "Dashboard"}</h1>
          <p>
            {[settings?.board_affiliation, settings?.campus_name, settings?.academic_year]
              .filter(Boolean)
              .join(" · ") || "Today at a glance"}
          </p>
        </div>
      </header>

      <div className="dashboard-tabs">
        <button
          type="button"
          className={view === "overview" ? "active" : ""}
          onClick={() => setView("overview")}
        >
          Overview
        </button>
        <button
          type="button"
          className={view === "builder" ? "active" : ""}
          onClick={() => setView("builder")}
        >
          My Dashboard
        </button>
      </div>

      {view === "builder" ? (
        <DashboardBuilder formatMoney={formatMoney} />
      ) : loading ? (
        <div className="loading-box">Loading dashboard...</div>
      ) : (
        <>
          <section className="stats-grid">
            {cards.map((card) => {
              const Icon = card.icon;

              return (
                <div
                  className="stat-card premium-card"
                  key={card.title}
                  style={{
                    "--card-accent": card.accent,
                    "--card-accent-2": card.accent2 || card.accent,
                  }}
                >
                  <div className="stat-icon">
                    <Icon size={24} />
                  </div>

                  <div className="stat-card-body">
                    <p>{card.title}</p>
                    <h3>{card.value}</h3>
                    <span>{card.note}</span>
                  </div>
                </div>
              );
            })}
          </section>

          <section className="panel trend-panel">
            <div className="panel-header">
              <div>
                <h3>Attendance Trend</h3>
                <p>Daily present rate over the last 14 days</p>
              </div>
              <TrendingUp size={22} />
            </div>
            <TrendArea
              data={trends?.attendance_trend || []}
              color="var(--primary)"
              unit="%"
              emptyText="No attendance recorded in this window yet."
            />
          </section>

          <section className="dashboard-grid">
            <div className="panel large-panel">
              <div className="panel-header">
                <div>
                  <h3>Attendance Today</h3>
                  <p>Daily attendance snapshot</p>
                </div>
                <ClipboardCheck size={22} />
              </div>

              <AttendanceDonut
                present={summary?.today_present || 0}
                absent={summary?.today_absent || 0}
                late={summary?.today_late || 0}
                excused={summary?.today_excused || 0}
              />
            </div>

            <div className="panel">
              <div className="panel-header">
                <div>
                  <h3>Finance Health</h3>
                  <p>Collection and dues</p>
                </div>
                <Wallet size={22} />
              </div>

              <RadialGauge
                percentage={summary?.collection_percentage || 0}
                collected={summary?.total_collection}
                due={summary?.total_due}
                formatMoney={formatMoney}
              />
            </div>

            <div className="panel">
              <div className="panel-header">
                <div>
                  <h3>Student Profile Mix</h3>
                  <p>International and transport indicators</p>
                </div>
                <Users size={22} />
              </div>

              <div className="finance-summary">
                <div>
                  <span>International Students</span>
                  <strong>{summary?.international_students || 0}</strong>
                </div>

                <div>
                  <span>Transport Users</span>
                  <strong>{summary?.transport_users || 0}</strong>
                </div>
              </div>
            </div>

            <div className="panel large-panel">
              <div className="panel-header">
                <div>
                  <h3>Students by Class</h3>
                  <p>Enrollment across class sections</p>
                </div>
                <BookOpen size={22} />
              </div>

              <CategoryBarChart data={studentsByClass} emptyText="No students recorded yet." />
            </div>

            <div className="panel large-panel">
              <div className="panel-header">
                <div>
                  <h3>Grade Distribution</h3>
                  <p>Marks recorded across all exams</p>
                </div>
                <Award size={22} />
              </div>

              <CategoryBarChart data={gradeDistribution} emptyText="No marks recorded yet." />
            </div>

            <div className="panel large-panel">
              <div className="panel-header">
                <div>
                  <h3>Recent Admissions</h3>
                  <p>Latest student records</p>
                </div>
                <Users size={22} />
              </div>

              <table className="classic-table">
                <thead>
                  <tr>
                    <th>Admission No</th>
                    <th>Student</th>
                    <th>Class</th>
                    {canUseHouse && <th>House</th>}
                    <th>Admission Date</th>
                  </tr>
                </thead>

                <tbody>
                  {(summary?.recent_admissions || []).length === 0 ? (
                    <tr>
                      <td colSpan={canUseHouse ? 5 : 4} className="empty-table">
                        No recent admissions.
                      </td>
                    </tr>
                  ) : (
                    summary.recent_admissions.map((student) => (
                      <tr key={student.id}>
                        <td>{student.admission_no}</td>
                        <td>{student.student_name}</td>
                        <td>
                          {student.class_name || "-"}-{student.section || "-"}
                        </td>
                        {canUseHouse && <td>{student.house || "-"}</td>}
                        <td>{student.admission_date || "-"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <div className="panel">
              <div className="panel-header">
                <div>
                  <h3>Upcoming Exams</h3>
                  <p>Next 30 days</p>
                </div>
                <CalendarDays size={22} />
              </div>

              <ul className="task-list">
                {(summary?.upcoming_exams || []).length === 0 ? (
                  <li>No upcoming exams</li>
                ) : (
                  summary.upcoming_exams.map((exam) => (
                    <li key={exam.id}>
                      {exam.exam_name} - {exam.class_name}-{exam.section} on{" "}
                      {exam.exam_date}
                    </li>
                  ))
                )}
              </ul>
            </div>

            <div className="panel">
              <div className="panel-header">
                <div>
                  <h3>Top Performers</h3>
                  <p>Highest marks records</p>
                </div>
                <Award size={22} />
              </div>

              <ul className="task-list">
                {(summary?.top_performers || []).length === 0 ? (
                  <li>No marks records yet</li>
                ) : (
                  summary.top_performers.map((mark) => (
                    <li key={mark.id}>
                      {getStudentName(mark.student_id)} - {mark.subject}:{" "}
                      {mark.marks_obtained}/{mark.total_marks} ({mark.grade || "-"})
                    </li>
                  ))
                )}
              </ul>
            </div>

            <div className="panel large-panel">
              <div className="panel-header">
                <div>
                  <h3>Fee Defaulters</h3>
                  <p>Top outstanding dues</p>
                </div>
                <TrendingUp size={22} />
              </div>

              <table className="classic-table">
                <thead>
                  <tr>
                    <th>Student</th>
                    <th>Class</th>
                    <th>Fee Type</th>
                    <th>Due</th>
                    <th>Status</th>
                  </tr>
                </thead>

                <tbody>
                  {(summary?.fee_defaulters || []).length === 0 ? (
                    <tr>
                      <td colSpan="5" className="empty-table">
                        No fee defaulters.
                      </td>
                    </tr>
                  ) : (
                    summary.fee_defaulters.map((fee) => (
                      <tr key={fee.id}>
                        <td>{getStudentName(fee.student_id)}</td>
                        <td>{getStudentClass(fee.student_id)}</td>
                        <td>{fee.fee_type}</td>
                        <td>{formatMoney(fee.due_amount)}</td>
                        <td>
                          <span className="status danger">
                            {fee.payment_status}
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}