import { Sparkles, Loader2, RefreshCw, AlertCircle } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo } from "react";
import type { Match, MatchStats, RatePack } from "@/lib/match-stats";
import type { Database } from "@/integrations/supabase/types";

type Game = Database["public"]["Enums"]["tcg_game"];
type Period = "7" | "30" | "90" | "all";

const pickRate = (r: RatePack): RatePack => ({
  wins: r.wins,
  losses: r.losses,
  draws: r.draws,
  total: r.total,
  winRate: r.winRate,
  wilsonLow: r.wilsonLow,
});

async function fetchCoach(payload: unknown): Promise<string> {
  const res = await fetch("/api/coach", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = (await res.json().catch(() => ({}))) as {
    content?: string;
    error?: string;
  };
  if (!res.ok) throw new Error(data.error ?? `요청 실패 (${res.status})`);
  if (!data.content) throw new Error("응답이 비어 있습니다.");
  return data.content;
}

export function AiCoachCard({
  rows,
  stats,
  period,
  game,
}: {
  rows: Match[];
  stats: MatchStats;
  period: Period;
  game: Game | "all";
}) {
  const enoughData = rows.length >= 5;

  const payload = useMemo(
    () => ({
      game: String(game),
      period: String(period),
      totalMatches: rows.length,
      overall: pickRate(stats.overall),
      first: pickRate(stats.first),
      second: pickRate(stats.second),
      topDecks: stats.byDeck.slice(0, 5).map((d) => ({
        deck: d.deck,
        stats: pickRate(d.stats),
        first: pickRate(d.first),
        second: pickRate(d.second),
      })),
      weakMatchups: [...stats.matchups]
        .filter((m) => m.stats.total >= 3)
        .sort((a, b) => a.stats.winRate - b.stats.winRate)
        .slice(0, 5)
        .map((m) => ({
          deck: m.deck,
          opponent: m.opponent,
          stats: pickRate(m.stats),
        })),
      topOpponents: stats.topOpponents.slice(0, 8).map((o) => ({
        opponent: o.opponent,
        count: o.count,
        share: o.share,
        stats: pickRate(o.stats),
      })),
    }),
    [rows.length, stats, game, period],
  );

  const mutation = useMutation({
    mutationFn: () => fetchCoach(payload),
  });

  // Auto-fetch on mount / when filters change
  useEffect(() => {
    if (!enoughData) return;
    mutation.mutate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enoughData, period, game, rows.length]);

  if (!enoughData) return null;

  const turnGap =
    Math.round((stats.first.winRate - stats.second.winRate) * 1000) / 10;

  return (
    <section className="mt-6 rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-foreground" />
        <h3 className="text-sm font-medium">AI 코칭 요약</h3>
        <span className="text-[10px] text-muted-foreground">
          {game === "all" ? "전체 게임" : ""} · 최근{" "}
          {period === "all" ? "전체" : `${period}일`} · {rows.length}판
        </span>
        <button
          type="button"
          onClick={() => mutation.mutate()}
          disabled={mutation.isPending}
          className="ml-auto inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-accent disabled:opacity-50"
        >
          {mutation.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <RefreshCw className="h-3 w-3" />
          )}
          다시 생성
        </button>
      </div>

      {mutation.isPending && !mutation.data && (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="h-3 w-3 animate-spin" />
          AI가 전적을 분석 중입니다…
        </div>
      )}

      {mutation.isError && (
        <div className="flex items-start gap-2 rounded-md border border-destructive/40 bg-destructive/5 p-2 text-xs text-destructive">
          <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>{(mutation.error as Error).message}</span>
        </div>
      )}

      {mutation.data && (
        <div className="whitespace-pre-wrap text-xs leading-relaxed text-foreground">
          {mutation.data}
        </div>
      )}

      {!mutation.isPending && !mutation.data && !mutation.isError && (
        <ul className="ml-1 space-y-1 text-xs text-muted-foreground">
          <li>
            최근 {rows.length}판에서 선공·후공 격차 약{" "}
            <span className="text-foreground">{turnGap}%p</span>
          </li>
          {stats.topOpponents[0] && (
            <li>
              가장 자주 만난 상대:{" "}
              <span className="text-foreground">
                {stats.topOpponents[0].opponent}
              </span>{" "}
              ({stats.topOpponents[0].count}회)
            </li>
          )}
        </ul>
      )}
    </section>
  );
}
