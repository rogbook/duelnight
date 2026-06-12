# AI Gemini 호출 — Supabase Edge Function 경유 (지역차단 우회)

작성: 2026-06-12 | Claude

## 문제
Cloudflare Workers에서 Gemini(`generativelanguage.googleapis.com`)를 **직접** 호출하면
일부 엣지 노드(홍콩 등)에서 `400 User location is not supported for the API use`로 차단됨.
(로컬 PC=한국에선 정상 → Cloudflare egress 위치 문제. 알려진 이슈, AI Gateway로도 동일.)

## 해결
AI 호출을 **Supabase Edge Function `gemini-proxy` 경유**로 변경.
- Edge Function을 `x-region: ap-south-1`(뭄바이=Gemini 지원지역)로 실행 고정 → 그 지역에서 Gemini 호출.
- 인증: `verify_jwt=true` (로그인 사용자만). Gemini 키는 워커가 `x-gemini-key` 헤더로 전달(코드/함수에 키 미저장).
- 503/429는 프록시에서 최대 3회 백오프 재시도(일시 과부하 흡수).

## 코드
- `supabase/functions/gemini-proxy/`(Edge Function, MCP로 배포 — 저장소엔 참고용)
- `src/lib/gemini.server.ts` — `callGeminiProxy(token, apiKey, payload)` 공통 헬퍼
- 사용처: `src/routes/api/coach.ts`, `card-ocr.ts`, `card-import.ts`

## 검증 (2026-06-12)
- 프록시 직접 호출 3회 연속 200 / 코치 e2e 정상 한국어 응답 생성 확인.
- Google 일시 과부하 시 502로 graceful degrade(앱 정상, 토스트 안내).

## 비용/주의
- Edge Function 호출 1회 추가(무료 한도 내). 키는 CF Secret + 워커→프록시 헤더 전달.
- 도메인/리전 변경 시: 프록시는 그대로, Gemini 지원지역만 유지하면 됨.
