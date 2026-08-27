import { getApiKey, resolveApiUrl } from "@/lib/env";

/**
 * Shared fetch for app API calls — applies `VITE_API_URL` and `VITE_API_KEY`.
 */
export async function apiFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  if (!headers.has("Accept")) {
    headers.set("Accept", "application/json");
  }

  const apiKey = getApiKey();
  if (apiKey) {
    if (!headers.has("Authorization")) {
      headers.set("Authorization", `Bearer ${apiKey}`);
    }
    if (!headers.has("X-Api-Key")) {
      headers.set("X-Api-Key", apiKey);
    }
  }

  return fetch(resolveApiUrl(path), { ...init, headers });
}

export async function apiJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await apiFetch(path, init);
  if (!res.ok) {
    let detail = `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { message?: string | string[] };
      if (typeof body.message === "string") detail = body.message;
      else if (Array.isArray(body.message)) detail = body.message.join(", ");
    } catch {
      // ignore parse errors — fall back to status
    }
    throw new Error(detail);
  }
  return res.json() as Promise<T>;
}
