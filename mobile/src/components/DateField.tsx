import React, { useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import DateTimePicker, { DateTimePickerEvent } from "@react-native-community/datetimepicker";
import { colors, radius, spacing, type } from "../theme/theme";

/**
 * The API stores dates as plain `YYYY-MM-DD` strings, so parse and format
 * without timezone conversion — `new Date("2026-03-01")` is parsed as UTC and
 * can render as the previous day west of Greenwich.
 */
function parseIso(value?: string): Date | null {
  if (!value) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!m) return null;
  const [, y, mo, d] = m;
  const date = new Date(Number(y), Number(mo) - 1, Number(d));
  return Number.isNaN(date.getTime()) ? null : date;
}

function toIso(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function formatForDisplay(value?: string) {
  const date = parseIso(value);
  if (!date) return null;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

/** Time columns are plain `HH:MM` strings, handled the same way as dates. */
function parseTime(value?: string): Date | null {
  if (!value) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(value.trim());
  if (!m) return null;
  const date = new Date();
  date.setHours(Number(m[1]), Number(m[2]), 0, 0);
  return date;
}

function toTime(date: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatTimeForDisplay(value?: string) {
  const date = parseTime(value);
  if (!date) return null;
  return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function DateField({
  value,
  onChange,
  mode = "date",
  placeholder,
}: {
  value?: string;
  onChange: (value: string) => void;
  mode?: "date" | "time";
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const isTime = mode === "time";
  const selected = (isTime ? parseTime(value) : parseIso(value)) ?? new Date();
  const display = isTime ? formatTimeForDisplay(value) : formatForDisplay(value);
  const hint = placeholder ?? (isTime ? "Choose a time" : "Choose a date");

  function handleChange(event: DateTimePickerEvent, picked?: Date) {
    // Android fires once and dismisses itself; iOS keeps the spinner mounted
    // until the user is done, so it closes on "Done" below instead.
    if (Platform.OS === "android") setOpen(false);
    if (event.type === "dismissed" || !picked) return;
    onChange(isTime ? toTime(picked) : toIso(picked));
  }

  return (
    <View>
      <Pressable onPress={() => setOpen(true)} style={styles.control}>
        <Text style={[styles.value, !display && styles.placeholder]}>{display || hint}</Text>
        {value ? (
          <Pressable
            hitSlop={10}
            onPress={(e) => {
              e.stopPropagation();
              onChange("");
            }}
          >
            <Text style={styles.clear}>Clear</Text>
          </Pressable>
        ) : null}
      </Pressable>

      {open && (
        <>
          <DateTimePicker
            value={selected}
            mode={mode}
            display={Platform.OS === "ios" ? "spinner" : "default"}
            onChange={handleChange}
          />
          {Platform.OS === "ios" && (
            <Pressable onPress={() => setOpen(false)} style={styles.done}>
              <Text style={styles.doneText}>Done</Text>
            </Pressable>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  control: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(3.5),
    backgroundColor: colors.surface,
  },
  value: { ...type.body, color: colors.text },
  placeholder: { color: colors.textFaint },
  clear: { ...type.caption, color: colors.primary, fontWeight: "700" },
  done: {
    alignSelf: "flex-end",
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(2),
  },
  doneText: { ...type.label, color: colors.primary },
});
