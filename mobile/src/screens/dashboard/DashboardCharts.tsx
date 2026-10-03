import React from "react";
import { StyleSheet, Text, View } from "react-native";
import Svg, { Circle, Line, Path, Rect, Text as SvgText } from "react-native-svg";
import { colors, type } from "../../theme/theme";
import { boundedPercentage } from "./dashboardData";

export interface ChartDatum { label: string; value: number | null; color?: string }
const palette = [colors.primary, colors.success, colors.warning, colors.danger, "#0891B2", "#DB2777", "#7C3AED"];
const valueOf = (d: ChartDatum) => d.value != null && Number.isFinite(d.value) ? d.value : 0;
const defaultFormat = (value: number) => value.toLocaleString("en-IN");

function Legend({ data, format }: { data: ChartDatum[]; format: (value: number) => string }) {
  return <View style={styles.legend}>{data.map((d, i) => <View key={i} style={styles.row}>
    <View style={[styles.dot, { backgroundColor: d.color || palette[i % palette.length] }]} />
    <Text style={styles.label}>{d.label}</Text>
    <Text style={styles.value}>{d.value == null ? "No records" : format(valueOf(d))}</Text>
  </View>)}</View>;
}

export function FinanceGauge({ percentage }: { percentage: number }) {
  const pct = boundedPercentage(percentage);
  const length = Math.PI * 120;
  return <View accessibilityLabel={`Fee collection: ${percentage}%`} accessible>
    <Svg testID="finance-gauge" width="100%" height={190} viewBox="0 0 300 190">
      <Path d="M 30 150 A 120 120 0 0 1 270 150" fill="none" stroke={colors.surfaceAlt} strokeWidth={22} strokeLinecap="round" />
      {pct > 0 && <Path d="M 30 150 A 120 120 0 0 1 270 150" fill="none" stroke={colors.success} strokeWidth={22}
        strokeDasharray={`${length * pct / 100} ${length}`} strokeLinecap="round" />}
      <SvgText x={150} y={122} textAnchor="middle" fill={pct >= 75 ? colors.success : colors.danger} fontSize={36} fontWeight="700">{percentage}%</SvgText>
      <SvgText x={150} y={150} textAnchor="middle" fill={colors.textMuted} fontSize={15}>collected</SvgText>
    </Svg>
  </View>;
}

