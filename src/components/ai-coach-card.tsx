import { Sparkles } from "lucide-react";
import type { Match, MatchStats } from "@/lib/match-stats";
import type { Database } from "@/integrations/supabase/types";

type Game = Database["public"]["Enums"]["tcg_game"];
type Period = "7" | "30" | "90" | "all";

// Placeholder coach card. Wires data context for a future Lovable AI server
// route (`/api/coach`). UI is ready; AI generation will be added in a
// follow-up step.
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
  if (rows.length < 5) return null;

  const weakest = [...stats.matchups]
    .filter((m) => m.stats.total >= 3)
    .sort((a, b) => a.stats.winRate - b.stats.winRate)
    .slice(0, 2);

  const turnGap =
    Math.round((stats.first.winRate - stats.second.winRate) * 1000) / 10;

  return (
    <section className="mt-6 rounded-lg border border-border bg-card p-4">
      <div className="mb-2 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-foreground" />
        <h3 className="text-sm font-medium">AI 코칭 요약</h3>
        <span className="text-[10px] text-muted-foreground">
          {game === "all" ? "전체 게임" : ""} · 최근 {period === "all" ? "전체" : `${period}일`}
        </span>
      </div>
      <ul className="ml-1 space-y-1 text-xs text-muted-foreground">
        <li>
          최근 {rows.length}판에서 선공·후공 격차 약{" "}
          <span className="text-foreground">{turnGap}%p</span>{" "}
          {turnGap > 5 ? "(선공 우세)" : turnGap < -5 ? "(후공 우세)" : "(균형)"}
        </li>
        {weakest.length > 0 && (
          <li>
            취약 매치업:{" "}
            {weakest
              .map(
                (m) =>
                  `${m.deck} vs ${m.opponent} (${Math.round(m.stats.winRate * 100)}%, ${m.stats.total}판)`,
              )
              .join(", ")}
          </li>
        )}
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
      <p className="mt-3 text-[11px] text-muted-foreground">
        ※ 다음 단계로 Lovable AI를 연결해 자연어 인사이트와 개선 제안을 자동 생성할 수 있어요.
      </p>
    </section>
  );
}
