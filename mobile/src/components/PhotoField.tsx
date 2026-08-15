import React, { useState } from "react";
import { ActivityIndicator, Alert, Image, Pressable, StyleSheet, Text, View } from "react-native";
import * as ImagePicker from "expo-image-picker";
import { ApiError } from "../api/client";
import { uploadFile } from "../api/files";
import { resolveFileUrl } from "../utils/files";
import { colors, radius, spacing, type } from "../theme/theme";

/**
 * Picks an image from the library (or camera) and uploads it, storing the URL
 * the backend returns. Mirrors the web's PhotoUploadField.
 */
export default function PhotoField({
  value,
  onChange,
}: {
  value?: string;
  onChange: (url: string) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);

  async function pick(fromCamera: boolean) {
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();

    if (!permission.granted) {
      Alert.alert(
        "Permission needed",
        fromCamera
          ? "Allow camera access to take a photo."
          : "Allow photo access to choose an image."
      );
      return;
    }

    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          quality: 0.7,
        });

    if (result.canceled || !result.assets?.length) return;

    const asset = result.assets[0];
    setPreview(asset.uri);
    setBusy(true);
    try {
      const uploaded = await uploadFile(asset.uri, asset.fileName || undefined);
      if (!uploaded?.url) throw new ApiError(0, "Upload returned no URL.");
      onChange(uploaded.url);
    } catch (e) {
      setPreview(null);
      Alert.alert(
        "Upload failed",
        e instanceof ApiError && typeof e.detail === "string" ? e.detail : "Could not upload that image."
      );
    } finally {
      setBusy(false);
    }
  }

  const shown = preview || resolveFileUrl(value);

  return (
    <View>
      <View style={styles.previewRow}>
        {shown ? (
          <Image source={{ uri: shown }} style={styles.preview} />
        ) : (
          <View style={[styles.preview, styles.previewEmpty]}>
            <Text style={styles.previewEmptyText}>No photo</Text>
          </View>
        )}
        {busy ? <ActivityIndicator color={colors.primary} style={{ marginLeft: spacing(3) }} /> : null}
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.action} onPress={() => pick(false)} disabled={busy}>
          <Text style={styles.actionText}>Choose photo</Text>
        </Pressable>
        <Pressable style={styles.action} onPress={() => pick(true)} disabled={busy}>
          <Text style={styles.actionText}>Take photo</Text>
        </Pressable>
        {value ? (
          <Pressable
            style={styles.action}
            onPress={() => {
              setPreview(null);
              onChange("");
            }}
            disabled={busy}
          >
            <Text style={[styles.actionText, { color: colors.danger }]}>Remove</Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  previewRow: { flexDirection: "row", alignItems: "center" },
  preview: { width: 96, height: 96, borderRadius: radius.md, backgroundColor: colors.surfaceAlt },
  previewEmpty: { alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
  previewEmptyText: { ...type.caption, color: colors.textFaint },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: spacing(2), marginTop: spacing(3) },
  action: {
    borderWidth: 1,
    borderColor: colors.borderStrong,
    borderRadius: radius.pill,
    paddingHorizontal: spacing(4),
    paddingVertical: spacing(2),
    backgroundColor: colors.surface,
  },
  actionText: { ...type.caption, color: colors.primary, fontWeight: "700" },
});
