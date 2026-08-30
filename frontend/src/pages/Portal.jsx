import { useEffect, useMemo, useRef, useState } from "react";
import { Plus, QrCode, Trash2, X, Send } from "lucide-react";
import QRCode from "qrcode";

import API from "../api";
import { getUser, isFeatureEnabled } from "../auth";
import { formatMoney } from "../utils/money";
import { TrendArea, CollectionMeter } from "../components/DashboardCharts";

// Online Tests is sold separately, so its tab only exists for schools the
// platform owner has enabled it for. The server enforces this too -- hiding
// the tab alone would leave the endpoints reachable.
const TABS = [
  ["summary", "Summary"],
  ["performance", "Performance"],
  ["attendance", "Attendance"],
  ["marks", "Marks"],
  ["fees", "Fees"],
  ["timetable", "Timetable"],
  ["homework", "Homework"],
  ["tests", "Online Tests", "online_tests"],
  ["leave", "Leave"],
  ["library", "Library", "library"],
  ["messages", "Messages"],
  ["history", "History"],
].filter(([, , feature]) => !feature || isFeatureEnabled(feature));

function parseUtc(value) {
  if (!value) return null;
  const iso = typeof value === "string" && !value.endsWith("Z") ? `${value}Z` : value;
  return new Date(iso);
}

function getApiErrorMessage(error, fallback) {
  return error?.response?.data?.detail || fallback;
}

// The set of charts a parent/student can add to their own "Dashboard" tab.
// Deliberately a short, fixed catalog (not a free source/dimension/measure
// builder like the staff DashboardBuilder) -- every option here is already
// scoped to the signed-in user's own linked child by construction, so there
// is nothing to pick that could show another family's data.
const PORTAL_WIDGET_KINDS = [
  {
    kind: "attendance_trend",
    title: "Attendance Over Time",
    subtitle: "Monthly attendance %",
  },
  {
    kind: "marks_trend",
    title: "Marks Over Time",
    subtitle: "Percentage by exam",
  },
  {
    kind: "fee_summary",
    title: "Fee Status",
    subtitle: "Paid vs due this year",
  },
];

const DEFAULT_PORTAL_WIDGETS = PORTAL_WIDGET_KINDS.map((entry) => ({
  id: entry.kind,
  kind: entry.kind,
}));

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function monthKey(dateString) {
  return (dateString || "").slice(0, 7); // "2026-03-14" -> "2026-03"
}

function buildAttendanceTrend(attendance) {
  if (!attendance?.records?.length) return [];

  const buckets = new Map();
  attendance.records.forEach((record) => {
    const key = monthKey(record.date);
    if (!key) return;

    const bucket = buckets.get(key) || { present: 0, total: 0 };
    bucket.total += 1;
    if (record.status === "Present" || record.status === "Late") bucket.present += 1;
    else if (record.status === "Half Day") bucket.present += 0.5;
    buckets.set(key, bucket);
  });

  return Array.from(buckets.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, bucket]) => ({
      date: key,
      percentage: bucket.total ? Math.round((bucket.present / bucket.total) * 1000) / 10 : null,
    }));
}

function buildMarksTrend(marks) {
  if (!marks?.exams?.length) return [];

  return marks.exams
    .filter((exam) => exam.exam_date)
    .map((exam) => ({ date: exam.exam_date, percentage: exam.percentage }));
}

// On-device face-presence check during a proctored, webcam-required attempt.
// Both the WASM runtime and the model itself are fetched from Google's
// MediaPipe CDN, pinned to the installed @mediapipe/tasks-vision version so
// the JS API and the WASM binary stay compatible -- the video frame itself
// never leaves the browser for this, only the resulting 0/1/2+ face count.
// If either fetch fails (offline, a school firewall blocking the CDN), face
// detection is silently skipped; snapshot capture and the rest of proctoring
// are unaffected, since this is a supplementary signal, not a requirement.
const FACE_DETECTOR_WASM_URL = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm";
const FACE_DETECTOR_MODEL_URL =
  "https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite";
const FACE_CHECK_INTERVAL_MS = 2000;

