import AsyncStorage from "@react-native-async-storage/async-storage";
import * as SecureStore from "expo-secure-store";

// The live backend on cPanel — the same origin the admin frontend is built
// against (VITE_API_BASE_URL in .cpanel.yml). No trailing slash: request paths
// are concatenated onto this as-is. Override at runtime from the login screen's
// "Server settings" (e.g. http://10.0.2.2:8000 to reach a local backend from the
// Android emulator), same pattern as the native Android app this replaces.
export const DEFAULT_API_BASE_URL = "https://schoolment.com/school-erp";

// The token is the one piece of session state worth the extra cost of
// Keychain/Keystore-backed storage (SecureStore) rather than plain
// AsyncStorage — everything else here (account code, cached server URL) is
// not a credential and staying in AsyncStorage keeps it readable synchronously
// on the render path where that's needed.
const TOKEN_KEY = "school_erp_token";
const ACCOUNT_CODE_KEY = "school_erp_account_code";
const API_BASE_KEY = "school_erp_api_base";

let cachedBaseUrl: string | null = null;

export async function getApiBase(): Promise<string> {
  if (cachedBaseUrl) return cachedBaseUrl;
  const stored = await AsyncStorage.getItem(API_BASE_KEY);
  cachedBaseUrl = stored || DEFAULT_API_BASE_URL;
  return cachedBaseUrl;
}

/**
 * Whether `hostname` is a private/loopback address — legitimate for on-prem
 * or local-network deployments and local dev, where plain HTTP is acceptable
 * because the traffic never leaves the local network. Everything else must
 * use HTTPS, since the login screen POSTs the school code, email and
 * password to whatever this resolves to.
 */
function isPrivateHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  if (host === "localhost" || host === "127.0.0.1" || host === "::1" || host === "0.0.0.0") return true;
  if (host.endsWith(".local")) return true; // mDNS

  const ipv4 = host.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (ipv4) {
    const a = Number(ipv4[1]);
    const b = Number(ipv4[2]);
    if (a === 127) return true; // 127.0.0.0/8
    if (a === 10) return true; // 10.0.0.0/8
    if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
    if (a === 192 && b === 168) return true; // 192.168.0.0/16
  }
  return false;
}

/**
 * Splits a user-entered server URL into scheme + authority (host[:port]) +
 * the rest of the URL, defaulting to https when no scheme was typed. Kept as
 * simple string parsing rather than the `URL` global, which isn't reliably
 * available in the Hermes runtime this app ships on.
 */
function parseServerUrl(input: string): { protocol: "http" | "https"; authority: string; hostname: string; rest: string } | null {
  const m = input.match(/^(?:(https?):\/\/)?([^/?#]+)(.*)$/i);
  if (!m || !m[2]) return null;
  const protocol = (m[1]?.toLowerCase() as "http" | "https" | undefined) || "https";
  const authority = m[2];
  const hostname = authority.replace(/:\d+$/, "");
  return { protocol, authority, hostname, rest: m[3] || "" };
}

export type ApiBaseValidation = { ok: true; url: string; upcasted: boolean } | { ok: false; error: string };

/**
 * Validates (and where possible auto-fixes) the "Server settings" override
 * on the login screen. Plain HTTP is only accepted to a private/loopback
 * host; for any other host it is silently upgraded to HTTPS rather than
 * rejected outright, since the more common case is a user pasting a bare
 * `http://` URL by habit rather than deliberately choosing cleartext.
 */
export function validateApiBase(input: string): ApiBaseValidation {
  const trimmed = input.trim();
  if (!trimmed) return { ok: false, error: "Enter a server URL." };

  const parsed = parseServerUrl(trimmed);
  if (!parsed || !parsed.hostname) {
    return { ok: false, error: "That doesn't look like a valid URL." };
  }

  const upcasted = parsed.protocol === "http" && !isPrivateHost(parsed.hostname);
  const protocol = upcasted ? "https" : parsed.protocol;
  const path = parsed.rest.replace(/\/+$/, "");
  return { ok: true, url: `${protocol}://${parsed.authority}${path}`, upcasted };
}

/**
 * Saves the "Server settings" override, after running it through
 * `validateApiBase`. Returns the validation result so callers (the login
 * screen) can surface an error or an "upgraded to https" notice; the base
 * URL is only written to storage when validation succeeds.
 */
export async function setApiBase(url: string): Promise<ApiBaseValidation> {
  const result = validateApiBase(url);
  if (!result.ok) return result;
  cachedBaseUrl = result.url;
  await AsyncStorage.setItem(API_BASE_KEY, result.url);
  return result;
}

/**
 * The base URL without awaiting storage, for render-path use such as resolving
 * an <Image> source. Falls back to the default until `getApiBase()` has run
 * once — which the auth bootstrap does before any screen renders.
 */
export function getApiBaseSync() {
  return cachedBaseUrl || DEFAULT_API_BASE_URL;
}

export async function getToken() {
  return SecureStore.getItemAsync(TOKEN_KEY);
}

export async function getAccountCode() {
  return AsyncStorage.getItem(ACCOUNT_CODE_KEY);
}

export async function setSession(token: string, accountCode: string) {
  await Promise.all([SecureStore.setItemAsync(TOKEN_KEY, token), AsyncStorage.setItem(ACCOUNT_CODE_KEY, accountCode)]);
}

export async function clearSession() {
  await Promise.all([SecureStore.deleteItemAsync(TOKEN_KEY), AsyncStorage.removeItem(ACCOUNT_CODE_KEY)]);
}

export class ApiError extends Error {
  status: number;
  detail: unknown;
  constructor(status: number, detail: unknown) {
    super(typeof detail === "string" ? detail : "Request failed");
    this.status = status;
    this.detail = detail;
  }
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined>;
  skipAuth?: boolean;
};

function buildQuery(query?: RequestOptions["query"]) {
  if (!query) return "";
  const params = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return params.length ? `?${params.join("&")}` : "";
}

export async function apiRequest<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const base = await getApiBase();
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (!options.skipAuth) {
    const [token, accountCode] = await Promise.all([getToken(), getAccountCode()]);
    if (token) headers.Authorization = `Bearer ${token}`;
    if (accountCode) headers["X-School-Code"] = accountCode;
  }

  const res = await fetch(`${base}${path}${buildQuery(options.query)}`, {
    method: options.method || "GET",
    headers,
    body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : undefined;

  if (!res.ok) {
    throw new ApiError(res.status, data?.detail ?? data);
  }
  return data as T;
}

export const api = {
  get: <T>(path: string, query?: RequestOptions["query"]) => apiRequest<T>(path, { method: "GET", query }),
  post: <T>(path: string, body?: unknown, options?: RequestOptions) =>
    apiRequest<T>(path, { ...options, method: "POST", body }),
  put: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: "PUT", body }),
  patch: <T>(path: string, body?: unknown) => apiRequest<T>(path, { method: "PATCH", body }),
  delete: <T>(path: string) => apiRequest<T>(path, { method: "DELETE" }),
};
