import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Trophy, Medal } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Database } from "@/integrations/supabase/types";

type Game = Database["public"]["Enums"]["tcg_game"];
type Period = "7" | "30" | "90" | "all";

interface Row {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  total: number;
  wins: number;
  losses: number;
  draws: number;
  win_rate: number;
}

const PERIOD_DAYS: Record<Period, number | null> = {
  "7": 7,
  "30": 30,
  "90": 90,
  all: null,
};

export const Route = createFileRoute("/leaderboard")({
  head: () => ({
    meta: [
      { title: "리더보드 — TCG Hub" },
      {
        name: "description",
        content: "게임·기간별 사용자 승률 랭킹.",
      },
    ],
  }),
  component: LeaderboardPage,
});

function LeaderboardPage() {
  const [game, setGame] = useState<Game | "all">("all");
  const [period, setPeriod] = useState<Period>("30");
  const [minTotal, setMinTotal] = useState(5);

  const { data = [], isLoading } = useQuery({
    queryKey: ["leaderboard", game, period, minTotal],
    queryFn: async () => {
      const days = PERIOD_DAYS[period];
      const { data, error } = await supabase.rpc("get_leaderboard", {
        ...(game === "all" ? {} : { p_game: game }),
        ...(days == null ? {} : { p_days: days }),
        p_min_total: minTotal,
        p_limit: 50,
      });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8">
      <PageHeader title="리더보드" description="게임·기간별 승률 랭킹">
        <Select value={game} onValueChange={(v) => setGame(v as Game | "all")}>
          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="optcg">원피스</SelectItem>
            <SelectItem value="ptcg">포켓몬</SelectItem>
            <SelectItem value="dtcg">디지몬</SelectItem>
          </SelectContent>
        </Select>
        <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <SelectTrigger className="w-[100px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7일</SelectItem>
            <SelectItem value="30">30일</SelectItem>
            <SelectItem value="90">90일</SelectItem>
            <SelectItem value="all">전체</SelectItem>
          </SelectContent>
        </Select>
        <Select
          value={String(minTotal)}
          onValueChange={(v) => setMinTotal(Number(v))}
        >
          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="3">최소 3판</SelectItem>
            <SelectItem value="5">최소 5판</SelectItem>
            <SelectItem value="10">최소 10판</SelectItem>
            <SelectItem value="20">최소 20판</SelectItem>
          </SelectContent>
        </Select>
      </PageHeader>

      {isLoading ? (
        <p className="mt-8 text-center text-sm text-muted-foreground">불러오는 중...</p>
      ) : data.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={Trophy}
            title="조건에 맞는 랭커가 없어요"
            description="기간/판수 조건을 조정해보세요."
          />
        </div>
      ) : (
        <ol className="mt-6 divide-y divide-border rounded-lg border border-border bg-card">
          {data.map((r, i) => (
            <li key={r.user_id} className="flex items-center gap-3 px-4 py-3">
              <RankBadge rank={i + 1} />
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">
                  {r.display_name || r.username || "익명"}
                  {r.username && (
                    <span className="ml-2 text-xs text-muted-foreground">@{r.username}</span>
                  )}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  {r.total}판 · {r.wins}승 {r.losses}패
                  {r.draws ? ` ${r.draws}무` : ""}
                </p>
              </div>
              <div className="text-right">
                <p className="text-base font-semibold tabular-nums">
                  {Number(r.win_rate).toFixed(1)}%
                </p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1)
    return (
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-amber-500/20 text-amber-600 dark:text-amber-400">
        <Medal className="h-4 w-4" />
      </span>
    );
  if (rank <= 3)
    return (
      <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-muted text-foreground">
        <Medal className="h-4 w-4" />
      </span>
    );
  return (
    <span className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-muted text-xs font-medium text-muted-foreground">
      {rank}
    </span>
  );
}
