import React, { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { colors, elevation, radius, spacing, type } from "../theme/theme";
import { AppTextInput } from "./Common";
import { toISODate, todayISO } from "../utils/dates";

export interface Option {
  label: string;
  value: string;
  subtitle?: string;
}

/* ------------------------------------------------------------------ *
 * Shared trigger — looks like AppTextInput so a picker and a text box
 * sit on the same visual line in a form.
 * ------------------------------------------------------------------ */

function PickerTrigger({
  text,
  placeholder,
  onPress,
  disabled,
  onClear,
}: {
  text?: string;
  placeholder: string;
  onPress: () => void;
  disabled?: boolean;
  onClear?: () => void;
}) {
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      style={({ pressed }) => [
        styles.trigger,
        pressed && !disabled && styles.triggerPressed,
        disabled && styles.triggerDisabled,
      ]}
    >
      <Text style={[styles.triggerText, !text && styles.triggerPlaceholder]} numberOfLines={1}>
        {text || placeholder}
      </Text>
      {text && onClear && !disabled ? (
        <Pressable onPress={onClear} hitSlop={10} style={styles.clearButton}>
          <Text style={styles.clearText}>×</Text>
        </Pressable>
      ) : (
        <Text style={styles.chevron}>⌄</Text>
      )}
    </Pressable>
  );
}

function Sheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Stop presses inside the sheet from closing it. */}
        <Pressable style={styles.sheet} onPress={() => {}}>
          <View style={styles.sheetHeader}>
            <Text style={styles.sheetTitle}>{title}</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={styles.sheetClose}>Done</Text>
            </Pressable>
          </View>
          {children}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

/* ------------------------------------------------------------------ *
 * Option picker — a real dropdown, with search once the list is long.
 * ------------------------------------------------------------------ */

