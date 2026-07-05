import { useEffect, useRef, useState } from "react";
import { MessageCircle, X } from "lucide-react";

import ChatWidget from "./ChatWidget";

const POSITION_KEY = "school_erp_assistant_position";
const DRAG_THRESHOLD = 4;
const PANEL_GAP = 16;

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

function loadSavedPosition() {
  try {
    const saved = JSON.parse(localStorage.getItem(POSITION_KEY));
    if (saved && typeof saved.x === "number" && typeof saved.y === "number") {
      return saved;
    }
  } catch {
    // ignore malformed/missing saved position
  }
  return null;
}

export default function FloatingAssistant() {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState(loadSavedPosition);
  const [panelPos, setPanelPos] = useState(null);
  const buttonRef = useRef(null);
  const dragState = useRef({ dragging: false, moved: false, startX: 0, startY: 0, originX: 0, originY: 0 });

  useEffect(() => {
    function clampToViewport() {
      setPos((current) => {
        if (!current || !buttonRef.current) return current;
        const rect = buttonRef.current.getBoundingClientRect();
        return {
          x: clamp(current.x, 0, Math.max(0, window.innerWidth - rect.width)),
          y: clamp(current.y, 0, Math.max(0, window.innerHeight - rect.height)),
        };
      });
    }
    window.addEventListener("resize", clampToViewport);
    return () => window.removeEventListener("resize", clampToViewport);
  }, []);

  function handlePointerDown(event) {
    if (event.button !== undefined && event.button !== 0) return;
    const rect = buttonRef.current.getBoundingClientRect();
    dragState.current = {
      dragging: true,
      moved: false,
      startX: event.clientX,
      startY: event.clientY,
      originX: pos ? pos.x : rect.left,
      originY: pos ? pos.y : rect.top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event) {
    if (!dragState.current.dragging) return;
    const dx = event.clientX - dragState.current.startX;
    const dy = event.clientY - dragState.current.startY;

    if (!dragState.current.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    dragState.current.moved = true;

    const rect = buttonRef.current.getBoundingClientRect();
    const nextX = clamp(dragState.current.originX + dx, 0, Math.max(0, window.innerWidth - rect.width));
    const nextY = clamp(dragState.current.originY + dy, 0, Math.max(0, window.innerHeight - rect.height));
    setPos({ x: nextX, y: nextY });
  }

  function handlePointerUp() {
    if (dragState.current.dragging && dragState.current.moved) {
      setPos((current) => {
        if (current) localStorage.setItem(POSITION_KEY, JSON.stringify(current));
        return current;
      });
    }
    dragState.current.dragging = false;
  }

  function handleClick() {
    if (dragState.current.moved) {
      dragState.current.moved = false;
      return;
    }

    setOpen((prev) => {
      const next = !prev;

      if (next && pos && buttonRef.current) {
        const rect = buttonRef.current.getBoundingClientRect();
        const panelWidth = Math.min(380, window.innerWidth - 32);
        const panelHeight = Math.min(520, window.innerHeight - 128);

        let left = clamp(rect.right - panelWidth, 16, window.innerWidth - panelWidth - 16);
        let top = rect.top - PANEL_GAP - panelHeight;
        if (top < 16) {
          top = Math.min(rect.bottom + PANEL_GAP, window.innerHeight - panelHeight - 16);
        }
        setPanelPos({ top, left });
      } else if (next) {
        setPanelPos(null);
      }

      return next;
    });
  }

  const buttonStyle = {
    padding: open ? "0.85rem" : "0.85rem 1.25rem",
    ...(pos ? { left: pos.x, top: pos.y, right: "auto", bottom: "auto" } : {}),
  };

  return (
    <>
      {open && (
        <div
          className="floating-assistant-panel"
          style={panelPos ? { top: panelPos.top, left: panelPos.left, right: "auto", bottom: "auto" } : undefined}
        >
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
        ref={buttonRef}
        type="button"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onClick={handleClick}
        aria-label={open ? "Close assistant" : "Ask Now"}
        className="floating-assistant-toggle"
        style={buttonStyle}
      >
        {open ? <X size={20} /> : <MessageCircle size={20} />}
        {!open && "Ask Now"}
      </button>
    </>
  );
}
