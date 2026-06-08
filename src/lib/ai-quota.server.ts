/**
 * AI 사용 할당량 체크 / 소진 헬퍼.
 * - check_free_quota → Pro 무제한 / 무료 한도 (OCR 5/일, Coach 3/월)
 * - 한도 소진 시 user_credits 잔액으로 대체 (OCR 5C, Coach 10C)
 * - 사용 후 ai_usage 로그 기록 (free_quota / pro / credits)
 *
 * 이 모듈은 서버 라우트에서만 사용합니다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const AI_COST = {
  ocr: 5,
  coach: 5,
} as const;

export type AiFeature = keyof typeof AI_COST;

export type QuotaResult =
  | { ok: true; userId: string; source: "free_quota" | "pro" | "credits" | "unlimited" }
  | { ok: false; status: 401 | 402; error: string };

/**
 * 무제한 사용자 여부.
 * - 관리자(app_role 'admin') 또는
 * - 특별 지정 허용목록(ai_unlimited 테이블)에 등록된 사용자
 * 둘 중 하나면 한도·크레딧 검사 없이 AI 무제한.
 * (ai_unlimited 테이블이 아직 없으면 조용히 무시 → 관리자만 무제한)
 */
async function isUnlimitedUser(supabase: SupabaseClient, userId: string): Promise<boolean> {
  try {
    const { data: isAdmin } = await supabase.rpc("has_role", { _role: "admin", _user_id: userId });
    if (isAdmin === true) return true;
  } catch (e) {
    console.error("has_role check failed", e);
  }
  try {
    const { data } = await (supabase as any)
      .from("ai_unlimited")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (data) return true;
  } catch {
    // 테이블 미생성 등 → 무제한 아님으로 처리
  }
  return false;
}

/**
 * AI 호출 전에 1회 호출.
 * - 401: 인증 실패
 * - 402: 무료 한도 초과 + 크레딧 부족
 * - ok=true: AI 호출 진행 가능 (호출 성공 시 commitAiUsage 호출)
 */
export async function checkAiQuota(
  supabase: SupabaseClient,
  feature: AiFeature,
): Promise<QuotaResult> {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) {
    return { ok: false, status: 401, error: "로그인이 필요합니다." };
  }
  const userId = userData.user.id;

  // 관리자 / 특별 지정 사용자는 한도·크레딧 없이 무제한
  if (await isUnlimitedUser(supabase, userId)) {
    return { ok: true, userId, source: "unlimited" };
  }

  const { data: q, error: qErr } = await supabase.rpc("check_free_quota", {
    _user_id: userId,
    _feature: feature,
  });
  if (qErr) {
    console.error("check_free_quota error", qErr);
    return { ok: false, status: 402, error: "할당량 확인 실패" };
  }

  const allowed = (q as { allowed?: boolean } | null)?.allowed === true;
  const source = (q as { source?: string } | null)?.source;

  if (allowed && (source === "pro" || source === "free_quota")) {
    return { ok: true, userId, source };
  }

  // 크레딧 잔액 확인
  const cost = AI_COST[feature];
  const { data: credit } = await supabase
    .from("user_credits")
    .select("balance")
    .eq("user_id", userId)
    .maybeSingle();
  const balance = credit?.balance ?? 0;
  if (balance < cost) {
    return {
      ok: false,
      status: 402,
      error:
        feature === "ocr"
          ? "무료 OCR 한도(5회/일)를 모두 사용했고 크레딧이 부족합니다."
          : "무료 코치 한도(3회/월)를 모두 사용했고 크레딧이 부족합니다.",
    };
  }
  return { ok: true, userId, source: "credits" };
}

/**
 * AI 호출 성공 후 1회 호출. 실패해도 사용자 응답에 영향 주지 않음(로그만 남김).
 */
export async function commitAiUsage(
  supabase: SupabaseClient,
  userId: string,
  feature: AiFeature,
  source: "free_quota" | "pro" | "credits" | "unlimited",
): Promise<void> {
  try {
    if (source === "credits") {
      const { error } = await supabase.rpc("consume_credits", {
        _user_id: userId,
        _amount: AI_COST[feature],
        _feature: feature,
      });
      if (error) console.error("consume_credits error", error);
    } else {
      const { error } = await supabase.rpc("log_ai_usage", {
        _user_id: userId,
        _feature: feature,
        _source: source,
      });
      if (error) console.error("log_ai_usage error", error);
    }
  } catch (e) {
    console.error("commitAiUsage failed", e);
  }
}
