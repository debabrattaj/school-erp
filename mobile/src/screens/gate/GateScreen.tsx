import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, spacing, type } from "../../theme/theme";
import OverviewTab from "./OverviewTab";
import VisitorsTab from "./VisitorsTab";
import PassesTab from "./PassesTab";
import BlockedTab from "./BlockedTab";

const TABS = ["Overview", "Visitors", "Passes", "Blocked"] as const;
type Tab = (typeof TABS)[number];

export default function GateScreen() {
  const [tab, setTab] = useState<Tab>("Overview");

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
        {tab === "Overview" && <OverviewTab />}
        {tab === "Visitors" && <VisitorsTab />}
        {tab === "Passes" && <PassesTab />}
        {tab === "Blocked" && <BlockedTab />}
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
