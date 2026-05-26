import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import Stripe from "stripe";

interface CreditPack {
  amount: number; // Base KRW KRW amount (10000, 45000, 85000)
  credits: number; // Final credits including bonuses
  name: string;
}

const CREDIT_PACKS: Record<string, CreditPack> = {
  "credits-small": { amount: 10000, credits: 1000, name: "1,000 Credits" },
  "credits-medium": { amount: 45000, credits: 5000, name: "5,000 Credits" }, // 4,500 + 500 Bonus
  "credits-large": { amount: 85000, credits: 10000, name: "10,000 Credits" }, // 8,500 + 1,500 Bonus
};

function getStripeInstance() {
  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Stripe Secret Key is not configured in STRIPE_SECRET_KEY environment variable.");
  }
  return new Stripe(secretKey, {
    apiVersion: "2025-02-24.accredited" as any, // Using safe type casting to bypass strict compilation
  });
}

/** 서버 사이드에서 인증된 사용자 ID를 가져오는 헬퍼 */
async function getAuthenticatedUserId() {
  const request = getRequest();
  const authHeader = request?.headers?.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized");
  
  const token = authHeader.replace("Bearer ", "");
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!
  );
  
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Error("Unauthorized");
  return data.user.id;
}

// 국가 기반 통화 및 세부 가격 결정 헬퍼
function getPriceAndCurrency(packId: string, countryCode: string) {
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
    // Stripe는 소수점이 있는 통화(USD, EUR 등)는 센트 단위(Integer)로 넘겨주어야 합니다.
    const usdValue = Math.floor(pack.amount / 1000);
    return {
      unitAmount: usdValue * 100, // 1000센트 = $10.00
      currency: "usd",
    };
  }
}

async function recordSuccessfulPayment(params: {
  userId: string;
  orderId: string; // Stripe Session ID
  amount: number; // Local price
  currency: string;
  packId: string;
  paymentIntentId?: string;
}) {
  const pack = CREDIT_PACKS[params.packId];
  if (!pack) throw new Error("Invalid pack ID");

  const creditsToAdd = pack.credits;

  // Prevent double charging
  const { data: existingPayment, error: existingPaymentError } = await supabaseAdmin
    .from("payments")
    .select("id")
    .eq("order_id", params.orderId)
    .eq("status", "completed")
    .maybeSingle();

  if (existingPaymentError) throw existingPaymentError;
  if (existingPayment) return;

  // Record payment history
  const { error: paymentError } = await supabaseAdmin.from("payments").upsert(
    {
      user_id: params.userId,
      order_id: params.orderId,
      imp_uid: params.paymentIntentId ?? null, // Save Stripe Payment Intent ID here
      amount: pack.amount, // Save as base KRW amount for global stats compatibility
      provider: "stripe",
      status: "completed",
    },
    { onConflict: "order_id" },
  );

  if (paymentError) throw paymentError;

  // Fetch current user credits balance
  const { data: creditRow, error: creditReadError } = await supabaseAdmin
    .from("user_credits")
    .select("balance")
    .eq("user_id", params.userId)
    .maybeSingle();

  if (creditReadError) throw creditReadError;

  // Add credits balance
  const { error: creditWriteError } = await supabaseAdmin
    .from("user_credits")
    .upsert({
      user_id: params.userId,
      balance: (creditRow?.balance ?? 0) + creditsToAdd,
      updated_at: new Date().toISOString(),
    });

  if (creditWriteError) throw creditWriteError;
}

/** Stripe Checkout Session 생성 서버 함수 */
export const createStripeCheckoutSession = createServerFn({ method: "POST" })
  .inputValidator((d: { packId: string }) => d)
  .handler(async ({ data }) => {
    const { packId } = data;
    const userId = await getAuthenticatedUserId();
    const pack = CREDIT_PACKS[packId];
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
      await supabaseAdmin
        .from("profiles")
        .update({ country_code: countryCode })
        .eq("id", userId);
    }

    // 3. 국가 코드 기반 통화 및 가격 동적 빌드
    const { unitAmount, currency } = getPriceAndCurrency(packId, countryCode);

    // 4. Stripe Checkout Session 발급
    const stripe = getStripeInstance();
    const origin = request.headers.get("origin") || "http://localhost:3000";

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
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
  });

/** Stripe 결제 사후 검증 서버 함수 */
export const verifyStripePayment = createServerFn({ method: "POST" })
  .inputValidator((d: { session_id: string }) => d)
  .handler(async ({ data }) => {
    const { session_id } = data;
    const userId = await getAuthenticatedUserId();

    try {
      const stripe = getStripeInstance();
      const session = await stripe.checkout.sessions.retrieve(session_id);

      if (session.payment_status !== "paid") {
        throw new Error("결제가 완료되지 않았습니다.");
      }

      const packId = session.metadata?.pack_id;
      const amount = Number(session.metadata?.amount ?? "0");
      const currency = session.metadata?.currency ?? "usd";

      if (!packId || !CREDIT_PACKS[packId]) {
        throw new Error("결제 세션 메타데이터에 잘못된 팩 ID가 지정되었습니다.");
      }

      if (session.metadata?.user_id !== userId) {
        throw new Error("결제 세션의 사용자가 현재 로그인된 사용자와 일치하지 않습니다.");
      }

      await recordSuccessfulPayment({
        userId,
        orderId: session.id,
        amount,
        currency,
        packId,
        paymentIntentId: typeof session.payment_intent === "string" ? session.payment_intent : undefined,
      });

      return { success: true };
    } catch (error) {
      console.error("Stripe verification error:", error);
      return { success: false, error: (error as Error).message };
    }
  });
