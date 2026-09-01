import API, { API_BASE } from "../api";

// Uploaded files come back as server-relative paths like "/uploads/...".
// Prefix them with the API origin so <img src> resolves correctly (the app is
// served from a different origin than the API in dev).
export function resolveFileUrl(url) {
  if (!url) return "";
  if (/^https?:\/\//i.test(url) || url.startsWith("data:")) return url;
  if (url.startsWith("/uploads/")) return `${API_BASE}${url}`;
  return url;
}

// Upload a File object; returns the stored URL string.
// Let axios set the multipart Content-Type (with boundary) from the FormData.
export async function uploadFile(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await API.post("/uploads/", form);
  return res.data?.url || "";
}

// Guards free-text, user-entered link fields (e.g. compliance evidence
// links) before they're rendered as an <a href>. Without this a
// "javascript:" URI would execute in whoever's session clicks it.
export function isSafeExternalUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url, window.location.origin);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
