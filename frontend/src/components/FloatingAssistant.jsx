import { useState } from "react";
import { MessageCircle, X } from "lucide-react";

import ChatWidget from "./ChatWidget";

export default function FloatingAssistant() {
  const [open, setOpen] = useState(false);

  return (
    <>
      {open && (
        <div className="floating-assistant-panel">
          <div className="floating-assistant-panel-header">
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
              className="floating-assistant-close"
            >
              <X size={20} />
            </button>
          </div>

          <div className="floating-assistant-panel-body">
            <ChatWidget compact />
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={open ? "Close assistant" : "Ask Now"}
        className="floating-assistant-toggle"
        style={{ padding: open ? "0.85rem" : "0.85rem 1.25rem" }}
      >
        {open ? <X size={20} /> : <MessageCircle size={20} />}
        {!open && "Ask Now"}
      </button>
    </>
  );
}
