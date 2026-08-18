import React, { useCallback, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { api, ApiError } from "../../../api/client";
import { AppTextInput, EmptyView, ErrorView, LoadingView } from "../../../components/Common";
import { colors, radius, spacing, type } from "../../../theme/theme";

interface PortalMessage {
  id: number;
  student_id: number;
  sender_name: string;
  sender_role: string;
  is_staff: boolean;
  body: string;
  created_at?: string;
}

export default function MessagesTab({ studentId }: { studentId: number }) {
  const listRef = useRef<FlatList<PortalMessage>>(null);
  const [messages, setMessages] = useState<PortalMessage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    try {
      setMessages(await api.get<PortalMessage[]>(`/portal/students/${studentId}/messages`));
    } catch (e) {
      setError(e instanceof ApiError ? String(e.message) : "Failed to load messages.");
    }
  }, [studentId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await api.post(`/portal/students/${studentId}/messages`, { body });
      setDraft("");
      await load();
      requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
    } catch (e) {
      setError(e instanceof ApiError ? String(e.message) : "Could not send that message.");
    } finally {
      setSending(false);
    }
  }

  if (error && !messages) return <ErrorView message={error} onRetry={load} />;
  if (!messages) return <LoadingView />;

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 120 : 0}
    >
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => String(m.id)}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={<EmptyView message="No messages yet. Start the conversation below." />}
        renderItem={({ item }) => (
          // Staff messages sit left, the family's own messages right.
          <View style={[styles.bubbleRow, !item.is_staff && styles.bubbleRowOwn]}>
            <View style={[styles.bubble, item.is_staff ? styles.bubbleStaff : styles.bubbleOwn]}>
              <Text style={[styles.sender, !item.is_staff && styles.senderOwn]}>
                {item.sender_name} · {item.sender_role}
              </Text>
              <Text style={item.is_staff ? styles.bodyStaff : styles.bodyOwn}>{item.body}</Text>
            </View>
          </View>
        )}
      />

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.composer}>
        <AppTextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Message the school…"
          style={styles.input}
          multiline
        />
        <Pressable
          onPress={send}
          disabled={!draft.trim() || sending}
          style={[styles.sendButton, (!draft.trim() || sending) && styles.sendDisabled]}
        >
          <Text style={styles.sendText}>Send</Text>
        </Pressable>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.background },
  list: { padding: spacing(4), flexGrow: 1 },
  bubbleRow: { flexDirection: "row", marginBottom: spacing(2.5) },
  bubbleRowOwn: { justifyContent: "flex-end" },
  bubble: { maxWidth: "84%", borderRadius: radius.lg, paddingHorizontal: spacing(4), paddingVertical: spacing(3) },
  bubbleStaff: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  bubbleOwn: { backgroundColor: colors.primary },
  sender: { ...type.caption, color: colors.textMuted, marginBottom: spacing(1) },
  senderOwn: { color: "rgba(255,255,255,0.75)" },
  bodyStaff: { ...type.body, color: colors.text },
  bodyOwn: { ...type.body, color: colors.onPrimary },
  error: { ...type.caption, color: colors.danger, paddingHorizontal: spacing(4) },
  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: spacing(2),
    padding: spacing(4),
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  input: { flex: 1, maxHeight: 120 },
  sendButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing(5),
    paddingVertical: spacing(3),
  },
  sendDisabled: { opacity: 0.45 },
  sendText: { ...type.label, color: colors.onPrimary, fontWeight: "700" },
});
