import React, { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { Centered } from "../../components/Common";
import { OptionPicker } from "../../components/Pickers";
import { colors, spacing, type } from "../../theme/theme";
import { useClassSubjects } from "./useClassSubjects";
import UnitsTab from "./UnitsTab";
import CoverageTab from "./CoverageTab";
import LessonPlansTab from "./LessonPlansTab";
import BehindTab from "./BehindTab";

const TABS = ["Units", "Coverage", "Lesson Plans", "Behind"] as const;
type Tab = (typeof TABS)[number];

export default function SyllabusScreen() {
  const [tab, setTab] = useState<Tab>("Units");
  const [classSubjectId, setClassSubjectId] = useState("");
  const { options, loading, error } = useClassSubjects();

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

      {tab === "Behind" ? (
        <BehindTab />
      ) : (
        <View style={{ flex: 1 }}>
          <View style={styles.pickerWrap}>
            <OptionPicker
              label="Class subject"
              options={options}
              value={classSubjectId}
              onChange={setClassSubjectId}
              placeholder="Choose a class subject"
              loading={loading}
              error={error}
            />
          </View>

          {!classSubjectId ? (
            <Centered>
              <Text style={styles.hint}>Choose a class subject to see its syllabus.</Text>
            </Centered>
          ) : (
            <>
              {tab === "Units" && <UnitsTab classSubjectId={Number(classSubjectId)} />}
              {tab === "Coverage" && <CoverageTab classSubjectId={Number(classSubjectId)} />}
              {tab === "Lesson Plans" && <LessonPlansTab classSubjectId={Number(classSubjectId)} />}
            </>
          )}
        </View>
      )}
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
  pickerWrap: { padding: spacing(4), paddingBottom: 0 },
  hint: { ...type.body, color: colors.textMuted, textAlign: "center" },
});
