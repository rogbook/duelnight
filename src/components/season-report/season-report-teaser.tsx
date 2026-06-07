/**
 * 1위 성적표 티저 — 비로그인 인트로용 쇼케이스(옵션).
 * 게임별 TOP1 중 최고 rating 플레이어의 시즌 성적표를 보여줘 가입을 유도한다.
 *
 * 설계: docs/INTRO_HOME_REDESIGN.md §2-3
 */
import { useQuery } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { SeasonReport } from "./season-report";
import { getSeasonStartISO } from "@/lib/season";
import type { Match } from "@/lib/match-stats";
import { useI18n } from "@/i18n/language-context";
import { useGames } from "@/hooks/use-games";

type Game = string;

interface TopPlayer {
  game: Game;
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  rating: number;
}

export function SeasonReportTeaser({ onSignup }: { onSignup?: () => void }) {
  const { t } = useI18n();
  const { games } = useGames();
  const codes = games.map((g) => g.code);

  const { data: top } = useQuery({
    queryKey: ["intro-showcase-top", codes.join(",")],
    queryFn: async (): Promise<TopPlayer | null> => {
      const results = await Promise.all(
        codes.map((g) =>
          supabase.rpc("get_leaderboard", { p_game: g, p_min_total: 1, p_limit: 1 }),
        ),
      );
      let best: TopPlayer | null = null;
      results.forEach((res, i) => {
        const row = res.data?.[0];
        if (row && (best === null || row.rating > best.rating)) {
          best = {
            game: codes[i],
            user_id: row.user_id,
            display_name: row.display_name,
            username: row.username,
            avatar_url: row.avatar_url,
            rating: row.rating,
          };
        }
      });
      return best;
    },
  });

  const { data: matches = [] } = useQuery({
    queryKey: ["intro-showcase-matches", top?.user_id, top?.game],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_user_recent_matches", {
        p_game: top!.game,
        p_user_id: top!.user_id,
        p_limit: 200,
      });
      if (error) throw error;
      const seasonStart = getSeasonStartISO();
      return ((data ?? []) as unknown as Match[]).filter((m) => m.played_at >= seasonStart);
    },
    enabled: !!top,
  });

  if (!top) return null;
  const player = top as TopPlayer;
  const displayName = player.display_name || player.username || t("leaderboard.anonymous");

  return (
    <section className="mx-auto w-full max-w-6xl px-4 sm:px-6">
      <div className="mb-4 flex items-center justify-center gap-2 text-center">
        <Sparkles className="h-4 w-4 text-amber-500" />
        <p className="text-sm text-muted-foreground">{t("seasonReport.teaserCaption")}</p>
      </div>
      <SeasonReport
        mode="showcase"
        game={player.game}
        matches={matches}
        rating={player.rating}
        displayName={displayName}
        username={player.username}
        avatarUrl={player.avatar_url}
        rank={1}
      />
      {onSignup && (
        <div className="mt-4 text-center">
          <button
            type="button"
            onClick={onSignup}
            className="inline-flex items-center justify-center rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            {t("seasonReport.teaserCta")}
          </button>
        </div>
      )}
    </section>
  );
}
