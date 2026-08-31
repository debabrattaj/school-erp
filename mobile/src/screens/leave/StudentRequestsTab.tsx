import React, { useCallback, useState } from "react";
import { Alert, FlatList, Text, View, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../api/client";
import { Badge, Card, EmptyView, ErrorView, LoadingView, PromptModal, Row, SecondaryButton } from "../../components/Common";
import { colors, spacing, type } from "../../theme/theme";

interface Student {
  id: number;
  first_name: string;
  last_name?: string;
  admission_no?: string;
  class_name?: string;
  section?: string;
}

interface StudentLeaveRequest {
  id: number;
  student_id: number;
  from_date: string;
  to_date: string;
  reason?: string;
  status: string;
  requested_by: string;
  decision_note?: string;
}

const STATUS_FILTERS = ["Requested", "Approved", "Rejected", "All"];

function statusTone(status: string): "default" | "success" | "warning" | "danger" {
  if (status === "Approved") return "success";
  if (status === "Requested") return "warning";
  if (status === "Rejected") return "danger";
  return "default";
}

function studentLabel(s?: Student) {
  if (!s) return null;
  return [s.first_name, s.last_name].filter(Boolean).join(" ");
}

export default function StudentRequestsTab() {
  const [requests, setRequests] = useState<StudentLeaveRequest[] | null>(null);
  const [students, setStudents] = useState<Record<number, Student>>({});
  const [error, setError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState("Requested");

  const [decision, setDecision] = useState<{ request: StudentLeaveRequest; kind: "approve" | "reject" } | null>(null);
  const [deciding, setDeciding] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [reqs, studentList] = await Promise.all([
        api.get<StudentLeaveRequest[]>(
          "/student-leave-requests/",
          statusFilter !== "All" ? { status: statusFilter } : undefined
        ),
        api.get<Student[]>("/students/"),
      ]);
      setRequests(reqs);
      setStudents(Object.fromEntries(studentList.map((s) => [s.id, s])));
    } catch (e) {
      setError(e instanceof ApiError ? String(e.message) : "Failed to load student leave requests.");
    }
  }, [statusFilter]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function runDecision(note: string) {
    if (!decision) return;
    setDeciding(true);
    try {
      const path = `/student-leave-requests/${decision.request.id}/${decision.kind}`;
      await api.post(path, { note: note || undefined });
      setDecision(null);
      await load();
    } catch (e) {
      Alert.alert(
        "Could not update",
        e instanceof ApiError && typeof e.detail === "string" ? e.detail : "The server refused the request."
      );
    } finally {
      setDeciding(false);
    }
  }

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (!requests) return <LoadingView />;

  return (
    <View style={{ flex: 1 }}>
      <FlatList
        data={requests}
        keyExtractor={(r) => String(r.id)}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View style={styles.chipRow}>
            {STATUS_FILTERS.map((s) => (
              <Text
                key={s}
                onPress={() => setStatusFilter(s)}
                style={[styles.filterChip, statusFilter === s && styles.filterChipActive]}
              >
                {s}
              </Text>
            ))}
          </View>
        }
        ListEmptyComponent={<EmptyView message="No student leave requests found." />}
        renderItem={({ item }) => {
          const student = students[item.student_id];
          return (
            <Card style={{ marginBottom: spacing(2.5) }}>
              <Row style={{ justifyContent: "space-between" }}>
                <Text style={styles.name}>{studentLabel(student) || `Student #${item.student_id}`}</Text>
                <Badge text={item.status} tone={statusTone(item.status)} />
              </Row>
              <Text style={styles.meta}>
                {student?.admission_no ? `${student.admission_no} · ` : ""}
                {[student?.class_name, student?.section].filter(Boolean).join(" ")}
              </Text>
              <Text style={styles.meta}>
                {item.from_date} → {item.to_date} · Requested by {item.requested_by}
              </Text>
              {item.reason ? <Text style={styles.reason}>{item.reason}</Text> : null}
              {item.decision_note ? <Text style={styles.decisionNote}>Note: {item.decision_note}</Text> : null}

              {item.status === "Requested" ? (
                <Row style={{ gap: spacing(2), marginTop: spacing(3) }}>
                  <SecondaryButton title="Approve" onPress={() => setDecision({ request: item, kind: "approve" })} style={{ flex: 1 }} />
                  <SecondaryButton title="Reject" onPress={() => setDecision({ request: item, kind: "reject" })} style={{ flex: 1 }} />
                </Row>
              ) : null}
            </Card>
          );
        }}
      />

      <PromptModal
        visible={!!decision}
        title={decision?.kind === "approve" ? "Approve this absence?" : "Reject this request?"}
        message={
          decision?.kind === "approve"
            ? "Marks Attendance Excused for every working day in range."
            : undefined
        }
        confirmLabel={decision?.kind === "approve" ? "Approve" : "Reject"}
        destructive={decision?.kind === "reject"}
        loading={deciding}
        onCancel={() => setDecision(null)}
        onConfirm={runDecision}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing(4) },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: spacing(2), marginBottom: spacing(3) },
  filterChip: {
    ...type.caption,
    color: colors.textMuted,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 999,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1.5),
    overflow: "hidden",
  },
  filterChipActive: { backgroundColor: colors.primary, color: colors.onPrimary },
  name: { ...type.heading, color: colors.text },
  meta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  reason: { ...type.body, color: colors.text, marginTop: spacing(2) },
  decisionNote: { ...type.caption, color: colors.textMuted, marginTop: spacing(1), fontStyle: "italic" },
});
