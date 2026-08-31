import React, { useEffect, useState } from "react";
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, View } from "react-native";
import { useAuth, ApiError } from "../auth/AuthContext";
import { AppTextInput, Field, PrimaryButton, SecondaryButton } from "../components/Common";
import { colors, elevation, radius, spacing, type } from "../theme/theme";
import { DEFAULT_API_BASE_URL, getApiBase, setApiBase } from "../api/client";

export default function LoginScreen() {
  const { login, sessionExpired } = useAuth();
  const [accountCode, setAccountCode] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [needsMfa, setNeedsMfa] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showServerSettings, setShowServerSettings] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [apiBase, setApiBaseState] = useState(DEFAULT_API_BASE_URL);

  useEffect(() => {
    getApiBase().then(setApiBaseState);
  }, []);

  async function handleSubmit() {
    setError(null);
    setNotice(null);
    if (!accountCode || !email || !password) {
      setError("School code, email and password are required.");
      return;
    }
    setLoading(true);
    try {
      await login({ accountCode: accountCode.trim(), email: email.trim(), password, mfaCode: mfaCode || undefined });
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.detail === "MFA_REQUIRED") {
          setNeedsMfa(true);
          setError("Enter the 6-digit code from your authenticator app.");
        } else {
          setError(typeof e.detail === "string" ? e.detail : "Login failed.");
        }
      } else {
        setError("Could not reach the server. Check Server settings below.");
      }
    } finally {
      setLoading(false);
    }
  }

  async function saveServerUrl() {
    const candidate = apiBase.trim();
    // A bare host or a typo here strands the user with "could not reach the
    // server" and no clue why, so the shape is checked before it is stored.
    if (!/^https?:\/\/[^\s/]+/i.test(candidate)) {
      setError("Enter a full URL starting with http:// or https://");
      return;
    }
    // setApiBase strips the trailing slash; every request path already has one,
    // so a saved "https://host/api/" used to produce "https://host/api//auth/login".
    const saved = await setApiBase(candidate);
    setApiBaseState(saved);
    setError(null);
    setNotice("Server URL saved.");
    setShowServerSettings(false);
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
        <View style={styles.brand}>
          <View style={styles.logo}>
            <Text style={styles.logoText}>S</Text>
          </View>
          <Text style={styles.title}>School ERP</Text>
          <Text style={styles.subtitle}>Sign in to continue</Text>
        </View>

        <View style={styles.card}>
        <Field label="School code">
          <AppTextInput
            value={accountCode}
            onChangeText={setAccountCode}
            // Codes are matched exactly by the backend (tenant.get_account) and
            // real ones are lowercase, so forcing capitals here made the field
            // fight the user and produced a code that could not be found.
            autoCapitalize="none"
            autoCorrect={false}
            placeholder="e.g. springdale"
          />
        </Field>
        <Field label="Email">
          <AppTextInput
            value={email}
            onChangeText={setEmail}
            autoCapitalize="none"
            keyboardType="email-address"
            placeholder="you@school.edu"
          />
        </Field>
        <Field label="Password">
          <AppTextInput value={password} onChangeText={setPassword} secureTextEntry placeholder="••••••••" />
        </Field>

        {needsMfa && (
          <Field label="Authentication code">
            <AppTextInput
              value={mfaCode}
              onChangeText={setMfaCode}
              keyboardType="number-pad"
              placeholder="123456"
              maxLength={6}
              autoFocus
            />
          </Field>
        )}

        {sessionExpired && !error ? (
          <Text style={styles.notice}>Your session expired. Please sign in again.</Text>
        ) : null}
        {notice && !error ? <Text style={styles.notice}>{notice}</Text> : null}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        <PrimaryButton title="Sign in" onPress={handleSubmit} loading={loading} style={{ marginTop: spacing(2) }} />

        <SecondaryButton
          title={showServerSettings ? "Hide server settings" : "Server settings"}
          onPress={() => setShowServerSettings((v) => !v)}
          style={{ marginTop: spacing(4) }}
        />

        {showServerSettings && (
          <Field label="API base URL">
            <AppTextInput
              value={apiBase}
              onChangeText={setApiBaseState}
              autoCapitalize="none"
              autoCorrect={false}
              placeholder="https://your-school-erp-api.example.com"
            />
            <SecondaryButton title="Save" onPress={saveServerUrl} style={{ marginTop: spacing(2) }} />
          </Field>
        )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.background },
  container: { flexGrow: 1, justifyContent: "center", padding: spacing(5) },

  brand: { alignItems: "center", marginBottom: spacing(6) },
  logo: {
    width: 56,
    height: 56,
    borderRadius: radius.lg,
    backgroundColor: colors.primary,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: spacing(3),
    ...elevation.md,
  },
  logoText: { color: colors.onPrimary, fontSize: 26, fontWeight: "800" },
  title: { ...type.display, color: colors.text, textAlign: "center" },
  subtitle: { ...type.body, color: colors.textMuted, textAlign: "center", marginTop: spacing(1) },

  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing(5),
    ...elevation.md,
  },
  notice: {
    ...type.label,
    color: colors.primaryDark,
    backgroundColor: colors.primaryTint,
    borderRadius: radius.sm,
    paddingVertical: spacing(2),
    paddingHorizontal: spacing(3),
    marginBottom: spacing(3),
    textAlign: "center",
  },
  error: {
    ...type.label,
    color: colors.danger,
    backgroundColor: colors.dangerTint,
    borderRadius: radius.sm,
    paddingVertical: spacing(2),
    paddingHorizontal: spacing(3),
    marginBottom: spacing(3),
    textAlign: "center",
  },
});
