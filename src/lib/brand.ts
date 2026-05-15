/**
 * 브랜드 상수
 *
 * 도메인/네이밍이 확정되면 이 파일 한 곳만 수정하면
 * 인트로/메타/푸터 등 전 영역에 일괄 반영됩니다.
 */

export const BRAND_NAME = "DeckLog";
export const BRAND_TAGLINE = "당신의 모든 TCG 매치를 기록하는 곳";
export const BRAND_DESCRIPTION =
  "원피스·포켓몬·디지몬 카드 게임의 덱 빌딩, 매치 기록, AI 코치, LFG, 매장 정보를 한곳에서.";

export const SITE_URL = "https://tcg-hub.lovable.app";
export const SUPPORT_EMAIL = "support@decklog.example";

/**
 * 결제 모드 — 'test' 또는 'live'
 * VITE_PAYMENT_MODE 환경변수로 오버라이드 가능. 미설정 시 'test'.
 */
export const PAYMENT_MODE: "test" | "live" =
  (import.meta.env.VITE_PAYMENT_MODE as "test" | "live") || "test";

export const IS_TEST_MODE = PAYMENT_MODE === "test";

/**
 * 베타 모드 플래그 — 인트로/요금제 페이지에 베타 배너 노출 제어
 */
export const IS_BETA = IS_TEST_MODE;
