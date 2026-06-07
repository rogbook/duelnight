import type { Database } from "@/integrations/supabase/types";

export type Game = string;

export type CardTypeOption = { id: string; label: string };

export const CARD_TYPES_BY_GAME: Record<Game, CardTypeOption[]> = {
  optcg: [
    { id: "leader",    label: "리더" },
    { id: "character", label: "캐릭터" },
    { id: "event",     label: "이벤트" },
    { id: "stage",     label: "스테이지" },
  ],
  dtcg: [
    { id: "digitama",  label: "디지타마" },
    { id: "digimon",   label: "디지몬" },
    { id: "option",    label: "옵션" },
    { id: "tamer",     label: "테이머" },
  ],
  ptcg: [
    { id: "pokemon",   label: "포켓몬" },
    { id: "trainer",   label: "트레이너스" },
    { id: "energy",    label: "에너지" },
    { id: "ace",       label: "ACE SPEC" },
  ],
};

export const DIGIMON_LEVELS = ["-", "2", "3", "4", "5", "6", "7"];

export const DECK_MAX_TOTAL: Record<Game, number> = {
  optcg: 50,
  dtcg:  50,
  ptcg:  60,
};

export const DECK_MAX_COPIES: Record<Game, number> = {
  optcg: 4,
  dtcg:  4,
  ptcg:  4,
};

/** 금지/제한 카드 코드 목록 (향후 DB로 이관 예정) */
export const BAN_LIST: Set<string> = new Set([
  // 예: "OP01-001"
]);

export type AddCardCheck = { ok: true } | { ok: false; reason: string };

export function checkCanAdd(params: {
  game: Game;
  cardCode: string;
  cardType: string | null;
  rarity: string | null;
  name: string;
  currentQtyOfCode: number;
  totalCardsInDeck: number;
  digitamaCountInDeck: number;
  hasAceInDeck: boolean;
}): AddCardCheck {
  const { game, cardCode, cardType, rarity, name, currentQtyOfCode, totalCardsInDeck, digitamaCountInDeck, hasAceInDeck } = params;

  // 금지 리스트 체크
  if (BAN_LIST.has(cardCode)) {
    return { ok: false, reason: "해당 카드는 금지/제한 리스트에 영향을 받는 카드입니다." };
  }

  const type = cardType?.toLowerCase() ?? "";
  const isAce = type === "ace" || rarity?.toUpperCase() === "ACE";

  // 타입별 최대 개수
  let maxCopies = DECK_MAX_COPIES[game];

  // 예외 처리: 포켓몬 기본 에너지는 무제한
  if (game === "ptcg" && type === "energy" && !name.includes("특수")) {
    maxCopies = Infinity;
  }
  
  // 리더는 1장
  if (game === "optcg" && type === "leader") maxCopies = 1;

  if (currentQtyOfCode >= maxCopies) {
    if (!isFinite(maxCopies)) return { ok: true }; // 무제한
    return { ok: false, reason: `같은 카드는 최대 ${maxCopies}장까지 투입 가능합니다.` };
  }

  // ACE SPEC 체크
  if (game === "ptcg" && isAce && hasAceInDeck) {
    return { ok: false, reason: "ACE SPEC 카드는 덱에 1장만 투입 가능합니다." };
  }

  // DTCG 디지타마 최대 5장
  if (game === "dtcg" && type === "digitama" && digitamaCountInDeck >= 5) {
    return { ok: false, reason: "디지타마 카드는 최대 5장까지 투입 가능합니다." };
  }

  // 총 장수 초과
  const maxTotal = DECK_MAX_TOTAL[game];
  if (totalCardsInDeck >= maxTotal) {
    return { ok: false, reason: `덱은 최대 ${maxTotal}장까지 구성할 수 있습니다.` };
  }

  return { ok: true };
}
