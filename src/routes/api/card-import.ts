import { createFileRoute } from "@tanstack/react-router";
import "@tanstack/react-start";
import { z } from "zod";

/**
 * 카드 자동 등록 — 공식 카드리스트 URL 가져오기 (Phase 1.5)
 *
 * 동작: 관리자가 입력한 카드 페이지 URL을 서버에서 fetch → HTML을 텍스트로 정리
 *       (카드 이미지는 [IMG:url] 토큰으로 보존) → Lovable AI 게이트웨이(Gemini)로
 *       cards 스키마에 맞춰 구조화하여 반환.
 * 설계: docs/CARD_IMPORT_PROPOSAL.md
 *
 * 저작권: 이미지는 재호스팅하지 않고 원본 URL을 그대로 참조(핫링크, 이미지 처리 2번).
 *         ⚠️ 원본 사이트가 referer 핫링크를 차단하면 이미지가 깨질 수 있음(별도 정책 결정 필요).
 */

const InputSchema = z.object({
  url: z.string().url().max(2000),
  game_hint: z.string().max(32).optional(),
});

const corsHeaders = { "Content-Type": "application/json" };

// 브라우저처럼 보이게 해 공식 사이트의 봇 차단(403)을 줄임
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

/** SSRF 방지: 사설/내부 주소만 차단하고 공개 http/https는 허용. */
function hostBlocked(host: string): boolean {
  const h = host.toLowerCase().replace(/^\[|\]$/g, "");
  if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return true;
  if (h === "metadata.google.internal" || h === "169.254.169.254") return true;
  if (h === "0.0.0.0" || h === "::1") return true;
  if (/^127\./.test(h) || /^10\./.test(h) || /^192\.168\./.test(h) || /^169\.254\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  return false;
}

/** HTML → 분석용 평문. 카드 <img>는 [IMG:절대URL] 토큰으로 보존해 AI가 카드↔이미지를 매핑하게 함. */
function htmlToText(html: string, baseUrl: string): string {
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ");
  // 이미지: src 추출 → 절대경로 → [IMG:...] 토큰
  s = s.replace(/<img\b[^>]*?\bsrc=["']([^"']+)["'][^>]*>/gi, (_m, src: string) => {
    let abs = src;
    try {
      abs = new URL(src, baseUrl).toString();
    } catch {
      /* keep raw */
    }
    return ` [IMG:${abs}] `;
  });
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/[ \t]+/g, " ")
    .replace(/\s{2,}/g, " ")
    .trim();
}

/** og:image (단일 카드 폴백용). */
function extractOgImage(html: string, baseUrl: string): string | null {
  const og =
    html.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
    html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i);
  if (!og?.[1]) return null;
  try {
    return new URL(og[1], baseUrl).toString();
  } catch {
    return og[1];
  }
}

const SYSTEM = `당신은 TCG 공식 카드 페이지의 텍스트에서 카드 메타데이터를 추출하는 도우미입니다.
반드시 아래 JSON만 출력하세요(마크다운/설명 금지):
{
  "cards": [
    {
      "code": string,           // 카드번호 (예: BT14-012, OP01-001, ST1-001)
      "set_code": string,       // 세트/수록 코드. 없으면 code의 접두를 사용 (BT14-012→BT14, OP01-001→OP01)
      "name": string,           // 카드 이름 (한국어 우선)
      "type": "leader"|"character"|"event"|"stage"|"don", // 디지몬:디지몬→character, 옵션→event, 테이머→character, 디지타마→stage
      "colors": string[],       // ["red","blue","green","purple","black","yellow","white"] 중
      "cost": number|null,      // 등장 코스트
      "power": number|null,     // 파워/DP
      "counter": number|null,
      "attribute": string|null, // 속성 (디지몬: 백신종/데이터종/바이러스종, 원피스: 타격/슬래시 등)
      "rarity": string|null,    // R/SR/C/UC/L/SEC/P 등
      "traits": string[],       // 유형/특징 (디지몬 유형 예: ["리버레이터","파충류형"])
      "image_url": string|null, // 그 카드 바로 근처의 [IMG:URL] 토큰의 URL. 로고/배너/아이콘으로 보이면 제외하고 null
      "effect": string|null,    // 효과 텍스트 (상단+하단 결합)
      "extra": {                // 디지몬 전용 확장 필드 (디지몬이 아니면 생략/빈 객체)
        "category": string|null,    // 종류: 디지타마/디지몬/옵션/테이머/듀얼
        "form": string|null,        // 형태: 유년기/성장기/성숙기/완전체/궁극체
        "evo_cost_1": string|null,  // 진화 코스트 1 (예: "Lv.3")
        "evo_cost_2": string|null,  // 진화 코스트 2
        "text_top": string|null,    // 상단 텍스트
        "text_bottom": string|null  // 하단 텍스트
      }
    }
  ]
}
규칙:
- 텍스트 중 [IMG:URL] 은 그 직전/직후 카드의 이미지입니다. 각 카드의 image_url에 가장 가까운 카드 이미지 URL을 넣으세요.
- 디지몬 카드면 cost=등장 코스트, power=DP, attribute=속성, traits=유형, extra에 종류/형태/진화코스트/상단·하단 텍스트를 채우세요.
- 페이지에 실제로 있는 값만 사용하고 모르면 null. 추측 금지.
- 카드가 여러 장이면 모두 배열에 담으세요(목록 페이지).`;

