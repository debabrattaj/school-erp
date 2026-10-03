import React, { useCallback, useRef, useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../api/client";
import { ErrorView, LoadingView } from "../../components/Common";
import { colors, elevation, radius, spacing, type } from "../../theme/theme";
import { useAuth } from "../../auth/AuthContext";
import { money, starterWidgets } from "./dashboardData";
import { Empty, MyDashboard, Panel, panelStyles, ReportPanel } from "./DashboardPanels";
import { DashboardChart, FinanceGauge } from "./DashboardCharts";

interface Summary {
  total_students?: number; active_students?: number; total_teachers?: number; total_classes?: number;
  total_collection?: number; total_due?: number; collection_percentage?: number;
  attendance_percentage?: number; today_present?: number; today_absent?: number; today_late?: number; today_excused?: number;
  international_students?: number; transport_users?: number; library_overdue_count?: number; library_issued_count?: number;
  recent_admissions?: { id: number; admission_no: string; student_name: string; class_name: string; section: string; admission_date: string }[];
  upcoming_exams?: { id: number; exam_name: string; class_name: string; section: string; exam_date: string }[];
  top_performers?: { id: number; student_id: number; subject: string; marks_obtained: number; total_marks: number; grade: string }[];
  fee_defaulters?: { id: number; student_id: number; fee_type: string; due_amount: number; payment_status: string }[];
}
interface Settings { school_name?: string; currency?: string; board_affiliation?: string; campus_name?: string; academic_year?: string }
interface Trend { attendance_trend: { date: string; percentage: number | null; total: number }[] }

function StatTile({ label, value, accent = colors.primary }: { label: string; value: string | number; accent?: string }) {
  return <View style={styles.tile}>
    <Text style={[styles.tileValue, { color: accent }]}>{value}</Text>
    <Text style={styles.tileLabel}>{label}</Text>
  </View>;
}
function RecordRow({ title, detail }: { title: string; detail: string }) {
  return <View style={styles.record}><Text style={styles.recordTitle}>{title}</Text><Text style={panelStyles.muted}>{detail}</Text></View>;
}

export default function DashboardScreen() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"overview" | "mine">("overview");
  const [summary, setSummary] = useState<Summary | null>(null);
  const [settings, setSettings] = useState<Settings>({});
  const [studentNames, setStudentNames] = useState<Record<number, string>>({});
  const [trends, setTrends] = useState<Trend | null>(null);
  const [trendError, setTrendError] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [revision, setRevision] = useState(0);
  const generation = useRef(0);
  const load = useCallback(async () => {
    const run = ++generation.current;
    setRefreshing(true);
    setError(null);
    setTrends(null);
    setTrendError(false);
    // Independent requests keep optional report failures from hiding school totals.
    const summaryRequest = api.get<Summary>("/dashboard/summary").then(data => {
      if (generation.current === run) setSummary(data);
    }).catch(e => {
      if (generation.current === run) setError(e instanceof ApiError ? e.message : "Failed to load dashboard.");
    });
    const settingsRequest = api.get<Settings>("/settings/").then(data => {
      if (generation.current === run) setSettings(data);
    }).catch(() => {});
    const studentsRequest = api.get<{ id: number; first_name: string; last_name?: string }[]>("/students/").then(data => {
      if (generation.current === run) setStudentNames(Object.fromEntries(data.map(student =>
        [student.id, [student.first_name, student.last_name].filter(Boolean).join(" ")])));
    }).catch(() => {});
    const trendsRequest = api.get<Trend>("/dashboard/trends", { days: 14 }).then(data => {
      if (generation.current === run) setTrends(data);
    }).catch(() => { if (generation.current === run) setTrendError(true); });
    setRevision(v => v + 1);
    await Promise.all([summaryRequest, settingsRequest, trendsRequest, studentsRequest]);
    if (generation.current === run) setRefreshing(false);
  }, []);

  useFocusEffect(useCallback(() => {
    void load();
    return () => { generation.current += 1; };
  }, [load]));

  const currency = settings.currency || "INR";
  const fmt = (value?: number) => value == null ? "—" : money(value, currency);
  const trendRows = trends?.attendance_trend || [];

  return <ScrollView contentContainerStyle={styles.container}
    refreshControl={<RefreshControl refreshing={refreshing} onRefresh={load} tintColor={colors.primary} />}>
    <View style={styles.hero}>
      <Text style={styles.eyebrow}>{settings.school_name || user?.account?.name || user?.account?.account_code || "Your school"}</Text>
      <Text style={styles.welcome}>Welcome back, {(user?.name || "").split(" ")[0]}</Text>
      <Text style={styles.heroDetail}>{[settings.board_affiliation, settings.campus_name, settings.academic_year].filter(Boolean).join(" · ") || "Today at a glance"}</Text>
    </View>
    <View style={styles.tabs} accessibilityRole="tablist">
      {([ ["overview", "Overview"], ["mine", "My Dashboard"] ] as const).map(([id, label]) =>
        <Pressable key={id} accessibilityRole="tab" accessibilityState={{ selected: tab === id }}
          onPress={() => setTab(id)} style={[styles.tab, tab === id && styles.activeTab]}>
          <Text style={[styles.tabText, tab === id && { color: colors.primary }]}>{label}</Text>
        </Pressable>)}
    </View>
    {tab === "mine" ? <MyDashboard currency={currency} revision={revision} />
      : !summary ? error ? <ErrorView message={error} onRetry={load} /> : <LoadingView label="Loading overview…" />
      : <>
        {error ? <Text accessibilityRole="alert" style={styles.error}>Refresh failed: {error} Showing previously loaded figures. Pull down to retry.</Text> : null}
        <View style={styles.grid}>
          <StatTile label="Total Students" value={summary.total_students ?? "—"} />
          <StatTile label="Active Students" value={summary.active_students ?? "—"} />
          <StatTile label="Faculty Strength" value={summary.total_teachers ?? "—"} />
          <StatTile label="Class Sections" value={summary.total_classes ?? "—"} />
          <StatTile label="Fee Collection" value={fmt(summary.total_collection)} accent={colors.success} />
          <StatTile label="Outstanding Due" value={fmt(summary.total_due)} accent={colors.danger} />
          <StatTile label="Today Attendance" value={summary.attendance_percentage == null ? "—" : summary.attendance_percentage + "%"} />
          <StatTile label="International Students" value={summary.international_students ?? "—"} />
          <StatTile label="Library Overdue" value={summary.library_overdue_count ?? "—"} accent={colors.danger} />
          <StatTile label="Books Currently Issued" value={summary.library_issued_count ?? "—"} />
        </View>
        <Panel title="Attendance Trend" subtitle="Daily present rate · latest 14-day attendance window">
          {trendError ? <Empty>Attendance trend could not be loaded. Pull down to retry.</Empty>
            : !trends ? <Empty>Loading attendance trend…</Empty>
            : <DashboardChart kind="area" fixedMax={100} format={value => value + "%"}
                emptyText="No attendance recorded in this window yet."
                data={trendRows.map(row => ({ label: row.date, value: row.percentage }))} />}
        </Panel>
        <Panel title="Attendance Today" subtitle="Daily attendance snapshot">
          <DashboardChart kind="donut" data={[
            { label: "Present", value: summary.today_present ?? 0, color: colors.success },
            { label: "Absent", value: summary.today_absent ?? 0, color: colors.danger },
            { label: "Late", value: summary.today_late ?? 0, color: colors.warning },
            { label: "Excused", value: summary.today_excused ?? 0, color: colors.primary },
          ]} />
          {!((summary.today_present ?? 0) + (summary.today_absent ?? 0) + (summary.today_late ?? 0) + (summary.today_excused ?? 0)) &&
            <Empty>No attendance recorded for today yet.</Empty>}
        </Panel>
        <Panel title="Finance Health" subtitle="Collection and dues">
          <FinanceGauge percentage={summary.collection_percentage ?? 0} />
          <View style={panelStyles.row}><Text style={panelStyles.label}>Collected</Text><Text style={[panelStyles.value, { color: colors.success }]}>{fmt(summary.total_collection)}</Text></View>
          <View style={panelStyles.row}><Text style={panelStyles.label}>Outstanding</Text><Text style={[panelStyles.value, { color: colors.danger }]}>{fmt(summary.total_due)}</Text></View>
        </Panel>
        <Panel title="Student Profile Mix" subtitle="International and transport indicators">
          <View style={styles.grid}>
            <StatTile label="International Students" value={summary.international_students ?? "—"} />
            <StatTile label="Transport Users" value={summary.transport_users ?? "—"} />
          </View>
        </Panel>
        <ReportPanel widget={starterWidgets[0]} currency={currency} revision={revision} />
        <ReportPanel widget={starterWidgets[2]} currency={currency} revision={revision} />
        <Panel title="Recent Admissions" subtitle="Latest student records">
          {!summary.recent_admissions?.length ? <Empty>No recent admissions.</Empty> : summary.recent_admissions.map(student =>
            <RecordRow key={student.id} title={student.student_name} detail={[student.admission_no, [student.class_name, student.section].filter(Boolean).join(" · "), student.admission_date].filter(Boolean).join(" | ")} />)}
        </Panel>
        <Panel title="Upcoming Exams" subtitle="Next 30 days">
          {!summary.upcoming_exams?.length ? <Empty>No upcoming exams.</Empty> : summary.upcoming_exams.map(exam =>
            <RecordRow key={exam.id} title={exam.exam_name} detail={[exam.class_name, exam.section, exam.exam_date].filter(Boolean).join(" · ")} />)}
        </Panel>
        <Panel title="Top Performers" subtitle="Highest marks records">
          {!summary.top_performers?.length ? <Empty>No marks records yet.</Empty> : summary.top_performers.map(mark =>
            <RecordRow key={mark.id} title={(studentNames[mark.student_id] || "Student #" + mark.student_id) + " · " + mark.subject} detail={mark.marks_obtained + "/" + mark.total_marks + " · " + (mark.grade || "Ungraded")} />)}
        </Panel>
        <Panel title="Fee Defaulters" subtitle="Top outstanding dues">
          {!summary.fee_defaulters?.length ? <Empty>No fee defaulters.</Empty> : summary.fee_defaulters.map(fee =>
            <RecordRow key={fee.id} title={(studentNames[fee.student_id] || "Student #" + fee.student_id) + " · " + fmt(fee.due_amount)} detail={fee.fee_type + " · " + fee.payment_status} />)}
        </Panel>
      </>}
  </ScrollView>;
}

