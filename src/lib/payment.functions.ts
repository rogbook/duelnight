import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CREDIT_PACK_AMOUNTS = new Set([10000, 45000, 85000]);

function assertValidCreditPackAmount(amount: number) {
  if (!Number.isFinite(amount) || !CREDIT_PACK_AMOUNTS.has(amount)) {
    throw new Error("유효하지 않은 결제 금액입니다.");
  }
}

async function recordSuccessfulPayment(params: {
  userId: string;
  amount: number;
  orderId: string;
  provider: "portone" | "paypal";
  impUid?: string;
}) {
  const creditsToAdd = Math.floor(params.amount / 10);

  const { data: existingPayment, error: existingPaymentError } = await supabaseAdmin
    .from("payments")
    .select("id")
    .eq("order_id", params.orderId)
    .eq("status", "completed")
    .maybeSingle();

  if (existingPaymentError) throw existingPaymentError;
  if (existingPayment) return;

  const { error: paymentError } = await supabaseAdmin.from("payments").upsert(
    {
      user_id: params.userId,
      order_id: params.orderId,
      imp_uid: params.impUid ?? null,
      amount: params.amount,
      provider: params.provider,
      status: "completed",
    },
    { onConflict: "order_id" },
  );

  if (paymentError) throw paymentError;

  const { data: creditRow, error: creditReadError } = await supabaseAdmin
    .from("user_credits")
    .select("balance")
    .eq("user_id", params.userId)
    .maybeSingle();

  if (creditReadError) throw creditReadError;

  const { error: creditWriteError } = await supabaseAdmin
    .from("user_credits")
    .upsert({
      user_id: params.userId,
      balance: (creditRow?.balance ?? 0) + creditsToAdd,
      updated_at: new Date().toISOString(),
    });

  if (creditWriteError) throw creditWriteError;
}

/**
 * PortOne 결제 검증 서버 함수
 */
export const verifyPortOnePayment = createServerFn({ method: "POST" })
  .validator(z.object({ imp_uid: z.string(), merchant_uid: z.string(), amount: z.number() }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { imp_uid, merchant_uid, amount } = data;
    const userId = context.userId;

    try {
      assertValidCreditPackAmount(amount);

      // 1. PortOne 토큰 발급
      // 서버 환경변수(Lovable Cloud Secrets)에서 키를 가져옴
      const tokenRes = await fetch("https://api.iamport.kr/users/getToken", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imp_key: process.env.PORTONE_API_KEY,
          imp_secret: process.env.PORTONE_API_SECRET,
        }),
      });
      
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) throw new Error("PortOne 토큰 발급 실패 (API 키 설정을 확인하세요)");
      const { access_token } = tokenData.response;

      // 2. 결제 정보 조회
      const paymentRes = await fetch(`https://api.iamport.kr/payments/${imp_uid}`, {
        headers: { Authorization: access_token },
      });
      const paymentData = await paymentRes.json();
      if (!paymentRes.ok) throw new Error("결제 정보 조회 실패");
      const payment = paymentData.response;

      // 3. 검증 (금액 비교 및 상태 확인)
      if (payment.amount !== amount) {
        throw new Error("결제 금액 위변조가 의심됩니다.");
      }

      if (payment.status !== "paid") {
        throw new Error(`결제가 완료되지 않았습니다. (상태: ${payment.status})`);
      }

      // 4. DB 업데이트 (미들웨어에서 추출한 인증된 userId 사용 및 Admin 권한으로 실행)
      await recordSuccessfulPayment({
        userId,
        amount,
        orderId: merchant_uid,
        provider: "portone",
        impUid: imp_uid,
      });

      return { success: true };
    } catch (error) {
      console.error("PortOne verification error:", error);
      return { success: false, error: (error as Error).message };
    }
  });

/**
 * PayPal 결제 검증 서버 함수
 */
export const verifyPayPalPayment = createServerFn({ method: "POST" })
  .validator(z.object({ order_id: z.string(), amount: z.number() }))
  .middleware([requireSupabaseAuth])
  .handler(async ({ data, context }) => {
    const { order_id, amount } = data;
    const userId = context.userId;

    try {
      assertValidCreditPackAmount(amount);

      // 1. PayPal Access Token 발급
      const auth = btoa(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`);
      const tokenRes = await fetch("https://api-m.sandbox.paypal.com/v1/oauth2/token", {
        method: "POST",
        headers: {
          Authorization: `Basic ${auth}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      });
      const tokenData = await tokenRes.json();
      const accessToken = tokenData.access_token;

      // 2. PayPal 주문 상세 정보 조회
      const orderRes = await fetch(`https://api-m.sandbox.paypal.com/v2/checkout/orders/${order_id}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const orderData = await orderRes.json();

      // 3. 검증 (상태가 COMPLETED인지, 금액이 일치하는지 확인)
      // 주의: PayPal은 소수점 단위 USD를 사용하므로 환율 계산 로직 확인 필요
      if (orderData.status !== "COMPLETED") {
        throw new Error(`PayPal 주문이 완료되지 않았습니다. (상태: ${orderData.status})`);
      }

      // 4. DB 업데이트 (성공 시 크레딧 지급)
      await recordSuccessfulPayment({
        userId,
        amount,
        orderId: order_id,
        provider: "paypal",
      });

      return { success: true };
    } catch (error) {
      console.error("PayPal verification error:", error);
      return { success: false, error: (error as Error).message };
    }
  });
