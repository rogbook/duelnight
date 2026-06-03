/**
 * 결제 서버 함수(클라이언트에서 호출하는 TanStack Server Function) — provider 비종속 facade.
 *
 * 실제 결제 로직은 provider 모듈(src/lib/payments/providers/*)에 있으며,
 * 이 파일은 인증 후 provider로 위임하는 얇은 래퍼만 유지한다.
 * 새 provider(LemonSqueezy/Apple/Google) 추가 시 provider 모듈 + (필요하면) 웹훅 라우트만 더하면 된다.
 *
 * 설계: docs/PAYMENT_MOR_MIGRATION_PLAN.md
 */
import { createServerFn } from "@tanstack/react-start";
import { getAuthenticatedUserId } from "./payments/auth.server";
import * as stripe from "./payments/providers/stripe.server";
import * as portone from "./payments/providers/portone.server";

// 하위호환 재노출(기존 import 경로 유지).
export { CREDIT_PACKS } from "./payments/credit-packs";

/** Stripe Checkout Session 생성 서버 함수 */
export const createStripeCheckoutSession = createServerFn({ method: "POST" })
  .inputValidator((d: { packId: string }) => d)
  .handler(async ({ data }) => {
    const userId = await getAuthenticatedUserId();
    return stripe.createCheckoutSession(userId, data.packId);
  });

/** Stripe 결제 사후 검증 서버 함수 */
export const verifyStripePayment = createServerFn({ method: "POST" })
  .inputValidator((d: { session_id: string }) => d)
  .handler(async ({ data }) => {
    const userId = await getAuthenticatedUserId();
    return stripe.verifyPayment(userId, data.session_id);
  });

/** PortOne 결제 사후 검증 서버 함수 */
export const verifyPortOnePayment = createServerFn({ method: "POST" })
  // amount는 하위호환을 위해 받되 검증/적립에는 사용하지 않는다(서버가 packId로 기준가 산출).
  .inputValidator(
    (d: { imp_uid: string; merchant_uid: string; amount: number; packId: string }) => d,
  )
  .handler(async ({ data }) => {
    const userId = await getAuthenticatedUserId();
    return portone.verifyPayment({
      userId,
      imp_uid: data.imp_uid,
      merchant_uid: data.merchant_uid,
      packId: data.packId,
    });
  });
