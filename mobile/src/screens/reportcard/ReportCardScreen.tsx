import React, { useState } from "react";
import { Alert, ScrollView, StyleSheet, Text } from "react-native";
import { ApiError } from "../../api/client";
import { downloadAndShare } from "../../api/files";
import { Card, PrimaryButton, SectionLabel } from "../../components/Common";
import RecordPicker, { PickerButton } from "../../components/RecordPicker";
import { colors, spacing, type } from "../../theme/theme";

interface Student {
  id: number;
  first_name?: string;
  last_name?: string;
  admission_no?: string;
  class_name?: string;
  section?: string;
}

interface Exam {
  id: number;
  exam_name?: string;
  exam_type?: string;
  class_name?: string;
  section?: string;
}

function studentLabel(s: Student) {
  return [s.first_name, s.last_name].filter(Boolean).join(" ") || `Student #${s.id}`;
}

export default function ReportCardScreen() {
  const [student, setStudent] = useState<Student | null>(null);
  const [exam, setExam] = useState<Exam | null>(null);
  const [pick, setPick] = useState<"student" | "exam" | null>(null);
  const [busy, setBusy] = useState(false);

  async function download() {
    if (!student || !exam) return;
    setBusy(true);
    try {
      const safe = studentLabel(student).replace(/[^\w]+/g, "-").toLowerCase();
      await downloadAndShare("/marks/report-card", `report-card-${safe}-${exam.id}.pdf`, {
        student_id: student.id,
        exam_id: exam.id,
      });
    } catch (e) {
      Alert.alert(
        "Could not generate",
        e instanceof ApiError && typeof e.detail === "string"
          ? e.detail
          : "No marks found for this student and exam, or the server refused the request."
      );
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Card>
        <Text style={styles.intro}>
          Pick a student and an exam to generate their report card. The PDF opens in the share
          sheet, so you can save, print or send it.
        </Text>
      </Card>

      <SectionLabel>Student</SectionLabel>
      <PickerButton
        label="Student"
        value={student ? `${studentLabel(student)}${student.admission_no ? ` · ${student.admission_no}` : ""}` : null}
        onPress={() => setPick("student")}
      />

      <SectionLabel>Exam</SectionLabel>
      <PickerButton
        label="Exam"
        value={exam ? `${exam.exam_name}${exam.class_name ? ` · ${exam.class_name}` : ""}` : null}
        onPress={() => setPick("exam")}
      />

      <PrimaryButton
        title="Generate report card"
        onPress={download}
        loading={busy}
        disabled={!student || !exam}
        style={{ marginTop: spacing(6) }}
      />

      <RecordPicker<Student>
        visible={pick === "student"}
        onClose={() => setPick(null)}
        title="Choose student"
        endpoint="/students"
        labelFor={studentLabel}
        subtitleFor={(s) =>
          [s.admission_no, s.class_name && `Class ${s.class_name}`, s.section].filter(Boolean).join(" · ")
        }
        searchFields={["first_name", "last_name", "admission_no", "class_name"]}
        onPick={setStudent}
      />

      <RecordPicker<Exam>
        visible={pick === "exam"}
        onClose={() => setPick(null)}
        title="Choose exam"
        endpoint="/exams"
        labelFor={(e) => e.exam_name || `Exam #${e.id}`}
        subtitleFor={(e) => [e.exam_type, e.class_name, e.section].filter(Boolean).join(" · ")}
        searchFields={["exam_name", "exam_type", "class_name"]}
        onPick={setExam}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing(4), paddingBottom: spacing(10) },
  intro: { ...type.body, color: colors.textMuted },
});
