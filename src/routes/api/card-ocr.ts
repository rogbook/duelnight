import { createFileRoute } from "@tanstack/react-router";
import "@tanstack/react-start";
import { z } from "zod";

const InputSchema = z.object({
  image_url: z.string().url().max(2000).optional(),
  image_b64: z.string().max(12_000_000).optional(),
  game_hint: z.enum(["optcg", "ptcg", "dtcg"]).optional(),
}).refine((d) => d.image_url || d.image_b64, { message: "이미지가 필요합니다" });

const corsHeaders = { "Content-Type": "application/json" };

const SYSTEM = `당신은 TCG 카드 이미지를 분석해 메타데이터를 추출하는 OCR 도우미입니다.
반드시 아래 JSON 스키마만 출력하세요. 마크다운/설명 금지.
{
  "code": string,           // 카드번호 (예: OP01-001)
  "set_code": string,       // 세트 코드 (예: OP01)
  "name": string,           // 카드 이름 (한글 우선, 없으면 영문)
  "type": "leader"|"character"|"event"|"stage"|"don",
  "colors": string[],       // ["red","green","blue","purple","black","yellow"] 중
  "cost": number|null,
  "power": number|null,
  "counter": number|null,
  "attribute": string|null, // 속성 (타격/슬래시/특수 등) 한글
  "rarity": string|null,    // L/C/UC/R/SR/SEC/P 등
  "effect": string|null     // 효과 텍스트 (있으면)
}
모르는 값은 null. 추측하지 말고 이미지에 없으면 null.`;

export const Route = createFileRoute("/api/card-ocr")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) {
          return new Response(JSON.stringify({ error: "AI 게이트웨이 미설정" }), { status: 500, headers: corsHeaders });
        }

        let payload;
        try {
          payload = InputSchema.parse(await request.json());
        } catch (e) {
          return new Response(JSON.stringify({ error: "잘못된 요청 형식" }), { status: 400, headers: corsHeaders });
        }

        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return new Response(JSON.stringify({ error: "로그인이 필요합니다." }), { status: 401, headers: corsHeaders });
        }
        const token = authHeader.replace("Bearer ", "");
        const { createClient } = await import("@supabase/supabase-js");
        const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!, {
          global: { headers: { Authorization: `Bearer ${token}` } }
        });

        const { checkAiQuota, commitAiUsage } = await import("@/lib/ai-quota.server");
        const quota = await checkAiQuota(supabase, "ocr");
        if (!quota.ok) {
          return new Response(JSON.stringify({ error: quota.error }), { status: quota.status, headers: corsHeaders });
        }

        const imageUrl = payload.image_b64 ?? payload.image_url!;

        try {
          const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
            body: JSON.stringify({
              model: "google/gemini-2.5-flash",
              messages: [
                { role: "system", content: SYSTEM },
                {
                  role: "user",
                  content: [
                    { type: "text", text: `이 카드 이미지를 분석해 JSON으로 출력하세요.${payload.game_hint ? ` (게임: ${payload.game_hint})` : ""}` },
                    { type: "image_url", image_url: { url: imageUrl } },
                  ],
                },
              ],
              response_format: { type: "json_object" },
            }),
          });

          if (res.status === 429) return new Response(JSON.stringify({ error: "요청이 많습니다. 잠시 후 다시 시도." }), { status: 429, headers: corsHeaders });
          if (res.status === 402) return new Response(JSON.stringify({ error: "AI 크레딧이 부족합니다." }), { status: 402, headers: corsHeaders });
          if (!res.ok) {
            const txt = await res.text();
            console.error("ocr gateway error", res.status, txt);
            return new Response(JSON.stringify({ error: "OCR 실패" }), { status: 502, headers: corsHeaders });
          }

          const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
          const content = json.choices?.[0]?.message?.content?.trim() ?? "";
          let parsed: Record<string, unknown> = {};
          try {
            parsed = JSON.parse(content);
          } catch {
            const m = content.match(/\{[\s\S]*\}/);
            if (m) parsed = JSON.parse(m[0]);
          }

          await commitAiUsage(supabase, quota.userId, "ocr", quota.source);

          return new Response(JSON.stringify({ data: parsed }), { status: 200, headers: corsHeaders });
        } catch (e) {
          console.error("ocr route error", e);
          return new Response(JSON.stringify({ error: "AI 서버 오류" }), { status: 500, headers: corsHeaders });
        }
      },
    },
  },
});
