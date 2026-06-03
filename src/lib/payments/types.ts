/**
 * 결제 도메인 공용 타입.
 *
 * 설계 배경: docs/PAYMENT_MOR_MIGRATION_PLAN.md
 * - 모든 결제 provider(웹 MoR / 앱 IAP / 직접 PG)가 동일한 크레딧 원장으로 수렴한다.
 * - provider는 결제 검증을 수행해 VerifiedPayment로 "정규화"하고,
 *   적립은 단일 함수 grantCredits()가 멱등하게 처리한다.
 */

/** 지원(예정 포함) 결제 provider 식별자. payments.provider 컬럼에 저장된다. */
export type PaymentProvider =
  | "stripe" // 해외 직접 PG (사업자등록 필요)
  | "portone" // 국내 직접 PG (사업자등록 필요)
  | "lemonsqueezy" // 웹 MoR (사업자등록 불필요) — Phase 1
  | "apple" // iOS 인앱결제 (MoR) — Phase 2
  | "google"; // Android 인앱결제 (MoR) — Phase 2

/** 크레딧 충전 상품 정의(서버 기준값). */
export interface CreditPack {
  /** 기준 가격(KRW). 글로벌 통계 호환을 위한 단일 기준 금액. */
  amount: number;
  /** 보너스 포함 최종 적립 크레딧. */
  credits: number;
  /** 표시용 이름. */
  name: string;
}

/**
 * provider 검증을 통과해 "정규화된" 결제 결과.
 * grantCredits()의 입력이자 모든 provider 검증의 공통 출력.
 */
export interface VerifiedPayment {
  userId: string;
  packId: string;
  /** 멱등 키 → payments.order_id (UNIQUE). 중복 적립을 막는다. */
  orderId: string;
  /** 기록할 금액(기준 KRW). 통계 호환을 위해 pack.amount를 저장한다. */
  amount: number;
  currency: string;
  provider: PaymentProvider;
  /** provider별 외부 참조: imp_uid / payment_intent / transaction_id 등. */
  externalRef?: string;
}

/**
 * provider 검증기 인터페이스.
 * 새 provider 추가 시 이 인터페이스를 구현하고 grantCredits()로 적립하면 된다.
 */
export interface PaymentVerifier {
  verify(rawPayload: unknown): Promise<VerifiedPayment>;
}

/** 체크아웃 세션 발급 결과(리디렉션 URL 기반 provider 공용). */
export interface CheckoutResult {
  url: string | null;
}

/** 서버 검증 결과(클라이언트 응답 공용). */
export interface VerifyResult {
  success: boolean;
  error?: string;
}
