import "jsr:@supabase/functions-js/edge-runtime.d.ts";

// Cloudflare Workers에서 Gemini를 직접 호출하면 일부 엣지 노드(홍콩 등)가
// Google의 지역 제한("User location is not supported")에 걸린다. 이 함수는
// x-region: ap-south-1(뭄바이=Gemini 지원지역)으로 실행을 고정해 대신 호출한다.
// 인증: verify_jwt=true(로그인 사용자만). Gemini 키는 호출자가 x-gemini-key로 전달(코드에 키 없음).
// (MCP apply 배포본과 동일 — 저장소엔 이력 보관용)

const GEMINI_URL =
  "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const JSON_HEADERS = { "content-type": "application/json" };
const MAX_ATTEMPTS = 3;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method Not Allowed" }), {
      status: 405,
      headers: JSON_HEADERS,
    });
  }

  const geminiKey = req.headers.get("x-gemini-key");
  if (!geminiKey) {
    return new Response(JSON.stringify({ error: "x-gemini-key 헤더가 없습니다." }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "잘못된 JSON 본문" }), {
      status: 400,
      headers: JSON_HEADERS,
    });
  }
  const payload = JSON.stringify(body);

  // 503(일시 과부하)·429는 짧은 백오프로 재시도해 사용자 체감 실패를 줄인다.
  let lastText = "";
  let lastStatus = 502;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      const res = await fetch(GEMINI_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${geminiKey}`,
        },
        body: payload,
      });
      lastStatus = res.status;
      lastText = await res.text();
      if (res.status !== 503 && res.status !== 429) {
        return new Response(lastText, { status: res.status, headers: JSON_HEADERS });
      }
    } catch (e) {
      lastStatus = 502;
      lastText = JSON.stringify({ error: "Gemini 호출 실패", detail: String(e).slice(0, 150) });
    }
    if (attempt < MAX_ATTEMPTS) await sleep(attempt * 600);
  }
  return new Response(lastText, { status: lastStatus, headers: JSON_HEADERS });
});
