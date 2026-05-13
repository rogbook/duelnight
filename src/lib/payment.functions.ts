import { createServerFn } from "@tanstack/start";
import { supabase } from "@/integrations/supabase/client";

/**
 * PortOne 결제 검증 서버 함수
 */
export const verifyPortOnePayment = createServerFn({ method: "POST" })
  .validator((d: { imp_uid: string; merchant_uid: string; amount: number; user_id: string }) => d)
  .handler(async ({ data }) => {
    const { imp_uid, merchant_uid, amount, user_id } = data;

    try {
      // 1. PortOne 토큰 발급
      const tokenRes = await fetch("https://api.iamport.kr/users/getToken", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imp_key: process.env.PORTONE_API_KEY,
          imp_secret: process.env.PORTONE_API_SECRET,
        }),
      });
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) throw new Error("Failed to get PortOne token");
      const { access_token } = tokenData.response;

      // 2. 결제 정보 조회
      const paymentRes = await fetch(`https://api.iamport.kr/payments/${imp_uid}`, {
        headers: { Authorization: access_token },
      });
      const paymentData = await paymentRes.json();
      if (!paymentRes.ok) throw new Error("Failed to get payment details");
      const payment = paymentData.response;

      // 3. 금액 검증 (클라이언트가 보낸 금액과 실제 결제 금액 비교)
      if (payment.amount !== amount) {
        throw new Error("Payment amount mismatch. Potential forgery detected.");
      }

      if (payment.status !== "paid") {
        throw new Error("Payment status is not 'paid'");
      }

      // 4. DB 업데이트 (RPC 호출)
      // 서버 환경이므로 service_role을 사용하거나 적절한 권한으로 호출
      const { error } = await supabase.rpc("process_successful_payment", {
        p_user_id: user_id,
        p_amount: amount,
        p_order_id: merchant_uid,
        p_provider: "portone",
        p_imp_uid: imp_uid,
      });

      if (error) throw error;

      return { success: true };
    } catch (error) {
      console.error("Payment verification failed:", error);
      return { success: false, error: (error as Error).message };
    }
  });

/**
 * PayPal 결제 검증 서버 함수 (구현 예정 - 현재는 로직 뼈대만 제공)
 */
export const verifyPayPalPayment = createServerFn({ method: "POST" })
  .validator((d: { order_id: string; amount: number; user_id: string }) => d)
  .handler(async ({ data }) => {
    // TODO: PayPal API를 통한 실결제 검증 로직 구현
    // 현재는 위변조 방지를 위해 일단 실패 처리하거나 관리자에게 알림
    return { success: false, error: "PayPal verification is not yet implemented on server." };
  });
