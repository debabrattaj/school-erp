import React, { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, spacing, type } from "../../theme/theme";
import SendTab from "./SendTab";
import LogTab from "./LogTab";

const TABS = ["Send", "Log"] as const;
type Tab = (typeof TABS)[number];

export default function CommunicationsScreen() {
  const [tab, setTab] = useState<Tab>("Send");

  return (
    <View style={styles.container}>
      <View style={styles.tabBarWrap}>
        <View style={styles.tabBar}>
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
        </View>
      </View>

      <View style={{ flex: 1 }}>
        {tab === "Send" && <SendTab />}
        {tab === "Log" && <LogTab />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.background },
  tabBarWrap: { backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  tabBar: { flexDirection: "row", paddingHorizontal: spacing(2) },
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
