const TOKEN_KEY = 'connect_token';
const ADMIN_TOKEN_KEY = 'connect_admin_token';

/**
 * Base URL of the API. Empty in the browser (same-origin, proxied by Vite/nginx);
 * the Android build sets VITE_API_URL to the public server origin, because the
 * native WebView is served from https://localhost and has no proxy.
 */
export const API_BASE = String(import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

/** Turns a server-relative path (/uploads/...) into an absolute URL for the native shell. */
export function assetUrl(url: string | null | undefined): string | undefined {
  if (!url) return undefined;
  if (/^(https?:|data:|blob:|capacitor:)/.test(url)) return url;
  return `${API_BASE}${url.startsWith('/') ? '' : '/'}${url}`;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null): void {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

export function getAdminToken(): string | null {
  return localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string | null): void {
  if (token) localStorage.setItem(ADMIN_TOKEN_KEY, token);
  else localStorage.removeItem(ADMIN_TOKEN_KEY);
}

interface RequestOptions {
  method?: string;
  body?: unknown;
  admin?: boolean;
  form?: FormData;
}

export async function api<T = unknown>(path: string, options: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = options.admin ? getAdminToken() : getToken();
  if (token) headers.authorization = `Bearer ${token}`;
  let body: BodyInit | undefined;
  if (options.form) {
    body = options.form;
  } else if (options.body !== undefined) {
    headers['content-type'] = 'application/json';
    body = JSON.stringify(options.body);
  }

  let response: Response;
  try {
    response = await fetch(`${API_BASE}/api${path}`, {
      method: options.method || (body ? 'POST' : 'GET'),
      headers,
      body,
    });
  } catch {
    throw new ApiError(0, 'Network error — check your connection', 'network_error');
  }

  const text = await response.text();
  const data = text ? (JSON.parse(text) as Record<string, unknown>) : {};
  if (!response.ok) {
    throw new ApiError(
      response.status,
      String(data.error || 'Request failed'),
      data.code ? String(data.code) : undefined,
      data.details
    );
  }
  return data as T;
}

export function wsUrl(): string {
  const token = getToken() || '';
  const base = API_BASE ? new URL(API_BASE) : null;
  const protocol = (base ? base.protocol : window.location.protocol) === 'https:' ? 'wss' : 'ws';
  const host = base ? base.host : window.location.host;
  return `${protocol}://${host}/ws?token=${encodeURIComponent(token)}`;
}
