import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { DrawerContentComponentProps } from "@react-navigation/drawer";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAuth } from "../auth/AuthContext";
import { Tile } from "../components/Common";
import { colors, radius, spacing, type } from "../theme/theme";

type Entry = { name: string; title: string; icon: string; group: string };

/**
 * Grouped drawer. With 40+ modules a flat list is unusable, so entries are
 * filed under section headings and a filter box narrows them by name.
 */
export default function DrawerContent(props: DrawerContentComponentProps) {
  const { state, navigation } = props;
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState("");

  const entries: Entry[] = useMemo(
    () =>
      state.routes.map((r) => {
        const opts = (props.descriptors[r.key]?.options ?? {}) as Record<string, unknown>;
        return {
          name: r.name,
          title: (opts.drawerLabel as string) || (opts.title as string) || r.name,
          icon: (opts.drawerIcon as unknown as string) || r.name.slice(0, 2),
          group: (opts.drawerGroup as string) || "Overview",
        };
      }),
    [state.routes, props.descriptors],
  );

  const activeName = state.routes[state.index]?.name;

  const grouped = useMemo(() => {
    const q = query.trim().toLowerCase();
    const shown = q ? entries.filter((e) => e.title.toLowerCase().includes(q)) : entries;
    const byGroup = new Map<string, Entry[]>();
    for (const e of shown) {
      if (!byGroup.has(e.group)) byGroup.set(e.group, []);
      byGroup.get(e.group)!.push(e);
    }
    return Array.from(byGroup.entries());
  }, [entries, query]);

  const initials = (user?.name || "?")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("");

  return (
    <View style={[styles.root, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initials}</Text>
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.userName} numberOfLines={1}>
            {user?.name || "Signed in"}
          </Text>
          <Text style={styles.userMeta} numberOfLines={1}>
            {user?.role}
            {user?.account?.account_code ? ` · ${user.account.account_code}` : ""}
          </Text>
        </View>
      </View>

      <View style={styles.searchWrap}>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search modules"
          placeholderTextColor={colors.textFaint}
          autoCapitalize="none"
          autoCorrect={false}
          style={styles.search}
        />
      </View>

      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + spacing(4) }}
        showsVerticalScrollIndicator={false}
      >
        {grouped.length === 0 ? (
          <Text style={styles.noResult}>No modules match “{query}”.</Text>
        ) : (
          grouped.map(([group, items]) => (
            <View key={group}>
              <Text style={styles.groupLabel}>{group.toUpperCase()}</Text>
              {items.map((e) => {
                const active = e.name === activeName;
                return (
                  <Pressable
                    key={e.name}
                    onPress={() => navigation.navigate(e.name as never)}
                    accessibilityRole="button"
                    accessibilityLabel={e.title}
                    accessibilityState={{ selected: active }}
                    style={({ pressed }) => [
                      styles.item,
                      active && styles.itemActive,
                      pressed && !active && styles.itemPressed,
                    ]}
                  >
                    <Tile label={e.icon} size={32} />
                    <Text
                      style={[styles.itemText, active && styles.itemTextActive]}
                      numberOfLines={1}
                    >
                      {e.title}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          ))
        )}
      </ScrollView>

      <Pressable
        onPress={logout}
        accessibilityRole="button"
        accessibilityLabel="Log out"
        style={({ pressed }) => [
          styles.logout,
          { paddingBottom: insets.bottom || spacing(3) },
          pressed && styles.itemPressed,
        ]}
      >
        <Text style={styles.logoutText}>Log out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.surface },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(3),
    paddingHorizontal: spacing(4),
    paddingTop: spacing(4),
    paddingBottom: spacing(3),
  },
  avatar: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.onPrimary, fontWeight: "800", fontSize: 15 },
  userName: { ...type.heading, color: colors.text },
  userMeta: { ...type.caption, color: colors.textMuted, marginTop: 1 },

  searchWrap: { paddingHorizontal: spacing(4), paddingBottom: spacing(2) },
  search: {
    backgroundColor: colors.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2.5),
    fontSize: 14,
    color: colors.text,
  },

  groupLabel: {
    ...type.overline,
    color: colors.textFaint,
    paddingHorizontal: spacing(4),
    marginTop: spacing(4),
    marginBottom: spacing(1.5),
  },

  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(3),
    marginHorizontal: spacing(2),
    paddingHorizontal: spacing(2),
    paddingVertical: spacing(2),
    borderRadius: radius.md,
  },
  itemActive: { backgroundColor: colors.primaryTint },
  itemPressed: { backgroundColor: colors.surfaceAlt },
  itemText: { ...type.body, color: colors.textMuted, flex: 1 },
  itemTextActive: { color: colors.primaryDark, fontWeight: "700" },

  noResult: {
    ...type.body,
    color: colors.textMuted,
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(6),
    textAlign: "center",
  },

  logout: {
    borderTopWidth: 1,
    borderTopColor: colors.border,
    paddingHorizontal: spacing(4),
    paddingTop: spacing(3),
  },
  logoutText: { ...type.body, color: colors.danger, fontWeight: "700" },
});
