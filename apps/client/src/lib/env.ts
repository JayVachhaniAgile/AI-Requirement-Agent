/**
 * Frontend environment accessors.
 *
 * Vite only exposes vars prefixed with `VITE_`. Defaults keep same-origin
 * `/api` + socket proxy behavior for local development.
 */

function trimTrailingSlash(value: string): string {
  return value.replace(/\/+$/, "");
}

/** Optional absolute API origin (e.g. https://api.example.com). Empty = same origin. */
export function getApiBaseUrl(): string {
  const raw = import.meta.env.VITE_API_URL;
  if (typeof raw === "string" && raw.trim() !== "") {
    return trimTrailingSlash(raw.trim());
  }
  return "";
}

/** Optional API key sent as `Authorization: Bearer` / `X-Api-Key` when backend auth is on. */
export function getApiKey(): string | null {
  const raw = import.meta.env.VITE_API_KEY;
  if (typeof raw === "string" && raw.trim() !== "") {
    return raw.trim();
  }
  return null;
}

/** Socket.IO origin; defaults to `window.location.origin` (Vite proxy in dev). */
export function getSocketUrl(): string {
  const raw = import.meta.env.VITE_SOCKET_URL;
  if (typeof raw === "string" && raw.trim() !== "") {
    return trimTrailingSlash(raw.trim());
  }
  if (typeof window !== "undefined") {
    return window.location.origin;
  }
  return "";
}

/** Resolve a path like `/api/foo` against `VITE_API_URL` when set. */
export function resolveApiUrl(path: string): string {
  const base = getApiBaseUrl();
  if (!base) return path;
  if (path.startsWith("http://") || path.startsWith("https://")) return path;
  return `${base}${path.startsWith("/") ? path : `/${path}`}`;
}
