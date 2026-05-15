import { supabase } from "@/integrations/supabase/client";

/**
 * Patches window.fetch so that requests to TanStack Start server functions
 * (`/_serverFn/...`) automatically include the current Supabase access token
 * as `Authorization: Bearer <token>`. Without this, any server fn protected by
 * `requireSupabaseAuth` returns 401 even when the user is logged in.
 *
 * Safe to call multiple times; runs only in the browser.
 */
let installed = false;
export function installServerFnAuthFetch() {
  if (installed || typeof window === "undefined") return;
  installed = true;

  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string"
        ? input
        : input instanceof URL
          ? input.toString()
          : input.url;

    if (!url.includes("/_serverFn/") && !url.includes("/api/")) {
      return original(input, init);
    }

    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return original(input, init);

      const headers = new Headers(
        init?.headers ??
          (input instanceof Request ? input.headers : undefined),
      );
      if (!headers.has("authorization")) {
        headers.set("authorization", `Bearer ${token}`);
      }
      return original(input, { ...init, headers });
    } catch {
      return original(input, init);
    }
  };
}
