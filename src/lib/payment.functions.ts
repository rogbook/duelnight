import { createServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

/**
 * PortOne 결제 검증 서버 함수
 */
export const verifyPortOnePayment = createServerFn({ method: "POST" })
  .inputValidator((d: { imp_uid: string; merchant_uid: string; amount: number }) => d)
  .handler(async ({ data }) => {
    const { imp_uid, merchant_uid, amount } = data;

    try {
      // 1. 서버 측 인증 확인 (클라이언트가 보낸 ID가 아닌 실제 세션 정보 사용)
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        throw new Error("인증되지 않은 사용자입니다.");
      }

      // 2. PortOne 토큰 발급
      const tokenRes = await fetch("https://api.iamport.kr/users/getToken", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          imp_key: process.env.PORTONE_API_KEY,
          imp_secret: process.env.PORTONE_API_SECRET,
        }),
      });
      
      const tokenData = await tokenRes.json();
      if (!tokenRes.ok) throw new Error("PortOne 토큰 발급 실패");
      const { access_token } = tokenData.response;

      // 3. 결제 정보 조회
      const paymentRes = await fetch(`https://api.iamport.kr/payments/${imp_uid}`, {
        headers: { Authorization: access_token },
      });
      const paymentData = await paymentRes.json();
      if (!paymentRes.ok) throw new Error("결제 정보 조회 실패");
      const payment = paymentData.response;

      // 4. 검증 (금액 비교 및 상태 확인)
      if (payment.amount !== amount) {
        throw new Error("결제 금액 위변조가 의심됩니다.");
      }

      if (payment.status !== "paid") {
        throw new Error(`결제가 완료되지 않았습니다. (상태: ${payment.status})`);
      }

      // 5. DB 업데이트 (인증된 user.id 사용)
      const { error } = await supabase.rpc("process_successful_payment", {
        p_user_id: user.id,
        p_amount: amount,
        p_order_id: merchant_uid,
        p_provider: "portone",
        p_imp_uid: imp_uid,
      });

      if (error) throw error;

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
  .inputValidator((d: { order_id: string; amount: number }) => d)
  .handler(async ({ data }) => {
    // TODO: PayPal API 연동 실구현 필요
    return { success: false, error: "PayPal 서버 검증이 아직 구현되지 않았습니다." };
  });
