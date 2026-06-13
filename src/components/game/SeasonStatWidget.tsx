import { Link } from "@tanstack/react-router";
import { Flame, Swords } from "lucide-react";
import { useI18n } from "@/i18n/language-context";
import { computeStats, computeStreak } from "@/lib/match-stats";
import type { Tables } from "@/integrations/supabase/types";

interface SeasonStatWidgetProps {
  matches: Tables<"matches">[];
}

export function SeasonStatWidget({ matches = [] }: SeasonStatWidgetProps) {
  const { t } = useI18n();

  if (matches.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center bg-game-card border border-game-line rounded-2xl p-6 text-center shadow-md min-h-[140px] w-full">
        <Swords className="h-8 w-8 text-game-icon-idle mb-2" />
        <p className="text-sm font-bold text-game-text">
          {t("seasonReport.emptyTitle") || "이번 시즌 대전 기록이 없습니다."}
        </p>
        <p className="text-xs text-game-text-dim mt-0.5 max-w-[200px]">
          {t("seasonReport.emptyDesc") || "첫 번째 대전을 기록하고 승률과 통계를 분석해보세요."}
        </p>
        <Link
          to="/matches"
          className="mt-3.5 inline-flex items-center justify-center rounded-xl bg-game-blue-deep hover:bg-game-blue text-white px-4 py-2 text-xs font-semibold transition-colors duration-200"
        >
          {t("seasonReport.recordFirst") || "첫 전적 기록하기"}
        </Link>
      </div>
    );
  }

  const stats = computeStats(matches);
  const streak = computeStreak(matches);

  const decided = stats.overall.wins + stats.overall.losses;
  const winRate = decided === 0 ? 0 : Math.round((stats.overall.wins / decided) * 1000) / 10;

  return (
    <div className="bg-game-card border border-game-line rounded-2xl p-4 shadow-md flex flex-col justify-between h-full min-h-[140px]">
      <div>
        <span className="text-[11px] font-semibold text-game-text-dim uppercase tracking-wider">
          {t("matches.overallWinRate") || "이번 시즌 승률"}
        </span>
        <div className="flex items-baseline gap-2 mt-1.5">
          <span className="text-3xl font-extrabold tracking-tight text-game-text">{winRate}%</span>
          {streak.current > 0 && (
            <span className="inline-flex items-center text-xs font-bold text-game-win bg-game-win/10 px-1.5 py-0.5 rounded-md">
              <Flame className="h-3.5 w-3.5 mr-0.5 fill-current" />
              {streak.current}
              {t("matches.streak") || "연승"}
            </span>
          )}
          {streak.current < 0 && (
            <span className="inline-flex items-center text-xs font-bold text-game-loss bg-game-loss/10 px-1.5 py-0.5 rounded-md">
              {Math.abs(streak.current)}연패
            </span>
          )}
        </div>
      </div>

      <div className="flex gap-1.5 mt-4">
        <span className="inline-flex items-center justify-center text-[10px] font-bold text-game-text-mid bg-game-bg border border-game-line px-2.5 py-1 rounded-full">
          {stats.overall.total}전
        </span>
        <span className="inline-flex items-center justify-center text-[10px] font-bold text-game-win bg-game-bg border border-game-line px-2.5 py-1 rounded-full">
          {stats.overall.wins}승
        </span>
        <span className="inline-flex items-center justify-center text-[10px] font-bold text-game-loss bg-game-bg border border-game-line px-2.5 py-1 rounded-full">
          {stats.overall.losses}패
        </span>
      </div>
    </div>
  );
}
