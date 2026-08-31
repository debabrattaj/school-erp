import React, { useState } from "react";
import { ScrollView, StyleSheet, Text } from "react-native";
import { showAlert } from "../../utils/alert";
import { ApiError } from "../../api/client";
import { downloadAndShare } from "../../api/files";
import { Card, PrimaryButton, SecondaryButton, SectionLabel } from "../../components/Common";
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

function studentLabel(s: Student) {
  return [s.first_name, s.last_name].filter(Boolean).join(" ") || `Student #${s.id}`;
}

/** Mirrors backend/app/routes/certificates.py, which hangs these off /students. */
const DOCUMENTS = [
  { key: "bonafide", label: "Bonafide Certificate", hint: "Proof of enrolment" },
  { key: "transfer-certificate", label: "Transfer Certificate", hint: "Issued on leaving" },
  { key: "transcript", label: "Transcript", hint: "Consolidated academic record" },
  { key: "id-card", label: "ID Card", hint: "Printable student ID" },
] as const;

export default function CertificatesScreen() {
  const [student, setStudent] = useState<Student | null>(null);
  const [picking, setPicking] = useState(false);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  async function download(docKey: string, label: string) {
    if (!student) return;
    setBusyKey(docKey);
    try {
      const safe = studentLabel(student).replace(/[^\w]+/g, "-").toLowerCase();
      await downloadAndShare(`/students/${student.id}/${docKey}`, `${docKey}-${safe}.pdf`);
    } catch (e) {
      showAlert(
        `Could not generate ${label}`,
        e instanceof ApiError && typeof e.detail === "string" ? e.detail : "The server refused the request."
      );
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <SectionLabel>Student</SectionLabel>
      <PickerButton
        label="Student"
        value={student ? `${studentLabel(student)}${student.admission_no ? ` · ${student.admission_no}` : ""}` : null}
        onPress={() => setPicking(true)}
      />

      <SectionLabel>Documents</SectionLabel>
      {DOCUMENTS.map((doc) => (
        <Card key={doc.key} style={{ marginBottom: spacing(2.5) }}>
          <Text style={styles.docTitle}>{doc.label}</Text>
          <Text style={styles.docHint}>{doc.hint}</Text>
          {student ? (
            <PrimaryButton
              title="Generate PDF"
              onPress={() => download(doc.key, doc.label)}
              loading={busyKey === doc.key}
              style={{ marginTop: spacing(3) }}
            />
          ) : (
            <SecondaryButton
              title="Choose a student first"
              onPress={() => setPicking(true)}
              style={{ marginTop: spacing(3) }}
            />
          )}
        </Card>
      ))}

      <RecordPicker<Student>
        visible={picking}
        onClose={() => setPicking(false)}
        title="Choose student"
        endpoint="/students"
        labelFor={studentLabel}
        subtitleFor={(s) =>
          [s.admission_no, s.class_name && `Class ${s.class_name}`, s.section].filter(Boolean).join(" · ")
        }
        searchFields={["first_name", "last_name", "admission_no", "class_name"]}
        onPick={setStudent}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  content: { padding: spacing(4), paddingBottom: spacing(10) },
  docTitle: { ...type.heading, color: colors.text },
  docHint: { ...type.caption, color: colors.textMuted, marginTop: 2 },
});
