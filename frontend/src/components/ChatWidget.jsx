import { useEffect, useRef, useState } from "react";
import { Bot, RotateCcw, Send, X } from "lucide-react";

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
    <div className="chat-widget" style={{ height: compact ? "100%" : "60vh" }}>
      {(activeStudentName || messages.length > 1) && (
        <div className="chat-widget-toolbar">
          <span>
            {activeStudentName ? (
              <span className="chat-widget-active-student">
                Asking about {activeStudentName}
                <button type="button" onClick={clearStudent} title="Stop asking about this student">
                  <X size={12} />
                </button>
              </span>
            ) : null}
          </span>
          <button type="button" onClick={clearChat} className="chat-widget-clear-button" title="Clear the conversation">
            <RotateCcw size={13} />
            Clear
          </button>
        </div>
      )}
      <div className="chat-widget-messages">
        {messages.map((msg, index) => (
          <div key={index} className={msg.from === "user" ? "chat-message-row user" : "chat-message-row"}>
            {msg.from === "bot" && (
              <span className="chat-avatar">
                <Bot size={14} />
              </span>
            )}
            <div className={msg.from === "user" ? "chat-bubble user" : "chat-bubble bot"}>
              {msg.text}
              {msg.children?.length > 0 && (
                <div className="chat-suggestions">
                  {msg.children.map((child) => (
                    <button
                      key={child.id}
                      type="button"
                      className="chat-suggestion-chip"
                      onClick={() => pickChild(child, msg.originalMessage)}
                    >
                      {child.name}
                    </button>
                  ))}
                </div>
              )}
              {msg.from === "bot" && msg.suggestions?.length > 0 && (
                <div className="chat-suggestions">
                  {msg.suggestions.map((suggestion) => (
                    <button
                      key={suggestion}
                      type="button"
                      className="chat-suggestion-chip"
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
        {sending && (
          <div className="chat-message-row">
            <span className="chat-avatar">
              <Bot size={14} />
            </span>
            <div className="chat-bubble bot">
              <span className="chat-typing">
                <span />
                <span />
                <span />
              </span>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      <div className="chat-composer">
        <input
          className="chat-composer-input"
          value={input}
          placeholder='Try "How much fee is pending?"'
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") send();
          }}
        />
        <button
          type="button"
          className="chat-composer-send"
          onClick={() => send()}
          disabled={sending}
          aria-label="Send"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
