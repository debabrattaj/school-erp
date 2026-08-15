import React, { useEffect, useMemo, useState } from "react";
import { Pressable, SectionList, StyleSheet, Text, View } from "react-native";
import { api, ApiError } from "../../api/client";
import { AppTextInput, EmptyView, LoadingView, Tile } from "../../components/Common";
import { colors, radius, spacing, type } from "../../theme/theme";

interface SearchResult {
  group: string;
  id: number;
  label: string;
  subtitle?: string;
  path?: string;
}

/**
 * The backend returns web routes (`/students/3`). Map the group onto the
 * drawer route + module stack screens this app uses instead.
 */
const GROUP_ROUTES: Record<string, { drawer: string; detail: string }> = {
  Students: { drawer: "students", detail: "studentsDetail" },
  Teachers: { drawer: "teachers", detail: "teachersDetail" },
  Classes: { drawer: "classes", detail: "classesDetail" },
  Exams: { drawer: "exams", detail: "examsDetail" },
};

const MONOGRAM: Record<string, string> = { Students: "St", Teachers: "Te", Classes: "Cl", Exams: "Ex" };

export default function SearchScreen({ navigation }: { navigation: any }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // The endpoint ignores anything shorter than 2 characters, so don't spend a
  // request on it. Debounced so typing doesn't fire one per keystroke.
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api.get<{ results: SearchResult[] }>("/search", { q });
        if (!cancelled) {
          setResults(res.results || []);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof ApiError ? String(e.message) : "Search failed.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 300);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const sections = useMemo(() => {
    const byGroup = new Map<string, SearchResult[]>();
    for (const r of results || []) {
      if (!byGroup.has(r.group)) byGroup.set(r.group, []);
      byGroup.get(r.group)!.push(r);
    }
    return Array.from(byGroup, ([title, data]) => ({ title, data }));
  }, [results]);

  function open(result: SearchResult) {
    const route = GROUP_ROUTES[result.group];
    if (!route) return;
    navigation.navigate(route.drawer, { screen: route.detail, params: { id: result.id } });
  }

  return (
    <View style={styles.screen}>
      <View style={styles.searchWrap}>
        <AppTextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search students, teachers, classes, exams…"
          autoFocus
          autoCorrect={false}
        />
      </View>

      {error ? (
        <EmptyView message={error} />
      ) : query.trim().length < 2 ? (
        <EmptyView message="Type at least two characters to search." />
      ) : loading && !results ? (
        <LoadingView />
      ) : sections.length === 0 ? (
        <EmptyView message={`Nothing found for “${query.trim()}”.`} />
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(item) => `${item.group}-${item.id}`}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: spacing(4) }}
          renderSectionHeader={({ section }) => <Text style={styles.sectionHeader}>{section.title}</Text>}
          renderItem={({ item }) => (
            <Pressable style={styles.row} onPress={() => open(item)}>
              <Tile label={MONOGRAM[item.group] || item.group.slice(0, 2)} size={36} />
              <View style={styles.rowText}>
                <Text style={styles.rowTitle}>{item.label}</Text>
                {item.subtitle ? <Text style={styles.rowSubtitle}>{item.subtitle}</Text> : null}
              </View>
              <Text style={styles.chevron}>›</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  searchWrap: { padding: spacing(4), paddingBottom: 0 },
  sectionHeader: {
    ...type.overline,
    color: colors.primary,
    marginTop: spacing(4),
    marginBottom: spacing(2),
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(3),
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    padding: spacing(3.5),
    marginBottom: spacing(2),
    borderWidth: 1,
    borderColor: colors.border,
  },
  rowText: { flex: 1 },
  rowTitle: { ...type.body, color: colors.text, fontWeight: "600" },
  rowSubtitle: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  chevron: { fontSize: 22, color: colors.textMuted },
});
