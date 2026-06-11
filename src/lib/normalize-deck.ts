// Normalize deck / leader names so typos, spacing and synonyms collapse into
// a single canonical entry for stats grouping.

import type { Database } from "@/integrations/supabase/types";

export type Game = string;

// Canonical display name -> list of aliases (case/space-insensitive match).
// Aliases include Korean, English, romanizations, and common typos.
const SYNONYMS: Record<Game, Array<{ canonical: string; aliases: string[] }>> = {
  optcg: [
    {
      canonical: "적 루피",
      aliases: ["적루피", "빨강루피", "빨간루피", "red luffy", "redluffy", "루피적", "r루피"],
    },
    { canonical: "흑 루피", aliases: ["흑루피", "검은루피", "black luffy", "blackluffy"] },
    { canonical: "황 루피", aliases: ["황루피", "노랑루피", "yellow luffy"] },
    { canonical: "녹 조로", aliases: ["녹조로", "초록조로", "green zoro", "조로녹"] },
    { canonical: "검은수염", aliases: ["검수", "흑수염", "blackbeard", "티치"] },
    { canonical: "흰수염", aliases: ["흰수", "백수염", "whitebeard", "뉴게이트"] },
    { canonical: "에넬", aliases: ["enel", "에네루"] },
    { canonical: "도플라밍고", aliases: ["도플", "doflamingo", "두플라밍고"] },
    { canonical: "샹크스", aliases: ["shanks", "적발 샹크스"] },
    { canonical: "카이도", aliases: ["kaido"] },
    { canonical: "빅맘", aliases: ["bigmom", "big mom", "샬롯 링링"] },
    { canonical: "에이스", aliases: ["ace", "포트거스 d 에이스"] },
    { canonical: "사보", aliases: ["sabo"] },
    { canonical: "로", aliases: ["law", "트라팔가 로", "트라팔가로"] },
    { canonical: "키드", aliases: ["kid", "유스타스 키드"] },
    { canonical: "보아 행콕", aliases: ["행콕", "boa hancock", "hancock"] },
  ],
  ptcg: [
    { canonical: "리자몽 ex", aliases: ["리자몽ex", "리자몽 EX", "charizard ex", "charizardex"] },
    { canonical: "미라이돈 ex", aliases: ["미라이돈ex", "miraidon ex", "miraidonex"] },
    { canonical: "코라이돈 ex", aliases: ["코라이돈ex", "koraidon ex", "koraidonex"] },
    { canonical: "기라티나 VSTAR", aliases: ["기라티나vstar", "giratina vstar", "기라vstar"] },
    { canonical: "로스트 박스", aliases: ["로스트박스", "lost box", "lostbox"] },
    {
      canonical: "팔데아 케천 ex",
      aliases: ["팔데아케천", "팔데아 케천", "armarouge ex", "팔데아 케천ex"],
    },
    { canonical: "테라파고스 ex", aliases: ["테라파고스ex", "terapagos ex", "terapagosex"] },
    { canonical: "이상해꽃 ex", aliases: ["이상해꽃ex", "venusaur ex"] },
    { canonical: "거북왕 ex", aliases: ["거북왕ex", "blastoise ex"] },
  ],
  dtcg: [
    { canonical: "오메가몬", aliases: ["omegamon", "오메가", "omnimon"] },
    { canonical: "임페리얼드라몬", aliases: ["임페리얼", "imperialdramon"] },
    { canonical: "워그레이몬", aliases: ["wargreymon", "워그", "metalgreymon"] },
    { canonical: "메탈가루몬", aliases: ["metalgarurumon", "메탈가루"] },
    { canonical: "아구몬", aliases: ["agumon"] },
    { canonical: "가브몬", aliases: ["gabumon"] },
    { canonical: "베리얼반체몬", aliases: ["beelzemon", "베리얼반체"] },
    { canonical: "마그나몬", aliases: ["magnamon"] },
  ],
};

// Collapse whitespace, NFKC, lowercase, strip non-alphanumeric/CJK characters
// for a forgiving comparison key. Korean syllables (가-힣) are preserved.
const stripKey = (s: string): string =>
  s
    .normalize("NFKC")
    .toLowerCase()
    .replace(/[\s\u3000]+/g, "")
    .replace(/[^\p{L}\p{N}가-힣]+/gu, "");

// Compact form for display: collapse internal whitespace, trim ends.
const tidyDisplay = (s: string): string =>
  s
    .normalize("NFKC")
    .replace(/[\s\u3000]+/g, " ")
    .trim();

const aliasIndex = new Map<Game, Map<string, string>>();
for (const game of Object.keys(SYNONYMS) as Game[]) {
  const m = new Map<string, string>();
  for (const { canonical, aliases } of SYNONYMS[game]) {
    m.set(stripKey(canonical), canonical);
    for (const a of aliases) m.set(stripKey(a), canonical);
  }
  aliasIndex.set(game, m);
}

/** Returns the canonical display name for a deck/leader within a game. */
export function normalizeDeckName(raw: string | null | undefined, game: Game): string {
  const tidied = tidyDisplay(raw ?? "");
  if (!tidied) return "";
  const key = stripKey(tidied);
  const hit = aliasIndex.get(game)?.get(key);
  return hit ?? tidied;
}

/** Stable grouping key: normalize then strip — collapses spacing/casing
 *  variants of the same canonical name into one bucket. */
export function deckKey(raw: string | null | undefined, game: Game): string {
  const canonical = normalizeDeckName(raw, game);
  return stripKey(canonical);
}
