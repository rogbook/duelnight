/**
 * 덱 상세 페이지(/decks/$id) 렌더링 검증 스크립트.
 *
 * 사용법:
 *   bun scripts/verify-deck-detail.ts             # 공개 덱 자동 샘플링
 *   bun scripts/verify-deck-detail.ts <deckId>    # 특정 덱 강제 검증
 *
 * 검증 항목 (RecipeEditor / DeckDetailPage가 의존하는 실제 쿼리 그대로):
 *   1) decks 행이 SELECT 가능한가 (RLS 통과)
 *   2) deck_cards 가 SELECT 가능한가
 *   3) cards 메타가 in('code', codes) 로 모두 매칭되는가 (cardMap 정합성)
 *   4) 매칭된 카드의 image_url 결손율이 임계치 이내인가
 *   5) 원피스(optcg)일 경우 leader 카드 조회가 성공하는가
 *
 * 종료 코드: 실패 시 1 → CI에서 그대로 사용 가능.
 */
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
const SUPABASE_KEY =
  process.env.VITE_SUPABASE_PUBLISHABLE_KEY ?? process.env.SUPABASE_PUBLISHABLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error("✖ SUPABASE_URL / SUPABASE_PUBLISHABLE_KEY 환경변수가 필요합니다.");
  process.exit(2);
}

const IMAGE_MISSING_THRESHOLD = 0.5; // 매칭된 카드 중 이미지 결손이 50% 초과면 실패

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

type Result = { ok: boolean; label: string; detail?: string };
const results: Result[] = [];
const check = (ok: boolean, label: string, detail?: string) => {
  results.push({ ok, label, detail });
  console.log(`${ok ? "✓" : "✖"} ${label}${detail ? ` — ${detail}` : ""}`);
};

async function pickDeckId(): Promise<string | null> {
  const arg = process.argv[2];
  if (arg) return arg;
  const { data, error } = await supabase
    .from("decks")
    .select("id")
    .eq("is_public", true)
    .order("updated_at", { ascending: false })
    .limit(1);
  if (error) {
    console.error("덱 샘플링 실패:", error.message);
    return null;
  }
  return data?.[0]?.id ?? null;
}

async function run() {
  const deckId = await pickDeckId();
  if (!deckId) {
    console.error(
      "✖ 검증할 덱이 없습니다. 공개 덱이 1개 이상 필요하거나 인자로 deckId를 넘기세요.",
    );
    process.exit(2);
  }
  console.log(`\n▶ 검증 대상 deckId = ${deckId}\n`);

  // 1) 덱 본체
  const { data: deck, error: deckErr } = await supabase
    .from("decks")
    .select("*")
    .eq("id", deckId)
    .maybeSingle();
  check(
    !deckErr && !!deck,
    "decks SELECT (RLS 통과)",
    deckErr?.message ?? (deck ? `name="${deck.name}" game=${deck.game}` : "행 없음"),
  );
  if (!deck) return finish();

  // 2) 덱 카드
  const { data: deckCards, error: dcErr } = await supabase
    .from("deck_cards")
    .select("*")
    .eq("deck_id", deckId);
  check(
    !dcErr && Array.isArray(deckCards),
    "deck_cards SELECT",
    dcErr?.message ?? `${deckCards?.length ?? 0}개 행`,
  );
  if (!deckCards) return finish();

  if (deckCards.length === 0) {
    check(true, "(빈 덱) 추가 검증 생략", "deck_cards가 0개 — 빈 상태 화면이 정상 노출되어야 함");
    return finish();
  }

  // 3) 카드 메타 매칭 (cardMap 정합성)
  const codes = [...new Set(deckCards.map((c) => c.card_code))];
  const { data: cards, error: cardErr } = await supabase
    .from("cards")
    .select("code, name, image_url")
    .in("code", codes);
  check(
    !cardErr,
    "cards.in(code, ...) SELECT",
    cardErr?.message ?? `${cards?.length ?? 0}/${codes.length} 매칭`,
  );
  const matched = new Set((cards ?? []).map((c) => c.code));
  const missingCodes = codes.filter((c) => !matched.has(c));
  check(
    missingCodes.length === 0,
    "모든 deck_cards.card_code 가 cards 테이블에 존재",
    missingCodes.length
      ? `누락 ${missingCodes.length}개: ${missingCodes.slice(0, 5).join(", ")}${missingCodes.length > 5 ? " …" : ""}`
      : "OK",
  );

  // 4) 이미지 결손율
  const withImage = (cards ?? []).filter((c) => !!c.image_url).length;
  const ratio = (cards?.length ?? 0) === 0 ? 0 : 1 - withImage / (cards?.length ?? 1);
  check(
    ratio <= IMAGE_MISSING_THRESHOLD,
    `image_url 결손율 ≤ ${(IMAGE_MISSING_THRESHOLD * 100).toFixed(0)}%`,
    `${withImage}/${cards?.length ?? 0} 보유 (결손 ${(ratio * 100).toFixed(1)}%)`,
  );

  // 5) 원피스 리더
  if (deck.game === "optcg" && deck.leader) {
    const { data: leader, error: leaderErr } = await supabase
      .from("cards")
      .select("code, name, image_url")
      .eq("game", "optcg")
      .eq("name", deck.leader)
      .eq("type", "leader")
      .limit(1)
      .maybeSingle();
    check(
      !leaderErr && !!leader,
      `optcg leader 카드 조회 ("${deck.leader}")`,
      leaderErr?.message ?? (leader ? `code=${leader.code}` : "리더 카드 없음"),
    );
  }

  return finish();
}

function finish() {
  const failed = results.filter((r) => !r.ok);
  console.log(`\n결과: ${results.length - failed.length} 통과 / ${failed.length} 실패`);
  if (failed.length) {
    console.log("\n실패 항목:");
    for (const f of failed) console.log(`  ✖ ${f.label}${f.detail ? ` — ${f.detail}` : ""}`);
    process.exit(1);
  }
  console.log("\n✅ 덱 상세 렌더링 데이터 파이프라인 정상");
}

run().catch((e) => {
  console.error("스크립트 오류:", e);
  process.exit(2);
});
