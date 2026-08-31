import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, spacing, type } from "../../theme/theme";
import RequestsTab from "./RequestsTab";
import StudentRequestsTab from "./StudentRequestsTab";
import BalancesTab from "./BalancesTab";
import TypesTab from "./TypesTab";
import CoverTab from "./CoverTab";

const TABS = ["Requests", "Student Leave", "Balances", "Types", "Cover"] as const;
type Tab = (typeof TABS)[number];

export default function LeaveScreen() {
  const [tab, setTab] = useState<Tab>("Requests");

  return (
    <View style={styles.container}>
      <View style={styles.tabBarWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBar}>
          {TABS.map((t) => (
            <Pressable key={t} style={[styles.tab, tab === t && styles.tabActive]}
              onPress={() => setTab(t)}
              accessibilityRole="tab"
              accessibilityLabel={t}
              accessibilityState={{ selected: tab === t }}
            >
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <View style={{ flex: 1 }}>
        {tab === "Requests" && <RequestsTab />}
        {tab === "Student Leave" && <StudentRequestsTab />}
        {tab === "Balances" && <BalancesTab />}
        {tab === "Types" && <TypesTab />}
        {tab === "Cover" && <CoverTab />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  tabBarWrap: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  tabBar: { paddingHorizontal: spacing(2) },
  tab: {
    paddingVertical: spacing(3.5),
    paddingHorizontal: spacing(4),
    alignItems: "center",
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  tabActive: { borderBottomColor: colors.primary },
  tabText: { ...type.label, color: colors.textMuted },
  tabTextActive: { color: colors.primary },
});
