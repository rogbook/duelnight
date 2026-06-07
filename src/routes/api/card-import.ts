import { createFileRoute } from "@tanstack/react-router";
import "@tanstack/react-start";
import { z } from "zod";
import { createClient } from "@supabase/supabase-js";


/**
 * 카드 자동 등록 — 공식 카드리스트 URL 가져오기 (Phase 1)
 *
 * 동작: 관리자가 입력한 카드 페이지 URL을 서버에서 fetch → HTML을 텍스트로 정리 →
 *       기존 Lovable AI 게이트웨이(Gemini)로 cards 스키마에 맞춰 구조화하여 반환.
 * 설계: docs/CARD_IMPORT_PROPOSAL.md
 *
 * 주의(저작권): 이미지는 재호스팅하지 않고 원본 URL을 그대로 참조(핫링크)한다. (이미지 처리 2번)
 *               텍스트/사실 데이터는 관리자 입력 보조용으로만 사용하며, 등록 전 검수를 거친다.
 */

const InputSchema = z.object({
  url: z.string().url().max(2000),
  game_hint: z.enum(["optcg", "ptcg", "dtcg"]).optional(),
});

const corsHeaders = { "Content-Type": "application/json" };

// SSRF 방지: 알려진 공식 카드 사이트만 허용 (필요 시 확장)
const ALLOWED_HOSTS = [
  "digimoncard.co.kr",
  "onepiece-cardgame.com",
  "onepiece-cardgame.co.kr",
  "pokemon-card.com",
  "pokemoncard.co.kr",
];

function hostAllowed(host: string): boolean {
  const h = host.toLowerCase();
  return ALLOWED_HOSTS.some((d) => h === d || h.endsWith("." + d));
}

/** HTML → 분석용 평문. script/style 제거 후 태그 제거·공백 정리. */
function htmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

