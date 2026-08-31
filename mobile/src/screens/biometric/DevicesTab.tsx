import React, { useCallback, useState } from "react";
import { Alert, FlatList, Text, View, StyleSheet } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../api/client";
import {
  AppTextInput,
  Badge,
  Card,
  EmptyView,
  ErrorView,
  Field,
  LoadingView,
  PrimaryButton,
  Row,
  SecondaryButton,
} from "../../components/Common";
import { colors, spacing, type } from "../../theme/theme";

interface Device {
  id: number;
  name: string;
  serial_number: string;
  location?: string;
  vendor?: string;
  mode: string;
  is_active: boolean;
  last_seen_at?: string;
}

const emptyForm = { name: "", serialNumber: "", location: "", vendor: "", mode: "push" as "push" | "pull", pullEndpoint: "" };

export default function DevicesTab() {
  const [devices, setDevices] = useState<Device[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [freshToken, setFreshToken] = useState<{ device: string; token: string } | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      setDevices(await api.get<Device[]>("/biometric/devices"));
    } catch (e) {
      setError(e instanceof ApiError ? String(e.message) : "Failed to load devices.");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  function resetForm() {
    setForm(emptyForm);
    setAdding(false);
  }

  async function submit() {
    if (!form.name.trim() || !form.serialNumber.trim()) {
      Alert.alert("Missing details", "Name and serial number are required.");
      return;
    }
    setSaving(true);
    try {
      const created = await api.post<Device & { auth_token: string }>("/biometric/devices", {
        name: form.name.trim(),
        serial_number: form.serialNumber.trim(),
        location: form.location.trim() || undefined,
        vendor: form.vendor.trim() || undefined,
        mode: form.mode,
        pull_endpoint: form.mode === "pull" ? form.pullEndpoint.trim() || undefined : undefined,
      });
      resetForm();
      setFreshToken({ device: created.name, token: created.auth_token });
      await load();
    } catch (e) {
      Alert.alert("Could not add device", e instanceof ApiError && typeof e.detail === "string" ? e.detail : "The server refused the request.");
    } finally {
      setSaving(false);
    }
  }

  async function rotateToken(device: Device) {
    try {
      const updated = await api.post<Device & { auth_token: string }>(`/biometric/devices/${device.id}/rotate-token`);
      setFreshToken({ device: device.name, token: updated.auth_token });
    } catch (e) {
      Alert.alert("Error", e instanceof ApiError ? String(e.message) : "Could not rotate this device's token.");
    }
  }

  async function toggleActive(device: Device) {
    try {
      await api.put(`/biometric/devices/${device.id}`, { is_active: !device.is_active });
      await load();
    } catch (e) {
      Alert.alert("Error", e instanceof ApiError ? String(e.message) : "Could not update this device.");
    }
  }

  function remove(device: Device) {
    Alert.alert("Delete this device?", device.name, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await api.delete(`/biometric/devices/${device.id}`);
            await load();
          } catch (e) {
            Alert.alert("Error", e instanceof ApiError ? String(e.message) : "Could not delete this device.");
          }
        },
      },
    ]);
  }

  if (error) return <ErrorView message={error} onRetry={load} />;
  if (!devices) return <LoadingView />;

  return (
    <FlatList
      data={devices}
      keyExtractor={(d) => String(d.id)}
      contentContainerStyle={styles.list}
      ListHeaderComponent={
        <View>
          {freshToken ? (
            <Card style={{ marginBottom: spacing(3), borderColor: colors.primary }}>
              <Text style={styles.tokenTitle}>Token for {freshToken.device}</Text>
              <Text style={styles.tokenHint}>Shown once — copy it into the device now. It cannot be shown again.</Text>
              <Text selectable style={styles.tokenValue}>
                {freshToken.token}
              </Text>
              <SecondaryButton title="Dismiss" onPress={() => setFreshToken(null)} style={{ marginTop: spacing(2) }} />
            </Card>
          ) : null}

          {adding ? (
            <Card style={{ marginBottom: spacing(3) }}>
              <Field label="Name" required>
                <AppTextInput value={form.name} onChangeText={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="e.g. Main gate terminal" />
              </Field>
              <Field label="Serial number" required>
                <AppTextInput value={form.serialNumber} onChangeText={(v) => setForm((f) => ({ ...f, serialNumber: v }))} placeholder="e.g. ZK-00123" />
              </Field>
              <Field label="Location">
                <AppTextInput value={form.location} onChangeText={(v) => setForm((f) => ({ ...f, location: v }))} placeholder="Optional" />
              </Field>
              <Field label="Vendor">
                <AppTextInput value={form.vendor} onChangeText={(v) => setForm((f) => ({ ...f, vendor: v }))} placeholder="Optional" />
              </Field>
              <Field label="Mode">
                <Row style={{ gap: spacing(2) }}>
                  {(["push", "pull"] as const).map((m) => (
                    <Text key={m} onPress={() => setForm((f) => ({ ...f, mode: m }))} style={[styles.chip, form.mode === m && styles.chipActive]}>
                      {m === "push" ? "Push (device sends)" : "Pull (we poll it)"}
                    </Text>
                  ))}
                </Row>
              </Field>
              {form.mode === "pull" ? (
                <Field label="Pull endpoint">
                  <AppTextInput value={form.pullEndpoint} onChangeText={(v) => setForm((f) => ({ ...f, pullEndpoint: v }))} placeholder="http://..." />
                </Field>
              ) : null}
              <PrimaryButton title="Register device" onPress={submit} loading={saving} style={{ marginTop: spacing(2) }} />
              <SecondaryButton title="Cancel" onPress={resetForm} style={{ marginTop: spacing(2) }} />
            </Card>
          ) : (
            <PrimaryButton title="+ Register device" onPress={() => setAdding(true)} style={{ marginBottom: spacing(3) }} />
          )}
        </View>
      }
      ListEmptyComponent={<EmptyView message="No biometric devices registered yet." />}
      renderItem={({ item }) => (
        <Card style={{ marginBottom: spacing(2.5) }}>
          <Row style={{ justifyContent: "space-between" }}>
            <Text style={styles.name}>{item.name}</Text>
            <Badge text={item.is_active ? "Active" : "Disabled"} tone={item.is_active ? "success" : "danger"} />
          </Row>
          <Text style={styles.meta}>
            {item.serial_number} · {item.mode}
            {item.location ? ` · ${item.location}` : ""}
          </Text>
          <Text style={styles.meta}>{item.last_seen_at ? `Last seen ${item.last_seen_at.slice(0, 16).replace("T", " ")}` : "Never seen"}</Text>

          <Row style={{ gap: spacing(2), marginTop: spacing(3), flexWrap: "wrap" }}>
            <SecondaryButton title="Rotate token" onPress={() => rotateToken(item)} style={{ flex: 1 }} />
            <SecondaryButton title={item.is_active ? "Disable" : "Enable"} onPress={() => toggleActive(item)} style={{ flex: 1 }} />
          </Row>
          <SecondaryButton title="Delete" onPress={() => remove(item)} style={{ marginTop: spacing(2), borderColor: colors.danger }} />
        </Card>
      )}
    />
  );
}

const styles = StyleSheet.create({
  list: { padding: spacing(4) },
  name: { ...type.heading, color: colors.text },
  meta: { ...type.caption, color: colors.textMuted, marginTop: 2 },
  chip: {
    ...type.caption,
    color: colors.textMuted,
    backgroundColor: colors.surfaceAlt,
    borderRadius: 999,
    paddingHorizontal: spacing(3),
    paddingVertical: spacing(1.5),
    overflow: "hidden",
  },
  chipActive: { backgroundColor: colors.primary, color: colors.onPrimary },
  tokenTitle: { ...type.heading, color: colors.text },
  tokenHint: { ...type.caption, color: colors.textMuted, marginTop: spacing(1) },
  tokenValue: {
    ...type.body,
    color: colors.primaryDark,
    fontWeight: "700",
    marginTop: spacing(2),
    padding: spacing(2.5),
    backgroundColor: colors.surfaceAlt,
    borderRadius: 8,
  },
});
