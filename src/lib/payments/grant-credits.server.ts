/**
 * 단일 멱등 크레딧 적립 — 모든 provider의 검증 결과(VerifiedPayment)가 여기로 수렴한다.
 *
 * (구 recordSuccessfulPayment를 provider 비종속으로 일반화)
 *
 * 멱등성: order_id(UNIQUE) 기준으로 이미 완료된 결제는 재적립하지 않는다.
 *
 * ⚠️ 알려진 한계(docs/PAYMENT_MOR_MIGRATION_PLAN.md §9 TODO):
 *  - 잔액 적립이 read-modify-write라 동시 결제 시 적립 유실 가능. 추후 원자적 RPC로 일원화 예정.
 */
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getPack } from "./credit-packs";
import type { VerifiedPayment } from "./types";

export async function grantCredits(payment: VerifiedPayment): Promise<void> {
  const pack = getPack(payment.packId);
  if (!pack) throw new Error("Invalid pack ID");

  const creditsToAdd = pack.credits;

  // 중복 결제 방지: 동일 order_id로 이미 완료된 결제가 있으면 적립하지 않는다.
  const { data: existingPayment, error: existingPaymentError } = await supabaseAdmin
    .from("payments")
    .select("id")
    .eq("order_id", payment.orderId)
    .eq("status", "completed")
    .maybeSingle();

  if (existingPaymentError) throw existingPaymentError;
  if (existingPayment) return;

  // 결제 내역 기록 (기준 KRW 금액으로 저장 — 글로벌 통계 호환)
  const { error: paymentError } = await supabaseAdmin.from("payments").upsert(
    {
      user_id: payment.userId,
      order_id: payment.orderId,
      imp_uid: payment.externalRef ?? null,
      amount: pack.amount,
      provider: payment.provider,
      status: "completed",
    },
    { onConflict: "order_id" },
  );

  if (paymentError) throw paymentError;

  // 현재 크레딧 잔액 조회
  const { data: creditRow, error: creditReadError } = await supabaseAdmin
    .from("user_credits")
    .select("balance")
    .eq("user_id", payment.userId)
    .maybeSingle();

  if (creditReadError) throw creditReadError;

  // 크레딧 가산
  const { error: creditWriteError } = await supabaseAdmin.from("user_credits").upsert({
    user_id: payment.userId,
    balance: (creditRow?.balance ?? 0) + creditsToAdd,
    updated_at: new Date().toISOString(),
  });

  if (creditWriteError) throw creditWriteError;
}
