import { useEffect, useRef, useState } from "react";
import { Check, ChevronDown } from "lucide-react";

// A dropdown whose OPEN option list can actually be styled -- a plain
// <select>'s popup is rendered by the OS/browser and CSS cannot touch it
// (rounded corners, brand colors, hover states all get ignored), which is
// why native selects look inconsistent with the rest of a SaaS-styled app.
//
// options: [{ value, label }] or plain strings (used as both value and label).
// Same shape as everywhere else in this app: onChange(value) — not a DOM event.
export default function CustomSelect({
  value,
  onChange,
  options,
  placeholder = "Select...",
  disabled = false,
  className = "",
}) {
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(-1);
  const rootRef = useRef(null);
  const listRef = useRef(null);

  const normalized = options.map((opt) =>
    typeof opt === "string" ? { value: opt, label: opt } : opt
  );
  const selectedIndex = normalized.findIndex((opt) => opt.value === value);
  const selected = normalized[selectedIndex];

  useEffect(() => {
    if (!open) return undefined;

    function handleClickOutside(event) {
      if (rootRef.current && !rootRef.current.contains(event.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (!open || highlighted < 0 || !listRef.current) return;
    const node = listRef.current.children[highlighted];
    if (node) node.scrollIntoView({ block: "nearest" });
  }, [open, highlighted]);

  // Set where the highlight starts right when the menu opens, instead of
  // reacting to `open` becoming true afterward -- one render, not two.
  function openMenu() {
    setHighlighted(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  }

  function commit(index) {
    const opt = normalized[index];
    if (!opt) return;
    onChange(opt.value);
    setOpen(false);
  }

  // Focus stays on the trigger button the whole time (the standard
  // "listbox button" pattern) -- the popup list is just visual, so all
  // keyboard handling lives here rather than needing to move focus into it.
  function handleTriggerKeyDown(event) {
    if (disabled) return;

    if (!open) {
      if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) {
        event.preventDefault();
        openMenu();
      }
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      setOpen(false);
    } else if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((current) => Math.min(current + 1, normalized.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      commit(highlighted);
    } else if (event.key === "Tab") {
      setOpen(false);
    }
  }

  return (
    <div className={`custom-select ${className}`} ref={rootRef}>
      <button
        type="button"
        className="custom-select-trigger"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => {
          if (disabled) return;
          if (open) setOpen(false);
          else openMenu();
        }}
        onKeyDown={handleTriggerKeyDown}
      >
        <span className={selected ? "" : "custom-select-placeholder"}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown size={16} className="custom-select-chevron" aria-hidden="true" />
      </button>

      {open && (
        <ul className="custom-select-panel" role="listbox" ref={listRef}>
          {normalized.map((opt, index) => (
            <li
              key={opt.value}
              role="option"
              aria-selected={opt.value === value}
              className={
                "custom-select-option" +
                (opt.value === value ? " is-selected" : "") +
                (index === highlighted ? " is-highlighted" : "")
              }
              onMouseEnter={() => setHighlighted(index)}
              onClick={() => commit(index)}
            >
              <span>{opt.label}</span>
              {opt.value === value && <Check size={15} aria-hidden="true" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
