import { getApiBaseSync } from "../api/client";

/**
 * Uploaded files come back as server-relative paths like "/uploads/...".
 * Prefix them with the API origin so <Image source> resolves. Mirrors the web's
 * `frontend/src/utils/files.js`.
 */
export function resolveFileUrl(url?: string | null): string {
  if (!url) return "";
  if (/^https?:\/\//i.test(url) || url.startsWith("data:") || url.startsWith("file:")) return url;
  if (url.startsWith("/uploads/")) return `${getApiBaseSync()}${url}`;
  return url;
}
