import React from "react";
import { Pressable, Text } from "react-native";
import { useAuth } from "../auth/AuthContext";
import { colors, spacing } from "../theme/theme";

export default function LogoutButton() {
  const { logout } = useAuth();
  return (
    <Pressable
      onPress={logout}
      accessibilityRole="button"
      accessibilityLabel="Log out"
      style={{ paddingHorizontal: spacing(2) }}
    >
      <Text style={{ color: colors.primary, fontWeight: "600" }}>Log out</Text>
    </Pressable>
  );
}
