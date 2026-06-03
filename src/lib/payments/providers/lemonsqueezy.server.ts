/**
 * Lemon Squeezy(웹 Merchant of Record) provider — Phase 1 스켈레톤.
 *
 * 🚧 아직 미구현. 사업자등록 없이 시작하는 "테스트 베이스"의 핵심 결제 경로다.
 *    구현 시 이 파일을 완성하고, 웹훅 라우트(src/routes/api/payments.lemonsqueezy.ts 예정)와
 *    크레딧 적립(grantCredits)을 연결하면 된다.
 *
 * 구현 단계 (docs/PAYMENT_MOR_MIGRATION_PLAN.md §6.1):
 *  1. 클라이언트: LS Checkout(상품/variant)로 결제창. custom 필드에 { user_id, pack_id } 동봉.
 *  2. 서버 웹훅 수신:
 *     - X-Signature HMAC-SHA256 서명 검증 (LEMONSQUEEZY_WEBHOOK_SECRET).
 *     - event_id 기준 멱등 처리 (payment_webhook_events 테이블, §5.2).
 *     - order_created / order_refunded 이벤트 처리.
 *  3. verify(): custom_data.user_id·pack_id 추출 → 기준가 대조 → VerifiedPayment 반환.
 *  4. grantCredits(verified)로 적립.
 */
import type { PaymentVerifier, VerifiedPayment } from "../types";

/**
 * 환경변수(구현 시 설정):
 *  - LEMONSQUEEZY_API_KEY
 *  - LEMONSQUEEZY_STORE_ID
 *  - LEMONSQUEEZY_WEBHOOK_SECRET
 */

export const lemonSqueezyVerifier: PaymentVerifier = {
  async verify(_rawPayload: unknown): Promise<VerifiedPayment> {
    // TODO(Phase 1): 웹훅 서명 검증 + 페이로드 정규화 구현.
    throw new Error(
      "LemonSqueezy verifier not implemented yet — see docs/PAYMENT_MOR_MIGRATION_PLAN.md (Phase 1)",
    );
  },
};
