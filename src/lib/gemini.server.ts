/**
 * Gemini 호출을 Supabase Edge Function(gemini-proxy) 경유로 보낸다.
 *
 * 이유: Cloudflare Workers에서 Gemini를 직접 호출하면 엣지 노드(홍콩 등)가
 * Google의 지역 제한("User location is not supported")에 걸린다.
 * Edge Function을 x-region: ap-south-1(뭄바이=Gemini 지원지역)로 고정 실행해 우회한다.
 *
 * 서버 라우트(coach/card-ocr/card-import) 전용.
 */

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: unknown;
};

const PROXY_REGION = "ap-south-1";

/**
 * Gemini Chat Completions(OpenAI 호환)를 프록시로 호출하고 원본 Response를 반환한다.
 * 상태코드별 처리(429/402/!ok 등)는 호출 측에서 기존대로 수행한다.
 *
 * @param token  로그인 사용자의 Supabase JWT (Edge Function verify_jwt 통과용)
 * @param apiKey Gemini API 키 (process.env.GEMINI_API_KEY)
 */
export async function callGeminiProxy(
  token: string,
  apiKey: string,
  payload: { model: string; messages: ChatMessage[] } & Record<string, unknown>,
): Promise<Response> {
  const base = process.env.SUPABASE_URL;
  if (!base) throw new Error("SUPABASE_URL이 설정되지 않았습니다.");
  return fetch(`${base}/functions/v1/gemini-proxy`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      "x-region": PROXY_REGION,
      "x-gemini-key": apiKey,
    },
    body: JSON.stringify(payload),
  });
}
