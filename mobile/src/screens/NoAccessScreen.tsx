import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PrimaryButton } from "../components/Common";
import { useAuth } from "../auth/AuthContext";
import { colors, radius, spacing, type } from "../theme/theme";

/**
 * Shown when a signed-in staff account's permission map grants no modules at
 * all. Rendering the drawer with zero screens crashes React Navigation, so this
 * stands in and gives the user a way out.
 */
export default function NoAccessScreen() {
  const { user, logout } = useAuth();
  const insets = useSafeAreaInsets();

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing(10), paddingBottom: insets.bottom + spacing(6) }]}>
      <View style={styles.icon}>
        <Text style={styles.iconText}>!</Text>
      </View>
      <Text style={styles.title}>No modules available</Text>
      <Text style={styles.body}>
        The {user?.role || "current"} role on this account has not been granted access to anything yet. Ask an
        administrator to add permissions, then sign in again.
      </Text>
      <PrimaryButton title="Log out" onPress={logout} style={styles.button} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: spacing(8),
  },
  icon: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    backgroundColor: colors.warningTint,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing(3),
  },
  iconText: { fontSize: 22, fontWeight: "800", color: colors.warning },
  title: { ...type.title, color: colors.text, textAlign: "center", marginBottom: spacing(2) },
  body: { ...type.body, color: colors.textMuted, textAlign: "center" },
  button: { marginTop: spacing(6), alignSelf: "stretch" },
});
