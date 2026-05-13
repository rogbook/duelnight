import { createFileRoute, redirect } from "@tanstack/react-router";
import { exchangeCodeForTokens, getDriveEmail } from "@/lib/google-drive.server";
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
          const state = JSON.parse(decodeURIComponent(stateStr));
          const userId = state.userId;

          if (!userId) throw new Error("No user ID in state");

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
          console.error("OAuth callback error:", err);
          throw redirect({ to: "/cards/upload", search: { error: "oauth_failed" } });
        }
      },
    },
  },
});
