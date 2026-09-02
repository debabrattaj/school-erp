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

/** Requests that hang longer than this fail rather than spinning forever. */
const REQUEST_TIMEOUT_MS = 30000;

const TOKEN_KEY = "school_erp_token";
const ACCOUNT_CODE_KEY = "school_erp_account_code";
const API_BASE_KEY = "school_erp_api_base";

let cachedBaseUrl: string | null = null;

/**
 * Trailing slashes have to go: every request path already starts with one, so
 * a saved "https://host/api/" would produce "https://host/api//students/".
 */
export function normaliseBaseUrl(url: string) {
  return url.trim().replace(/\/+$/, "");
}

export async function getApiBase(): Promise<string> {
  if (cachedBaseUrl) return cachedBaseUrl;
  const stored = await AsyncStorage.getItem(API_BASE_KEY);
  cachedBaseUrl = normaliseBaseUrl(stored || "") || DEFAULT_API_BASE_URL;
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
    super(typeof detail === "string" && detail ? detail : "Request failed");
    this.status = status;
    this.detail = detail;
  }
}

/**
 * A token that the backend has stopped accepting. Every screen already renders
 * `ApiError.message`, so the session is torn down centrally instead — see
 * `onUnauthorized` below, which the auth provider subscribes to.
 */
const unauthorizedHandlers = new Set<() => void>();

/** Registers a callback for 401s. Returns an unsubscribe function. */
export function onUnauthorized(handler: () => void) {
  unauthorizedHandlers.add(handler);
  return () => {
    unauthorizedHandlers.delete(handler);
  };
}

type RequestOptions = {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  skipAuth?: boolean;
  /** Suppresses the global session teardown, for the login call's own 401s. */
  skipAuthRedirect?: boolean;
  timeoutMs?: number;
};

function buildQuery(query?: RequestOptions["query"]) {
  if (!query) return "";
  const params = Object.entries(query)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`);
  return params.length ? `?${params.join("&")}` : "";
}

/**
 * A backend behind a proxy answers a gateway error or a maintenance page with
 * HTML, not JSON. Parsing that blindly threw a raw SyntaxError past every
 * screen's `instanceof ApiError` check and surfaced as "Unexpected token <".
 */
function parseBody(text: string): unknown {
  if (!text) return undefined;
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/** FastAPI 422s carry a list of {loc, msg}; flatten it into one readable line. */
function describeDetail(detail: unknown, status: number): unknown {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    const parts = detail
      .map((d: any) => {
        if (typeof d === "string") return d;
        const field = Array.isArray(d?.loc) ? d.loc.filter((p: unknown) => p !== "body").join(".") : null;
        return field ? `${field}: ${d?.msg ?? "invalid"}` : d?.msg;
      })
      .filter(Boolean);
    if (parts.length) return parts.join("\n");
  }
  if (detail && typeof detail === "object") {
    const msg = (detail as any).detail ?? (detail as any).message;
    if (typeof msg === "string") return msg;
  }
  return `Request failed (HTTP ${status}).`;
}

export async function apiRequest<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const base = await getApiBase();
  const headers: Record<string, string> = { "Content-Type": "application/json" };

  if (!options.skipAuth) {
    const [token, accountCode] = await Promise.all([getToken(), getAccountCode()]);
    if (token) headers.Authorization = `Bearer ${token}`;
    if (accountCode) headers["X-School-Code"] = accountCode;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs ?? REQUEST_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(`${base}${path}${buildQuery(options.query)}`, {
      method: options.method || "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      signal: controller.signal,
    });
  } catch (e) {
    // A timeout, a DNS failure and a refused connection all land here. They are
    // reported as ApiErrors so screens can render them like any other failure
    // rather than falling through to a generic "something went wrong".
    const aborted = (e as { name?: string })?.name === "AbortError";
    throw new ApiError(
      0,
      aborted
        ? "The server took too long to respond. Check your connection and try again."
        : "Could not reach the server. Check your connection and the server URL in Server settings."
    );
  } finally {
    clearTimeout(timer);
  }

  const text = await res.text();
  const data = parseBody(text);

  if (!res.ok) {
    const detail = describeDetail((data as any)?.detail ?? data, res.status);
    // 401 means the token is gone or expired. Tearing the session down here
    // sends the user back to the login screen instead of leaving every screen
    // stuck on "Not authenticated" with no way to sign in again.
    if (res.status === 401 && !options.skipAuth && !options.skipAuthRedirect) {
      unauthorizedHandlers.forEach((handler) => handler());
    }
    throw new ApiError(res.status, detail);
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

/**
 * Fetches one record by id, falling back to the list endpoint when the module
 * has no detail route.
 *
 * Most of this backend's CRUD routers expose only `GET /thing/` — of the 46
 * modules the app lists, 32 have no `GET /thing/{id}` at all, so asking for one
 * answered 404 and the detail and edit screens showed "Failed to load record".
 * Where a detail route does exist it is still preferred: it is one row over the
 * wire instead of the whole table.
 */
export async function fetchRecord<T extends { id: number }>(
  endpoint: string,
  id: number | string,
  /**
   * Set false where `{endpoint}/{id}` is a different route rather than a
   * missing one. `/master-data/{category}` is the case that forced this: a
   * request for /master-data/5 is read as the category "5" and answered with a
   * 400 "Invalid category", which no 404/405 fallback would catch.
   */
  hasDetailRoute = true
): Promise<T> {
  if (!hasDetailRoute) return findInList<T>(endpoint, id);
  try {
    return await api.get<T>(`${endpoint}/${id}`);
  } catch (e) {
    // 404/405 means "no such route", not "no such record" — fall back. Any
    // other failure (403, 500, offline) is real and must not be masked.
    if (!(e instanceof ApiError) || (e.status !== 404 && e.status !== 405)) throw e;
    return findInList<T>(endpoint, id);
  }
}

async function findInList<T extends { id: number }>(endpoint: string, id: number | string): Promise<T> {
  const rows = await api.get<T[]>(`${endpoint}/`);
  const wanted = String(id);
  const match = Array.isArray(rows) ? rows.find((row) => String(row?.id) === wanted) : undefined;
  if (!match) throw new ApiError(404, "That record no longer exists.");
  return match;
}
