import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const CREDIT_PACK_AMOUNTS = new Set([10000, 45000, 85000]);

function assertValidCreditPackAmount(amount: number) {
  if (!Number.isFinite(amount) || !CREDIT_PACK_AMOUNTS.has(amount)) {
    throw new Error("유효하지 않은 결제 금액입니다.");
  }
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

/** PortOne 결제 검증 서버 함수 */
export const verifyPortOnePayment = createServerFn({ method: "POST" })
  .inputValidator((d: { imp_uid: string; merchant_uid: string; amount: number }) => d)
  .handler(async ({ data }) => {
    const { imp_uid, merchant_uid, amount } = data;
    const userId = await getAuthenticatedUserId();

    try {
      assertValidCreditPackAmount(amount);

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

      const paymentRes = await fetch(`https://api.iamport.kr/payments/${imp_uid}`, {
        headers: { Authorization: access_token },
      });
      const paymentData = await paymentRes.json();
      if (!paymentRes.ok) throw new Error("결제 정보 조회 실패");
      const payment = paymentData.response;

      if (payment.amount !== amount) {
        throw new Error("결제 금액 위변조가 의심됩니다.");
      }

      if (payment.status !== "paid") {
        throw new Error(`결제가 완료되지 않았습니다. (상태: ${payment.status})`);
      }

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

/** PayPal 결제 검증 서버 함수 */
export const verifyPayPalPayment = createServerFn({ method: "POST" })
  .handler(async ({ data }) => {
    const { order_id, amount } = data as { order_id: string; amount: number };
    const userId = await getAuthenticatedUserId();

    try {
      assertValidCreditPackAmount(amount);

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

      const orderRes = await fetch(`https://api-m.sandbox.paypal.com/v2/checkout/orders/${order_id}`, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });
      const orderData = await orderRes.json();

      if (orderData.status !== "COMPLETED") {
        throw new Error(`PayPal 주문이 완료되지 않았습니다. (상태: ${orderData.status})`);
      }

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