export function OptionPicker({
  options,
  value,
  onChange,
  placeholder = "Select...",
  label,
  disabled,
  loading,
  error,
  required,
}: {
  options: Option[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  label: string;
  disabled?: boolean;
  loading?: boolean;
  error?: string | null;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const selected = options.find((o) => o.value === value);
  const searchable = options.length > 8;

  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter(
      (o) => o.label.toLowerCase().includes(q) || (o.subtitle || "").toLowerCase().includes(q)
    );
  }, [options, query]);

  // A value that no longer resolves (stale id, or options still loading) should
  // still be visible rather than silently reading as empty.
  const triggerText = selected?.label ?? (value ? (loading ? "Loading..." : `#${value}`) : undefined);

  return (
    <>
      <PickerTrigger
        text={triggerText}
        placeholder={loading ? "Loading..." : placeholder}
        onPress={() => {
          setQuery("");
          setOpen(true);
        }}
        disabled={disabled || loading}
        onClear={required ? undefined : () => onChange("")}
      />
      {error ? <Text style={styles.fieldError}>{error}</Text> : null}

      <Sheet visible={open} title={label} onClose={() => setOpen(false)}>
        {searchable ? (
          <AppTextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search..."
            style={styles.search}
            autoCorrect={false}
          />
        ) : null}

        {filtered.length === 0 ? (
          <Text style={styles.emptyText}>
            {options.length === 0 ? "Nothing to choose from yet." : "No matches."}
          </Text>
        ) : (
          <FlatList
            data={filtered}
            keyExtractor={(o) => o.value}
            keyboardShouldPersistTaps="handled"
            style={styles.list}
            renderItem={({ item }) => {
              const active = item.value === value;
              return (
                <Pressable
                  onPress={() => {
                    onChange(item.value);
                    setOpen(false);
                  }}
                  style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
                >
                  <View style={styles.optionTextWrap}>
                    <Text style={[styles.optionLabel, active && styles.optionLabelActive]} numberOfLines={1}>
                      {item.label}
                    </Text>
                    {item.subtitle ? (
                      <Text style={styles.optionSubtitle} numberOfLines={1}>
                        {item.subtitle}
                      </Text>
                    ) : null}
                  </View>
                  {active ? <Text style={styles.check}>✓</Text> : null}
                </Pressable>
              );
            }}
          />
        )}
      </Sheet>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Date picker — month grid, no native dependency.
 * ------------------------------------------------------------------ */

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];
const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

function formatDisplay(iso: string): string {
  const parsed = toISODate(iso);
  if (!parsed) return "";
  const [y, m, d] = parsed.split("-").map(Number);
  return `${d} ${MONTHS[m - 1]?.slice(0, 3) ?? m} ${y}`;
}

function pad(n: number) {
  return String(n).padStart(2, "0");
}

export function DatePicker({
  value,
  onChange,
  label,
  disabled,
  required,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  disabled?: boolean;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const iso = toISODate(value);

  // The grid opens on the selected month, or the current one when unset.
  const initial = iso ? new Date(iso + "T00:00:00") : new Date();
  const [viewYear, setViewYear] = useState(initial.getFullYear());
  const [viewMonth, setViewMonth] = useState(initial.getMonth());

  useEffect(() => {
    if (!open) return;
    const base = iso ? new Date(iso + "T00:00:00") : new Date();
    setViewYear(base.getFullYear());
    setViewMonth(base.getMonth());
  }, [open]);

  const cells = useMemo(() => {
    const firstWeekday = new Date(viewYear, viewMonth, 1).getDay();
    const daysInMonth = new Date(viewYear, viewMonth + 1, 0).getDate();
    const out: (number | null)[] = Array(firstWeekday).fill(null);
    for (let d = 1; d <= daysInMonth; d++) out.push(d);
    return out;
  }, [viewYear, viewMonth]);

  const today = todayISO();

  function step(delta: number) {
    const m = viewMonth + delta;
    if (m < 0) {
      setViewMonth(11);
      setViewYear(viewYear - 1);
    } else if (m > 11) {
      setViewMonth(0);
      setViewYear(viewYear + 1);
    } else {
      setViewMonth(m);
    }
  }

  return (
    <>
      <PickerTrigger
        text={formatDisplay(iso)}
        placeholder="Select date..."
        onPress={() => setOpen(true)}
        disabled={disabled}
        onClear={required ? undefined : () => onChange("")}
      />

      <Sheet visible={open} title={label} onClose={() => setOpen(false)}>
        <View style={styles.calHeader}>
          <Pressable onPress={() => step(-1)} hitSlop={12} style={styles.calNav}>
            <Text style={styles.calNavText}>‹</Text>
          </Pressable>
          <Text style={styles.calMonth}>
            {MONTHS[viewMonth]} {viewYear}
          </Text>
          <Pressable onPress={() => step(1)} hitSlop={12} style={styles.calNav}>
            <Text style={styles.calNavText}>›</Text>
          </Pressable>
        </View>

        <View style={styles.weekRow}>
          {WEEKDAYS.map((d, i) => (
            <Text key={i} style={styles.weekday}>
              {d}
            </Text>
          ))}
        </View>

        <View style={styles.grid}>
          {cells.map((day, i) => {
            if (day === null) return <View key={`b${i}`} style={styles.cell} />;
            const cellISO = `${viewYear}-${pad(viewMonth + 1)}-${pad(day)}`;
            const selected = cellISO === iso;
            const isToday = cellISO === today;
            return (
              <Pressable
                key={cellISO}
                style={styles.cell}
                onPress={() => {
                  onChange(cellISO);
                  setOpen(false);
                }}
              >
                <View style={[styles.day, selected && styles.daySelected, !selected && isToday && styles.dayToday]}>
                  <Text style={[styles.dayText, selected && styles.dayTextSelected]}>{day}</Text>
                </View>
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={() => {
            onChange(today);
            setOpen(false);
          }}
          style={styles.todayButton}
        >
          <Text style={styles.todayText}>Today</Text>
        </Pressable>
      </Sheet>
    </>
  );
}

/* ------------------------------------------------------------------ *
 * Time picker — hour/minute wheels, 5-minute granularity.
 * ------------------------------------------------------------------ */

function toHM(raw: string): { h: number; m: number } | null {
  const match = (raw || "").match(/^(\d{1,2}):(\d{2})/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return { h, m };
}

export function TimePicker({
  value,
  onChange,
  label,
  disabled,
  required,
}: {
  value: string;
  onChange: (v: string) => void;
  label: string;
  disabled?: boolean;
  required?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const current = toHM(value);

  const display = current
    ? `${((current.h + 11) % 12) + 1}:${pad(current.m)} ${current.h < 12 ? "AM" : "PM"}`
    : "";

  const hours = Array.from({ length: 24 }, (_, i) => i);
  const minutes = Array.from({ length: 12 }, (_, i) => i * 5);

  function set(h: number, m: number) {
    onChange(`${pad(h)}:${pad(m)}`);
  }

  return (
    <>
      <PickerTrigger
        text={display}
        placeholder="Select time..."
        onPress={() => setOpen(true)}
        disabled={disabled}
        onClear={required ? undefined : () => onChange("")}
      />

      <Sheet visible={open} title={label} onClose={() => setOpen(false)}>
        <View style={styles.timeRow}>
          <View style={styles.timeCol}>
            <Text style={styles.timeColLabel}>Hour</Text>
            <FlatList
              data={hours}
              keyExtractor={(h) => String(h)}
              style={styles.timeList}
              renderItem={({ item }) => {
                const active = current?.h === item;
                return (
                  <Pressable onPress={() => set(item, current?.m ?? 0)} style={[styles.timeCell, active && styles.timeCellActive]}>
                    <Text style={[styles.timeCellText, active && styles.timeCellTextActive]}>
                      {pad(item)}
                    </Text>
                  </Pressable>
                );
              }}
            />
          </View>
          <View style={styles.timeCol}>
            <Text style={styles.timeColLabel}>Minute</Text>
            <FlatList
              data={minutes}
              keyExtractor={(m) => String(m)}
              style={styles.timeList}
              renderItem={({ item }) => {
                const active = current?.m === item;
                return (
                  <Pressable onPress={() => set(current?.h ?? 0, item)} style={[styles.timeCell, active && styles.timeCellActive]}>
                    <Text style={[styles.timeCellText, active && styles.timeCellTextActive]}>
                      {pad(item)}
                    </Text>
                  </Pressable>
                );
              }}
            />
          </View>
        </View>
      </Sheet>
    </>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing(3.5),
    paddingVertical: spacing(3),
    backgroundColor: colors.surface,
    minHeight: 46,
  },
  triggerPressed: { borderColor: colors.primary },
  triggerDisabled: { backgroundColor: colors.surfaceAlt, opacity: 0.7 },
  triggerText: { flex: 1, fontSize: 15, color: colors.text },
  triggerPlaceholder: { color: colors.textFaint },
  chevron: { color: colors.textFaint, fontSize: 16, marginTop: -6 },
  clearButton: { paddingHorizontal: spacing(1) },
  clearText: { color: colors.textFaint, fontSize: 20, lineHeight: 22 },
  fieldError: { ...type.caption, color: colors.danger, marginTop: spacing(1) },

  backdrop: {
    flex: 1,
    backgroundColor: "rgba(20,21,43,0.45)",
    justifyContent: "flex-end",
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing(4),
    paddingTop: spacing(4),
    paddingBottom: spacing(6),
    maxHeight: "80%",
    ...elevation.lg,
  },
  sheetHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing(3),
  },
  sheetTitle: { ...type.heading, color: colors.text, flex: 1 },
  sheetClose: { ...type.label, color: colors.primary },

  search: { marginBottom: spacing(2) },
  list: { flexGrow: 0 },
  emptyText: { ...type.body, color: colors.textMuted, paddingVertical: spacing(6), textAlign: "center" },
  option: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(2),
    borderRadius: radius.md,
  },
  optionPressed: { backgroundColor: colors.surfaceAlt },
  optionTextWrap: { flex: 1 },
  optionLabel: { ...type.body, color: colors.text },
  optionLabelActive: { color: colors.primary, fontWeight: "700" },
  optionSubtitle: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  check: { color: colors.primary, fontSize: 16, fontWeight: "800" },

  calHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: spacing(2),
  },
  calNav: {
    width: 36,
    height: 36,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surfaceAlt,
  },
  calNavText: { fontSize: 20, color: colors.text, marginTop: -2 },
  calMonth: { ...type.heading, color: colors.text },
  weekRow: { flexDirection: "row", marginBottom: spacing(1) },
  weekday: { ...type.caption, color: colors.textFaint, width: `${100 / 7}%`, textAlign: "center" },
  grid: { flexDirection: "row", flexWrap: "wrap" },
  cell: { width: `${100 / 7}%`, aspectRatio: 1, alignItems: "center", justifyContent: "center" },
  day: { width: 38, height: 38, borderRadius: 19, alignItems: "center", justifyContent: "center" },
  daySelected: { backgroundColor: colors.primary },
  dayToday: { borderWidth: 1, borderColor: colors.primaryBorder },
  dayText: { ...type.body, color: colors.text },
  dayTextSelected: { color: colors.onPrimary, fontWeight: "700" },
  todayButton: { alignSelf: "center", marginTop: spacing(3), paddingVertical: spacing(2), paddingHorizontal: spacing(5) },
  todayText: { ...type.label, color: colors.primary },

  timeRow: { flexDirection: "row", gap: spacing(4) },
  timeCol: { flex: 1 },
  timeColLabel: { ...type.caption, color: colors.textFaint, textAlign: "center", marginBottom: spacing(1) },
  timeList: { maxHeight: 240 },
  timeCell: { paddingVertical: spacing(2.5), alignItems: "center", borderRadius: radius.sm },
  timeCellActive: { backgroundColor: colors.primary },
  timeCellText: { ...type.body, color: colors.text },
  timeCellTextActive: { color: colors.onPrimary, fontWeight: "700" },
});
