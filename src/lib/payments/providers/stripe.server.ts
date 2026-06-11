/**
 * Stripe(해외 직접 PG) provider 로직. 사업자등록 후 활성화(Phase 3).
 *
 * 서버 함수(createServerFn) 래퍼는 src/lib/payment.functions.ts에 있으며,
 * 여기서는 순수 provider 로직만 담당한다(인증된 userId를 인자로 받음).
 */
import { getRequest } from "@tanstack/react-start/server";
import Stripe from "stripe";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getPack, getPriceAndCurrency } from "../credit-packs";
import { grantCredits } from "../grant-credits.server";
import type { CheckoutResult, VerifyResult } from "../types";

function getStripeInstance() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "Stripe Secret Key is not configured in STRIPE_SECRET_KEY environment variable.",
    );
  }
  return new Stripe(secretKey, {
    apiVersion: "2025-02-24.accredited" as any, // Using safe type casting to bypass strict compilation
  });
}

/** Stripe Checkout Session 생성. */
export async function createCheckoutSession(
  userId: string,
  packId: string,
): Promise<CheckoutResult> {
  const pack = getPack(packId);
  if (!pack) throw new Error("유효하지 않은 충전 패키지입니다.");

  const request = getRequest();
  if (!request) throw new Error("HTTP Request context is missing.");

  // 1. Cloudflare cf-ipcountry 헤더를 통해 국가 코드 자동 추적
  let countryCode = request.headers?.get("cf-ipcountry") || "US";

  // 2. DB에서 유저 프로필 조회하여 기존 country_code 확인
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("country_code")
    .eq("id", userId)
    .maybeSingle();

  if (profile?.country_code) {
    countryCode = profile.country_code;
  } else {
    // 프로필에 국가 정보가 없으면 추적된 국가 정보로 캐싱 업데이트
    await supabaseAdmin.from("profiles").update({ country_code: countryCode }).eq("id", userId);
  }

  // 3. 국가 코드 기반 통화 및 가격 동적 빌드
  const { unitAmount, currency } = getPriceAndCurrency(packId, countryCode);

  // 4. Stripe Checkout Session 발급
  const stripe = getStripeInstance();
  const origin = request.headers.get("origin") || "http://localhost:3000";

  const session = await stripe.checkout.sessions.create({
    line_items: [
      {
        price_data: {
          currency: currency,
          product_data: {
            name: `DuelNight - ${pack.name}`,
            description: `${pack.credits.toLocaleString()} Credits Recharge`,
          },
          unit_amount: unitAmount,
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    success_url: `${origin}/store?success=true&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/store`,
    customer_email: (await supabaseAdmin.auth.admin.getUserById(userId)).data.user?.email,
    metadata: {
      user_id: userId,
      pack_id: packId,
      amount: String(unitAmount),
      currency: currency,
    },
  });

  return { url: session.url };
}

/** Stripe 결제 사후 검증 후 크레딧 적립. */
export async function verifyPayment(userId: string, sessionId: string): Promise<VerifyResult> {
  try {
    const stripe = getStripeInstance();
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      throw new Error("결제가 완료되지 않았습니다.");
    }

    const packId = session.metadata?.pack_id;
    const amount = Number(session.metadata?.amount ?? "0");
    const currency = session.metadata?.currency ?? "usd";

    if (!packId || !getPack(packId)) {
      throw new Error("결제 세션 메타데이터에 잘못된 팩 ID가 지정되었습니다.");
    }

    if (session.metadata?.user_id !== userId) {
      throw new Error("결제 세션의 사용자가 현재 로그인된 사용자와 일치하지 않습니다.");
    }

    await grantCredits({
      userId,
      orderId: session.id,
      amount,
      currency,
      packId,
      externalRef: typeof session.payment_intent === "string" ? session.payment_intent : undefined,
      provider: "stripe",
    });

    return { success: true };
  } catch (error) {
    console.error("Stripe verification error:", error);
    return { success: false, error: (error as Error).message };
  }
}
