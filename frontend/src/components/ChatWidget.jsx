import { useEffect, useRef, useState } from "react";
import { RotateCcw, Send, X } from "lucide-react";

import API from "../api";

const INITIAL_MESSAGE = {
  from: "bot",
  text: "Hello! I'm the school assistant. Ask me about attendance, fees, marks, timetable, upcoming exams, class details or academic history.",
  suggestions: ["Attendance", "Fees pending", "Exam results", "Timetable", "Help"],
};

export default function ChatWidget({ compact = false }) {
  const [messages, setMessages] = useState([INITIAL_MESSAGE]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [activeStudentId, setActiveStudentId] = useState(null);
  const [activeStudentName, setActiveStudentName] = useState("");
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  function clearStudent() {
    setActiveStudentId(null);
    setActiveStudentName("");
  }

  function clearChat() {
    setMessages([INITIAL_MESSAGE]);
    clearStudent();
    setInput("");
  }

  async function send(text, studentId = activeStudentId) {
    const message = (text ?? input).trim();
    if (!message || sending) return;

    setMessages((prev) => [...prev, { from: "user", text: message }]);
    setInput("");
    setSending(true);

    try {
      const response = await API.post("/chatbot/ask", {
        message,
        student_id: studentId || null,
      });
      const data = response.data;
      if (data.student_id) {
        setActiveStudentId(data.student_id);
        if (data.student_name) setActiveStudentName(data.student_name);
      }
      setMessages((prev) => [
        ...prev,
        {
          from: "bot",
          text: data.reply,
          suggestions: data.suggestions || [],
          children: data.children || [],
          originalMessage: data.children?.length ? message : null,
        },
      ]);
    } catch (error) {
      setMessages((prev) => [
        ...prev,
        {
          from: "bot",
          text:
            error?.response?.data?.detail ||
            "Sorry, something went wrong. Please try again.",
          suggestions: ["Help"],
        },
      ]);
    } finally {
      setSending(false);
    }
  }

  function pickChild(child, originalMessage) {
    setActiveStudentId(child.id);
    send(originalMessage || "class details", child.id);
  }

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        height: compact ? "100%" : "60vh",
      }}
    >
      {(activeStudentName || messages.length > 1) && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: "0.5rem",
            padding: "0 0.5rem 0.5rem",
            fontSize: "0.8rem",
            color: "var(--saas-muted)",
          }}
        >
          <span>
            {activeStudentName ? (
              <>
                Asking about: <strong>{activeStudentName}</strong>{" "}
                <button
                  type="button"
                  onClick={clearStudent}
                  title="Stop asking about this student"
                  style={{
                    border: "none",
                    background: "none",
                    cursor: "pointer",
                    verticalAlign: "middle",
                    color: "inherit",
                    padding: 0,
                  }}
                >
                  <X size={13} />
                </button>
              </>
            ) : null}
          </span>
          <button
            type="button"
            onClick={clearChat}
            title="Clear the conversation"
            style={{
              border: "none",
              background: "none",
              cursor: "pointer",
              display: "inline-flex",
              alignItems: "center",
              gap: "0.25rem",
              color: "inherit",
              padding: 0,
            }}
          >
            <RotateCcw size={13} />
            Clear
          </button>
        </div>
      )}
      <div style={{ flex: 1, overflowY: "auto", padding: "0.5rem" }}>
        {messages.map((msg, index) => (
          <div
            key={index}
            style={{
              display: "flex",
              justifyContent: msg.from === "user" ? "flex-end" : "flex-start",
              marginBottom: "0.75rem",
            }}
          >
            <div
              style={{
                maxWidth: "80%",
                padding: "0.6rem 0.9rem",
                borderRadius: "12px",
                whiteSpace: "pre-wrap",
                fontSize: compact ? "0.9rem" : "1rem",
                background: msg.from === "user" ? "var(--saas-primary)" : "var(--saas-surface-soft)",
                color: msg.from === "user" ? "#fff" : "var(--saas-text)",
              }}
            >
              {msg.text}
              {msg.children?.length > 0 && (
                <div style={{ marginTop: "0.5rem" }}>
                  {msg.children.map((child) => (
                    <button
                      key={child.id}
                      type="button"
                      className="secondary-button"
                      style={{ marginRight: "0.4rem", marginTop: "0.3rem" }}
                      onClick={() => pickChild(child, msg.originalMessage)}
                    >
                      {child.name}
                    </button>
                  ))}
                </div>
              )}
              {msg.from === "bot" && msg.suggestions?.length > 0 && (
                <div style={{ marginTop: "0.5rem" }}>
                  {msg.suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className="secondary-button"
                      style={{ marginRight: "0.4rem", marginTop: "0.3rem" }}
                      onClick={() => send(suggestion)}
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        ))}
        {sending && <p style={{ color: "#64748b" }}>Thinking…</p>}
        <div ref={bottomRef} />
      </div>

      <div style={{ display: "flex", gap: "0.5rem", paddingTop: "0.75rem" }}>
        <input
          style={{ flex: 1 }}
          value={input}
          placeholder='Try "How much fee is pending?"'
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") send();
          }}
        />
        <button
          type="button"
          className="primary-button"
          onClick={() => send()}
          disabled={sending}
        >
          <Send size={17} />
          Send
        </button>
      </div>
    </div>
  );
}
