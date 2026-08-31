import React, { useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TextInputProps,
  View,
} from "react-native";
import { colors, elevation, radius, spacing, tileTint, type } from "../theme/theme";

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
      <View style={[styles.stateIcon, { backgroundColor: colors.dangerTint }]}>
        <Text style={[styles.stateIconText, { color: colors.danger }]}>!</Text>
      </View>
      <Text style={styles.stateTitle}>Something went wrong</Text>
      <Text style={styles.mutedText}>{message}</Text>
      {onRetry ? (
        <PrimaryButton
          title="Try again"
          onPress={onRetry}
          style={{ marginTop: spacing(5), alignSelf: "stretch" }}
        />
      ) : null}
    </Centered>
  );
}

export function EmptyView({ message }: { message: string }) {
  return (
    <Centered>
      <View style={[styles.stateIcon, { backgroundColor: colors.surfaceAlt }]}>
        <Text style={[styles.stateIconText, { color: colors.textFaint }]}>—</Text>
      </View>
      <Text style={styles.stateTitle}>Nothing here yet</Text>
      <Text style={styles.mutedText}>{message}</Text>
    </Centered>
  );
}

export function Card({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

/** Coloured monogram tile, used for modules and list rows. */
export function Tile({ label, size = 40 }: { label: string; size?: number }) {
  const tint = tileTint(label);
  return (
    <View
      style={[
        styles.tile,
        { width: size, height: size, borderRadius: size * 0.3, backgroundColor: tint.bg },
      ]}
    >
      <Text style={[styles.tileText, { color: tint.fg, fontSize: size * 0.36 }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function SectionLabel({ children }: { children: string }) {
  return <Text style={styles.sectionLabel}>{children.toUpperCase()}</Text>;
}

export function Field({
  label,
  children,
  required,
}: {
  label: string;
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={{ color: colors.danger }}> *</Text> : null}
      </Text>
      {children}
    </View>
  );
}

export function AppTextInput(props: TextInputProps) {
  const [focused, setFocused] = React.useState(false);
  return (
    <TextInput
      placeholderTextColor={colors.textFaint}
      {...props}
      onFocus={(e) => {
        setFocused(true);
        props.onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        props.onBlur?.(e);
      }}
      style={[styles.input, focused && styles.inputFocused, props.style]}
    />
  );
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
        <ActivityIndicator color={colors.onPrimary} />
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

export function Badge({
  text,
  tone = "default",
}: {
  text: string;
  tone?: "default" | "success" | "warning" | "danger";
}) {
  const map = {
    default: { fg: colors.textMuted, bg: colors.surfaceAlt },
    success: { fg: colors.success, bg: colors.successTint },
    warning: { fg: colors.warning, bg: colors.warningTint },
    danger: { fg: colors.danger, bg: colors.dangerTint },
  }[tone];
  return (
    <View style={[styles.badge, { backgroundColor: map.bg }]}>
      <Text style={[styles.badgeText, { color: map.fg }]}>{text}</Text>
    </View>
  );
}

export function Row({ children, style }: { children: React.ReactNode; style?: object }) {
  return <View style={[styles.row, style]}>{children}</View>;
}

/**
 * Bottom-sheet confirmation with an optional note — the mobile stand-in for
 * `window.prompt()` (React Native has no cross-platform equivalent; iOS-only
 * `Alert.prompt` won't do). Used for approve/reject/cancel style actions that
 * take a free-text reason.
 */
export function PromptModal({
  visible,
  title,
  message,
  placeholder = "Add a note (optional)",
  confirmLabel = "Confirm",
  destructive,
  loading,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  title: string;
  message?: string;
  placeholder?: string;
  confirmLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onCancel: () => void;
  onConfirm: (note: string) => void;
}) {
  const [note, setNote] = useState("");

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <Pressable style={promptStyles.backdrop} onPress={onCancel}>
        <Pressable style={promptStyles.sheet} onPress={() => {}}>
          <Text style={promptStyles.title}>{title}</Text>
          {message ? <Text style={promptStyles.message}>{message}</Text> : null}
          <AppTextInput
            value={note}
            onChangeText={setNote}
            placeholder={placeholder}
            multiline
            style={promptStyles.input}
          />
          <View style={promptStyles.actions}>
            <SecondaryButton title="Cancel" onPress={onCancel} style={{ flex: 1 }} />
            <PrimaryButton
              title={confirmLabel}
              onPress={() => {
                onConfirm(note.trim());
                setNote("");
              }}
              loading={loading}
              style={[{ flex: 1 }, destructive ? promptStyles.destructiveButton : null]}
            />
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const promptStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(20,21,43,0.45)", justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    padding: spacing(5),
    paddingBottom: spacing(8),
    ...elevation.lg,
  },
  title: { ...type.heading, color: colors.text, marginBottom: spacing(1) },
  message: { ...type.body, color: colors.textMuted, marginBottom: spacing(3) },
  input: { minHeight: 80, textAlignVertical: "top", marginBottom: spacing(4) },
  actions: { flexDirection: "row", gap: spacing(3) },
  destructiveButton: { backgroundColor: colors.danger, shadowColor: colors.danger },
});

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: spacing(8) },

  stateIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.lg,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing(3),
  },
  stateIconText: { fontSize: 22, fontWeight: "800" },
  stateTitle: { ...type.heading, color: colors.text, marginBottom: spacing(1) },
  mutedText: { ...type.body, color: colors.textMuted, textAlign: "center" },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing(4),
    borderWidth: 1,
    borderColor: colors.border,
    ...elevation.sm,
  },

  tile: { alignItems: "center", justifyContent: "center" },
  tileText: { fontWeight: "800", letterSpacing: -0.3 },

  // The web's `.eyebrow`: uppercase, violet, 11px/800, wide tracking.
  sectionLabel: {
    ...type.overline,
    color: colors.primary,
    marginTop: spacing(4),
    marginBottom: spacing(2),
  },

  field: { marginBottom: spacing(4) },
  label: { ...type.label, color: colors.textMuted, marginBottom: spacing(1.5) },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing(3.5),
    paddingVertical: spacing(3),
    fontSize: 15,
    color: colors.text,
    backgroundColor: colors.surface,
  },
  inputFocused: { borderColor: colors.primary, ...elevation.sm },

  // Pill buttons matching the web's .primary-button / .secondary-button:
  // 999px radius, 700 weight, 40px min height, violet glow on the primary.
  primaryButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    minHeight: 44,
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(5),
    alignItems: "center",
    justifyContent: "center",
    shadowColor: colors.primary,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.25,
    shadowRadius: 18,
    elevation: 3,
  },
  buttonDisabled: { opacity: 0.45 },
  buttonPressed: { opacity: 0.85, transform: [{ scale: 0.99 }] },
  primaryButtonText: { color: colors.onPrimary, fontWeight: "700", fontSize: 15, letterSpacing: -0.1 },

  secondaryButton: {
    borderRadius: radius.pill,
    minHeight: 44,
    paddingVertical: spacing(3),
    paddingHorizontal: spacing(5),
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.surface,
  },
  secondaryButtonText: { color: colors.text, fontWeight: "700", fontSize: 15 },

  badge: {
    borderRadius: radius.pill,
    paddingHorizontal: spacing(2.5),
    paddingVertical: spacing(1),
    alignSelf: "flex-start",
  },
  badgeText: { ...type.caption },

  row: { flexDirection: "row", alignItems: "center" },
});
