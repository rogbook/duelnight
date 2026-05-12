import type { Tables } from "@/integrations/supabase/types";
import { normalizeDeckName, deckKey } from "@/lib/normalize-deck";

export type Match = Tables<"matches">;

export interface RatePack {
  wins: number;
  losses: number;
  draws: number;
  total: number;
  winRate: number; // 0..1, draws excluded from denominator
}

const empty = (): RatePack => ({
  wins: 0,
  losses: 0,
  draws: 0,
  total: 0,
  winRate: 0,
});

const tally = (rows: Match[]): RatePack => {
  const r = empty();
  for (const m of rows) {
    r.total++;
    if (m.result === "win") r.wins++;
    else if (m.result === "loss") r.losses++;
    else r.draws++;
  }
  const decided = r.wins + r.losses;
  r.winRate = decided === 0 ? 0 : r.wins / decided;
  return r;
};

export interface MatchStats {
  overall: RatePack;
  first: RatePack;
  second: RatePack;
  byDeck: Array<{ deck: string; stats: RatePack }>;
  matchups: Array<{
    deck: string;
    opponent: string;
    stats: RatePack;
  }>;
  recent: Match[];
}

export function computeStats(rows: Match[]): MatchStats {
  const overall = tally(rows);
  const first = tally(rows.filter((m) => m.went_first));
  const second = tally(rows.filter((m) => !m.went_first));

  const deckMap = new Map<string, { label: string; rows: Match[] }>();
  for (const m of rows) {
    const label = normalizeDeckName(m.my_deck, m.game) || "(이름 없음)";
    const k = deckKey(m.my_deck, m.game) || "_unnamed_";
    const entry = deckMap.get(k) ?? { label, rows: [] };
    entry.rows.push(m);
    deckMap.set(k, entry);
  }
  const byDeck = [...deckMap.values()]
    .map(({ label, rows: arr }) => ({ deck: label, stats: tally(arr) }))
    .sort((a, b) => b.stats.total - a.stats.total);

  const matchupMap = new Map<
    string,
    { deck: string; opponent: string; rows: Match[] }
  >();
  for (const m of rows) {
    const oppRaw = m.opp_leader || m.opp_deck || "";
    const oppLabel = normalizeDeckName(oppRaw, m.game);
    if (!oppLabel) continue;
    const deckLabel = normalizeDeckName(m.my_deck, m.game) || "(내 덱)";
    const k = `${deckKey(m.my_deck, m.game) || "_mine_"}__VS__${deckKey(oppRaw, m.game)}`;
    const entry = matchupMap.get(k) ?? {
      deck: deckLabel,
      opponent: oppLabel,
      rows: [],
    };
    entry.rows.push(m);
    matchupMap.set(k, entry);
  }
  const matchups = [...matchupMap.values()]
    .map(({ deck, opponent, rows: arr }) => ({
      deck,
      opponent,
      stats: tally(arr),
    }))
    .sort((a, b) => b.stats.total - a.stats.total);

  const recent = [...rows]
    .sort((a, b) => +new Date(b.played_at) - +new Date(a.played_at))
    .slice(0, 10);

  return { overall, first, second, byDeck, matchups, recent };
}

export const fmtPct = (r: RatePack) =>
  r.wins + r.losses === 0 ? "—" : `${Math.round(r.winRate * 1000) / 10}%`;

export const GAME_LABEL: Record<string, string> = {
  optcg: "원피스",
  ptcg: "포켓몬",
  dtcg: "디지몬",
};

export const EVENT_LABEL: Record<string, string> = {
  friendly: "친선",
  shop: "매장",
  official: "공식",
};
