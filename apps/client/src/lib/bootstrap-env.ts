import { setAuthTokenGetter, setBaseUrl } from "@workspace/api-client-react";
import { getApiBaseUrl, getApiKey } from "@/lib/env";

/**
 * Apply Vite env to the generated API client (orval custom-fetch).
 * Call once at app startup before any queries run.
 */
export function bootstrapFrontendEnv(): void {
  const baseUrl = getApiBaseUrl();
  if (baseUrl) {
    setBaseUrl(baseUrl);
  }

  setAuthTokenGetter(() => getApiKey());
}
