/**
 * Centralised API client. Auth uses a short-lived bearer token kept in
 * sessionStorage (cleared when the tab closes). No provider secrets ever reach
 * the browser - they live only in server environment variables.
 */

export const API_BASE: string = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/$/, "") || "/api";
const TOKEN_KEY = "qa.session";

export function getToken(): string | null {
  try {
    return sessionStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token: string | null): void {
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* storage unavailable - session lasts for this page only */
  }
}

export type FieldErrors = Record<string, string[]>;

export class ApiError extends Error {
  status: number;
  fieldErrors: FieldErrors;
  code?: string;
  impacts: string[];
  data: unknown;

  constructor(status: number, message: string, data: unknown) {
    super(message);
    this.status = status;
    this.data = data;
    this.fieldErrors = {};
    this.impacts = [];
    if (data && typeof data === "object" && !Array.isArray(data)) {
      const obj = data as Record<string, unknown>;
      this.code = typeof obj.code === "string" ? obj.code : undefined;
      if (Array.isArray(obj.impacts)) this.impacts = obj.impacts.map(String);
      for (const [key, value] of Object.entries(obj)) {
        if (["detail", "code", "impacts", "error_id"].includes(key)) continue;
        if (Array.isArray(value)) this.fieldErrors[key] = value.map((v) => (typeof v === "string" ? v : JSON.stringify(v)));
        else if (typeof value === "string") this.fieldErrors[key] = [value];
      }
    }
  }

  get needsConfirmation(): boolean {
    return this.status === 409 && this.code === "confirmation_required";
  }
}

function messageFrom(status: number, data: unknown): string {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const obj = data as Record<string, unknown>;
    if (typeof obj.detail === "string") return obj.error_id ? `${obj.detail} (ref ${obj.error_id})` : obj.detail;
    if (obj.detail && typeof obj.detail === "object") return messageFrom(status, obj.detail);
    const first = Object.entries(obj).find(([, v]) => Array.isArray(v) || typeof v === "string");
    if (first) {
      const [key, value] = first;
      const text = Array.isArray(value) ? value.join(" ") : String(value);
      return key === "non_field_errors" ? text : `${key.replace(/_/g, " ")}: ${text}`;
    }
  }
  if (Array.isArray(data) && data.length) return data.map(String).join(" ");
  if (status === 0) return "Cannot reach the server. Check your connection or the API address.";
  if (status === 403) return "You do not have permission to do this.";
  if (status === 404) return "Not found, or you do not have access to it.";
  if (status === 429) return "Too many requests. Please wait a moment and try again.";
  if (status >= 500) return "The server had a problem. Please try again or contact your administrator.";
  return `Request failed (${status}).`;
}

export type Query = Record<string, string | number | boolean | null | undefined>;

export function buildUrl(path: string, query?: Query): string {
  const url = `${API_BASE}${path.startsWith("/") ? path : `/${path}`}`;
  if (!query) return url;
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${url}${url.includes("?") ? "&" : "?"}${qs}` : url;
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  query?: Query;
  signal?: AbortSignal;
}

export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (options.body instanceof FormData) body = options.body;
  else if (options.body !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.body);
  }
  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), { method: options.method ?? "GET", headers, body, signal: options.signal });
  } catch (err) {
    if (err instanceof DOMException && err.name === "AbortError") throw err;
    throw new ApiError(0, messageFrom(0, null), null);
  }
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  let data: unknown = null;
  if (text) {
    try {
      data = JSON.parse(text);
    } catch {
      data = text;
    }
  }
  if (!response.ok) {
    if (response.status === 401 && token) {
      setToken(null);
      window.dispatchEvent(new Event("qa:session-expired"));
    }
    throw new ApiError(response.status, messageFrom(response.status, data), data);
  }
  return data as T;
}

export interface Page<T> {
  count: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

/** Fetch every page of a list endpoint (config lists are small). */
export async function listAll<T>(path: string, query: Query = {}): Promise<T[]> {
  const out: T[] = [];
  let page = 1;
  for (;;) {
    const data = await api<Page<T> | T[]>(path, { query: { ...query, page, page_size: 500 } });
    if (Array.isArray(data)) return data;
    out.push(...data.results);
    if (!data.next || page > 50) return out;
    page += 1;
  }
}

export async function download(path: string, query: Query, filename: string): Promise<void> {
  const token = getToken();
  const response = await fetch(buildUrl(path, query), { headers: token ? { Authorization: `Bearer ${token}` } : {} });
  if (!response.ok) {
    let data: unknown = null;
    try {
      data = await response.json();
    } catch {
      /* not json */
    }
    throw new ApiError(response.status, messageFrom(response.status, data), data);
  }
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}
