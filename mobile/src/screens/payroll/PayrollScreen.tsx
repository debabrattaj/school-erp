import React, { useCallback, useMemo, useState } from "react";
import { Alert, FlatList, Pressable, StyleSheet, Text, View } from "react-native";
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
  SectionLabel,
} from "../../components/Common";
import { colors, radius, spacing, type } from "../../theme/theme";
import { todayISO } from "../../utils/dates";

interface Payslip {
  id: number;
  teacher_id: number;
  teacher_name_snapshot?: string;
  month: number;
  year: number;
  gross_pay: number;
  total_deductions: number;
  net_pay: number;
  status: string;
  payment_date?: string;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export default function PayrollScreen() {
  const now = new Date();
  const [payslips, setPayslips] = useState<Payslip[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(String(now.getFullYear()));
  const [generating, setGenerating] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setPayslips(await api.get<Payslip[]>("/payroll/payslips"));
    } catch (e) {
      setError(e instanceof ApiError ? String(e.message) : "Failed to load payroll.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const visible = useMemo(
    () => (payslips || []).filter((p) => p.month === month && String(p.year) === year),
    [payslips, month, year]
  );

  const totals = useMemo(
    () =>
      visible.reduce(
        (acc, p) => ({
          gross: acc.gross + (p.gross_pay || 0),
          deductions: acc.deductions + (p.total_deductions || 0),
          net: acc.net + (p.net_pay || 0),
        }),
        { gross: 0, deductions: 0, net: 0 }
      ),
    [visible]
  );

  async function generate() {
    const yearNum = Number(year);
    if (!yearNum) {
      Alert.alert("Invalid year", "Enter a four-digit year.");
      return;
    }
    setGenerating(true);
    try {
      await api.post("/payroll/generate", { month, year: yearNum });
      await load();
      Alert.alert("Generated", `Payslips created for ${MONTHS[month - 1]} ${year}.`);
    } catch (e) {
      Alert.alert("Error", e instanceof ApiError ? String(e.message) : "Could not generate payroll.");
    } finally {
      setGenerating(false);
    }
  }

  function markPaid(slip: Payslip) {
    Alert.alert("Mark as paid?", `${slip.teacher_name_snapshot || "Teacher"} — net ₹${slip.net_pay}`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Mark paid",
        onPress: async () => {
          try {
            await api.put(`/payroll/payslips/${slip.id}/mark-paid`, {
              payment_date: todayISO(),
            });
            await load();
          } catch (e) {
            Alert.alert("Error", e instanceof ApiError ? String(e.message) : "Could not update payslip.");
          }
        },
      },
    ]);
  }

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (!payslips) return <LoadingView />;

  return (
    <View style={styles.screen}>
      <FlatList
        data={visible}
        keyExtractor={(p) => String(p.id)}
        contentContainerStyle={styles.list}
        ListHeaderComponent={
          <View>
            <SectionLabel>Pay period</SectionLabel>
            <FlatList
              horizontal
              data={MONTHS}
              keyExtractor={(m) => m}
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ paddingVertical: spacing(2) }}
              renderItem={({ item, index }) => {
                const active = index + 1 === month;
                return (
                  <Pressable onPress={() => setMonth(index + 1)} style={[styles.chip, active && styles.chipActive]}>
                    <Text style={[styles.chipText, active && styles.chipTextActive]}>{item.slice(0, 3)}</Text>
                  </Pressable>
                );
              }}
            />
            <AppTextInput
              value={year}
              onChangeText={setYear}
              keyboardType="number-pad"
              maxLength={4}
              placeholder="Year"
              style={{ marginTop: spacing(2) }}
            />
            <PrimaryButton
              title={`Generate payslips for ${MONTHS[month - 1]}`}
              onPress={generate}
              loading={generating}
              style={{ marginTop: spacing(3) }}
            />

            {visible.length > 0 && (
              <Card style={{ marginTop: spacing(4) }}>
                <View style={styles.totalsRow}>
                  <View>
                    <Text style={styles.totalLabel}>Gross</Text>
                    <Text style={styles.totalValue}>₹{totals.gross.toLocaleString()}</Text>
                  </View>
                  <View>
                    <Text style={styles.totalLabel}>Deductions</Text>
                    <Text style={[styles.totalValue, { color: colors.danger }]}>
                      ₹{totals.deductions.toLocaleString()}
                    </Text>
                  </View>
                  <View>
                    <Text style={styles.totalLabel}>Net</Text>
                    <Text style={[styles.totalValue, { color: colors.success }]}>
                      ₹{totals.net.toLocaleString()}
                    </Text>
                  </View>
                </View>
              </Card>
            )}

            <SectionLabel>{`${visible.length} payslip${visible.length === 1 ? "" : "s"}`}</SectionLabel>
          </View>
        }
        ListEmptyComponent={
          <EmptyView message={`No payslips for ${MONTHS[month - 1]} ${year} yet. Generate them above.`} />
        }
        renderItem={({ item }) => (
          <Card style={{ marginBottom: spacing(2.5) }}>
            <View style={styles.slipHeader}>
              <Text style={styles.name}>{item.teacher_name_snapshot || `Teacher #${item.teacher_id}`}</Text>
              <Badge text={item.status} tone={item.status === "Paid" ? "success" : "warning"} />
            </View>
            <Text style={styles.detail}>
              Gross ₹{item.gross_pay} · Deductions ₹{item.total_deductions} · Net ₹{item.net_pay}
            </Text>
            {item.payment_date ? <Text style={styles.detail}>Paid on {item.payment_date}</Text> : null}
            {item.status !== "Paid" && (
              <PrimaryButton title="Mark as paid" onPress={() => markPaid(item)} style={{ marginTop: spacing(3) }} />
            )}
          </Card>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing(4) },
  chip: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(2),
    marginRight: spacing(2),
    backgroundColor: colors.surface,
  },
  chipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: { ...type.label, color: colors.text },
  chipTextActive: { color: colors.onPrimary },
  totalsRow: { flexDirection: "row", justifyContent: "space-between" },
  totalLabel: { ...type.caption, color: colors.textMuted },
  totalValue: { ...type.heading, color: colors.text, marginTop: 2 },
  slipHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: spacing(2) },
  name: { ...type.heading, color: colors.text, flex: 1 },
  detail: { ...type.body, color: colors.textMuted, fontSize: 13 },
});
