import { createFileRoute } from "@tanstack/react-router";
import "@tanstack/react-start";
import { z } from "zod";

const RatePackSchema = z.object({
  wins: z.number(),
  losses: z.number(),
  draws: z.number(),
  total: z.number(),
  winRate: z.number(),
  wilsonLow: z.number(),
  confidence: z.enum(["높음", "중간", "낮음"]).optional(),
});

const PayloadSchema = z.object({
  game: z.string(),
  period: z.string(),
  totalMatches: z.number(),
  overall: RatePackSchema,
  first: RatePackSchema,
  second: RatePackSchema,
  topDecks: z
    .array(
      z.object({
        deck: z.string(),
        stats: RatePackSchema,
        first: RatePackSchema,
        second: RatePackSchema,
      }),
    )
    .max(5),
  weakMatchups: z
    .array(
      z.object({
        deck: z.string(),
        opponent: z.string(),
        stats: RatePackSchema,
      }),
    )
    .max(5),
  topOpponents: z
    .array(
      z.object({
        opponent: z.string(),
        count: z.number(),
        share: z.number(),
        stats: RatePackSchema,
      }),
    )
    .max(8),
});

const corsHeaders = {
  "Content-Type": "application/json",
};

export const Route = createFileRoute("/api/coach")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) {
          return new Response(JSON.stringify({ error: "AI 게이트웨이가 설정되지 않았습니다." }), {
            status: 500,
            headers: corsHeaders,
          });
        }

        let payload;
        try {
          payload = PayloadSchema.parse(await request.json());
        } catch (e) {
          return new Response(JSON.stringify({ error: "잘못된 요청 형식입니다." }), {
            status: 400,
            headers: corsHeaders,
          });
        }

        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return new Response(JSON.stringify({ error: "로그인이 필요합니다." }), {
            status: 401,
            headers: corsHeaders,
          });
        }
        const token = authHeader.replace("Bearer ", "");
        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(
          process.env.SUPABASE_URL!,
          process.env.SUPABASE_PUBLISHABLE_KEY!,
          {
            global: { headers: { Authorization: `Bearer ${token}` } },
          },
        );

        const { checkAiQuota, commitAiUsage } = await import("@/lib/ai-quota.server");
        const quota = await checkAiQuota(supabase, "coach");
        if (!quota.ok) {
          return new Response(JSON.stringify({ error: quota.error }), {
            status: quota.status,
            headers: corsHeaders,
          });
        }

        const system =
          "당신은 TCG 전적 데이터를 분석해 한국어로 간결한 코칭 인사이트를 제공하는 코치입니다. " +
          "반드시 한국어로, 마크다운 없이, 3~5개의 짧은 불릿(각 줄 앞에 '• ')으로 답하세요. " +
          "데이터 기반 사실(승률·표본수)을 먼저 짚고, 마지막 1~2개 불릿은 구체적 개선 제안을 적으세요. " +
          "각 통계(전체/선후공/덱/매치업/상대)를 언급할 때는 표본수와 함께 신뢰도 라벨을 대괄호로 함께 표기하세요. " +
          "예: '레드 vs 블루 35% (12판) [중간]'. 라벨은 payload의 confidence 값을 그대로 사용하세요(높음/중간/낮음). " +
          "신뢰도가 '낮음'인 통계는 단정하지 말고 '표본 부족' 한계를 함께 적으세요.";

        const user = `다음은 사용자의 최근 전적 요약입니다(JSON):\n${JSON.stringify(payload)}`;

        try {
          const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                { role: "system", content: system },
                { role: "user", content: user },
              ],
            }),
          });

          if (res.status === 429) {
            return new Response(
              JSON.stringify({
                error: "요청이 많습니다. 잠시 후 다시 시도해 주세요.",
              }),
              { status: 429, headers: corsHeaders },
            );
          }
          if (res.status === 402) {
            return new Response(
              JSON.stringify({
                error: "AI 크레딧이 부족합니다. 워크스페이스 설정에서 충전해 주세요.",
              }),
              { status: 402, headers: corsHeaders },
            );
          }
          if (!res.ok) {
            const txt = await res.text();
            console.error("AI gateway error", res.status, txt);
            return new Response(JSON.stringify({ error: "AI 응답 생성에 실패했습니다." }), {
              status: 502,
              headers: corsHeaders,
            });
          }

          const json = (await res.json()) as {
            choices?: { message?: { content?: string } }[];
          };
          const content = json.choices?.[0]?.message?.content?.trim() ?? "";
          if (!content) {
            return new Response(JSON.stringify({ error: "응답이 비어 있습니다." }), {
              status: 502,
              headers: corsHeaders,
            });
          }

          await commitAiUsage(supabase, quota.userId, "coach", quota.source);

          return new Response(JSON.stringify({ content }), {
            status: 200,
            headers: corsHeaders,
          });
        } catch (e) {
          console.error("coach route error", e);
          return new Response(JSON.stringify({ error: "AI 서버에 연결할 수 없습니다." }), {
            status: 500,
            headers: corsHeaders,
          });
        }
      },
    },
  },
});
