import React, { useEffect, useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from "react-native";
import { api } from "../../api/client";
import { colors, radius, spacing, type } from "../../theme/theme";
import { boundedPercentage, money, Report, reportQuery, starterWidgets, Widget } from "./dashboardData";
import { DashboardChart } from "./DashboardCharts";

export function Panel({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return <View style={panelStyles.panel}>
    <Text accessibilityRole="header" style={panelStyles.heading}>{title}</Text>
    {subtitle ? <Text style={panelStyles.muted}>{subtitle}</Text> : null}
    <View style={panelStyles.content}>{children}</View>
  </View>;
}
export function Empty({ children }: { children: string }) { return <Text style={panelStyles.muted}>{children}</Text>; }
export function Bar({ label, value, percentage, color = colors.primary }: { label: string; value: string | number; percentage: number; color?: string }) {
  return <View style={panelStyles.barRow} accessible accessibilityLabel={`${label}: ${value}`}>
    <View style={panelStyles.row}><Text style={panelStyles.label}>{label}</Text><Text style={[panelStyles.value, { color }]}>{value}</Text></View>
    <View style={panelStyles.track}><View style={[panelStyles.fill, { width: `${boundedPercentage(percentage)}%`, backgroundColor: color }]} /></View>
  </View>;
}
export function ReportPanel({ widget, currency, revision }: { widget: Widget; currency: string; revision: number }) {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  const query = JSON.stringify(reportQuery(widget));
  useEffect(() => {
    let active = true;
    setReport(null); setError(false);
    api.get<Report>("/dashboard/report", JSON.parse(query)).then(data => { if (active) setReport(data); })
      .catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [query, revision, retry]);
  const format = (value: number) => report?.is_currency ? money(value, currency) : value.toLocaleString("en-IN");
  return <Panel title={widget.title}>
    {error ? <><Empty>This report could not be loaded.</Empty><Pressable accessibilityRole="button" onPress={() => setRetry(v => v + 1)} style={panelStyles.retry}><Text style={panelStyles.link}>Retry report</Text></Pressable></>
      : !report ? <ActivityIndicator color={colors.primary} />
      : <DashboardChart kind={widget.chartType} format={format} data={report.labels.map((label, i) => ({ label, value: report.values[i] ?? 0 }))} />}
  </Panel>;
}
export function MyDashboard({ currency, revision }: { currency: string; revision: number }) {
  const [widgets, setWidgets] = useState<Widget[] | null>(null);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setError(false); setWidgets(null);
    api.get<{ widgets: Widget[] | null }>("/dashboard/layout").then(data => {
      if (active) setWidgets(Array.isArray(data.widgets) ? data.widgets : starterWidgets);
    }).catch(() => { if (active) setError(true); });
    return () => { active = false; };
  }, [revision, retry]);
  if (error) return <Panel title="My Dashboard"><Empty>Your saved dashboard could not be loaded.</Empty><Pressable accessibilityRole="button" onPress={() => setRetry(v => v + 1)} style={panelStyles.retry}><Text style={panelStyles.link}>Try again</Text></Pressable></Panel>;
  if (!widgets) return <ActivityIndicator color={colors.primary} style={{ margin: spacing(6) }} />;
  return <><Text style={panelStyles.muted}>Your saved reports, arranged for mobile. Add or edit widgets on the website.</Text>
    {widgets.length === 0 ? <Panel title="My Dashboard"><Empty>No saved widgets yet. Add widgets on the website and pull down here to refresh.</Empty></Panel>
      : widgets.map((widget, i) => <ReportPanel key={`${widget.id}-${i}`} widget={widget} currency={currency} revision={revision} />)}</>;
}
export const panelStyles = StyleSheet.create({
  panel: { padding: spacing(4), borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radius.lg, marginTop: spacing(4) },
  heading: { ...type.heading, color: colors.text }, muted: { ...type.body, color: colors.textMuted, marginTop: spacing(1) },
  content: { marginTop: spacing(4) }, row: { flexDirection: "row", justifyContent: "space-between", gap: spacing(3), alignItems: "flex-start" },
  label: { ...type.body, color: colors.textMuted, flex: 1 }, value: { ...type.label, color: colors.text, flexShrink: 1 },
  barRow: { marginBottom: spacing(3) }, track: { height: 10, backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, overflow: "hidden", marginTop: spacing(2) },
  fill: { height: "100%", borderRadius: radius.pill }, stat: { ...type.display, color: colors.primary },
  retry: { paddingVertical: spacing(3), minHeight: 44 }, link: { ...type.label, color: colors.primary },
});