/** og:image 또는 첫 카드 이미지 URL 추출 (절대경로화). */
function extractPrimaryImage(html: string, baseUrl: string): string | null {
  const og =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  let candidate = og?.[1] ?? null;
  if (!candidate) {
    const img = html.match(/<img[^>]+src=["']([^"']+\.(?:png|jpe?g|webp)[^"']*)["']/i);
    candidate = img?.[1] ?? null;
  }
  if (!candidate) return null;
  try {
    return new URL(candidate, baseUrl).toString();
  } catch {
    return candidate;
  }
}

const SYSTEM = `당신은 TCG 공식 카드 페이지의 텍스트에서 카드 메타데이터를 추출하는 도우미입니다.
반드시 아래 JSON만 출력하세요(마크다운/설명 금지):
{
  "cards": [
    {
      "code": string,           // 카드번호 (예: BT14-012, OP01-001)
      "set_code": string,       // 세트/수록 코드 (예: BTK-21, OP01) — '입수 정보'의 코드 우선
      "name": string,           // 카드 이름 (한국어 우선)
      "type": "leader"|"character"|"event"|"stage"|"don", // 디지몬:디지몬→character, 옵션→event, 테이머→character, 디지타마→stage
      "colors": string[],       // ["red","blue","green","purple","black","yellow","white"] 중
      "cost": number|null,      // 등장 코스트
      "power": number|null,     // 파워/DP
      "counter": number|null,
      "attribute": string|null, // 속성 (백신종/타격 등) 한국어
      "rarity": string|null,    // R/SR/C/UC/L/SEC/P 등
      "effect": string|null     // 효과 텍스트 (상단+하단 결합)
    }
  ]
}
규칙: 페이지에 실제로 있는 값만 사용하고 모르면 null. 추측 금지. 카드가 여러 장이면 모두 배열에 담되,
목록 페이지에서 상세 정보가 없으면 code/name 등 보이는 값만 채우세요.`;

export const Route = createFileRoute("/api/card-import")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) {
          return new Response(JSON.stringify({ error: "AI 게이트웨이 미설정" }), { status: 500, headers: corsHeaders });
        }

        // 인증 + 관리자 권한 확인 (JWT 실검증)
        const authHeader = request.headers.get("authorization");
        const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7) : null;
        if (!token) {
          return new Response(JSON.stringify({ error: "로그인이 필요합니다." }), { status: 401, headers: corsHeaders });
        }
        const SUPABASE_URL = process.env.SUPABASE_URL;
        const SUPABASE_PUBLISHABLE_KEY = process.env.SUPABASE_PUBLISHABLE_KEY;
        if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY) {
          return new Response(JSON.stringify({ error: "서버 설정 오류" }), { status: 500, headers: corsHeaders });
        }
        const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data: userData, error: userErr } = await supabase.auth.getUser(token);
        if (userErr || !userData?.user) {
          return new Response(JSON.stringify({ error: "유효하지 않은 인증" }), { status: 401, headers: corsHeaders });
        }
        const { data: roleRow } = await supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", userData.user.id)
          .eq("role", "admin")
          .maybeSingle();
        if (!roleRow) {
          return new Response(JSON.stringify({ error: "관리자 권한이 필요합니다." }), { status: 403, headers: corsHeaders });
        }


        let payload: z.infer<typeof InputSchema>;
        try {
          payload = InputSchema.parse(await request.json());
        } catch {
          return new Response(JSON.stringify({ error: "잘못된 요청 형식 (url 필요)" }), { status: 400, headers: corsHeaders });
        }

        let target: URL;
        try {
          target = new URL(payload.url);
        } catch {
          return new Response(JSON.stringify({ error: "올바른 URL이 아닙니다." }), { status: 400, headers: corsHeaders });
        }
        if (target.protocol !== "https:" && target.protocol !== "http:") {
          return new Response(JSON.stringify({ error: "http/https URL만 허용됩니다." }), { status: 400, headers: corsHeaders });
        }
        if (!hostAllowed(target.hostname)) {
          return new Response(
            JSON.stringify({ error: `허용되지 않은 사이트입니다. 지원: ${ALLOWED_HOSTS.join(", ")}` }),
            { status: 400, headers: corsHeaders },
          );
        }

        // 1) 대상 페이지 HTML fetch
        let html: string;
        try {
          const res = await fetch(target.toString(), {
            headers: {
              "User-Agent": "DuelNightCardImporter/1.0 (+admin card registration helper)",
              Accept: "text/html,application/xhtml+xml",
              "Accept-Language": "ko,en;q=0.8,ja;q=0.6",
            },
            signal: AbortSignal.timeout(12000),
          });
          if (!res.ok) {
            return new Response(JSON.stringify({ error: `페이지를 불러오지 못했습니다 (${res.status})` }), { status: 502, headers: corsHeaders });
          }
          html = await res.text();
        } catch (e) {
          console.error("card-import fetch error", e);
          return new Response(JSON.stringify({ error: "페이지 요청 실패 (시간 초과 또는 네트워크 오류)" }), { status: 502, headers: corsHeaders });
        }

        const primaryImage = extractPrimaryImage(html, target.toString());
        const text = htmlToText(html).slice(0, 16000);
        if (text.length < 40) {
          return new Response(
            JSON.stringify({ error: "페이지에서 텍스트를 찾지 못했습니다. 동적(JS) 로딩 페이지일 수 있어 자동 추출이 어렵습니다." }),
            { status: 422, headers: corsHeaders },
          );
        }

        // 2) Gemini 게이트웨이로 구조화
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
                  content: `${payload.game_hint ? `게임: ${payload.game_hint}\n` : ""}아래는 카드 페이지 텍스트입니다. 카드 정보를 JSON으로 추출하세요.\n\n${text}`,
                },
              ],
              response_format: { type: "json_object" },
            }),
          });

          if (res.status === 429) return new Response(JSON.stringify({ error: "요청이 많습니다. 잠시 후 다시 시도." }), { status: 429, headers: corsHeaders });
          if (res.status === 402) return new Response(JSON.stringify({ error: "AI 크레딧이 부족합니다." }), { status: 402, headers: corsHeaders });
          if (!res.ok) {
            const txt = await res.text();
            console.error("card-import gateway error", res.status, txt);
            return new Response(JSON.stringify({ error: "카드 정보 추출 실패" }), { status: 502, headers: corsHeaders });
          }

          const json = (await res.json()) as { choices?: { message?: { content?: string } }[] };
          const content = json.choices?.[0]?.message?.content?.trim() ?? "";
          let parsed: { cards?: unknown[] } = {};
          try {
            parsed = JSON.parse(content);
          } catch {
            const m = content.match(/\{[\s\S]*\}/);
            if (m) parsed = JSON.parse(m[0]);
          }

          const cards = Array.isArray(parsed.cards) ? parsed.cards : [];
          // 단일 카드 상세 페이지면 대표 이미지(핫링크)를 연결
          if (cards.length === 1 && primaryImage && typeof cards[0] === "object" && cards[0]) {
            (cards[0] as Record<string, unknown>).image_url = primaryImage;
          }

          if (cards.length === 0) {
            return new Response(
              JSON.stringify({ error: "카드 정보를 찾지 못했습니다. 상세 카드 페이지 URL을 사용해 보세요." }),
              { status: 422, headers: corsHeaders },
            );
          }

          return new Response(JSON.stringify({ cards, source_url: target.toString(), image_url: primaryImage }), { status: 200, headers: corsHeaders });
        } catch (e) {
          console.error("card-import route error", e);
          return new Response(JSON.stringify({ error: "AI 서버 오류" }), { status: 500, headers: corsHeaders });
        }
      },
    },
  },
});
