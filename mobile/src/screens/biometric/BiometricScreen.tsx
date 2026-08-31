import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, spacing, type } from "../../theme/theme";
import DevicesTab from "./DevicesTab";
import EnrollmentsTab from "./EnrollmentsTab";
import PunchesTab from "./PunchesTab";
import RulesTab from "./RulesTab";

const TABS = ["Devices", "Enrollments", "Punches", "Rules"] as const;
type Tab = (typeof TABS)[number];

export default function BiometricScreen() {
  const [tab, setTab] = useState<Tab>("Devices");

  return (
    <View style={styles.container}>
      <View style={styles.tabBarWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBar}>
          {TABS.map((t) => (
            <Pressable key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
              <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>{t}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <View style={{ flex: 1 }}>
        {tab === "Devices" && <DevicesTab />}
        {tab === "Enrollments" && <EnrollmentsTab />}
        {tab === "Punches" && <PunchesTab />}
        {tab === "Rules" && <RulesTab />}
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