export default function Portal() {
  const user = getUser();
  const isParent = user?.role === "Parent";
  const isStudent = user?.role === "Student";
  // A student cannot self-consent to being monitored -- only these roles can
  // grant/revoke, matching the same restriction the backend enforces.
  const canManageProctoringConsent = ["Parent", "Admin", "Principal"].includes(user?.role);
  const [children, setChildren] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [activeTab, setActiveTab] = useState("summary");
  const [message, setMessage] = useState("");
  const [paymentEnabled, setPaymentEnabled] = useState(false);
  const [upiPayment, setUpiPayment] = useState(null);
  const [upiReference, setUpiReference] = useState("");
  const [confirmingUpi, setConfirmingUpi] = useState(false);

  const [dashboardWidgets, setDashboardWidgets] = useState(DEFAULT_PORTAL_WIDGETS);
  const [dashboardLayoutLoaded, setDashboardLayoutLoaded] = useState(false);
  const [showAddWidget, setShowAddWidget] = useState(false);

  useEffect(() => {
    if (!message) return undefined;

    const timeoutId = window.setTimeout(() => {
      setMessage("");
    }, 2000);

    return () => window.clearTimeout(timeoutId);
  }, [message]);

  const [loading, setLoading] = useState(false);

  const [summary, setSummary] = useState(null);
  const [attendance, setAttendance] = useState(null);
  const [marks, setMarks] = useState(null);
  const [fees, setFees] = useState(null);
  const [history, setHistory] = useState([]);
  const [yearFilter, setYearFilter] = useState("");

  const [timetable, setTimetable] = useState([]);
  const [homework, setHomework] = useState([]);
  const [messages, setMessages] = useState([]);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [messageBody, setMessageBody] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);

  const [leaveRequests, setLeaveRequests] = useState([]);
  const [leaveRequestsLoading, setLeaveRequestsLoading] = useState(false);
  const [leaveFromDate, setLeaveFromDate] = useState("");
  const [leaveToDate, setLeaveToDate] = useState("");
  const [leaveReason, setLeaveReason] = useState("");
  const [submittingLeave, setSubmittingLeave] = useState(false);

  const [library, setLibrary] = useState(null);
  const [libraryLoading, setLibraryLoading] = useState(false);

  const [onlineTests, setOnlineTests] = useState([]);
  const [onlineTestsLoading, setOnlineTestsLoading] = useState(false);
  const [activeOnlineTest, setActiveOnlineTest] = useState(null);
  const [testAnswers, setTestAnswers] = useState({});
  const [submittingTest, setSubmittingTest] = useState(false);
  const [timeLeftSeconds, setTimeLeftSeconds] = useState(null);

  // Proctoring add-on: null while unknown/not applicable, otherwise
  // {granted, consent}. Only fetched when the school has the add-on.
  const [proctoringConsent, setProctoringConsent] = useState(null);
  const [proctoringViolationCount, setProctoringViolationCount] = useState(0);
  const proctoringQueueRef = useRef([]);
  const flushProctoringEventsRef = useRef(() => {});

  // Phase 2: periodic webcam snapshots. "pending" until getUserMedia
  // resolves, then "active" | "denied" | "unavailable". The <video> element
  // is just a live local preview for the student's own reassurance -- the
  // stream itself is never sent anywhere, only individual captured frames.
  const [cameraStatus, setCameraStatus] = useState("pending");
  const videoRef = useRef(null);

  async function loadChildren() {
    try {
      const response = await API.get("/portal/children");
      const list = response.data || [];
      setChildren(list);
      if (list.length && !selectedId) {
        setSelectedId(list[0].id);
      }
      if (!list.length) {
        setMessage(
          "No student is linked to your account yet. Please contact the school office."
        );
      }
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to load your students."));
    }
  }

  // Same per-user saved-layout endpoint the staff Dashboard builder uses
  // (DashboardLayout.user_id) -- it stores an opaque widget array, so a
  // parent's small {id, kind} shape here coexists fine with the richer
  // {source, groupBy, measure, ...} shape staff widgets use elsewhere.
  async function loadDashboardLayout() {
    try {
      const response = await API.get("/dashboard/layout");
      const widgets = response.data?.widgets;
      if (Array.isArray(widgets) && widgets.length) {
        setDashboardWidgets(widgets);
      }
    } catch {
      // Keep the default widget set on failure.
    } finally {
      setDashboardLayoutLoaded(true);
    }
  }

  async function saveDashboardLayout(widgets) {
    try {
      await API.put("/dashboard/layout", { widgets });
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to save your dashboard changes."));
    }
  }

  function addDashboardWidget(kind) {
    const next = [...dashboardWidgets, { id: uid(), kind }];
    setDashboardWidgets(next);
    saveDashboardLayout(next);
    setShowAddWidget(false);
  }

  function removeDashboardWidget(id) {
    const next = dashboardWidgets.filter((widget) => widget.id !== id);
    setDashboardWidgets(next);
    saveDashboardLayout(next);
  }

  async function loadStudentData(studentId) {
    if (!studentId) return;
    setLoading(true);
    setMessage("");
    const params = yearFilter ? { academic_year: yearFilter } : {};
    try {
      const [summaryRes, attendanceRes, marksRes, feesRes, historyRes, timetableRes, homeworkRes] =
        await Promise.all([
          API.get(`/portal/students/${studentId}/summary`),
          API.get(`/portal/students/${studentId}/attendance`, { params }),
          API.get(`/portal/students/${studentId}/marks`, { params }),
          API.get(`/portal/students/${studentId}/fees`, { params }),
          API.get(`/portal/students/${studentId}/enrollments`),
          API.get(`/portal/students/${studentId}/timetable`),
          API.get(`/portal/students/${studentId}/homework`),
        ]);
      setSummary(summaryRes.data);
      setAttendance(attendanceRes.data);
      setMarks(marksRes.data);
      setFees(feesRes.data);
      setHistory(historyRes.data || []);
      setTimetable(timetableRes.data || []);
      setHomework(homeworkRes.data || []);
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to load student data."));
    } finally {
      setLoading(false);
    }
  }

  async function loadMessages(studentId) {
    if (!studentId) return;
    setMessagesLoading(true);
    try {
      const response = await API.get(`/portal/students/${studentId}/messages`);
      setMessages(response.data || []);
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to load messages."));
    } finally {
      setMessagesLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab === "messages" && selectedId) {
      loadMessages(selectedId);
    }
  }, [activeTab, selectedId]);

  async function loadLeaveRequests(studentId) {
    if (!studentId) return;
    setLeaveRequestsLoading(true);
    try {
      const response = await API.get(`/portal/students/${studentId}/leave-requests`);
      setLeaveRequests(response.data || []);
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to load leave requests."));
    } finally {
      setLeaveRequestsLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab === "leave" && selectedId) {
      loadLeaveRequests(selectedId);
    }
  }, [activeTab, selectedId]);

  async function submitLeaveRequest(event) {
    event.preventDefault();
    if (!selectedId || !leaveFromDate || !leaveToDate) return;

    setSubmittingLeave(true);
    try {
      await API.post(`/portal/students/${selectedId}/leave-requests`, {
        from_date: leaveFromDate,
        to_date: leaveToDate,
        reason: leaveReason.trim() || null,
      });
      setLeaveFromDate("");
      setLeaveToDate("");
      setLeaveReason("");
      setMessage("Leave request submitted.");
      await loadLeaveRequests(selectedId);
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to submit leave request."));
    } finally {
      setSubmittingLeave(false);
    }
  }

  async function sendMessage(event) {
    event.preventDefault();
    const body = messageBody.trim();
    if (!body || !selectedId) return;

    setSendingMessage(true);
    try {
      await API.post(`/portal/students/${selectedId}/messages`, { body });
      setMessageBody("");
      await loadMessages(selectedId);
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to send message."));
    } finally {
      setSendingMessage(false);
    }
  }

  async function loadLibrary(studentId) {
    if (!studentId) return;
    setLibraryLoading(true);
    try {
      const response = await API.get(`/portal/students/${studentId}/library`);
      setLibrary(response.data);
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to load library data."));
    } finally {
      setLibraryLoading(false);
    }
  }

  useEffect(() => {
    if (activeTab === "library" && selectedId) {
      loadLibrary(selectedId);
    }
  }, [activeTab, selectedId]);

  async function loadOnlineTests(studentId) {
    if (!studentId) return;
    setOnlineTestsLoading(true);
    try {
      const response = await API.get(`/portal/students/${studentId}/online-tests`);
      setOnlineTests(response.data || []);
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to load online tests."));
    } finally {
      setOnlineTestsLoading(false);
    }
  }

  async function loadProctoringConsent(studentId) {
    if (!studentId || !isFeatureEnabled("online_test_proctoring")) {
      setProctoringConsent(null);
      return;
    }
    try {
      const response = await API.get(`/portal/students/${studentId}/proctoring/consent`);
      setProctoringConsent(response.data);
    } catch {
      setProctoringConsent(null);
    }
  }

  useEffect(() => {
    if (activeTab === "tests" && selectedId && !activeOnlineTest) {
      loadOnlineTests(selectedId);
      loadProctoringConsent(selectedId);
    }
  }, [activeTab, selectedId, activeOnlineTest]);

  async function grantProctoringConsent() {
    setMessage("");
    try {
      const response = await API.post(`/portal/students/${selectedId}/proctoring/consent`);
      setProctoringConsent(response.data);
      setMessage("Proctoring consent granted.");
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to grant consent."));
    }
  }

  async function revokeProctoringConsent() {
    setMessage("");
    try {
      const response = await API.delete(`/portal/students/${selectedId}/proctoring/consent`);
      setProctoringConsent(response.data);
      setMessage("Proctoring consent revoked.");
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to revoke consent."));
    }
  }

  async function openOnlineTest(testId) {
    setMessage("");
    try {
      const response = await API.get(`/portal/students/${selectedId}/online-tests/${testId}`);
      const data = response.data;
      setActiveOnlineTest(data);

      const initialAnswers = {};
      data.questions.forEach((q) => {
        if (q.selected_option) initialAnswers[q.id] = q.selected_option;
      });
      setTestAnswers(initialAnswers);

      // The server computes the deadline (the earlier of the attempt's duration
      // and the test's closing time) and enforces it, so trust its value rather
      // than recomputing one here that could disagree.
      if (data.attempt.status === "In Progress" && data.attempt.deadline) {
        const deadline = parseUtc(data.attempt.deadline).getTime();
        setTimeLeftSeconds(Math.max(0, Math.round((deadline - Date.now()) / 1000)));
      } else {
        setTimeLeftSeconds(null);
      }
      proctoringQueueRef.current = [];
      setProctoringViolationCount(0);
      setCameraStatus("pending");
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to open this test."));
    }
  }

  function closeOnlineTest() {
    setActiveOnlineTest(null);
    setTestAnswers({});
    setTimeLeftSeconds(null);
    proctoringQueueRef.current = [];
    setProctoringViolationCount(0);
    setCameraStatus("pending");
    loadOnlineTests(selectedId);
  }

  async function selectAnswer(questionId, option) {
    setTestAnswers((prev) => ({ ...prev, [questionId]: option }));

    // Persist as the student goes. The server grades a timed-out attempt on
    // what it has saved, so an answer that never reached it doesn't count --
    // this is what stops a slow connection at the deadline costing marks.
    if (!activeOnlineTest || activeOnlineTest.attempt.status !== "In Progress") return;
    try {
      await API.post(
        `/portal/students/${selectedId}/online-tests/${activeOnlineTest.test.id}/answer`,
        { question_id: questionId, selected_option: option }
      );
    } catch (error) {
      setMessage(getApiErrorMessage(error, "That answer could not be saved — check your connection."));
    }
  }

  async function submitOnlineTest() {
    if (!activeOnlineTest || submittingTest) return;
    setSubmittingTest(true);
    try {
      const answers = Object.entries(testAnswers).map(([question_id, selected_option]) => ({
        question_id: Number(question_id),
        selected_option,
      }));
      await API.post(
        `/portal/students/${selectedId}/online-tests/${activeOnlineTest.test.id}/submit`,
        { answers }
      );
      setMessage("Test submitted.");
      await openOnlineTest(activeOnlineTest.test.id);
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to submit test."));
    } finally {
      setSubmittingTest(false);
    }
  }

  useEffect(() => {
    if (timeLeftSeconds === null || activeOnlineTest?.attempt.status !== "In Progress") {
      return undefined;
    }
    if (timeLeftSeconds <= 0) {
      submitOnlineTest();
      return undefined;
    }
    const timerId = window.setTimeout(() => setTimeLeftSeconds((prev) => prev - 1), 1000);
    return () => window.clearTimeout(timerId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [timeLeftSeconds]);

  function queueProctoringEvent(eventType, detail, confidence) {
    proctoringQueueRef.current.push({ event_type: eventType, detail, confidence });
  }

  // Client-side signals are evidence for a human reviewer, not proof --
  // severity is decided server-side from event_type, this just reports what
  // happened. Reads activeOnlineTest/selectedId directly (fresh every render,
  // since this function is redefined each render); it is called only through
  // flushProctoringEventsRef so a setInterval created once still always runs
  // the latest version.
  async function flushProctoringEvents() {
    if (!activeOnlineTest?.proctoring?.enabled || activeOnlineTest.attempt.status !== "In Progress") return;
    const events = proctoringQueueRef.current;
    if (!events.length) return;
    proctoringQueueRef.current = [];
    try {
      const response = await API.post(
        `/portal/students/${selectedId}/online-tests/${activeOnlineTest.test.id}/proctoring/events`,
        { events }
      );
      setProctoringViolationCount(response.data.violation_count);
      if (response.data.auto_submitted) {
        setMessage("This attempt was submitted automatically after repeated proctoring violations.");
        await openOnlineTest(activeOnlineTest.test.id);
      }
    } catch {
      // Best-effort: put the events back so the next flush retries them.
      proctoringQueueRef.current = [...events, ...proctoringQueueRef.current];
    }
  }

  useEffect(() => {
    flushProctoringEventsRef.current = flushProctoringEvents;
  });

  // Browser lockdown for a proctored attempt: fullscreen on start, and
  // listeners that turn tab switches / window blur / copy-paste into queued
  // events flushed every few seconds. Keyed on the attempt id *and* status so
  // this tears itself down (exiting fullscreen, flushing anything queued)
  // the moment the attempt stops being "In Progress" -- including the
  // auto-submit triggered by flushProctoringEvents itself.
  useEffect(() => {
    const proctoring = activeOnlineTest?.proctoring;
    if (!proctoring?.enabled || activeOnlineTest.attempt.status !== "In Progress") {
      return undefined;
    }

    if (proctoring.require_fullscreen && !document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {
        // Some browsers refuse without a fresh user gesture -- the exit this
        // would otherwise suppress simply gets reported the normal way.
      });
    }

    function onVisibilityChange() {
      if (document.hidden) queueProctoringEvent("tab_blur");
    }
    function onWindowBlur() {
      queueProctoringEvent("window_blur");
    }
    function onFullscreenChange() {
      if (proctoring.require_fullscreen && !document.fullscreenElement) {
        queueProctoringEvent("fullscreen_exit");
      }
    }
    function onCopy(event) {
      if (proctoring.block_copy_paste) {
        event.preventDefault();
        queueProctoringEvent("copy_attempt");
      }
    }
    function onPaste(event) {
      if (proctoring.block_copy_paste) {
        event.preventDefault();
        queueProctoringEvent("paste_attempt");
      }
    }
    function onContextMenu(event) {
      if (proctoring.block_copy_paste) {
        event.preventDefault();
        queueProctoringEvent("context_menu");
      }
    }

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("blur", onWindowBlur);
    document.addEventListener("fullscreenchange", onFullscreenChange);
    document.addEventListener("copy", onCopy);
    document.addEventListener("paste", onPaste);
    document.addEventListener("contextmenu", onContextMenu);

    const flushIntervalId = window.setInterval(() => flushProctoringEventsRef.current(), 5000);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("blur", onWindowBlur);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      document.removeEventListener("copy", onCopy);
      document.removeEventListener("paste", onPaste);
      document.removeEventListener("contextmenu", onContextMenu);
      window.clearInterval(flushIntervalId);
      flushProctoringEventsRef.current();
      if (document.fullscreenElement) {
        document.exitFullscreen?.().catch(() => {});
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOnlineTest?.attempt?.id, activeOnlineTest?.attempt?.status]);

  // Phase 2: periodic webcam snapshots, only when the policy actually asks
  // for them. Separate from the lockdown effect above -- a denied/missing
  // camera must not stop fullscreen/tab-switch enforcement from working, and
  // vice versa. Same attempt-id/status-keyed lifecycle as that effect.
  useEffect(() => {
    const proctoring = activeOnlineTest?.proctoring;
    if (!proctoring?.enabled || !proctoring.require_webcam || activeOnlineTest.attempt.status !== "In Progress") {
      return undefined;
    }

    let stream = null;
    let captureIntervalId = null;
    let firstCaptureTimeoutId = null;
    let faceCheckIntervalId = null;
    let faceDetector = null;
    let cancelled = false;
    const videoEl = videoRef.current;
    // Local bookkeeping, not React state: only used to detect a state
    // *transition* (ok -> no_face, no_face -> multiple_faces, ...) so a
    // sustained absence reports once, not every 2s. Recovery back to "ok" is
    // deliberately not itself reported -- it isn't a violation.
    let lastFaceState = "ok";

    async function captureFrame() {
      const video = videoRef.current;
      if (!video || !video.videoWidth) return;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext("2d").drawImage(video, 0, 0);
      canvas.toBlob(
        async (blob) => {
          if (!blob) return;
          const formData = new FormData();
          formData.append("file", blob, "snapshot.jpg");
          try {
            await API.post(
              `/portal/students/${selectedId}/online-tests/${activeOnlineTest.test.id}/proctoring/snapshot`,
              formData
            );
          } catch {
            // Best-effort -- a missed frame isn't retried, the next interval
            // tick just captures a fresh one.
          }
        },
        "image/jpeg",
        0.8
      );
    }

    // On-device face-presence check, reusing this same camera stream (never
    // a second getUserMedia call). Runs entirely in the browser -- only the
    // resulting face count, not any image data, is ever sent to the server.
    async function setUpFaceDetector() {
      try {
        const { FaceDetector, FilesetResolver } = await import("@mediapipe/tasks-vision");
        if (cancelled) return;
        const vision = await FilesetResolver.forVisionTasks(FACE_DETECTOR_WASM_URL);
        if (cancelled) return;
        faceDetector = await FaceDetector.createFromOptions(vision, {
          baseOptions: { modelAssetPath: FACE_DETECTOR_MODEL_URL },
          runningMode: "VIDEO",
        });
        if (cancelled) {
          faceDetector.close();
          faceDetector = null;
          return;
        }
        faceCheckIntervalId = window.setInterval(() => {
          const video = videoRef.current;
          if (!faceDetector || !video || !video.videoWidth) return;
          let result;
          try {
            result = faceDetector.detectForVideo(video, performance.now());
          } catch {
            return; // a transient decode error on one frame isn't worth acting on
          }
          const faceCount = result.detections.length;
          const state = faceCount === 0 ? "no_face" : faceCount === 1 ? "ok" : "multiple_faces";
          if (state !== lastFaceState && state !== "ok") {
            const confidence =
              state === "multiple_faces"
                ? Math.min(...result.detections.map((d) => d.categories?.[0]?.score ?? 1))
                : undefined;
            queueProctoringEvent(state, `${faceCount} face(s) detected`, confidence);
          }
          lastFaceState = state;
        }, FACE_CHECK_INTERVAL_MS);
      } catch {
        // CDN unreachable, WASM unsupported, or model load failed -- face
        // detection is a bonus signal, not a requirement; skip it silently
        // and leave snapshot capture and lockdown enforcement unaffected.
      }
    }

    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }
        setCameraStatus("active");
        if (videoEl) videoEl.srcObject = stream;

        const intervalMs = (proctoring.capture_interval_seconds || 30) * 1000;
        firstCaptureTimeoutId = window.setTimeout(captureFrame, 1000);
        captureIntervalId = window.setInterval(captureFrame, intervalMs);
        setUpFaceDetector();
      } catch (err) {
        if (cancelled) return;
        const denied = err && err.name === "NotAllowedError";
        setCameraStatus(denied ? "denied" : "unavailable");
        queueProctoringEvent(denied ? "camera_denied" : "camera_unavailable", err?.message);
      }
    })();

    return () => {
      cancelled = true;
      if (firstCaptureTimeoutId) window.clearTimeout(firstCaptureTimeoutId);
      if (captureIntervalId) window.clearInterval(captureIntervalId);
      if (faceCheckIntervalId) window.clearInterval(faceCheckIntervalId);
      if (faceDetector) faceDetector.close();
      if (stream) stream.getTracks().forEach((track) => track.stop());
      if (videoEl) videoEl.srcObject = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeOnlineTest?.attempt?.id, activeOnlineTest?.attempt?.status]);

  function formatTimeLeft(seconds) {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${String(s).padStart(2, "0")}`;
  }

  useEffect(() => {
    loadChildren();
    loadDashboardLayout();
  }, []);

  useEffect(() => {
    loadStudentData(selectedId);
  }, [selectedId, yearFilter]);

  const attendanceTrend = useMemo(() => buildAttendanceTrend(attendance), [attendance]);
  const marksTrend = useMemo(() => buildMarksTrend(marks), [marks]);

  const feeSummary = useMemo(() => {
    if (!fees?.totals) return null;
    const { total_amount: total, total_paid: paid, total_due: due } = fees.totals;
    return {
      percentage: total ? Math.round((paid / total) * 1000) / 10 : 0,
      collected: paid,
      due,
    };
  }, [fees]);

  const availableWidgetKinds = PORTAL_WIDGET_KINDS.filter(
    (entry) => !dashboardWidgets.some((widget) => widget.kind === entry.kind)
  );

  useEffect(() => {
    if (!isParent) return;
    API.get("/portal/payment/config")
      .then((r) => setPaymentEnabled(Boolean(r.data?.enabled)))
      .catch(() => setPaymentEnabled(false));
  }, [isParent]);

  async function openUpiPayment(fee) {
    setMessage("");
    try {
      const { data } = await API.get(
        `/portal/students/${selectedId}/fees/${fee.id}/payment/upi`
      );
      let qr = "";
      try {
        qr = await QRCode.toDataURL(data.uri, { width: 220, margin: 1 });
      } catch {
        qr = "";
      }
      setUpiReference("");
      setUpiPayment({ fee, details: data, qr });
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Unable to start UPI payment."));
    }
  }

  function closeUpiPayment() {
    setUpiPayment(null);
    setUpiReference("");
  }

  async function confirmUpiPayment() {
    if (!upiPayment) return;

    const reference = upiReference.trim();
    if (!reference) {
      setMessage("Enter the UPI transaction reference (UTR) to confirm.");
      return;
    }

    setConfirmingUpi(true);
    try {
      await API.post(
        `/portal/students/${selectedId}/fees/${upiPayment.fee.id}/payment/upi/confirm`,
        { reference }
      );
      setMessage("UPI payment recorded.");
      closeUpiPayment();
      await loadStudentData(selectedId);
    } catch (error) {
      setMessage(getApiErrorMessage(error, "Could not record the UPI payment."));
    } finally {
      setConfirmingUpi(false);
    }
  }

  const selectedChild = children.find((child) => child.id === selectedId);
  const yearOptions = [
    ...new Set(history.map((item) => item.academic_year).filter(Boolean)),
  ];

  return (
    <div className="management-page">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Family Portal</p>
          <h2>Student Portal</h2>
          <p>View attendance, marks, fees and academic history.</p>
        </div>
      </section>

      {message && <div className="toast-notification">{message}</div>}

      {children.length > 1 && (
        <section className="form-panel">
          <div className="classic-form">
            <div className="form-grid">
              <div className="form-field">
                <label>Student</label>
                <select
                  value={selectedId || ""}
                  onChange={(event) => setSelectedId(Number(event.target.value))}
                >
                  {children.map((child) => (
                    <option key={child.id} value={child.id}>
                      {child.full_name} ({child.admission_no})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </section>
      )}

      {selectedChild && (
        <section className="form-panel">
          <div className="panel-header">
            <div>
              <h3>{selectedChild.full_name}</h3>
              <p>
                Admission No: {selectedChild.admission_no} | Class:{" "}
                {[selectedChild.class_name, selectedChild.section]
                  .filter(Boolean)
                  .join(" - ") || "-"}{" "}
                | Status: {selectedChild.student_status || "-"}
              </p>
            </div>

            <div className="form-field">
              <label>Academic Year</label>
              <select
                value={yearFilter}
                onChange={(event) => setYearFilter(event.target.value)}
              >
                <option value="">All Years</option>
                {yearOptions.map((year) => (
                  <option key={year} value={year}>
                    {year}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div style={{ marginBottom: "1rem" }}>
            {TABS.map(([key, label]) => (
              <button
                key={key}
                type="button"
                className={activeTab === key ? "primary-button" : "secondary-button"}
                style={{ marginRight: "0.5rem" }}
                onClick={() => setActiveTab(key)}
              >
                {label}
              </button>
            ))}
          </div>

          {loading && <p>Loading...</p>}

          {!loading && activeTab === "summary" && summary && (
            <div className="table-wrapper">
            <table className="classic-table">
              <tbody>
                <tr>
                  <th>Current Academic Year</th>
                  <td>{summary.current_academic_year || "-"}</td>
                </tr>
                <tr>
                  <th>Current Class</th>
                  <td>
                    {summary.current_enrollment
                      ? [
                          summary.current_enrollment.class_name,
                          summary.current_enrollment.section,
                        ]
                          .filter(Boolean)
                          .join(" - ")
                      : "-"}
                  </td>
                </tr>
                <tr>
                  <th>Roll No</th>
                  <td>{summary.current_enrollment?.roll_no || "-"}</td>
                </tr>
                <tr>
                  <th>House</th>
                  <td>{summary.student?.house || "-"}</td>
                </tr>
                <tr>
                  <th>Father</th>
                  <td>{summary.guardian?.father_name || "-"}</td>
                </tr>
                <tr>
                  <th>Mother</th>
                  <td>{summary.guardian?.mother_name || "-"}</td>
                </tr>
              </tbody>
            </table>
            </div>
          )}

          {!loading && activeTab === "performance" && dashboardLayoutLoaded && (
            <>
              <div className="builder-grid">
                {dashboardWidgets.map((widget) => {
                  const meta = PORTAL_WIDGET_KINDS.find((entry) => entry.kind === widget.kind);
                  if (!meta) return null;

                  return (
                    <div key={widget.id} className="widget-card">
                      <div className="widget-head">
                        <div className="widget-title">
                          <h3>{meta.title}</h3>
                          <p>{meta.subtitle}</p>
                        </div>
                        <div className="widget-actions">
                          <button
                            type="button"
                            className="widget-remove"
                            aria-label={`Remove ${meta.title}`}
                            onClick={() => removeDashboardWidget(widget.id)}
                          >
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </div>
                      <div className="widget-body">
                        {widget.kind === "attendance_trend" && (
                          <TrendArea
                            data={attendanceTrend}
                            unit="%"
                            emptyText="No attendance recorded yet."
                          />
                        )}
                        {widget.kind === "marks_trend" && (
                          <TrendArea
                            data={marksTrend}
                            unit="%"
                            color="var(--success-600)"
                            emptyText="No exam marks recorded yet."
                          />
                        )}
                        {widget.kind === "fee_summary" &&
                          (feeSummary ? (
                            <CollectionMeter
                              percentage={feeSummary.percentage}
                              collected={feeSummary.collected}
                              due={feeSummary.due}
                              formatMoney={(value) => formatMoney(value)}
                            />
                          ) : (
                            <p className="chart-empty">No fee records yet.</p>
                          ))}
                      </div>
                    </div>
                  );
                })}
              </div>

              {!dashboardWidgets.length && (
                <p className="builder-empty">
                  No charts added yet. Use "Add Chart" below to build your own view.
                </p>
              )}

              <div style={{ marginTop: "1rem", position: "relative" }}>
                {availableWidgetKinds.length > 0 && (
                  <button
                    type="button"
                    className="light-button"
                    onClick={() => setShowAddWidget((prev) => !prev)}
                  >
                    <Plus size={16} />
                    Add Chart
                  </button>
                )}

                {showAddWidget && (
                  <div className="report-saved-views" style={{ marginTop: "10px" }}>
                    {availableWidgetKinds.map((entry) => (
                      <button
                        key={entry.kind}
                        type="button"
                        className="secondary-button"
                        onClick={() => addDashboardWidget(entry.kind)}
                      >
                        {entry.title}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}

          {!loading && activeTab === "attendance" && attendance && (
            <>
              <div className="message-box">
                Attendance:{" "}
                {attendance.attendance_percentage != null
                  ? `${attendance.attendance_percentage}%`
                  : "No records"}{" "}
                | Present: {attendance.counts.Present} | Absent:{" "}
                {attendance.counts.Absent} | Late: {attendance.counts.Late} | Half
                Day: {attendance.counts["Half Day"]}
              </div>
              <div className="table-wrapper">
              <table className="classic-table">
                <thead>
                  <tr>
                    <th>Date</th>
                    <th>Status</th>
                    <th>Year</th>
                    <th>Remarks</th>
                  </tr>
                </thead>
                <tbody>
                  {attendance.records.slice(0, 60).map((record, index) => (
                    <tr key={index}>
                      <td>{record.date}</td>
                      <td>{record.status}</td>
                      <td>{record.academic_year || "-"}</td>
                      <td>{record.remarks || "-"}</td>
                    </tr>
                  ))}
                  {!attendance.records.length && (
                    <tr>
                      <td colSpan={4}>No attendance records found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
              </div>
            </>
          )}

          {!loading && activeTab === "marks" && marks && (
            <>
              {marks.exams.map((exam) => (
                <div key={exam.exam_name} style={{ marginBottom: "1.5rem" }}>
                  <h4>
                    {exam.exam_name} ({exam.academic_year || "-"}) —{" "}
                    {exam.percentage != null ? `${exam.percentage}%` : "-"}
                  </h4>
                  <div className="table-wrapper">
                  <table className="classic-table">
                    <thead>
                      <tr>
                        <th>Subject</th>
                        <th>Marks</th>
                        <th>Max</th>
                        <th>Grade</th>
                      </tr>
                    </thead>
                    <tbody>
                      {exam.subjects.map((subject, index) => (
                        <tr key={index}>
                          <td>{subject.subject}</td>
                          <td>{subject.marks_obtained}</td>
                          <td>{subject.max_marks}</td>
                          <td>{subject.grade || "-"}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  </div>
                </div>
              ))}
              {!marks.exams.length && <p>No marks recorded yet.</p>}
            </>
          )}

          {!loading && activeTab === "fees" && fees && (
            <>
              <div className="message-box">
                Total: {fees.totals.total_amount} | Paid: {fees.totals.total_paid} |{" "}
                <strong>Due: {fees.totals.total_due}</strong>
              </div>
              <div className="table-wrapper">
              <table className="classic-table">
                <thead>
                  <tr>
                    <th>Fee Type</th>
                    <th>Year</th>
                    <th>Total</th>
                    <th>Paid</th>
                    <th>Due</th>
                    <th>Status</th>
                    <th>Receipt</th>
                    {isParent && <th>Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {fees.fees.map((fee) => (
                    <tr key={fee.id}>
                      <td>{fee.fee_type}</td>
                      <td>{fee.academic_year || "-"}</td>
                      <td>{fee.total_amount}</td>
                      <td>{fee.paid_amount}</td>
                      <td>{fee.due_amount}</td>
                      <td>{fee.payment_status}</td>
                      <td>{fee.receipt_no || "-"}</td>
                      {isParent && (
                        <td>
                          {paymentEnabled && fee.due_amount > 0 && (
                            <button
                              type="button"
                              className="icon-button"
                              onClick={() => openUpiPayment(fee)}
                              title="Pay via UPI"
                            >
                              <QrCode size={15} />
                            </button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                  {!fees.fees.length && (
                    <tr>
                      <td colSpan={isParent ? 8 : 7}>No fee records found.</td>
                    </tr>
                  )}
                </tbody>
              </table>
              </div>
            </>
          )}

          {activeTab === "library" && (
            <>
              {libraryLoading && <p>Loading library data…</p>}
              {!libraryLoading && library && (
                <>
                  <div className="message-box">
                    Currently issued: {library.current.length} | Total fine due: {library.total_fine_due}
                  </div>

                  <div className="table-wrapper">
                    <table className="classic-table">
                      <thead>
                        <tr>
                          <th>Book</th><th>Issued</th><th>Due</th><th>Status</th><th>Days Overdue</th><th>Fine</th>
                        </tr>
                      </thead>
                      <tbody>
                        {library.current.map((issue) => (
                          <tr key={issue.id}>
                            <td>{issue.accession_no} - {issue.book_title}</td>
                            <td>{issue.issue_date}</td>
                            <td>{issue.due_date || "-"}</td>
                            <td>{issue.status}</td>
                            <td>{issue.days_overdue || 0}</td>
                            <td>{issue.fine_amount || 0}{issue.fine_paid ? " (paid)" : ""}</td>
                          </tr>
                        ))}
                        {!library.current.length && (
                          <tr><td colSpan={6}>No books currently issued.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>

                  {!!library.reservations.length && (
                    <>
                      <h4 style={{ marginTop: 20 }}>Reservations</h4>
                      <div className="table-wrapper">
                        <table className="classic-table">
                          <thead><tr><th>Book</th><th>Status</th><th>Queue #</th></tr></thead>
                          <tbody>
                            {library.reservations.map((r) => (
                              <tr key={r.id}>
                                <td>{r.book_title}</td><td>{r.status}</td><td>{r.queue_position}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </>
                  )}

                  <h4 style={{ marginTop: 20 }}>History</h4>
                  <div className="table-wrapper">
                    <table className="classic-table">
                      <thead>
                        <tr><th>Book</th><th>Issued</th><th>Return</th><th>Status</th><th>Fine</th></tr>
                      </thead>
                      <tbody>
                        {library.history.map((issue) => (
                          <tr key={issue.id}>
                            <td>{issue.accession_no} - {issue.book_title}</td>
                            <td>{issue.issue_date}</td>
                            <td>{issue.return_date || "-"}</td>
                            <td>{issue.status}</td>
                            <td>{issue.fine_amount || 0}</td>
                          </tr>
                        ))}
                        {!library.history.length && (
                          <tr><td colSpan={5}>No past library records.</td></tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </>
          )}

          {!loading && activeTab === "timetable" && (
            <div className="table-wrapper">
            <table className="classic-table">
              <thead>
                <tr>
                  <th>Day</th>
                  <th>Period</th>
                  <th>Time</th>
                  <th>Subject</th>
                  <th>Teacher</th>
                  <th>Room</th>
                </tr>
              </thead>
              <tbody>
                {timetable.map((entry, index) => (
                  <tr key={index}>
                    <td>{entry.day_of_week}</td>
                    <td>{entry.period_no}</td>
                    <td>
                      {entry.start_time && entry.end_time
                        ? `${entry.start_time} - ${entry.end_time}`
                        : "-"}
                    </td>
                    <td>
                      {entry.entry_type === "period"
                        ? entry.subject || "-"
                        : entry.label || entry.entry_type}
                    </td>
                    <td>{entry.teacher_name || "-"}</td>
                    <td>{entry.room || "-"}</td>
                  </tr>
                ))}
                {!timetable.length && (
                  <tr>
                    <td colSpan={6}>No timetable published for this class yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          )}

          {!loading && activeTab === "homework" && (
            <div className="table-wrapper">
            <table className="classic-table">
              <thead>
                <tr>
                  <th>Due Date</th>
                  <th>Subject</th>
                  <th>Title</th>
                  <th>Description</th>
                  <th>Teacher</th>
                </tr>
              </thead>
              <tbody>
                {homework.map((item) => (
                  <tr key={item.id}>
                    <td>{item.due_date || "-"}</td>
                    <td>{item.subject || "-"}</td>
                    <td>{item.title}</td>
                    <td>{item.description || "-"}</td>
                    <td>{item.teacher_name || "-"}</td>
                  </tr>
                ))}
                {!homework.length && (
                  <tr>
                    <td colSpan={5}>No homework posted for this class yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          )}

          {!loading && activeTab === "tests" && !activeOnlineTest && isFeatureEnabled("online_test_proctoring") && (
            <div className="message-box proctoring-consent-banner">
              {proctoringConsent?.granted ? (
                <>
                  <strong>Exam proctoring consent: granted.</strong>{" "}
                  Proctored tests for this student may request fullscreen and report browser
                  activity such as tab switches or copy/paste attempts while an attempt is open.
                  {canManageProctoringConsent && (
                    <div className="form-actions">
                      <button type="button" className="light-button" onClick={revokeProctoringConsent}>
                        Revoke Consent
                      </button>
                    </div>
                  )}
                </>
              ) : (
                <>
                  <strong>Exam proctoring consent: not granted.</strong>{" "}
                  A proctored test cannot be started for this student until a guardian or
                  administrator grants consent.
                  {canManageProctoringConsent ? (
                    <div className="form-actions">
                      <button type="button" className="primary-button" onClick={grantProctoringConsent}>
                        Grant Consent
                      </button>
                    </div>
                  ) : (
                    <div>Ask a parent or the school office to grant consent from this page.</div>
                  )}
                </>
              )}
            </div>
          )}

          {!loading && activeTab === "tests" && !activeOnlineTest && (
            <div className="table-wrapper">
            <table className="classic-table">
              <thead>
                <tr>
                  <th>Subject</th>
                  <th>Title</th>
                  <th>Marks</th>
                  <th>Status</th>
                  <th>Score</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {onlineTestsLoading && (
                  <tr>
                    <td colSpan={6}>Loading...</td>
                  </tr>
                )}
                {!onlineTestsLoading &&
                  onlineTests.map((test) => (
                    <tr key={test.id}>
                      <td>{test.subject || "-"}</td>
                      <td>
                        {test.title}
                        {test.proctoring_enabled && <span className="status pending online-test-proctored-badge">Proctored</span>}
                      </td>
                      <td>{test.total_marks}</td>
                      <td>
                        {test.attempt_status === "Submitted"
                          ? "Submitted"
                          : test.attempt_status === "In Progress"
                          ? "In Progress"
                          : test.is_open
                          ? "Not Started"
                          : "Closed"}
                      </td>
                      <td>
                        {test.attempt_status === "Submitted"
                          ? `${test.score} / ${test.max_score}`
                          : "-"}
                      </td>
                      <td>
                        {test.attempt_status === "Submitted" ? (
                          <button type="button" className="secondary-button" onClick={() => openOnlineTest(test.id)}>
                            Review
                          </button>
                        ) : test.attempt_status === "In Progress" ? (
                          <button type="button" className="primary-button" onClick={() => openOnlineTest(test.id)}>
                            Continue
                          </button>
                        ) : test.is_open && isStudent ? (
                          <button type="button" className="primary-button" onClick={() => openOnlineTest(test.id)}>
                            Start
                          </button>
                        ) : (
                          "-"
                        )}
                      </td>
                    </tr>
                  ))}
                {!onlineTestsLoading && !onlineTests.length && (
                  <tr>
                    <td colSpan={6}>No online tests published for this class yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          )}

          {activeTab === "tests" && activeOnlineTest && (
            <div className="online-test-runner">
              <div className="online-test-runner-header">
                <div>
                  <h3>{activeOnlineTest.test.title}</h3>
                  <p>{activeOnlineTest.test.subject}</p>
                </div>
                {timeLeftSeconds !== null && activeOnlineTest.attempt.status === "In Progress" && (
                  <div className="online-test-timer">Time left: {formatTimeLeft(timeLeftSeconds)}</div>
                )}
              </div>

              {activeOnlineTest.proctoring?.enabled && activeOnlineTest.attempt.status === "In Progress" && (
                <div className="message-box online-test-proctoring-notice">
                  This attempt is proctored: stay in fullscreen and do not switch tabs, copy or
                  paste. Flags reported so far: {proctoringViolationCount}
                  {activeOnlineTest.proctoring.max_violations_before_autosubmit
                    ? ` / ${activeOnlineTest.proctoring.max_violations_before_autosubmit}`
                    : ""}
                  . Reaching the limit submits this attempt automatically.
                  {activeOnlineTest.proctoring.require_webcam && (
                    <div className="online-test-camera-status">
                      {cameraStatus === "active" && "Camera: on — a still photo is captured periodically, not a continuous recording. An on-device check also flags if no face or more than one face is visible; no video is sent anywhere for this."}
                      {cameraStatus === "pending" && "Camera: requesting permission..."}
                      {cameraStatus === "denied" && "Camera: permission denied — this has been flagged for the teacher."}
                      {cameraStatus === "unavailable" && "Camera: not available on this device — this has been flagged for the teacher."}
                    </div>
                  )}
                </div>
              )}

              {activeOnlineTest.proctoring?.require_webcam && activeOnlineTest.attempt.status === "In Progress" && (
                <video ref={videoRef} autoPlay muted playsInline className="online-test-camera-preview" />
              )}

              {activeOnlineTest.attempt.status === "Submitted" && (
                <div className="message-box">
                  Score: {activeOnlineTest.attempt.score} / {activeOnlineTest.attempt.max_score}
                  {activeOnlineTest.attempt.auto_submitted_reason === "time_expired" && (
                    <div>This test was submitted automatically because the time ran out. Answers saved before then were marked.</div>
                  )}
                  {activeOnlineTest.attempt.auto_submitted_reason === "window_closed" && (
                    <div>This test closed before it was submitted. Answers saved before it closed were marked.</div>
                  )}
                  {activeOnlineTest.attempt.auto_submitted_reason === "proctoring_violation" && (
                    <div>This test was submitted automatically after repeated proctoring violations. Answers saved before then were marked.</div>
                  )}
                </div>
              )}

              {activeOnlineTest.questions.map((q, index) => (
                <div key={q.id} className="online-test-question">
                  <p className="online-test-question-text">
                    {index + 1}. {q.question_text} <span className="online-test-question-marks">({q.marks} mark{q.marks === 1 ? "" : "s"})</span>
                  </p>
                  <div className="online-test-options">
                    {(q.options || ["True", "False"]).map((option) => {
                      const isSelected = testAnswers[q.id] === option;
                      const isSubmitted = activeOnlineTest.attempt.status === "Submitted";
                      const isCorrectOption = isSubmitted && q.correct_option === option;
                      let optionClass = "online-test-option";
                      if (isSelected) optionClass += " online-test-option-selected";
                      if (isSubmitted && isCorrectOption) optionClass += " online-test-option-correct";
                      if (isSubmitted && isSelected && !isCorrectOption) optionClass += " online-test-option-wrong";
                      return (
                        <label key={option} className={optionClass}>
                          <input
                            type="radio"
                            name={`question-${q.id}`}
                            checked={isSelected}
                            disabled={isSubmitted}
                            onChange={() => selectAnswer(q.id, option)}
                          />
                          {option}
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}

              <div className="form-actions">
                {activeOnlineTest.attempt.status === "In Progress" && (
                  <button type="button" className="primary-button" onClick={submitOnlineTest} disabled={submittingTest}>
                    {submittingTest ? "Submitting..." : "Submit Test"}
                  </button>
                )}
                <button type="button" className="light-button" onClick={closeOnlineTest}>
                  Back to Tests
                </button>
              </div>
            </div>
          )}

          {activeTab === "leave" && (
            <div className="portal-messages">
              <div className="portal-messages-list">
                {leaveRequestsLoading && <p>Loading...</p>}
                {!leaveRequestsLoading && !leaveRequests.length && (
                  <p>No leave requests yet. Submit one below.</p>
                )}
                {!leaveRequestsLoading &&
                  leaveRequests.map((request) => (
                    <div key={request.id} className="portal-message portal-message-staff">
                      <div className="portal-message-meta">
                        <strong>
                          {request.from_date}
                          {request.to_date !== request.from_date ? ` to ${request.to_date}` : ""}
                        </strong>
                        <span
                          className={
                            request.status === "Approved"
                              ? "status active"
                              : request.status === "Rejected"
                              ? "status danger"
                              : "status warning"
                          }
                        >
                          {request.status}
                        </span>
                      </div>
                      {request.reason && <p>{request.reason}</p>}
                      {request.decision_note && (
                        <p>
                          <em>School note: {request.decision_note}</em>
                        </p>
                      )}
                    </div>
                  ))}
              </div>

              <form className="portal-message-form" onSubmit={submitLeaveRequest}>
                <div className="form-grid">
                  <div className="form-field">
                    <label>From</label>
                    <input
                      type="date"
                      value={leaveFromDate}
                      onChange={(event) => setLeaveFromDate(event.target.value)}
                      required
                    />
                  </div>
                  <div className="form-field">
                    <label>To</label>
                    <input
                      type="date"
                      value={leaveToDate}
                      onChange={(event) => setLeaveToDate(event.target.value)}
                      required
                    />
                  </div>
                </div>
                <textarea
                  value={leaveReason}
                  onChange={(event) => setLeaveReason(event.target.value)}
                  placeholder="Reason (optional)"
                  rows={2}
                />
                <button
                  type="submit"
                  className="primary-button"
                  disabled={submittingLeave || !leaveFromDate || !leaveToDate}
                >
                  <Send size={16} /> Submit Request
                </button>
              </form>
            </div>
          )}

          {activeTab === "messages" && (
            <div className="portal-messages">
              <div className="portal-messages-list">
                {messagesLoading && <p>Loading...</p>}
                {!messagesLoading && !messages.length && (
                  <p>No messages yet. Send one below to reach the school office.</p>
                )}
                {!messagesLoading &&
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={
                        msg.is_staff
                          ? "portal-message portal-message-staff"
                          : "portal-message portal-message-self"
                      }
                    >
                      <div className="portal-message-meta">
                        <strong>{msg.sender_name}</strong>
                        <span>{msg.sender_role}</span>
                      </div>
                      <p>{msg.body}</p>
                    </div>
                  ))}
              </div>

              <form className="portal-message-form" onSubmit={sendMessage}>
                <textarea
                  value={messageBody}
                  onChange={(event) => setMessageBody(event.target.value)}
                  placeholder="Write a message to the school..."
                  rows={2}
                />
                <button
                  type="submit"
                  className="primary-button"
                  disabled={sendingMessage || !messageBody.trim()}
                >
                  <Send size={16} /> Send
                </button>
              </form>
            </div>
          )}

          {!loading && activeTab === "history" && (
            <div className="table-wrapper">
            <table className="classic-table">
              <thead>
                <tr>
                  <th>Academic Year</th>
                  <th>Class</th>
                  <th>Roll No</th>
                  <th>Status</th>
                  <th>Outcome</th>
                </tr>
              </thead>
              <tbody>
                {history.map((item, index) => (
                  <tr key={index}>
                    <td>{item.academic_year}</td>
                    <td>
                      {[item.class_name, item.section].filter(Boolean).join(" - ") ||
                        "-"}
                    </td>
                    <td>{item.roll_no || "-"}</td>
                    <td>{item.enrollment_status}</td>
                    <td>{item.promotion_status}</td>
                  </tr>
                ))}
                {!history.length && (
                  <tr>
                    <td colSpan={5}>No enrollment history yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
            </div>
          )}
        </section>
      )}

      {upiPayment && (
        <div className="layout-modal-backdrop" onClick={closeUpiPayment}>
          <div
            className="layout-modal"
            style={{ width: "min(420px, 100%)" }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="layout-modal-header">
              <div>
                <h3>Pay via UPI</h3>
                <p>
                  {upiPayment.fee.fee_type || "Fee"} —{" "}
                  {selectedChild?.full_name || "-"}
                </p>
              </div>
              <button
                type="button"
                className="light-icon-button"
                onClick={closeUpiPayment}
                title="Close"
              >
                <X size={16} />
              </button>
            </div>

            <div style={{ textAlign: "center" }}>
              {upiPayment.qr ? (
                <img
                  src={upiPayment.qr}
                  alt="UPI payment QR code"
                  style={{ width: 220, height: 220 }}
                />
              ) : (
                <p>Scan unavailable — pay using the UPI ID below.</p>
              )}

              <p style={{ margin: "10px 0 2px", fontSize: "1.05rem" }}>
                <strong>{upiPayment.details.amount}</strong>
              </p>
              <p style={{ margin: 0, color: "var(--text-muted)" }}>
                to <strong>{upiPayment.details.upi_id}</strong>
                {upiPayment.details.payee_name
                  ? ` (${upiPayment.details.payee_name})`
                  : ""}
              </p>

              <p style={{ margin: "12px 0 0" }}>
                <a href={upiPayment.details.uri}>Open in UPI app</a>
              </p>
            </div>

            <div style={{ marginTop: 16 }}>
              <label htmlFor="upi-reference">
                UPI transaction reference (UTR)
              </label>
              <input
                id="upi-reference"
                type="text"
                value={upiReference}
                placeholder="e.g. 415712345678"
                onChange={(event) => setUpiReference(event.target.value)}
                style={{ width: "100%", marginTop: 6 }}
              />
              <p style={{ margin: "6px 0 0", fontSize: 12, color: "var(--text-muted)" }}>
                After the payment succeeds in the UPI app, enter its reference
                number here to record the fee as paid.
              </p>
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 10,
                marginTop: 16,
              }}
            >
              <button
                type="button"
                className="secondary-button"
                onClick={closeUpiPayment}
                disabled={confirmingUpi}
              >
                Cancel
              </button>
              <button
                type="button"
                className="primary-button"
                onClick={confirmUpiPayment}
                disabled={confirmingUpi}
              >
                {confirmingUpi ? "Recording…" : "Confirm payment"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
