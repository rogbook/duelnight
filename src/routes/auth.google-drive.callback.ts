import { createFileRoute, redirect } from "@tanstack/react-router";
import { consumeOAuthState, exchangeCodeForTokens, getDriveEmail } from "@/lib/google-drive.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/auth/google-drive/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const stateStr = url.searchParams.get("state");

        if (!code || !stateStr) {
          throw redirect({ to: "/cards/upload", search: { error: "missing_code" } });
        }

        try {
          // state는 { nonce } 형식. nonce를 통해 서버 측 매핑된 user_id를 검증.
          let nonce: string | null = null;
          try {
            const parsed = JSON.parse(decodeURIComponent(stateStr));
            nonce = typeof parsed?.nonce === "string" ? parsed.nonce : null;
          } catch {
            nonce = null;
          }

          if (!nonce) {
            throw redirect({ to: "/cards/upload", search: { error: "invalid_state" } });
          }

          const userId = await consumeOAuthState(nonce, "google_drive");
          if (!userId) {
            // CSRF 또는 만료된 state
            throw redirect({ to: "/cards/upload", search: { error: "invalid_state" } });
          }

          const tokens = await exchangeCodeForTokens(code);
          const email = await getDriveEmail(tokens.access_token);

          const expires_at = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

          const { error } = await supabaseAdmin.from("user_drive_tokens").upsert({
            user_id: userId,
            access_token: tokens.access_token,
            refresh_token: tokens.refresh_token || "", // refresh_token is only sent on first consent
            expires_at,
            scope: tokens.scope,
            connected_email: email,
            updated_at: new Date().toISOString(),
          });

          if (error) throw error;

          throw redirect({ to: "/cards/upload", search: { drive: "connected" } });
        } catch (err) {
          // redirect는 throw로 전파됨 — 그대로 다시 throw
          if (err && typeof err === "object" && "isRedirect" in err) throw err;
          console.error("OAuth callback error:", err);
          throw redirect({ to: "/cards/upload", search: { error: "oauth_failed" } });
        }
      },
    },
  },
});
