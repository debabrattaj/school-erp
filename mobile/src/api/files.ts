import { Directory, File, Paths } from "expo-file-system";
import * as Sharing from "expo-sharing";
import { ApiError, getAccountCode, getApiBase, getToken } from "./client";

/**
 * The PDF/CSV endpoints are authenticated, so they can't be handed to
 * `Linking.openURL` — the browser would arrive without a token. Instead we
 * download with the session headers into the cache, then hand the local file to
 * the OS share sheet, which is also what lets the user save or print it.
 */

async function authHeaders() {
  const [token, accountCode] = await Promise.all([getToken(), getAccountCode()]);
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (accountCode) headers["X-School-Code"] = accountCode;
  return headers;
}

function buildQuery(query?: Record<string, string | number | undefined>) {
  if (!query) return "";
  const parts = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return parts.length ? `?${parts.join("&")}` : "";
}

/**
 * Downloads an authenticated file and opens the share sheet for it.
 * `filename` is what the user will see when saving.
 */
export async function downloadAndShare(
  path: string,
  filename: string,
  query?: Record<string, string | number | undefined>
) {
  const base = await getApiBase();
  const headers = await authHeaders();
  const url = `${base}${path}${buildQuery(query)}`;

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
 * Uploads a local file (e.g. a picked photo) to `/uploads/` and returns the
 * stored URL. Uses fetch + FormData rather than the File API's upload helper so
 * the JSON error envelope surfaces the same way as every other request.
 */
export async function uploadFile(localUri: string, filename?: string): Promise<UploadedFile> {
  const base = await getApiBase();
  const headers = await authHeaders();

  const name = filename || localUri.split("/").pop() || "upload.jpg";
  const ext = name.split(".").pop()?.toLowerCase() || "jpg";
  const mime =
    ext === "png" ? "image/png" : ext === "pdf" ? "application/pdf" : ext === "webp" ? "image/webp" : "image/jpeg";

  const form = new FormData();
  // React Native's FormData takes this {uri,name,type} shape rather than a Blob.
  form.append("file", { uri: localUri, name, type: mime } as unknown as Blob);

  const res = await fetch(`${base}/uploads/`, { method: "POST", headers, body: form });
  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!res.ok) throw new ApiError(res.status, data?.detail ?? data);
  return data as UploadedFile;
}

/** Clears anything this module cached under the app's cache directory. */
export async function clearDownloadCache() {
  const dir = new Directory(Paths.cache);
  for (const entry of dir.list()) {
    if (entry instanceof File && /\.(pdf|csv)$/i.test(entry.name)) entry.delete();
  }
}
