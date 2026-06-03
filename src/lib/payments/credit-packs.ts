/**
 * 크레딧 상품 정의 및 통화/가격 산출 — provider 비종속 순수 모듈(클라이언트/서버 공용).
 *
 * 금액 위변조 검증 원칙: 클라이언트가 보낸 금액이 아니라, 항상 packId로 서버에서
 * 산출한 기준가를 사용한다. (docs/PAYMENT_MOR_MIGRATION_PLAN.md §4.1)
 */

import type { CreditPack } from "./types";

export const CREDIT_PACKS: Record<string, CreditPack> = {
  "credits-small": { amount: 10000, credits: 1000, name: "1,000 Credits" },
  "credits-medium": { amount: 45000, credits: 5000, name: "5,000 Credits" }, // 4,500 + 500 Bonus
  "credits-large": { amount: 85000, credits: 10000, name: "10,000 Credits" }, // 8,500 + 1,500 Bonus
};

/** packId로 상품을 조회한다. 없으면 undefined. */
export function getPack(packId: string): CreditPack | undefined {
  return CREDIT_PACKS[packId];
}

/**
 * 국가 코드 기반 통화 및 결제 단가 산출.
 * - KR: KRW 기준가 그대로
 * - JP: ¥ = 기준가 / 10
 * - 그 외: USD(센트 단위) = floor(기준가 / 1000) * 100
 *
 * Stripe 등 소수점 통화는 최소 단위(센트) 정수로 넘겨야 한다.
 */
export function getPriceAndCurrency(packId: string, countryCode: string) {
  const pack = CREDIT_PACKS[packId];
  if (!pack) throw new Error("Invalid pack ID");

  const country = (countryCode ?? "US").toUpperCase();

  if (country === "KR") {
    return {
      unitAmount: pack.amount, // ₩10,000 / ₩45,000 / ₩85,000
      currency: "krw",
    };
  } else if (country === "JP") {
    return {
      unitAmount: Math.floor(pack.amount / 10), // ¥1,000 / ¥4,500 / ¥8,500
      currency: "jpy",
    };
  } else {
    // US 및 글로벌 기본값 ($10.00 / $45.00 / $85.00)
    const usdValue = Math.floor(pack.amount / 1000);
    return {
      unitAmount: usdValue * 100, // 1000센트 = $10.00
      currency: "usd",
    };
  }
}
