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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Database } from "@/integrations/supabase/types";
import { useGames } from "@/hooks/use-games";
import { useI18n } from "@/i18n/language-context";

type Game = string;

interface Row {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  rating: number;
  total: number;
  wins: number;
  losses: number;
  draws: number;
  win_rate: number;
}

export const Route = createFileRoute("/leaderboard")({
  head: () => {
    let locale = "ko";
    if (typeof window !== "undefined") {
      locale = localStorage.getItem("duelnight.i18n.locale") || "ko";
    }
    const titles: Record<string, string> = {
      ko: "리더보드 — DuelNight",
      en: "Leaderboard — DuelNight",
      ja: "リーダーボード — DuelNight",
    };
    const descs: Record<string, string> = {
      ko: "게임별 ELO 랭킹.",
      en: "ELO rankings by game.",
      ja: "ゲーム別ELOランキング。",
    };
    return {
      meta: [
        { title: titles[locale] || titles.ko },
        { name: "description", content: descs[locale] || descs.ko },
      ],
    };
  },
  component: LeaderboardPage,
});

function LeaderboardPage() {
  const { t, language } = useI18n();
  const { games, labelOf } = useGames();
  const [game, setGame] = useState<Game>("optcg");
  const [minTotal, setMinTotal] = useState(5);
  const [selected, setSelected] = useState<Row | null>(null);

  const dateLocale = language === "ko" ? "ko-KR" : language === "ja" ? "ja-JP" : "en-US";

  const { data = [], isLoading } = useQuery({
    queryKey: ["leaderboard", game, minTotal],
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_leaderboard", {
        p_game: game,
        p_min_total: minTotal,
        p_limit: 50,
      });
      if (error) throw error;
      return (data ?? []) as Row[];
    },
  });

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8">
      <PageHeader title={t("leaderboard.title")} description={t("leaderboard.desc")}>
        <Select value={game} onValueChange={(v) => setGame(v as Game)}>
          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            {games.map((g) => (
              <SelectItem key={g.code} value={g.code}>{labelOf(g.code)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={String(minTotal)}
          onValueChange={(v) => setMinTotal(Number(v))}
        >
          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="3">{t("leaderboard.minGames3")}</SelectItem>
            <SelectItem value="5">{t("leaderboard.minGames5")}</SelectItem>
            <SelectItem value="10">{t("leaderboard.minGames10")}</SelectItem>
            <SelectItem value="20">{t("leaderboard.minGames20")}</SelectItem>
          </SelectContent>
        </Select>
      </PageHeader>

      {isLoading ? (
        <p className="mt-8 text-center text-sm text-muted-foreground">{t("leaderboard.loading")}</p>
      ) : data.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={Trophy}
            title={t("leaderboard.emptyTitle")}
            description={t("leaderboard.emptyDesc")}
          />
        </div>
      ) : (
        <ol className="mt-6 divide-y divide-border rounded-lg border border-border bg-card">
          {data.map((r, i) => (
            <li key={r.user_id}>
              <button
                type="button"
                onClick={() => setSelected(r)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40"
              >
                <RankBadge rank={i + 1} />
                <Avatar className="h-9 w-9">
                  <AvatarImage src={r.avatar_url ?? undefined} />
                  <AvatarFallback>
                    {(r.display_name ?? r.username ?? "?").slice(0, 1)}
                  </AvatarFallback>
                </Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">
                    {r.display_name || r.username || t("leaderboard.anonymous")}
                    {r.username && (
                      <span className="ml-2 text-xs text-muted-foreground">@{r.username}</span>
                    )}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {t("leaderboard.recordLine", { total: r.total, wins: r.wins, losses: r.losses })}
                    {r.draws ? t("leaderboard.drawSuffix", { draws: r.draws }) : ""}
                    {t("leaderboard.winRateSuffix", { rate: Number(r.win_rate).toFixed(1) })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-base font-semibold tabular-nums">{r.rating}</p>
                  <p className="text-[10px] text-muted-foreground">ELO</p>
                </div>
              </button>
            </li>
          ))}
        </ol>
      )}

      <UserMatchesDialog
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
        user={selected}
        game={game}
        dateLocale={dateLocale}
      />
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

function UserMatchesDialog({
  open,
  onOpenChange,
  user,
  game,
  dateLocale,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  user: Row | null;
  game: Game;
  dateLocale: string;
}) {
  const { t } = useI18n();

  const { data: matches = [], isLoading } = useQuery({
    queryKey: ["user-recent", user?.user_id, game],
    enabled: !!user?.user_id,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("get_user_recent_matches", {
        p_user_id: user!.user_id,
        p_game: game,
        p_limit: 20,
      });
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
        {user && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-3">
                <Avatar className="h-10 w-10">
                  <AvatarImage src={user.avatar_url ?? undefined} />
                  <AvatarFallback>
                    {(user.display_name ?? user.username ?? "?").slice(0, 1)}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p>{user.display_name || user.username || t("leaderboard.anonymous")}</p>
                  <p className="text-xs font-normal text-muted-foreground">
                    {labelOf(game)} · ELO {user.rating} · {t("leaderboard.totalGames", { total: user.total })}
                  </p>
                </div>
              </DialogTitle>
            </DialogHeader>

            <section>
              <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("leaderboard.recentGames", { count: matches.length })}
              </h3>
              {isLoading ? (
                <p className="text-sm text-muted-foreground">{t("leaderboard.loading")}</p>
              ) : matches.length === 0 ? (
                <p className="text-sm text-muted-foreground">{t("leaderboard.noRecords")}</p>
              ) : (
                <ul className="divide-y divide-border rounded-md border border-border bg-card">
                  {matches.map((m) => (
                    <li key={m.id} className="flex items-center justify-between px-3 py-2 text-xs">
                      <div className="min-w-0 flex-1">
                        <p className="truncate">
                          <span className="font-medium">{m.my_deck}</span>
                          <span className="mx-1 text-muted-foreground">vs</span>
                          {m.opp_leader || m.opp_deck || "—"}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {new Date(m.played_at).toLocaleDateString(dateLocale)} ·{" "}
                          {m.went_first ? t("leaderboard.first") : t("leaderboard.second")}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <ResultPill r={m.result as "win" | "loss" | "draw"} />
                        {m.points_delta != null && (
                          <span
                            className={
                              "tabular-nums text-[11px] font-medium " +
                              (m.points_delta > 0
                                ? "text-emerald-600"
                                : m.points_delta < 0
                                  ? "text-rose-600"
                                  : "text-muted-foreground")
                            }
                          >
                            {m.points_delta > 0 ? "+" : ""}
                            {m.points_delta}
                          </span>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ResultPill({ r }: { r: "win" | "loss" | "draw" }) {
  const { t } = useI18n();
  const map = {
    win: "bg-emerald-500/10 text-emerald-600",
    loss: "bg-rose-500/10 text-rose-600",
    draw: "bg-muted text-muted-foreground",
  } as const;
  const label = {
    win: t("leaderboard.win"),
    loss: t("leaderboard.loss"),
    draw: t("leaderboard.draw"),
  }[r];
  return <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${map[r]}`}>{label}</span>;
}
