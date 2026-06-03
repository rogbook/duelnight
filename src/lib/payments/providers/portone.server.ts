/**
 * PortOne(국내 직접 PG) provider 로직. 사업자등록 후 활성화(Phase 3).
 *
 * 서버 함수(createServerFn) 래퍼는 src/lib/payment.functions.ts에 있다.
 */
import { getPack } from "../credit-packs";
import { grantCredits } from "../grant-credits.server";
import type { VerifyResult } from "../types";

interface PortOneVerifyInput {
  userId: string;
  imp_uid: string;
  merchant_uid: string;
  packId: string;
}

/** PortOne 결제 사후 검증 후 크레딧 적립. */
export async function verifyPayment(input: PortOneVerifyInput): Promise<VerifyResult> {
  const { userId, imp_uid, merchant_uid, packId } = input;

  try {
    // 0. packId를 신뢰하지 않고 서버에서 기준 가격을 산출한다.
    //    (클라이언트가 보낸 amount는 검증에 사용하지 않는다 — 위변조 가능)
    const pack = getPack(packId);
    if (!pack) throw new Error("유효하지 않은 충전 패키지입니다.");
    const expectedAmount = pack.amount; // PortOne(국내)은 KRW 기준가 = pack.amount

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
    if (!tokenRes.ok) throw new Error("PortOne 인증 토큰 획득 실패");
    const { access_token } = tokenData.response;

    // 2. 결제 데이터 상세 조회
    const paymentRes = await fetch(`https://api.iamport.kr/payments/${imp_uid}`, {
      headers: { Authorization: access_token },
    });
    const paymentData = await paymentRes.json();
    if (!paymentRes.ok) throw new Error("결제 내역 조회 실패");
    const payment = paymentData.response;

    // 3. 주문 번호 일치 검증 (다른 결제의 imp_uid 재사용 차단)
    if (payment.merchant_uid !== merchant_uid) {
      throw new Error("주문 번호가 결제 내역과 일치하지 않습니다.");
    }

    // 4. 금액 위변조 검증 — 실제 결제액을 "패키지 기준가"와 비교한다.
    //    클라이언트가 보낸 amount가 아니라 packId로 산출한 expectedAmount를 기준으로 한다.
    if (payment.amount !== expectedAmount) {
      throw new Error("결제 금액이 상품 가격과 일치하지 않습니다.");
    }

    if (payment.status !== "paid") {
      throw new Error("결제 상태가 완료(paid)가 아닙니다.");
    }

    // 5. 공용 비즈니스 로직을 통한 안전 가산 처리
    await grantCredits({
      userId,
      orderId: merchant_uid,
      amount: expectedAmount,
      currency: "krw",
      packId,
      externalRef: imp_uid,
      provider: "portone",
    });

    return { success: true };
  } catch (error) {
    console.error("PortOne verification error:", error);
    return { success: false, error: (error as Error).message };
  }
}