export function DashboardChart({ data, kind = "bar", format = defaultFormat, emptyText = "No records available yet.", fixedMax }: {
  data: ChartDatum[]; kind?: string; format?: (value: number) => string; emptyText?: string; fixedMax?: number;
}) {
  const total = data.reduce((sum, d) => sum + valueOf(d), 0);
  const hasRecords = data.some(d => d.value != null);
  const max = Math.max(1, fixedMax || 0, ...data.map(valueOf));
  if (kind === "stat") return <Text style={styles.stat}>{format(total)}</Text>;
  if (kind === "table") return <View testID="table-chart"><Legend data={data} format={format} />{!data.length && <Text style={styles.empty}>{emptyText}</Text>}</View>;

  let graphic: React.ReactNode;
  if (kind === "pie" || kind === "donut") {
    const positiveTotal = data.reduce((sum, d) => sum + Math.max(0, valueOf(d)), 0);
    let offset = 0;
    const ring = kind === "donut";
    const radius = ring ? 78 : 48;
    const circumference = 2 * Math.PI * radius;
    graphic = <Svg testID={`${kind}-chart`} width="100%" height={220} viewBox="0 0 300 220">
      <Circle cx={150} cy={110} r={radius} fill="none" stroke={colors.surfaceAlt} strokeWidth={ring ? 28 : 96} />
      {data.map((d, i) => {
        const length = positiveTotal ? Math.max(0, valueOf(d)) / positiveTotal * circumference : 0;
        const start = offset; offset += length;
        return length > 0 ? <Circle key={i} cx={150} cy={110} r={radius} fill="none" stroke={d.color || palette[i % palette.length]}
          strokeWidth={ring ? 28 : 96} strokeDasharray={`${length} ${circumference}`} strokeDashoffset={-start} rotation={-90} origin="150,110" /> : null;
      })}
      {ring && <SvgText x={150} y={116} textAnchor="middle" fill={colors.text} fontWeight="700" fontSize={22}>{format(total)}</SvgText>}
    </Svg>;
  } else if (kind === "line" || kind === "area") {
    const x = (index: number) => 36 + index * 248 / Math.max(1, data.length - 1);
    const y = (value: number) => 164 - value / max * 140;
    // Missing days break the line; they must not be plotted as zero attendance.
    const segments: { x: number; y: number }[][] = [];
    data.forEach((d, i) => {
      if (d.value == null) return;
      if (i === 0 || data[i - 1].value == null) segments.push([]);
      segments[segments.length - 1].push({ x: x(i), y: y(valueOf(d)) });
    });
    graphic = <Svg testID={`${kind}-chart`} width="100%" height={220} viewBox="0 0 320 210">
      {[0, .5, 1].map(fraction => <React.Fragment key={fraction}>
        <Line x1={36} x2={284} y1={y(max * fraction)} y2={y(max * fraction)} stroke={colors.border} />
        <SvgText x={30} y={y(max * fraction) + 4} textAnchor="end" fontSize={10} fill={colors.textMuted}>{Math.round(max * fraction)}</SvgText>
      </React.Fragment>)}
      {segments.map((segment, i) => {
        const path = segment.map((p, j) => `${j === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
        return <React.Fragment key={i}>
          {kind === "area" && <Path d={`${path} L ${segment[segment.length - 1].x} 164 L ${segment[0].x} 164 Z`} fill={colors.primaryTint} />}
          <Path d={path} fill="none" stroke={colors.primary} strokeWidth={3} />
          {segment.map((p, j) => <Circle key={j} cx={p.x} cy={p.y} r={3} fill={colors.primary} />)}
        </React.Fragment>;
      })}
      <SvgText x={36} y={192} fontSize={11} fill={colors.textMuted}>{data[0]?.label}</SvgText>
      {data.length > 1 && <SvgText x={284} y={192} textAnchor="end" fontSize={11} fill={colors.textMuted}>{data[data.length - 1]?.label}</SvgText>}
    </Svg>;
  } else {
    const height = Math.max(80, data.length * 42);
    graphic = <Svg testID="bar-chart" width="100%" height={height} viewBox={`0 0 320 ${height}`}>
      {data.map((d, i) => <React.Fragment key={i}>
        <SvgText x={0} y={i * 42 + 13} fill={colors.textMuted} fontSize={12}>{d.label.length > 26 ? d.label.slice(0, 24) + "…" : d.label}</SvgText>
        <Rect x={0} y={i * 42 + 22} width={320} height={12} rx={6} fill={colors.surfaceAlt} />
        <Rect x={0} y={i * 42 + 22} width={Math.max(0, valueOf(d)) / max * 320} height={12} rx={6} fill={d.color || palette[i % palette.length]} />
      </React.Fragment>)}
    </Svg>;
  }
  return <View>{graphic}{!hasRecords && <Text style={styles.empty}>{emptyText}</Text>}
    <Legend data={kind === "line" || kind === "area" ? data.map(d => ({ ...d, color: colors.primary })) : data} format={format} /></View>;
}

const styles = StyleSheet.create({
  legend: { gap: 10, marginTop: 12 }, row: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 9, height: 9, borderRadius: 5 }, label: { ...type.caption, flex: 1, color: colors.textMuted },
  value: { ...type.caption, color: colors.text, flexShrink: 1 }, empty: { ...type.body, color: colors.textMuted, textAlign: "center", marginVertical: 12 },
  stat: { ...type.display, color: colors.primary },
});
