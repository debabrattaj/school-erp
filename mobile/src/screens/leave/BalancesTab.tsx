import React, { useCallback, useEffect, useState } from "react";
import { FlatList, Text, View, StyleSheet } from "react-native";
import { api, ApiError } from "../../api/client";
import { Card, Centered, EmptyView, ErrorView, LoadingView, Row } from "../../components/Common";
import RecordPicker, { PickerButton } from "../../components/RecordPicker";
import { colors, spacing, type } from "../../theme/theme";

interface Teacher {
  id: number;
  name: string;
  employee_no?: string;
  department?: string;
}

interface Balance {
  leave_type_id: number;
  leave_type: string;
  entitled_days: number;
  used_days: number;
  remaining_days: number;
  is_paid: boolean;
}

export default function BalancesTab() {
  const [teacher, setTeacher] = useState<Teacher | null>(null);
  const [picking, setPicking] = useState(false);
  const [balances, setBalances] = useState<Balance[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!teacher) return;
    setError(null);
    setBalances(null);
    try {
      setBalances(await api.get<Balance[]>("/leave/balances", { teacher_id: teacher.id }));
    } catch (e) {
      setError(e instanceof ApiError ? String(e.message) : "Failed to load leave balances.");
    }
  }, [teacher]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <View style={{ flex: 1, padding: spacing(4) }}>
      <PickerButton
        label="Teacher"
        value={teacher ? `${teacher.name}${teacher.employee_no ? ` · ${teacher.employee_no}` : ""}` : null}
        onPress={() => setPicking(true)}
      />

      {!teacher ? (
        <Centered>
          <Text style={styles.hint}>Choose a teacher to see their leave balances.</Text>
        </Centered>
      ) : error ? (
        <ErrorView message={error} onRetry={load} />
      ) : !balances ? (
        <LoadingView />
      ) : (
        <FlatList
          data={balances}
          keyExtractor={(b) => String(b.leave_type_id)}
          contentContainerStyle={{ paddingTop: spacing(4) }}
          ListEmptyComponent={<EmptyView message="No active leave types configured." />}
          renderItem={({ item }) => (
            <Card style={{ marginBottom: spacing(2.5) }}>
              <Row style={{ justifyContent: "space-between" }}>
                <Text style={styles.name}>{item.leave_type}</Text>
                <Text style={styles.remaining}>{item.remaining_days} left</Text>
              </Row>
              <Text style={styles.meta}>
                {item.entitled_days} entitled · {item.used_days} used · {item.is_paid ? "Paid" : "Unpaid"}
              </Text>
            </Card>
          )}
        />
      )}

      <RecordPicker<Teacher>
        visible={picking}
        onClose={() => setPicking(false)}
        title="Choose teacher"
        endpoint="/teachers"
        labelFor={(t) => t.name}
        subtitleFor={(t) => [t.employee_no, t.department].filter(Boolean).join(" · ")}
        searchFields={["name", "employee_no", "department"]}
        onPick={setTeacher}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  hint: { ...type.body, color: colors.textMuted, textAlign: "center" },
  name: { ...type.heading, color: colors.text },
  remaining: { ...type.heading, color: colors.primary },
  meta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
});
