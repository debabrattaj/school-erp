import React from "react";
import {
  ActivityIndicator,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from "react-native";
import { colors, spacing } from "../theme/theme";

export function Screen({ children }: { children: React.ReactNode }) {
  return <View style={styles.screen}>{children}</View>;
}

export function Centered({ children }: { children: React.ReactNode }) {
  return <View style={styles.centered}>{children}</View>;
}

export function LoadingView({ label }: { label?: string }) {
  return (
    <Centered>
      <ActivityIndicator color={colors.primary} size="large" />
      {label ? <Text style={styles.mutedText}>{label}</Text> : null}
    </Centered>
  );
}

export function ErrorView({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Centered>
      <Text style={styles.errorText}>{message}</Text>
      {onRetry ? (
        <PrimaryButton title="Retry" onPress={onRetry} style={{ marginTop: spacing(3) }} />
      ) : null}
    </Centered>
  );
}

export function EmptyView({ message }: { message: string }) {
  return (
    <Centered>
      <Text style={styles.mutedText}>{message}</Text>
    </Centered>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

export function AppTextInput(props: TextInputProps) {
  return <TextInput placeholderTextColor={colors.textMuted} {...props} style={[styles.input, props.style]} />;
}

export function PrimaryButton({
  title,
  onPress,
  disabled,
  loading,
  style,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  style?: object;
}) {
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.primaryButton,
        (disabled || loading) && styles.buttonDisabled,
        pressed && !disabled && !loading && styles.buttonPressed,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator color="#fff" />
      ) : (
        <Text style={styles.primaryButtonText}>{title}</Text>
      )}
    </Pressable>
  );
}

export function SecondaryButton({
  title,
  onPress,
  style,
}: {
  title: string;
  onPress: () => void;
  style?: object;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed, style]}
    >
      <Text style={styles.secondaryButtonText}>{title}</Text>
    </Pressable>
  );
}

export function Badge({ text, tone = "default" }: { text: string; tone?: "default" | "success" | "warning" | "danger" }) {
  const toneColor =
    tone === "success" ? colors.success : tone === "warning" ? colors.warning : tone === "danger" ? colors.danger : colors.textMuted;
  return (
    <View style={[styles.badge, { borderColor: toneColor }]}>
      <Text style={[styles.badgeText, { color: toneColor }]}>{text}</Text>
    </View>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing(6) },
  mutedText: { color: colors.textMuted, marginTop: spacing(2), textAlign: "center" },
  errorText: { color: colors.danger, textAlign: "center", fontSize: 15 },
  card: {
    backgroundColor: colors.surface,
    borderRadius: 12,
    padding: spacing(4),
    borderWidth: 1,
    borderColor: colors.border,
  },
  field: { marginBottom: spacing(4) },
  label: { fontSize: 13, fontWeight: "600", color: colors.textMuted, marginBottom: spacing(1) },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(2.5),
    fontSize: 16,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: 8,
    paddingVertical: spacing(3),
    alignItems: "center",
    justifyContent: "center",
  },
  buttonDisabled: { opacity: 0.5 },
  buttonPressed: { opacity: 0.8 },
  primaryButtonText: { color: "#fff", fontWeight: "700", fontSize: 16 },
  secondaryButton: {
    borderRadius: 8,
    paddingVertical: spacing(3),
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.primary,
  },
  secondaryButtonText: { color: colors.primary, fontWeight: "700", fontSize: 16 },
  badge: {
    borderWidth: 1,
    borderRadius: 999,
    paddingHorizontal: spacing(2.5),
    paddingVertical: spacing(1),
    alignSelf: "flex-start",
  },
  badgeText: { fontSize: 12, fontWeight: "700" },
  row: { flexDirection: "row", alignItems: "center" },
});
