import React, { useCallback, useState } from "react";
import { ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../../api/client";
import { Badge, Card, EmptyView, ErrorView, LoadingView, PrimaryButton } from "../../../components/Common";
import { showAlert } from "../../../utils/alert";
import { colors, spacing, type } from "../../../theme/theme";

interface Notice { id: number; message: string; sent_at?: string; acknowledged: boolean; }
interface PaymentReport { id: number; reference: string; amount: number; status: string; }

export default function NoticesTab({ studentId }: { studentId: number }) {
  const [notices, setNotices] = useState<Notice[] | null>(null);
  const [payments, setPayments] = useState<PaymentReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [noticeRows, paymentRows] = await Promise.all([
        api.get<Notice[]>(`/portal/students/${studentId}/notices`),
        api.get<PaymentReport[]>(`/portal/students/${studentId}/payment-reports`),
      ]);
      setNotices(noticeRows);
      setPayments(paymentRows);
    } catch (e) {
      setError(e instanceof ApiError ? String(e.message) : "Failed to load notices.");
    }
  }, [studentId]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  async function acknowledge(notice: Notice) {
    setBusyId(notice.id);
    try {
      await api.post(`/portal/students/${studentId}/notices/${notice.id}/acknowledge`);
      setNotices((current) => current?.map((item) => item.id === notice.id ? { ...item, acknowledged: true } : item) || []);
    } catch (e) {
      showAlert("Could not acknowledge", e instanceof ApiError ? String(e.message) : "Please try again.");
    } finally {
      setBusyId(null);
    }
  }

  if (error && !notices) return <ErrorView message={error} onRetry={load} />;
  if (!notices || !payments) return <LoadingView />;
  if (!notices.length && !payments.length) return <EmptyView message="No family notices or payment reports yet." />;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.heading}>School notices</Text>
      {!notices.length ? <Text style={styles.empty}>No notices yet.</Text> : notices.map((notice) => (
        <Card key={notice.id} style={styles.card}>
          <View style={styles.header}>
            <Badge text={notice.acknowledged ? "Acknowledged" : "New"} tone={notice.acknowledged ? "success" : "warning"} />
            {notice.sent_at ? <Text style={styles.date}>{notice.sent_at}</Text> : null}
          </View>
          <Text style={styles.message}>{notice.message}</Text>
          {!notice.acknowledged ? <PrimaryButton title="Acknowledge" onPress={() => acknowledge(notice)} loading={busyId === notice.id} /> : null}
        </Card>
      ))}

      <Text style={styles.heading}>Payment verification</Text>
      {!payments.length ? <Text style={styles.empty}>No reported UPI payments.</Text> : payments.map((payment) => (
        <Card key={payment.id} style={styles.card}>
          <View style={styles.header}>
            <Text style={styles.reference}>{payment.reference}</Text>
            <Badge text={payment.status} tone={payment.status === "Approved" ? "success" : payment.status === "Rejected" ? "danger" : "warning"} />
          </View>
          <Text style={styles.amount}>₹{payment.amount}</Text>
          <Text style={styles.help}>Your fee balance changes only after the school verifies and approves the reference.</Text>
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing(4), paddingBottom: spacing(10) },
  heading: { ...type.heading, color: colors.text, marginBottom: spacing(3), marginTop: spacing(2) },
  card: { marginBottom: spacing(3), gap: spacing(3) },
  header: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: spacing(3) },
  date: { ...type.caption, color: colors.textMuted, flex: 1, textAlign: "right" },
  message: { ...type.body, color: colors.text },
  reference: { ...type.label, color: colors.text, flex: 1 },
  amount: { ...type.heading, color: colors.text },
  help: { ...type.caption, color: colors.textMuted },
  empty: { ...type.body, color: colors.textMuted, marginBottom: spacing(5) },
});
