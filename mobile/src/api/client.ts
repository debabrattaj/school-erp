import AsyncStorage from "@react-native-async-storage/async-storage";

// The live backend on cPanel — the same origin the admin frontend is built
// against (VITE_API_BASE_URL in .cpanel.yml). No trailing slash: request paths
// are concatenated onto this as-is. Override at runtime from the login screen's
// "Server settings" (e.g. http://10.0.2.2:8000 to reach a local backend from the
// Android emulator), same pattern as the native Android app this replaces.
export const DEFAULT_API_BASE_URL = "https://schoolment.com/school-erp";

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

export async function setApiBase(url: string) {
  cachedBaseUrl = url;
  await AsyncStorage.setItem(API_BASE_KEY, url);
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
  return AsyncStorage.getItem(TOKEN_KEY);
}

export async function getAccountCode() {
  return AsyncStorage.getItem(ACCOUNT_CODE_KEY);
}

export async function setSession(token: string, accountCode: string) {
  await Promise.all([AsyncStorage.setItem(TOKEN_KEY, token), AsyncStorage.setItem(ACCOUNT_CODE_KEY, accountCode)]);
}

export async function clearSession() {
  await Promise.all([AsyncStorage.removeItem(TOKEN_KEY), AsyncStorage.removeItem(ACCOUNT_CODE_KEY)]);
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
