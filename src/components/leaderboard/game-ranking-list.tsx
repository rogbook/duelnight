/**
 * 게임별 랭킹 — 비로그인 인트로 메인 섹션.
 * 모바일: 게임 탭 / 데스크탑: 3게임 3열 스택 (반응형).
 *
 * 설계: docs/INTRO_HOME_REDESIGN.md §2
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Trophy, Medal } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { supabase } from "@/integrations/supabase/client";
import { getTier } from "@/lib/tier";
import { useI18n, type TranslationKey } from "@/i18n/language-context";

const GAMES = ["optcg", "ptcg", "dtcg"] as const;
type Game = (typeof GAMES)[number];

const GAME_ACCENT: Record<Game, string> = {
  optcg: "bg-rose-500",
  ptcg: "bg-yellow-500",
  dtcg: "bg-indigo-500",
};

/** 데이터가 없을 때도 "집계 중"처럼 보이는 의도된 빈 상태. */
function EmptyRanking({ label }: { label: string }) {
  return (
    <div className="py-2">
      <div className="mb-3 flex flex-col items-center gap-1.5 text-center">
        <Medal className="h-7 w-7 text-amber-500/60" />
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
      <ul className="space-y-1.5 opacity-40">
        {[1, 2, 3].map((n) => (
          <li key={n} className="flex items-center gap-2.5 rounded-lg px-1 py-1.5">
            <span className="grid h-6 w-6 place-items-center text-xs font-semibold tabular-nums text-muted-foreground">
              {n}
            </span>
            <span className="h-7 w-7 rounded-full bg-muted" />
            <span className="h-2.5 flex-1 rounded bg-muted" />
            <span className="h-2.5 w-8 rounded bg-muted" />
          </li>
        ))}
      </ul>
    </div>
  );
}

interface LbRow {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  total: number;
  win_rate: number;
}

function RankNum({ rank }: { rank: number }) {
  if (rank === 1) {
    return (
      <span className="grid h-6 w-6 place-items-center rounded-full bg-amber-500/20 text-amber-500">
        <Medal className="h-3.5 w-3.5" />
      </span>
    );
  }
  return (
    <span className="grid h-6 w-6 place-items-center text-xs font-semibold tabular-nums text-muted-foreground">
      {rank}
    </span>
  );
}

function GameRankingColumn({ game, limit = 5 }: { game: Game; limit?: number }) {
  const { t } = useI18n();
  const { data = [], isLoading } = useQuery({
    queryKey: ["intro-ranking", game, limit],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_leaderboard", {
        p_game: game,
        p_min_total: 1,
        p_limit: limit,
      });
      if (error) throw error;
      return (data ?? []) as LbRow[];
    },
  });

  return (
    <div className="rounded-2xl border border-border bg-card/60 p-4 backdrop-blur">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          <span className={`h-2 w-2 rounded-full ${GAME_ACCENT[game]}`} />
          {t(`matches.${game}` as TranslationKey)}
        </h3>
        <Link to="/leaderboard" className="text-[11px] text-primary hover:underline">
          {t("gameRanking.viewAll")}
        </Link>
      </div>

      {isLoading ? (
        <p className="py-6 text-center text-xs text-muted-foreground">{t("common.loading")}</p>
      ) : data.length === 0 ? (
        <EmptyRanking label={t("gameRanking.empty")} />
      ) : (
        <ol className="space-y-1.5">
          {data.map((r, i) => {
            const tier = getTier(r.rating);
            return (
              <li key={r.user_id} className="flex items-center gap-2.5 rounded-lg px-1 py-1.5">
                <RankNum rank={i + 1} />
                <Avatar className="h-7 w-7">
                  <AvatarImage src={r.avatar_url ?? undefined} />
                  <AvatarFallback>
                    {(r.display_name ?? r.username ?? "?").slice(0, 1)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-xs font-medium">
                    {r.display_name || r.username || t("leaderboard.anonymous")}
                  </p>
                  <p className={`text-[10px] font-medium ${tier.text}`}>
                    {t(tier.labelKey as TranslationKey)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold tabular-nums">{r.rating}</p>
                  <p className="text-[9px] text-muted-foreground">
                    {Number(r.win_rate).toFixed(0)}% · {r.total}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </div>
  );
}

export function GameRankingList() {
  const { t } = useI18n();
  const [active, setActive] = useState<Game>("optcg");

  return (
    <section className="mx-auto w-full max-w-6xl px-4 sm:px-6">
      <div className="mb-5 text-center">
        <h2 className="flex items-center justify-center gap-2 text-2xl font-bold tracking-tight">
          <Trophy className="h-5 w-5 text-amber-500" />
          {t("gameRanking.title")}
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">{t("gameRanking.desc")}</p>
      </div>

      {/* 모바일: 게임 탭 */}
      <div className="md:hidden">
        <div className="mb-3 inline-flex w-full items-center gap-1 rounded-lg border border-border bg-card p-1">
          {GAMES.map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => setActive(g)}
              className={
                "flex-1 rounded-md px-3 py-1.5 text-xs font-medium transition-colors " +
                (active === g
                  ? "bg-foreground text-background"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              {t(`matches.${g}` as TranslationKey)}
            </button>
          ))}
        </div>
        <GameRankingColumn game={active} />
      </div>

      {/* 데스크탑: 3열 스택 */}
      <div className="hidden gap-4 md:grid md:grid-cols-3">
        {GAMES.map((g) => (
          <GameRankingColumn key={g} game={g} />
        ))}
      </div>
    </section>
  );
}
