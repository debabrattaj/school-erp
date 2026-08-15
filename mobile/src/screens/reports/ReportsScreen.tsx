import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { api, ApiError } from "../../api/client";
import { Card, EmptyView, ErrorView, LoadingView, SectionLabel } from "../../components/Common";
import { colors, radius, spacing, type } from "../../theme/theme";

interface CatalogEntry {
  label: string;
  dimensions: string[];
  measures: Record<string, string>;
  has_date: boolean;
}
type Catalog = Record<string, CatalogEntry>;

interface ReportRow {
  label: string;
  value: number;
}

function humanize(key: string) {
  return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Horizontal bars, scaled to the largest value — the mobile stand-in for the web's chart. */
function BarRow({ row, max }: { row: ReportRow; max: number }) {
  const pct = max > 0 ? Math.max(2, (row.value / max) * 100) : 0;
  return (
    <View style={styles.barRow}>
      <View style={styles.barHeader}>
        <Text style={styles.barLabel} numberOfLines={1}>
          {row.label || "—"}
        </Text>
        <Text style={styles.barValue}>{row.value.toLocaleString()}</Text>
      </View>
      <View style={styles.barTrack}>
        <View style={[styles.barFill, { width: `${pct}%` }]} />
      </View>
    </View>
  );
}

export default function ReportsScreen() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [groupBy, setGroupBy] = useState<string | null>(null);
  const [measure, setMeasure] = useState<string>("count");
  const [rows, setRows] = useState<ReportRow[] | null>(null);
  const [running, setRunning] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get<Catalog>("/dashboard/report/catalog");
        setCatalog(data);
        const first = Object.keys(data)[0];
        if (first) {
          setSource(first);
          setGroupBy(data[first].dimensions[0] ?? null);
        }
      } catch (e) {
        setError(e instanceof ApiError ? String(e.message) : "Failed to load report catalog.");
      }
    })();
  }, []);

  const run = useCallback(async () => {
    if (!source || !groupBy) return;
    setRunning(true);
    setError(null);
    try {
      const res = await api.get<any>("/dashboard/report", { source, group_by: groupBy, measure });
      const raw = Array.isArray(res) ? res : res?.rows ?? res?.data ?? [];
      setRows(
        raw.map((r: any) => ({
          label: String(r.label ?? r.group ?? r[groupBy] ?? ""),
          value: Number(r.value ?? r.measure ?? r.count ?? 0),
        }))
      );
    } catch (e) {
      setError(e instanceof ApiError ? String(e.message) : "Could not run this report.");
    } finally {
      setRunning(false);
    }
  }, [source, groupBy, measure]);

  useEffect(() => {
    if (source && groupBy) run();
  }, [source, groupBy, measure, run]);

  if (error && !catalog) return <ErrorView message={error} />;
  if (!catalog) return <LoadingView />;

  const entry = source ? catalog[source] : null;
  const max = rows?.length ? Math.max(...rows.map((r) => r.value)) : 0;

  function Chips({
    items,
    active,
    onPick,
    labelFor,
  }: {
    items: string[];
    active: string | null;
    onPick: (v: string) => void;
    labelFor?: (v: string) => string;
  }) {
    return (
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
        {items.map((it) => {
          const on = it === active;
          return (
            <Pressable key={it} onPress={() => onPick(it)} style={[styles.chip, on && styles.chipActive]}>
              <Text style={[styles.chipText, on && styles.chipTextActive]}>{labelFor ? labelFor(it) : humanize(it)}</Text>
            </Pressable>
          );
        })}
      </ScrollView>
    );
  }

  return (
    <FlatList
      style={styles.screen}
      data={rows ?? []}
      keyExtractor={(_, i) => String(i)}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View>
          <SectionLabel>Source</SectionLabel>
          <Chips
            items={Object.keys(catalog)}
            active={source}
            labelFor={(s) => catalog[s].label}
            onPick={(s) => {
              setSource(s);
              setGroupBy(catalog[s].dimensions[0] ?? null);
              setMeasure("count");
              setRows(null);
            }}
          />

          {entry && (
            <>
              <SectionLabel>Group by</SectionLabel>
              <Chips items={entry.dimensions} active={groupBy} onPick={setGroupBy} />

              <SectionLabel>Measure</SectionLabel>
              <Chips
                items={Object.keys(entry.measures)}
                active={measure}
                labelFor={(m) => entry.measures[m] || humanize(m)}
                onPick={setMeasure}
              />
            </>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}
          <SectionLabel>{running ? "Running…" : "Result"}</SectionLabel>
        </View>
      }
      ListEmptyComponent={running ? <LoadingView /> : <EmptyView message="No data for this combination." />}
      renderItem={({ item }) => (
        <Card style={{ marginBottom: spacing(2) }}>
          <BarRow row={item} max={max} />
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing(4) },
  chipRow: { paddingVertical: spacing(2), gap: spacing(2) },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(2),
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...type.label, color: colors.text },
  chipTextActive: { color: colors.onPrimary },
  barRow: { gap: spacing(2) },
  barHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  barLabel: { ...type.body, color: colors.text, flex: 1, marginRight: spacing(2) },
  barValue: { ...type.label, color: colors.primary },
  barTrack: { height: 8, backgroundColor: colors.surfaceAlt, borderRadius: radius.pill, overflow: "hidden" },
  barFill: { height: "100%", backgroundColor: colors.primary, borderRadius: radius.pill },
  error: { ...type.body, color: colors.danger, marginTop: spacing(2) },
});