const styles = StyleSheet.create({
  container: { padding: spacing(4), paddingBottom: spacing(10) },
  hero: { backgroundColor: colors.primary, borderRadius: radius.xl, padding: spacing(5), ...elevation.md },
  eyebrow: { ...type.overline, color: colors.primaryBorder, marginBottom: spacing(2) },
  welcome: { ...type.title, color: colors.onPrimary },
  heroDetail: { ...type.caption, color: colors.onPrimary, marginTop: spacing(2) },
  tabs: { flexDirection: "row", padding: spacing(1), backgroundColor: colors.surfaceAlt, borderRadius: radius.lg, marginVertical: spacing(4), borderColor: colors.border, borderWidth: 1 },
  tab: { flex: 1, minHeight: 48, padding: spacing(3), justifyContent: "center", alignItems: "center", borderRadius: radius.md },
  activeTab: { backgroundColor: colors.surface, ...elevation.sm },
  tabText: { ...type.label, color: colors.textMuted, textAlign: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: spacing(3) },
  tile: { flexGrow: 1, flexBasis: "46%", backgroundColor: colors.surface, borderRadius: radius.lg, padding: spacing(4), borderWidth: 1, borderColor: colors.border },
  tileValue: { ...type.title, fontSize: 24, lineHeight: 30 },
  tileLabel: { ...type.caption, color: colors.textMuted, marginTop: spacing(2) },
  record: { paddingVertical: spacing(3), borderBottomWidth: 1, borderColor: colors.border },
  recordTitle: { ...type.label, color: colors.text },
  error: { ...type.body, color: colors.danger, marginBottom: spacing(3) },
});
