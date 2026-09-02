import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth } from "../../auth/AuthContext";
import { colors, spacing, type } from "../../theme/theme";
import ProfileTab from "./tabs/ProfileTab";
import AttendanceTab from "./tabs/AttendanceTab";
import MarksTab from "./tabs/MarksTab";
import FeesTab from "./tabs/FeesTab";
import TimetableTab from "./tabs/TimetableTab";
import HomeworkTab from "./tabs/HomeworkTab";
import LearningTab from "./tabs/LearningTab";
import MessagesTab from "./tabs/MessagesTab";
import OnlineTestsTab from "./tabs/OnlineTestsTab";
import LeaveTab from "./tabs/LeaveTab";

const TABS = [
  "Profile",
  "Attendance",
  "Marks",
  "Fees",
  "Timetable",
  "Homework",
  "Learning",
  "Tests",
  "Messages",
  "Leave",
] as const;
type Tab = (typeof TABS)[number];

/**
 * Tabs behind a school feature switch. Online Tests is sold separately, and its
 * portal route answers 403 for a school that has not bought it — which showed
 * the family a "Something went wrong" tab rather than simply not offering it.
 */
const TAB_FEATURE: Partial<Record<Tab, string>> = { Tests: "online_tests", Learning: "lms" };

export default function ChildDetailScreen({ route }: { route: any }) {
  const { id } = route.params;
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("Profile");

  const tabs = useMemo(
    () => TABS.filter((t) => {
      const flag = TAB_FEATURE[t];
      return !flag || user?.features?.[flag] !== false;
    }),
    [user?.features]
  );

  // A tab that has just been switched off must not stay selected.
  const active = tabs.includes(tab) ? tab : tabs[0];

  return (
    <View style={styles.container}>
      {/* Eight tabs no longer fit the width, so the bar scrolls. */}
      <View style={styles.tabBarWrap}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabBar}>
          {tabs.map((t) => (
            <Pressable key={t} style={[styles.tab, active === t && styles.tabActive]}
              onPress={() => setTab(t)}
              accessibilityRole="tab"
              accessibilityLabel={t}
              accessibilityState={{ selected: active === t }}
            >
              <Text style={[styles.tabText, active === t && styles.tabTextActive]}>{t}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      <View style={{ flex: 1 }}>
        {active === "Profile" && <ProfileTab studentId={id} />}
        {active === "Attendance" && <AttendanceTab studentId={id} />}
        {active === "Marks" && <MarksTab studentId={id} />}
        {active === "Fees" && <FeesTab studentId={id} />}
        {active === "Timetable" && <TimetableTab studentId={id} />}
        {active === "Homework" && <HomeworkTab studentId={id} />}
        {active === "Learning" && <LearningTab studentId={id} />}
        {active === "Tests" && <OnlineTestsTab studentId={id} />}
        {active === "Messages" && <MessagesTab studentId={id} />}
        {active === "Leave" && <LeaveTab studentId={id} />}
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
