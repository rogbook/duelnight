import { createFileRoute, redirect } from "@tanstack/react-router";
import { getGoogleAuthUrl } from "@/lib/google-drive.server";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/drive/auth")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        // 인증 확인 (쿠키 또는 헤더에서 세션 추출)
        // TanStack Start에서 서버 사이드 세션 확인이 필요함.
        // 여기서는 편의상 헤더의 authorization을 확인하거나,
        // 클라이언트에서 쿼리 파라미터로 userId를 보내도록 유도 (보안상 좋지 않음).
        // 가장 좋은 방법은 서버 함수(createServerFn)로 auth URL을 받아오는 것임.

        return new Response(JSON.stringify({ error: "Use server function instead" }), {
          status: 400,
        });
      },
    },
  },
});
