import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { colors, spacing, type } from "../../theme/theme";
import ProfileTab from "./tabs/ProfileTab";
import AttendanceTab from "./tabs/AttendanceTab";
import MarksTab from "./tabs/MarksTab";
import FeesTab from "./tabs/FeesTab";
import TimetableTab from "./tabs/TimetableTab";
import HomeworkTab from "./tabs/HomeworkTab";
import MessagesTab from "./tabs/MessagesTab";
import OnlineTestsTab from "./tabs/OnlineTestsTab";

const TABS = [
  "Profile",
  "Attendance",
  "Marks",
  "Fees",
  "Timetable",
  "Homework",
  "Tests",
  "Messages",
] as const;
type Tab = (typeof TABS)[number];

export default function ChildDetailScreen({ route }: { route: any }) {
  const { id } = route.params;
  const [tab, setTab] = useState<Tab>("Profile");

  return (
    <View style={styles.container}>
      {/* Eight tabs no longer fit the width, so the bar scrolls. */}
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
        {tab === "Profile" && <ProfileTab studentId={id} />}
        {tab === "Attendance" && <AttendanceTab studentId={id} />}
        {tab === "Marks" && <MarksTab studentId={id} />}
        {tab === "Fees" && <FeesTab studentId={id} />}
        {tab === "Timetable" && <TimetableTab studentId={id} />}
        {tab === "Homework" && <HomeworkTab studentId={id} />}
        {tab === "Tests" && <OnlineTestsTab studentId={id} />}
        {tab === "Messages" && <MessagesTab studentId={id} />}
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
