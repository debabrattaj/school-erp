import { useEffect, useRef } from "react";

// Buttons across the app are still plain HTML buttons. Pair their click with
// the next Axios request so users receive feedback only for real async work,
// rather than for local UI actions such as changing tabs or opening a form.
export default function GlobalButtonFeedback() {
  const latestClick = useRef(null);
  const requests = useRef(new Map());

  useEffect(() => {
    function rememberClick(event) {
      const button = event.target.closest("button");
      if (!button || button.disabled || button.dataset.noLoading === "true") return;
      latestClick.current = { button, time: Date.now() };
    }

    function requestStarted(event) {
      const clicked = latestClick.current;
      if (!clicked || Date.now() - clicked.time > 1600 || !clicked.button.isConnected) return;

      const button = clicked.button;
      const count = Number(button.dataset.pendingRequests || 0) + 1;
      button.dataset.pendingRequests = String(count);
      button.dataset.pending = "true";
      button.setAttribute("aria-busy", "true");
      button.disabled = true;
      requests.current.set(event.detail?.id, button);
      latestClick.current = null;
    }

    function requestFinished(event) {
      const button = requests.current.get(event.detail?.id);
      requests.current.delete(event.detail?.id);
      if (!button || !button.isConnected) return;

      const remaining = Math.max(0, Number(button.dataset.pendingRequests || 1) - 1);
      if (remaining) {
        button.dataset.pendingRequests = String(remaining);
        return;
      }

      delete button.dataset.pendingRequests;
      delete button.dataset.pending;
      button.removeAttribute("aria-busy");
      button.disabled = false;
    }

    document.addEventListener("click", rememberClick, true);
    window.addEventListener("school-erp-request-start", requestStarted);
    window.addEventListener("school-erp-request-end", requestFinished);
    return () => {
      document.removeEventListener("click", rememberClick, true);
      window.removeEventListener("school-erp-request-start", requestStarted);
      window.removeEventListener("school-erp-request-end", requestFinished);
    };
  }, []);

  return null;
}
