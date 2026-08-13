import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "../../theme/theme";
import ProfileTab from "./tabs/ProfileTab";
import AttendanceTab from "./tabs/AttendanceTab";
import MarksTab from "./tabs/MarksTab";
import FeesTab from "./tabs/FeesTab";

const TABS = ["Profile", "Attendance", "Marks", "Fees"] as const;
type Tab = (typeof TABS)[number];

export default function ChildDetailScreen({ route }: { route: any }) {
  const { id } = route.params;
  const [tab, setTab] = useState<Tab>("Profile");

  return (
    <View style={styles.container}>
      <View style={styles.tabBar}>
        {TABS.map((t) => (
          <Pressable key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
          </Pressable>
        ))}
      </View>

      <View style={{ flex: 1 }}>
        {tab === "Profile" && <ProfileTab studentId={id} />}
        {tab === "Attendance" && <AttendanceTab studentId={id} />}
        {tab === "Marks" && <MarksTab studentId={id} />}
        {tab === "Fees" && <FeesTab studentId={id} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  tabBar: { flexDirection: "row", backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  tab: { flex: 1, paddingVertical: spacing(3.5), alignItems: "center", borderBottomWidth: 2, borderBottomColor: "transparent" },
  tabActive: { borderBottomColor: colors.primary },
  tabText: { color: colors.textMuted, fontWeight: "600", fontSize: 13 },
  tabTextActive: { color: colors.primary },
});
