import { Platform } from "react-native";
import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { ApiError, getAccountCode, getApiBase, getToken } from "./client";

/**
 * The PDF/CSV endpoints are authenticated, so they can't be handed to
 * `Linking.openURL` — the browser would arrive without a token. Instead we
 * download with the session headers into the cache, then hand the local file to
 * the OS share sheet, which is also what lets the user save or print it.
 */

export async function authHeaders() {
  const [token, accountCode] = await Promise.all([getToken(), getAccountCode()]);
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (accountCode) headers["X-School-Code"] = accountCode;
  return headers;
}

export function buildQuery(query?: Record<string, string | number | undefined>) {
  if (!query) return "";
  const parts = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

/** The absolute, query-bearing URL a download will be fetched from. */
export function buildFileUrl(
  base: string,
  path: string,
  query?: Record<string, string | number | undefined>
) {
  return `${base}${path}${buildQuery(query)}`;
}

/**
 * Fetches the file with the session headers and hands it to the browser.
 *
 * expo-file-system and expo-sharing are native-only, so on the web build the
 * whole download was an unhandled throw and every "Generate PDF" button did
 * nothing at all. Fetching the blob ourselves and clicking a temporary object
 * URL is the browser equivalent of the share sheet: it saves the file.
 */
async function downloadInBrowser(url: string, filename: string, headers: Record<string, string>) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    let detail: unknown = text;
    try {
      detail = JSON.parse(text)?.detail ?? text;
    } catch {
      // a non-JSON error body is used as-is
    }
    throw new ApiError(res.status, typeof detail === "string" && detail ? detail : "Could not generate that file.");
  }

  const blob = await res.blob();
  const objectUrl = URL.createObjectURL(blob);
  try {
    const link = document.createElement("a");
    link.href = objectUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
  } finally {
    // Revoked on the next tick so the click has taken the URL first.
    setTimeout(() => URL.revokeObjectURL(objectUrl), 0);
  }
  return objectUrl;
}

/**
 * Downloads an authenticated file and hands it to the OS share sheet, which is
 * what lets the user save, print or send it. `filename` is what they will see.
 */
export async function downloadAndShare(
  path: string,
  filename: string,
  query?: Record<string, string | number | undefined>
) {
  const base = await getApiBase();
  const headers = await authHeaders();
  const url = buildFileUrl(base, path, query);

  if (Platform.OS === "web") return downloadInBrowser(url, filename, headers);

  const target = new File(Paths.cache, filename);
  // Re-downloading the same report should replace the cached copy, not throw.
  const downloaded = await File.downloadFileAsync(url, target, { headers, idempotent: true });

  if (!(await Sharing.isAvailableAsync())) {
    throw new ApiError(0, "Sharing isn't available on this device.");
  }
  await Sharing.shareAsync(downloaded.uri);
  return downloaded.uri;
}

export interface UploadedFile {
  url: string;
  [key: string]: unknown;
}

/**
 * Uploads a local file (e.g. a picked photo) and returns the stored URL. Uses
 * fetch + FormData rather than the File API's upload helper so the JSON error
 * envelope surfaces the same way as every other request.
 *
 * `endpoint` picks which door to go through: staff use the default, and the
 * parent/student portal has its own, which only exists where the school has
 * the LMS.
 */
export async function uploadFile(
  localUri: string,
  filename?: string,
  endpoint = "/uploads/"
): Promise<UploadedFile> {
  const base = await getApiBase();
  const headers = await authHeaders();

  const name = filename || localUri.split("/").pop() || "upload.jpg";
  const ext = name.split(".").pop()?.toLowerCase() || "jpg";
  const mime =
    ext === "png" ? "image/png" : ext === "pdf" ? "application/pdf" : ext === "webp" ? "image/webp" : "image/jpeg";

  const form = new FormData();
  // React Native's FormData takes this {uri,name,type} shape rather than a Blob.
  form.append("file", { uri: localUri, name, type: mime } as unknown as Blob);

  const res = await fetch(`${base}${endpoint}`, { method: "POST", headers, body: form });
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!res.ok) throw new ApiError(res.status, data?.detail ?? data);
  return data as UploadedFile;
}

/** Clears anything this module cached under the app's cache directory. */
export async function clearDownloadCache() {
  // Nothing is cached on web: the browser owns the downloaded file.
  if (Platform.OS === "web") return;
  const dir = new Directory(Paths.cache);
  for (const entry of dir.list()) {
    if (entry instanceof File && /\.(pdf|csv)$/i.test(entry.name)) entry.delete();
  }
}
