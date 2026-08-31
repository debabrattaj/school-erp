import { useEffect } from "react";

// Sets the browser tab title for the page it's called from. Pass null/undefined
// while data is still loading to fall back to the app name.
export function usePageTitle(title) {
  useEffect(() => {
    document.title = title ? `${title} — Schoolment` : "Schoolment";
  }, [title]);
}
