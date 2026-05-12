import type { Tables } from "@/integrations/supabase/types";
import { normalizeDeckName, deckKey } from "@/lib/normalize-deck";

export type Match = Tables<"matches">;

export interface RatePack {
  wins: number;
  losses: number;
  draws: number;
  total: number;
  winRate: number; // 0..1, draws excluded from denominator
  /** Wilson 95% lower bound — penalises small samples. */
  wilsonLow: number;
}

const empty = (): RatePack => ({
  wins: 0,
  losses: 0,
  draws: 0,
  total: 0,
  winRate: 0,
  wilsonLow: 0,
});

// Wilson score lower bound, z=1.96 (95% CI)
const wilsonLower = (wins: number, decided: number): number => {
  if (decided === 0) return 0;
  const z = 1.96;
  const p = wins / decided;
  const denom = 1 + (z * z) / decided;
  const center = p + (z * z) / (2 * decided);
  const margin = z * Math.sqrt((p * (1 - p) + (z * z) / (4 * decided)) / decided);
  return Math.max(0, (center - margin) / denom);
};

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
  r.wilsonLow = wilsonLower(r.wins, decided);
  return r;
};

export interface DeckStat {
  deck: string;
  stats: RatePack;
  first: RatePack;
  second: RatePack;
}

export interface MatchupStat {
  deck: string;
  opponent: string;
  stats: RatePack;
  first: RatePack;
  second: RatePack;
}

export interface EventStat {
  event: Match["event"];
  stats: RatePack;
}

export interface OpponentFreq {
  opponent: string;
  count: number;
  share: number; // 0..1
  stats: RatePack; // your win-rate vs them
}

export interface MatchStats {
  overall: RatePack;
  first: RatePack;
  second: RatePack;
  byDeck: DeckStat[];
  matchups: MatchupStat[];
  byEvent: EventStat[];
  topOpponents: OpponentFreq[];
  recent: Match[];
}

export function computeStats(rows: Match[]): MatchStats {
  const overall = tally(rows);
  const first = tally(rows.filter((m) => m.went_first));
  const second = tally(rows.filter((m) => !m.went_first));

  // By deck — incl. first/second split
  const deckMap = new Map<string, { label: string; rows: Match[] }>();
  for (const m of rows) {
    const label = normalizeDeckName(m.my_deck, m.game) || "(이름 없음)";
    const k = deckKey(m.my_deck, m.game) || "_unnamed_";
    const entry = deckMap.get(k) ?? { label, rows: [] };
    entry.rows.push(m);
    deckMap.set(k, entry);
  }
  const byDeck: DeckStat[] = [...deckMap.values()]
    .map(({ label, rows: arr }) => ({
      deck: label,
      stats: tally(arr),
      first: tally(arr.filter((m) => m.went_first)),
      second: tally(arr.filter((m) => !m.went_first)),
    }))
    .sort((a, b) => b.stats.total - a.stats.total);

  // Matchups — incl. first/second split
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
  const matchups: MatchupStat[] = [...matchupMap.values()]
    .map(({ deck, opponent, rows: arr }) => ({
      deck,
      opponent,
      stats: tally(arr),
      first: tally(arr.filter((m) => m.went_first)),
      second: tally(arr.filter((m) => !m.went_first)),
    }))
    .sort((a, b) => b.stats.total - a.stats.total);

  // Event breakdown
  const evMap = new Map<Match["event"], Match[]>();
  for (const m of rows) {
    const arr = evMap.get(m.event) ?? [];
    arr.push(m);
    evMap.set(m.event, arr);
  }
  const byEvent: EventStat[] = [...evMap.entries()]
    .map(([event, arr]) => ({ event, stats: tally(arr) }))
    .sort((a, b) => b.stats.total - a.stats.total);

  // Top opponents (meta trend)
  const oppMap = new Map<string, { label: string; rows: Match[] }>();
  for (const m of rows) {
    const oppRaw = m.opp_leader || m.opp_deck || "";
    const label = normalizeDeckName(oppRaw, m.game);
    if (!label) continue;
    const k = deckKey(oppRaw, m.game);
    const e = oppMap.get(k) ?? { label, rows: [] };
    e.rows.push(m);
    oppMap.set(k, e);
  }
  const totalWithOpp = [...oppMap.values()].reduce((s, e) => s + e.rows.length, 0);
  const topOpponents: OpponentFreq[] = [...oppMap.values()]
    .map(({ label, rows: arr }) => ({
      opponent: label,
      count: arr.length,
      share: totalWithOpp === 0 ? 0 : arr.length / totalWithOpp,
      stats: tally(arr),
    }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const recent = [...rows]
    .sort((a, b) => +new Date(b.played_at) - +new Date(a.played_at))
    .slice(0, 10);

  return {
    overall,
    first,
    second,
    byDeck,
    matchups,
    byEvent,
    topOpponents,
    recent,
  };
}

export const fmtPct = (r: RatePack) =>
  r.wins + r.losses === 0 ? "—" : `${Math.round(r.winRate * 1000) / 10}%`;

export const fmtPctVal = (v: number) => `${Math.round(v * 1000) / 10}%`;

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
