import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { api, ApiError } from "../../api/client";
import { AppTextInput } from "../../components/Common";
import { colors, radius, spacing, type } from "../../theme/theme";
import { useAuth } from "../../auth/AuthContext";

interface Message {
  id: string;
  role: "user" | "assistant";
  text: string;
}

interface AskResponse {
  reply?: string;
  suggestions?: string[];
  [key: string]: unknown;
}

let seq = 0;
const nextId = () => `m${++seq}`;

export default function AssistantScreen() {
  const { user } = useAuth();
  const listRef = useRef<FlatList<Message>>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: nextId(),
      role: "assistant",
      text: `Hello ${user?.name?.split(" ")[0] || "there"} — ask me about students, fees, attendance or exams.`,
    },
  ]);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || sending) return;

      setMessages((prev) => [...prev, { id: nextId(), role: "user", text: trimmed }]);
      setDraft("");
      setSuggestions([]);
      setSending(true);

      try {
        const res = await api.post<AskResponse>("/chatbot/ask", { message: trimmed });
        setMessages((prev) => [
          ...prev,
          { id: nextId(), role: "assistant", text: res.reply || "I didn't catch that." },
        ]);
        setSuggestions(Array.isArray(res.suggestions) ? res.suggestions : []);
      } catch (e) {
        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            role: "assistant",
            text:
              e instanceof ApiError && typeof e.detail === "string"
                ? e.detail
                : "I couldn't reach the assistant. Check your connection and try again.",
          },
        ]);
      } finally {
        setSending(false);
        requestAnimationFrame(() => listRef.current?.scrollToEnd({ animated: true }));
      }
    },
    [sending]
  );

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
      keyboardVerticalOffset={Platform.OS === "ios" ? 88 : 0}
    >
      <FlatList
        ref={listRef}
        data={messages}
        keyExtractor={(m) => m.id}
        contentContainerStyle={styles.list}
        onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
        renderItem={({ item }) => (
          <View style={[styles.bubbleRow, item.role === "user" && styles.bubbleRowUser]}>
            <View style={[styles.bubble, item.role === "user" ? styles.bubbleUser : styles.bubbleAssistant]}>
              <Text style={item.role === "user" ? styles.textUser : styles.textAssistant}>{item.text}</Text>
            </View>
          </View>
        )}
        ListFooterComponent={
          sending ? (
            <View style={styles.typing}>
              <ActivityIndicator color={colors.primary} size="small" />
              <Text style={styles.typingText}>Thinking…</Text>
            </View>
          ) : null
        }
      />

      {suggestions.length > 0 && (
        <View style={styles.suggestionWrap}>
          {suggestions.map((s) => (
            <Pressable key={s} onPress={() => send(s)} style={styles.suggestion}>
              <Text style={styles.suggestionText}>{s}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <View style={styles.composer}>
        <AppTextInput
          value={draft}
          onChangeText={setDraft}
          placeholder="Ask a question…"
          style={styles.input}
          onSubmitEditing={() => send(draft)}
          returnKeyType="send"
        />
        <Pressable
          onPress={() => send(draft)}
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
  list: { padding: spacing(4), paddingBottom: spacing(2) },
  bubbleRow: { flexDirection: "row", marginBottom: spacing(2.5) },
  bubbleRowUser: { justifyContent: "flex-end" },
  bubble: { maxWidth: "82%", borderRadius: radius.lg, paddingHorizontal: spacing(4), paddingVertical: spacing(3) },
  bubbleAssistant: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  bubbleUser: { backgroundColor: colors.primary },
  textAssistant: { ...type.body, color: colors.text },
  textUser: { ...type.body, color: colors.onPrimary },
  typing: { flexDirection: "row", alignItems: "center", gap: spacing(2), paddingVertical: spacing(2) },
  typingText: { ...type.caption, color: colors.textMuted },
  suggestionWrap: { flexDirection: "row", flexWrap: "wrap", gap: spacing(2), paddingHorizontal: spacing(4), paddingBottom: spacing(2) },
  suggestion: {
    borderWidth: 1,
    borderColor: colors.primaryBorder,
    backgroundColor: colors.primaryTint,
    borderRadius: radius.pill,
    paddingHorizontal: spacing(3.5),
    paddingVertical: spacing(2),
  },
  suggestionText: { ...type.caption, color: colors.primary },
  composer: {
    flexDirection: "row",
    alignItems: "center",
    gap: spacing(2),
    padding: spacing(4),
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.surface,
  },
  input: { flex: 1 },
  sendButton: {
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    paddingHorizontal: spacing(5),
    paddingVertical: spacing(3),
  },
  sendDisabled: { opacity: 0.45 },
  sendText: { ...type.label, color: colors.onPrimary, fontWeight: "700" },
});