export const Route = createFileRoute("/api/card-import")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = process.env.LOVABLE_API_KEY;
        if (!apiKey) {
          return new Response(JSON.stringify({ error: "AI 게이트웨이 미설정" }), { status: 500, headers: corsHeaders });
        }

        const authHeader = request.headers.get("authorization");
        if (!authHeader?.startsWith("Bearer ")) {
          return new Response(JSON.stringify({ error: "로그인이 필요합니다." }), { status: 401, headers: corsHeaders });
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
        if (hostBlocked(target.hostname)) {
          return new Response(JSON.stringify({ error: "내부/사설 주소는 허용되지 않습니다." }), { status: 400, headers: corsHeaders });
        }

        // 1) 대상 페이지 HTML fetch (브라우저처럼)
        let html: string;
        try {
          const res = await fetch(target.toString(), {
            headers: {
              "User-Agent": BROWSER_UA,
              Accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
              "Accept-Language": "ko-KR,ko;q=0.9,en;q=0.8,ja;q=0.6",
              Referer: target.origin + "/",
            },
            redirect: "follow",
            signal: AbortSignal.timeout(15000),
          });
          if (res.status === 403 || res.status === 401) {
            return new Response(
              JSON.stringify({ error: `원본 사이트가 접근을 차단했습니다 (${res.status}). 봇 차단으로 자동 수집이 불가할 수 있습니다.` }),
              { status: 502, headers: corsHeaders },
            );
          }
          if (!res.ok) {
            return new Response(JSON.stringify({ error: `페이지를 불러오지 못했습니다 (${res.status})` }), { status: 502, headers: corsHeaders });
          }
          html = await res.text();
        } catch (e) {
          console.error("card-import fetch error", e);
          return new Response(JSON.stringify({ error: "페이지 요청 실패 (시간 초과 또는 네트워크 오류)" }), { status: 502, headers: corsHeaders });
        }

        const ogImage = extractOgImage(html, target.toString());
        const text = htmlToText(html, target.toString()).slice(0, 20000);
        if (text.replace(/\[IMG:[^\]]*\]/g, "").trim().length < 40) {
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
                  content: `${payload.game_hint ? `게임: ${payload.game_hint}\n` : ""}아래는 카드 페이지 텍스트입니다([IMG:URL]은 카드 이미지). 카드 정보를 JSON으로 추출하세요.\n\n${text}`,
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

          const cards = (Array.isArray(parsed.cards) ? parsed.cards : []).filter(
            (c): c is Record<string, unknown> => typeof c === "object" && c !== null,
          );

          // 후처리: image_url 절대경로화 + 폴백
          for (const c of cards) {
            const img = c.image_url;
            if (typeof img === "string" && img) {
              try {
                c.image_url = new URL(img, target.toString()).toString();
              } catch {
                /* keep */
              }
            }
            // set_code 폴백: code 접두
            if ((!c.set_code || c.set_code === "") && typeof c.code === "string") {
              const m = c.code.match(/^([A-Za-z]+\d+)/);
              if (m) c.set_code = m[1];
            }
          }
          // 단일 카드인데 이미지가 비면 og:image 폴백
          if (cards.length === 1 && !cards[0].image_url && ogImage) {
            cards[0].image_url = ogImage;
          }

          if (cards.length === 0) {
            return new Response(
              JSON.stringify({ error: "카드 정보를 찾지 못했습니다. 개별 카드 상세 페이지 URL을 사용해 보세요." }),
              { status: 422, headers: corsHeaders },
            );
          }

          return new Response(JSON.stringify({ cards, source_url: target.toString() }), { status: 200, headers: corsHeaders });
        } catch (e) {
          console.error("card-import route error", e);
          return new Response(JSON.stringify({ error: "AI 서버 오류" }), { status: 500, headers: corsHeaders });
        }
      },
    },
  },
});
