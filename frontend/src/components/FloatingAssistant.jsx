import { useState } from "react";
import { MessageCircle, X } from "lucide-react";

import ChatWidget from "./ChatWidget";

export default function FloatingAssistant() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {open && (
        <div
          style={{
            position: "fixed",
            bottom: "5.5rem",
            right: "1.5rem",
            width: "380px",
            maxWidth: "calc(100vw - 2rem)",
            height: "520px",
            maxHeight: "calc(100vh - 8rem)",
            background: "#fff",
            borderRadius: "16px",
            boxShadow: "0 12px 32px rgba(15, 23, 42, 0.18)",
            border: "1px solid #e2e8f0",
            display: "flex",
            flexDirection: "column",
            zIndex: 1000,
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0.9rem 1rem",
              borderBottom: "1px solid #e2e8f0",
              background: "var(--saas-primary)",
              color: "#fff",
              borderTopLeftRadius: "16px",
              borderTopRightRadius: "16px",
            }}
          >
            <div>
              <div style={{ fontWeight: 600 }}>School Assistant</div>
              <div style={{ fontSize: "0.75rem", opacity: 0.75 }}>
                Ask about attendance, fees, marks & more
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              style={{
                background: "transparent",
                border: "none",
                color: "#fff",
                cursor: "pointer",
                padding: "0.25rem",
              }}
            >
              <X size={20} />
            </button>
          </div>

          <div style={{ flex: 1, padding: "0.75rem 1rem 1rem", overflow: "hidden" }}>
            <ChatWidget compact />
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={open ? "Close assistant" : "Ask Now"}
        style={{
          position: "fixed",
          bottom: "1.5rem",
          right: "1.5rem",
          display: "flex",
          alignItems: "center",
          gap: "0.5rem",
          padding: open ? "0.85rem" : "0.85rem 1.25rem",
          borderRadius: "999px",
          border: "none",
          background: "var(--saas-primary)",
          color: "#fff",
          fontWeight: 600,
          fontSize: "0.95rem",
          boxShadow: "var(--saas-shadow-lg)",
          cursor: "pointer",
          zIndex: 1001,
        }}
      >
        {open ? <X size={20} /> : <MessageCircle size={20} />}
        {!open && "Ask Now"}
      </button>
    </>
  );
}
