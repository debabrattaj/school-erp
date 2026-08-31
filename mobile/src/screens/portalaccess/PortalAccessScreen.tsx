import React, { useCallback, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, View } from "react-native";
import { showAlert } from "../../utils/alert";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../api/client";
import {
  AppTextInput,
  Badge,
  Card,
  EmptyView,
  ErrorView,
  LoadingView,
  PrimaryButton,
  SecondaryButton,
  SectionLabel,
} from "../../components/Common";
import RecordPicker, { PickerButton } from "../../components/RecordPicker";
import { colors, radius, spacing, type } from "../../theme/theme";

interface PortalLink {
  id: number;
  user_id: number;
  student_id: number;
  relationship?: string;
  user_name?: string;
  user_email?: string;
  user_role?: string;
  student_name?: string;
  admission_no?: string;
}

interface User {
  id: number;
  name?: string;
  email?: string;
  role?: string;
}

interface Student {
  id: number;
  first_name?: string;
  last_name?: string;
  admission_no?: string;
  class_name?: string;
}

function studentLabel(s: Student) {
  return [s.first_name, s.last_name].filter(Boolean).join(" ") || `Student #${s.id}`;
}

export default function PortalAccessScreen() {
  const [links, setLinks] = useState<PortalLink[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [pick, setPick] = useState<"user" | "student" | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [student, setStudent] = useState<Student | null>(null);
  const [relationship, setRelationship] = useState("");
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setLinks(await api.get<PortalLink[]>("/portal/links"));
    } catch (e) {
      setError(e instanceof ApiError ? String(e.message) : "Failed to load portal links.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function resetForm() {
    setUser(null);
    setStudent(null);
    setRelationship("");
    setAdding(false);
  }

  async function createLink() {
    if (!user || !student) return;
    setSaving(true);
    try {
      await api.post("/portal/links", {
        user_id: user.id,
        student_id: student.id,
        relationship: relationship.trim() || undefined,
      });
      resetForm();
      await load();
    } catch (e) {
      showAlert(
        "Could not link",
        e instanceof ApiError && typeof e.detail === "string"
          ? e.detail
          : "The server refused the request. Links only work for Parent or Student accounts."
      );
    } finally {
      setSaving(false);
    }
  }

  function removeLink(link: PortalLink) {
    showAlert(
      "Remove access?",
      `${link.user_name || "This account"} will no longer see ${link.student_name || "this student"}.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            try {
              await api.delete(`/portal/links/${link.id}`);
              await load();
            } catch (e) {
              showAlert("Error", e instanceof ApiError ? String(e.message) : "Could not remove the link.");
            }
          },
        },
      ]
    );
  }

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (!links) return <LoadingView />;

  return (
    <View style={styles.screen}>
      <FlatList
        data={links}
        keyExtractor={(l) => String(l.id)}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            {adding ? (
              <Card>
                <SectionLabel>Parent or student account</SectionLabel>
                <PickerButton
                  label="Account"
                  value={user ? `${user.name || user.email} · ${user.role}` : null}
                  onPress={() => setPick("user")}
                />

                <SectionLabel>Student record</SectionLabel>
                <PickerButton
                  label="Student"
                  value={
                    student
                      ? `${studentLabel(student)}${student.admission_no ? ` · ${student.admission_no}` : ""}`
                      : null
                  }
                  onPress={() => setPick("student")}
                />

                <SectionLabel>Relationship (optional)</SectionLabel>
                <AppTextInput
                  value={relationship}
                  onChangeText={setRelationship}
                  placeholder="e.g. Father, Mother, Guardian"
                />

                <PrimaryButton
                  title="Grant access"
                  onPress={createLink}
                  loading={saving}
                  disabled={!user || !student}
                  style={{ marginTop: spacing(4) }}
                />
                <SecondaryButton title="Cancel" onPress={resetForm} style={{ marginTop: spacing(2) }} />
              </Card>
            ) : (
              <PrimaryButton title="+ Link an account to a student" onPress={() => setAdding(true)} />
            )}

            <SectionLabel>{`${links.length} link${links.length === 1 ? "" : "s"}`}</SectionLabel>
          </View>
        }
        ListEmptyComponent={
          <EmptyView message="No parent or student accounts are linked yet." />
        }
        renderItem={({ item }) => (
          <Card style={{ marginBottom: spacing(2.5) }}>
            <View style={styles.rowHeader}>
              <Text style={styles.account}>{item.user_name || item.user_email || `User #${item.user_id}`}</Text>
              {item.user_role ? <Badge text={item.user_role} /> : null}
            </View>
            {item.user_email ? <Text style={styles.detail}>{item.user_email}</Text> : null}
            <Text style={styles.detail}>
              Sees {item.student_name || `student #${item.student_id}`}
              {item.admission_no ? ` (${item.admission_no})` : ""}
              {item.relationship ? ` — ${item.relationship}` : ""}
            </Text>
            <Pressable onPress={() => removeLink(item)} style={styles.removeButton}>
              <Text style={styles.removeText}>Remove access</Text>
            </Pressable>
          </Card>
        )}
      />

      <RecordPicker<User>
        visible={pick === "user"}
        onClose={() => setPick(null)}
        title="Choose account"
        endpoint="/users"
        labelFor={(u) => u.name || u.email || `User #${u.id}`}
        subtitleFor={(u) => [u.email, u.role].filter(Boolean).join(" · ")}
        searchFields={["name", "email", "role"]}
        onPick={setUser}
      />

      <RecordPicker<Student>
        visible={pick === "student"}
        onClose={() => setPick(null)}
        title="Choose student"
        endpoint="/students"
        labelFor={studentLabel}
        subtitleFor={(s) => [s.admission_no, s.class_name && `Class ${s.class_name}`].filter(Boolean).join(" · ")}
        searchFields={["first_name", "last_name", "admission_no"]}
        onPick={setStudent}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing(4) },
  rowHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: spacing(2) },
  account: { ...type.heading, color: colors.text, flex: 1 },
  detail: { ...type.caption, color: colors.textMuted, marginTop: spacing(1) },
  removeButton: {
    marginTop: spacing(3),
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: colors.danger,
    borderRadius: radius.pill,
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(2),
  },
  removeText: { ...type.caption, color: colors.danger, fontWeight: "700" },
});
