import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import {
  MobileStatScroll,
  MobileTurnRatioCard,
  MobileDeckCards,
  MobileMatchupCards,
  MobileEventCards,
  MobileOpponentCards,
  MobileRecentCards,
} from "@/components/match-stat-cards";
import {
  Swords,
  Trash2,
  Plus,
  Wand2,
  Pencil,
  Download,
  Upload,
  X,
  Eye,
  CalendarIcon,
} from "lucide-react";
import { format } from "date-fns";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { OpponentSearch, type FoundUser } from "@/components/opponent-search";
import { OpponentDetailDialog } from "@/components/opponent-detail-dialog";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  DialogTrigger,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { useGames } from "@/hooks/use-games";
import {
  computeStats,
  computeStreak,
  fmtPct,
  fmtPctVal,
  GAME_LABEL,
  EVENT_LABEL,
  type Match,
  type RatePack,
  type DeckStat,
  type MatchupStat,
  type EventStat,
  type OpponentFreq,
} from "@/lib/match-stats";
import { WinRateChart, type ChartUnit } from "@/components/winrate-chart";
import { AiCoachCard } from "@/components/ai-coach-card";
import { normalizeDeckName } from "@/lib/normalize-deck";
import { matchesToCsv, matchesToJson, parseImport, downloadFile } from "@/lib/csv";
import type { Database } from "@/integrations/supabase/types";
import { useI18n } from "@/i18n/language-context";

type Game = string;
type EventT = Database["public"]["Enums"]["match_event"];
type Result = Database["public"]["Enums"]["match_result"];
type Period = "7" | "30" | "90" | "all";

const PERIOD_DAYS: Record<Period, number | null> = {
  "7": 7,
  "30": 30,
  "90": 90,
  all: null,
};

export const Route = createFileRoute("/matches")({
  head: () => {
    // Note: head function is computed statically/at route resolution, but inside a component is usually better.
    // However, TanStack Route head can use window-level locale or we can keep a simple static or dynamic.
    // For simplicity, we can do a standard locale lookup if needed, but keeping Route head or updating document.title in useEffect is more reliable.
    // Let's use a standard translation or simple translation. Since head is out of React context, we can just keep the title as "전적 기록 — DuelNight" or read language-context's local storage locale.
    const saved =
      typeof window !== "undefined" ? localStorage.getItem("duelnight.i18n.locale") : "ko";
    const title =
      saved === "ja"
        ? "戦績記録 — DuelNight"
        : saved === "en"
          ? "Match Records — DuelNight"
          : "전적 기록 — DuelNight";
    const desc =
      saved === "ja"
        ? "対戦結果を記録すると、デッキ・先攻後攻・マッチアップ統計が自動的に更新されます"
        : saved === "en"
          ? "Record match results to automatically calculate deck, turn, and stats"
          : "대전 결과를 기록하고 덱·선후공·매치업 통계를 자동 계산.";
    return {
      meta: [
        { title },
        {
          name: "description",
          content: desc,
        },
      ],
    };
  },
  component: MatchesPage,
});

function MatchesPage() {
  const { t } = useI18n();
  const { user, loading } = useAuth();
  const isMobile = useIsMobile();
  const [game, setGame] = useState<Game | "all">("all");
  const [period, setPeriod] = useState<Period>("30");
  const [chartUnit, setChartUnit] = useState<ChartUnit>("day");
  const [filters, setFilters] = useState<Filters>(emptyFilters);

  const { data: allRows = [], refetch } = useQuery({
    queryKey: ["matches", user?.id, game],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase.from("matches").select("*").order("played_at", { ascending: false });
      if (game !== "all") q = q.eq("game", game);
      const { data, error } = await q;
      if (error) throw error;
      return data as Match[];
    },
  });

  const periodRows = useMemo(() => {
    const days = PERIOD_DAYS[period];
    if (days == null) return allRows;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return allRows.filter((m) => new Date(m.played_at).getTime() >= cutoff);
  }, [allRows, period]);

  const rows = useMemo(() => applyFilters(periodRows, filters), [periodRows, filters]);

  const stats = useMemo(() => computeStats(rows), [rows]);
  const streak = useMemo(() => computeStreak(rows), [rows]);

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-8 text-sm text-muted-foreground">
        {t("common.loading")}
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-8">
        <PageHeader title={t("matches.title")} description={t("matches.loginRequiredDesc")} />
        <div className="mt-6 rounded-lg border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">{t("matches.loginRequired")}</p>
          <Link
            to="/login"
            className="mt-4 inline-flex items-center justify-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
          >
            {t("matches.goToLogin")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <PageHeader title={t("matches.title")} description={t("matches.desc")} />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("matches.game")}
            </span>
            <GameTabs value={game} onChange={setGame} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
              {t("matches.period")}
            </span>
            <PeriodTabs value={period} onChange={setPeriod} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ImportExportButton rows={allRows} onImported={() => refetch()} />
          <NormalizeButton onDone={() => refetch()} />
          <NewMatchButton onCreated={() => refetch()} lastMatch={allRows[0]} />
        </div>
      </div>

      <FilterBar rows={periodRows} value={filters} onChange={setFilters} />

      {isMobile ? (
        <MobileStatScroll stats={stats} streak={streak} />
      ) : (
        <StatGrid stats={stats} streak={streak} />
      )}

      <section className="mt-6 rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h3 className="text-sm font-medium">{t("matches.winRateTrend")}</h3>
            <p className="text-xs text-muted-foreground">{t("matches.winRateTrendDesc")}</p>
          </div>
          <ChartUnitTabs value={chartUnit} onChange={setChartUnit} />
        </div>
        <WinRateChart rows={rows} unit={chartUnit} />
      </section>

      <AiCoachCard rows={rows} stats={stats} period={period} game={game} />

      {isMobile ? (
        <>
          <MobileTurnRatioCard stats={stats} />
          <MobileDeckCards rows={stats.byDeck} />
          <MobileMatchupCards rows={stats.matchups} />
          <MobileEventCards rows={stats.byEvent} />
          <MobileOpponentCards rows={stats.topOpponents} allRows={rows} game={game} />
        </>
      ) : (
        <>
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <DeckTable rows={stats.byDeck} />
            <MatchupTable rows={stats.matchups} />
          </div>
          <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
            <EventTable rows={stats.byEvent} />
            <OpponentTable rows={stats.topOpponents} allRows={rows} game={game} />
          </div>
        </>
      )}

      <RecentList rows={rows} onDeleted={() => refetch()} isMobile={isMobile} />

      <TaggedAsOpponentSection onSaved={() => refetch()} />
    </div>
  );
}

function ChartUnitTabs({
  value,
  onChange,
}: {
  value: ChartUnit;
  onChange: (v: ChartUnit) => void;
}) {
  const { t } = useI18n();
  const items: { id: ChartUnit; label: string }[] = [
    { id: "day", label: t("matches.day") },
    { id: "week", label: t("matches.week") },
    { id: "month", label: t("matches.month") },
  ];
  return (
    <div className="inline-flex items-center gap-1 rounded-md border border-border bg-card p-0.5">
      {items.map((it) => (
        <button
          key={it.id}
          type="button"
          onClick={() => onChange(it.id)}
          className={
            "rounded px-2 py-1 text-[11px] font-medium transition-colors " +
            (value === it.id
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground")
          }
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

function PeriodTabs({ value, onChange }: { value: Period; onChange: (v: Period) => void }) {
  const { t } = useI18n();
  const items: { id: Period; label: string }[] = [
    { id: "7", label: t("matches.day7") },
    { id: "30", label: t("matches.day30") },
    { id: "90", label: t("matches.day90") },
    { id: "all", label: t("matches.all") },
  ];
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1">
      {items.map((p) => (
        <button
          key={p.id}
          onClick={() => onChange(p.id)}
          className={
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors " +
            (value === p.id
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground")
          }
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}

function GameTabs({
  value,
  onChange,
}: {
  value: Game | "all";
  onChange: (v: Game | "all") => void;
}) {
  const { t } = useI18n();
  const { games, labelOf } = useGames();
  const items: { id: Game | "all"; label: string }[] = [
    { id: "all", label: t("matches.all") },
    ...games.map((g) => ({ id: g.code as Game | "all", label: labelOf(g.code) })),
  ];
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1">
      {items.map((g) => (
        <button
          key={g.id}
          onClick={() => onChange(g.id)}
          className={
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors " +
            (value === g.id
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground")
          }
        >
          {g.label}
        </button>
      ))}
    </div>
  );
}

function StatCard({ label, pack }: { label: string; pack: RatePack }) {
  const { t } = useI18n();
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">{fmtPct(pack)}</p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {pack.wins}
        {t("matches.win")} {pack.losses}
        {t("matches.lose")}
        {pack.draws ? ` ${pack.draws}${t("matches.draw")}` : ""} · {pack.total}
        {t("matches.playCount")}
      </p>
    </div>
  );
}

function StatGrid({
  stats,
  streak,
}: {
  stats: ReturnType<typeof computeStats>;
  streak: ReturnType<typeof computeStreak>;
}) {
  const { t } = useI18n();
  const cur = streak.current;
  const curLabel =
    cur === 0
      ? "—"
      : cur > 0
        ? `${cur}${t("matches.winsStreak")} 🔥`
        : `${-cur}${t("matches.lossesStreak")}`;
  const curClass =
    cur > 0
      ? "text-emerald-600 dark:text-emerald-400"
      : cur < 0
        ? "text-rose-600 dark:text-rose-400"
        : "text-foreground";
  return (
    <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
      <StatCard label={t("matches.overallWinRate")} pack={stats.overall} />
      <StatCard label={t("matches.firstWinRate")} pack={stats.first} />
      <StatCard label={t("matches.secondWinRate")} pack={stats.second} />
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">{t("matches.currentStreak")}</p>
        <p className={`mt-2 text-2xl font-semibold tracking-tight ${curClass}`}>{curLabel}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {t("matches.bestStreak")} {streak.best}
          {t("matches.winsStreak")} · {t("matches.worstStreak")} {streak.worst}
          {t("matches.lossesStreak")}
        </p>
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">{t("matches.decksUsed")}</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight">{stats.byDeck.length}</p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {t("matches.matchupCount").replace("{count}", String(stats.matchups.length))}
        </p>
      </div>
    </section>
  );
}

function DeckTable({ rows }: { rows: DeckStat[] }) {
  const { t } = useI18n();
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-medium">{t("matches.byDeck")}</h3>
        <p className="text-[11px] text-muted-foreground">{t("matches.byDeckDesc")}</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-xs text-muted-foreground">{t("matches.noData")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.deck} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-sm">{r.deck}</span>
                <span className="text-xs text-muted-foreground">
                  <span className="mr-2 font-medium text-foreground">{fmtPct(r.stats)}</span>
                  {r.stats.wins}-{r.stats.losses}
                  {r.stats.draws ? `-${r.stats.draws}` : ""}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                <span>
                  {t("matches.first")} {fmtPct(r.first)} ({r.first.total})
                </span>
                <span>
                  {t("matches.second")} {fmtPct(r.second)} ({r.second.total})
                </span>
                <span>
                  {t("matches.wilsonLow")} {fmtPctVal(r.stats.wilsonLow)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MatchupTable({ rows }: { rows: MatchupStat[] }) {
  const { t } = useI18n();
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-medium">{t("matches.matchups")}</h3>
        <p className="text-[11px] text-muted-foreground">{t("matches.matchupsDesc")}</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-xs text-muted-foreground">
          {t("matches.matchupRequired")}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.slice(0, 12).map((r) => (
            <li key={`${r.deck}-${r.opponent}`} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-sm">
                  <span className="text-foreground">{r.deck}</span>
                  <span className="mx-1.5 text-muted-foreground">vs</span>
                  <span className="text-muted-foreground">{r.opponent}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  <span className="mr-2 font-medium text-foreground">{fmtPct(r.stats)}</span>
                  {r.stats.wins}-{r.stats.losses}
                  {r.stats.draws ? `-${r.stats.draws}` : ""}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                <span>
                  {t("matches.first")} {fmtPct(r.first)} ({r.first.total})
                </span>
                <span>
                  {t("matches.second")} {fmtPct(r.second)} ({r.second.total})
                </span>
                <span>
                  {t("matches.wilsonLow")} {fmtPctVal(r.stats.wilsonLow)}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EventTable({ rows }: { rows: EventStat[] }) {
  const { t } = useI18n();
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-medium">{t("matches.byEvent")}</h3>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-xs text-muted-foreground">{t("matches.noData")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.event} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm">
                {t(`matches.event${r.event.charAt(0).toUpperCase() + r.event.slice(1)}` as any)}
              </span>
              <span className="text-xs text-muted-foreground">
                <span className="mr-2 font-medium text-foreground">{fmtPct(r.stats)}</span>
                {r.stats.wins}-{r.stats.losses}
                {r.stats.draws ? `-${r.stats.draws}` : ""}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function OpponentTable({
  rows,
  allRows,
  game,
}: {
  rows: OpponentFreq[];
  allRows: Match[];
  game: Game | "all";
}) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<{ name: string; userId?: string | null } | null>(null);

  const matchesFor = (oppName: string) =>
    allRows.filter((m) => (m.opp_leader || m.opp_deck || "") === oppName);

  const userIdFor = (oppName: string): string | null => {
    const found = allRows.find(
      (m) => (m.opp_leader || m.opp_deck || "") === oppName && m.opponent_user_id,
    );
    return found?.opponent_user_id ?? null;
  };

  // Pick a representative game from filtered set; fallback to optcg if "all"
  const dialogGame: Game =
    game !== "all" ? game : selected ? (matchesFor(selected.name)[0]?.game ?? "optcg") : "optcg";

  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-medium">{t("matches.oppMeta")}</h3>
        <p className="text-[11px] text-muted-foreground">{t("matches.oppMetaDesc")}</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-xs text-muted-foreground">{t("matches.noData")}</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.opponent}>
              <button
                type="button"
                onClick={() => setSelected({ name: r.opponent, userId: userIdFor(r.opponent) })}
                className="block w-full px-4 py-3 text-left transition hover:bg-muted/30"
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="truncate text-sm">{r.opponent}</span>
                  <span className="text-xs text-muted-foreground">
                    <span className="mr-2 font-medium text-foreground">{fmtPct(r.stats)}</span>
                    {r.count}
                    {t("matches.times")} · {fmtPctVal(r.share)}
                  </span>
                </div>
                <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-muted">
                  <div
                    className="h-full bg-foreground/70"
                    style={{ width: `${Math.round(r.share * 100)}%` }}
                  />
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
      <OpponentDetailDialog
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
        opponent={selected}
        game={dialogGame}
        myMatches={
          selected
            ? matchesFor(selected.name).map((m) => ({
                id: m.id,
                played_at: m.played_at,
                game: m.game,
                my_deck: m.my_deck,
                opp_leader: m.opp_leader,
                opp_deck: m.opp_deck,
                result: m.result as "win" | "loss" | "draw",
                went_first: m.went_first,
                points_delta: m.points_delta,
                opponent_user_id: m.opponent_user_id,
              }))
            : []
        }
      />
    </div>
  );
}

function RecentList({
  rows,
  onDeleted,
  isMobile = false,
}: {
  rows: Match[];
  onDeleted: () => void;
  isMobile?: boolean;
}) {
  const { t, language } = useI18n();
  const { labelOf } = useGames();
  const [editing, setEditing] = useState<Match | null>(null);
  const [viewing, setViewing] = useState<Match | null>(null);
  const [oppSelected, setOppSelected] = useState<{
    name: string;
    userId?: string | null;
    game: Game;
  } | null>(null);
  const [page, setPage] = useState(1);
  const PAGE = 30;
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * PAGE, safePage * PAGE);
  useEffect(() => {
    setPage(1);
  }, [rows.length]);

  // 상대 닉네임 일괄 조회
  const oppUserIds = useMemo(
    () => Array.from(new Set(rows.map((m) => m.opponent_user_id).filter((x): x is string => !!x))),
    [rows],
  );
  const { data: oppProfiles } = useQuery({
    queryKey: ["opp-profiles-bulk", oppUserIds],
    enabled: oppUserIds.length > 0,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id,display_name,username")
        .in("id", oppUserIds);
      return data ?? [];
    },
  });
  const nickById = useMemo(() => {
    const map = new Map<string, string>();
    (oppProfiles ?? []).forEach((p) => {
      const n = p.display_name || p.username;
      if (n) map.set(p.id, n);
    });
    return map;
  }, [oppProfiles]);
  const oppNick = (m: Match): string | null =>
    m.opponent_user_id ? (nickById.get(m.opponent_user_id) ?? null) : null;
  const openOpp = (m: Match) => {
    const nick = oppNick(m);
    const name = nick || m.opp_leader || m.opp_deck || "—";
    setOppSelected({ name, userId: m.opponent_user_id ?? null, game: m.game });
  };
  const oppDialogMatches = useMemo(() => {
    if (!oppSelected) return [];
    return rows.filter((m) =>
      oppSelected.userId
        ? m.opponent_user_id === oppSelected.userId
        : (m.opp_leader || m.opp_deck || "") === oppSelected.name,
    );
  }, [oppSelected, rows]);

  if (rows.length === 0) {
    return (
      <div className="mt-8">
        <EmptyState
          icon={Swords}
          title={t("matches.emptyTitle")}
          description={t("matches.emptyDesc")}
        />
      </div>
    );
  }
  const onDelete = async (id: string) => {
    if (!confirm(t("matches.confirmDelete"))) return;
    const { error } = await supabase.from("matches").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success(t("matches.deleted"));
      onDeleted();
    }
  };

  const localeStr = language === "ko" ? "ko-KR" : language === "ja" ? "ja-JP" : "en-US";

  return (
    <section className="mt-8">
      <h2 className="text-sm font-medium">{t("matches.recentMatches")}</h2>
      {isMobile ? (
        <MobileRecentCards
          rows={pageRows}
          oppNick={oppNick}
          onOpponentClick={(m) => openOpp(m)}
          onView={(m) => setViewing(m)}
          onEdit={(m) => setEditing(m)}
          onDelete={(id) => onDelete(id)}
        />
      ) : (
        <div className="mt-3 overflow-hidden rounded-lg border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-left font-medium">{t("matches.date")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("matches.game")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("matches.event")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("matches.myDeck")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("matches.opponent")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("matches.turn")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("matches.result")}</th>
                <th className="px-3 py-2 text-left font-medium">{t("matches.score")}</th>
                <th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((m) => (
                <tr
                  key={m.id}
                  onClick={() => setViewing(m)}
                  className="cursor-pointer border-b border-border transition hover:bg-muted/30 last:border-0"
                >
                  <td className="px-3 py-2 text-muted-foreground">
                    {new Date(m.played_at).toLocaleDateString(localeStr)}
                  </td>
                  <td className="px-3 py-2">{labelOf(m.game)}</td>
                  <td className="px-3 py-2 text-muted-foreground">
                    {t(`matches.event${m.event.charAt(0).toUpperCase() + m.event.slice(1)}` as any)}
                  </td>
                  <td className="px-3 py-2">{m.my_deck}</td>
                  <td
                    className="px-3 py-2 text-muted-foreground"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {(() => {
                      const nick = oppNick(m);
                      const deck = m.opp_leader || m.opp_deck;
                      if (!nick && !deck) return "—";
                      return (
                        <div className="flex flex-col">
                          {nick && (
                            <button
                              type="button"
                              onClick={() => openOpp(m)}
                              className="truncate text-left text-foreground font-medium hover:underline"
                            >
                              {nick}
                            </button>
                          )}
                          {deck && (
                            <span className="truncate text-xs text-muted-foreground">{deck}</span>
                          )}
                        </div>
                      );
                    })()}
                  </td>
                  <td className="px-3 py-2">
                    {m.went_first ? t("matches.first") : t("matches.second")}
                  </td>
                  <td className="px-3 py-2">
                    <ResultBadge r={m.result} />
                  </td>
                  <td className="px-3 py-2">
                    {m.points_delta != null ? (
                      <span
                        className={
                          "tabular-nums text-xs font-medium " +
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
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </td>
                  <td className="px-3 py-2 text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => setViewing(m)}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label={t("matches.viewDetail")}
                      >
                        <Eye className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setEditing(m)}
                        className="text-muted-foreground hover:text-foreground"
                        aria-label={t("common.edit")}
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => onDelete(m.id)}
                        className="text-muted-foreground hover:text-destructive"
                        aria-label={t("common.delete")}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            {t("matches.paginationTotal")
              .replace("{total}", String(rows.length))
              .replace("{page}", String(safePage))
              .replace("{totalPages}", String(totalPages))}
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
            >
              {t("matches.prev")}
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
            >
              {t("matches.next")}
            </Button>
          </div>
        </div>
      )}
      <ViewMatchDialog
        match={viewing}
        oppNick={viewing ? oppNick(viewing) : null}
        onOpenOpponent={(m) => {
          openOpp(m);
          setViewing(null);
        }}
        onOpenChange={(o) => !o && setViewing(null)}
        onEdit={(m) => {
          setViewing(null);
          setEditing(m);
        }}
        onDelete={(id) => {
          setViewing(null);
          onDelete(id);
        }}
      />
      <EditMatchDialog
        match={editing}
        onOpenChange={(o) => !o && setEditing(null)}
        onSaved={() => {
          setEditing(null);
          onDeleted();
        }}
      />
      <OpponentDetailDialog
        open={!!oppSelected}
        onOpenChange={(o) => !o && setOppSelected(null)}
        opponent={oppSelected ? { name: oppSelected.name, userId: oppSelected.userId } : null}
        game={oppSelected?.game ?? "optcg"}
        myMatches={oppDialogMatches.map((m) => ({
          id: m.id,
          played_at: m.played_at,
          game: m.game,
          my_deck: m.my_deck,
          opp_leader: m.opp_leader,
          opp_deck: m.opp_deck,
          result: m.result as "win" | "loss" | "draw",
          went_first: m.went_first,
          points_delta: m.points_delta,
          opponent_user_id: m.opponent_user_id,
        }))}
      />
    </section>
  );
}

function ViewMatchDialog({
  match,
  oppNick,
  onOpenOpponent,
  onOpenChange,
  onEdit,
  onDelete,
}: {
  match: Match | null;
  oppNick?: string | null;
  onOpenOpponent?: (m: Match) => void;
  onOpenChange: (open: boolean) => void;
  onEdit: (m: Match) => void;
  onDelete: (id: string) => void;
}) {
  const { t, language } = useI18n();
  const { labelOf } = useGames();
  const localeStr = language === "ko" ? "ko-KR" : language === "ja" ? "ja-JP" : "en-US";

  return (
    <Dialog open={!!match} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        {match && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {t("matches.viewDetail")}
                <ResultBadge r={match.result} />
              </DialogTitle>
            </DialogHeader>
            <dl className="grid grid-cols-3 gap-x-3 gap-y-3 text-sm">
              <Row
                label={t("matches.datetime")}
                value={new Date(match.played_at).toLocaleString(localeStr)}
              />
              <Row label={t("matches.game")} value={labelOf(match.game)} />
              <Row
                label={t("matches.event")}
                value={t(
                  `matches.event${match.event.charAt(0).toUpperCase() + match.event.slice(1)}` as any,
                )}
              />
              <Row label={t("matches.myDeck")} value={match.my_deck} />
              <div>
                <dt className="text-xs text-muted-foreground">{t("matches.opponent")}</dt>
                <dd className="mt-0.5 text-sm">
                  {oppNick ? (
                    <button
                      type="button"
                      onClick={() => onOpenOpponent?.(match)}
                      className="font-medium hover:underline"
                    >
                      {oppNick}
                    </button>
                  ) : null}
                  {(match.opp_leader || match.opp_deck) && (
                    <div className={oppNick ? "text-xs text-muted-foreground" : ""}>
                      {`${match.opp_leader ?? ""}${
                        match.opp_leader && match.opp_deck ? " · " : ""
                      }${match.opp_deck ?? ""}`}
                    </div>
                  )}
                  {!oppNick && !match.opp_leader && !match.opp_deck && "—"}
                </dd>
              </div>
              <Row
                label={t("matches.turn")}
                value={match.went_first ? t("matches.first") : t("matches.second")}
              />
              {match.notes && (
                <div className="col-span-3">
                  <dt className="text-xs text-muted-foreground">{t("matches.matchNote")}</dt>
                  <dd className="mt-1 whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-sm leading-relaxed">
                    {match.notes}
                  </dd>
                </div>
              )}
            </dl>
            <div className="mt-2 flex justify-end gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onDelete(match.id)}
                className="text-destructive hover:text-destructive"
              >
                <Trash2 className="mr-1 h-4 w-4" /> {t("common.delete")}
              </Button>
              <Button size="sm" onClick={() => onEdit(match)}>
                <Pencil className="mr-1 h-4 w-4" /> {t("common.edit")}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{value}</dd>
    </div>
  );
}

function EditMatchDialog({
  match,
  onOpenChange,
  onSaved,
}: {
  match: Match | null;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const { t } = useI18n();
  const qc = useQueryClient();
  const [form, setForm] = useState<{
    event: EventT;
    my_deck: string;
    opp_leader: string;
    opp_deck: string;
    went_first: string;
    result: Result;
    notes: string;
  } | null>(null);

  useEffect(() => {
    if (!match) {
      setForm(null);
      return;
    }
    setForm({
      event: match.event,
      my_deck: match.my_deck,
      opp_leader: match.opp_leader ?? "",
      opp_deck: match.opp_deck ?? "",
      went_first: String(match.went_first),
      result: match.result,
      notes: match.notes ?? "",
    });
  }, [match]);

  if (!match || !form) {
    return (
      <Dialog open={false} onOpenChange={onOpenChange}>
        <DialogContent />
      </Dialog>
    );
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const myDeck = normalizeDeckName(form.my_deck, match.game) || form.my_deck.trim();
    if (!myDeck) {
      toast.error(t("matches.myDeckRequired"));
      return;
    }
    const oppLeader = form.opp_leader
      ? normalizeDeckName(form.opp_leader, match.game) || form.opp_leader.trim()
      : "";
    const oppDeck = form.opp_deck
      ? normalizeDeckName(form.opp_deck, match.game) || form.opp_deck.trim()
      : "";
    const { error } = await supabase
      .from("matches")
      .update({
        event: form.event,
        my_deck: myDeck,
        opp_leader: oppLeader || null,
        opp_deck: oppDeck || null,
        went_first: form.went_first === "true",
        result: form.result,
        notes: form.notes.trim() || null,
      })
      .eq("id", match.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("matches.editedToast"));
    qc.invalidateQueries({ queryKey: ["matches"] });
    onSaved();
  };

  return (
    <Dialog open={!!match} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("matches.editTitle")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid grid-cols-2 gap-3">
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label>{t("matches.event")}</Label>
            <Select
              value={form.event}
              onValueChange={(v) => setForm({ ...form, event: v as EventT })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="friendly">{t("matches.eventFriendly")}</SelectItem>
                <SelectItem value="shop">{t("matches.eventShop")}</SelectItem>
                <SelectItem value="official">{t("matches.eventOfficial")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label>{t("matches.myDeck")}</Label>
            <Input
              value={form.my_deck}
              onChange={(e) => setForm({ ...form, my_deck: e.target.value })}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t("matches.oppLeader")}</Label>
            <Input
              value={form.opp_leader}
              onChange={(e) => setForm({ ...form, opp_leader: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t("matches.oppDeck")}</Label>
            <Input
              value={form.opp_deck}
              onChange={(e) => setForm({ ...form, opp_deck: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t("matches.turn")}</Label>
            <Select
              value={form.went_first}
              onValueChange={(v) => setForm({ ...form, went_first: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">{t("matches.first")}</SelectItem>
                <SelectItem value="false">{t("matches.second")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{t("matches.result")}</Label>
            <Select
              value={form.result}
              onValueChange={(v) => setForm({ ...form, result: v as Result })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="win">{t("matches.win")}</SelectItem>
                <SelectItem value="loss">{t("matches.lose")}</SelectItem>
                <SelectItem value="draw">{t("matches.draw")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 mt-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit">{t("common.save")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResultBadge({ r }: { r: Result }) {
  const { t } = useI18n();
  const map = {
    win: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    loss: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    draw: "bg-muted text-muted-foreground",
  } as const;
  const label = { win: t("matches.win"), loss: t("matches.lose"), draw: t("matches.draw") }[r];
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${map[r]}`}>
      {label}
    </span>
  );
}

function CanonicalHint({
  raw,
  game,
  onApply,
}: {
  raw: string;
  game: Game;
  onApply: (v: string) => void;
}) {
  const { t } = useI18n();
  const canonical = normalizeDeckName(raw, game);
  if (!canonical || canonical === raw.trim()) return null;
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span>
        {t("matches.onSave")} <span className="font-medium text-foreground">{canonical}</span>
      </span>
      <button
        type="button"
        onClick={() => onApply(canonical)}
        className="rounded border border-border px-1.5 py-0.5 text-[10px] hover:bg-accent"
      >
        {t("matches.apply")}
      </button>
    </div>
  );
}

function NewMatchDialog({ onCreated, lastMatch }: { onCreated: () => void; lastMatch?: Match }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const { games, labelOf } = useGames();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [keepRaw, setKeepRaw] = useState(false);
  const initial = () => ({
    game: (lastMatch?.game ?? "optcg") as Game,
    event: (lastMatch?.event ?? "friendly") as EventT,
    my_deck: lastMatch?.my_deck ?? "",
    opp_leader: lastMatch?.opp_leader ?? "",
    opp_deck: lastMatch?.opp_deck ?? "",
    went_first: String(lastMatch?.went_first ?? true),
    result: "win" as Result,
    notes: "",
    tournament_note: "",
    deck_id: (lastMatch?.deck_id ?? "") as string,
    opponent_deck_id: "" as string,
    played_at: new Date(),
  });
  const [form, setForm] = useState(initial);
  const [opponent, setOpponent] = useState<FoundUser | null>(null);

  const { data: decks = [] } = useQuery({
    queryKey: ["decks-for-match", user?.id, form.game],
    enabled: !!user && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("decks")
        .select("id,name,leader,game")
        .eq("user_id", user!.id)
        .eq("game", form.game)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Opponent's saved (public) decks
  const { data: oppDecks = [] } = useQuery({
    queryKey: ["opp-decks-for-match", opponent?.id, form.game],
    enabled: !!opponent && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("decks")
        .select("id,name,leader,game,is_public")
        .eq("user_id", opponent!.id)
        .eq("game", form.game)
        .eq("is_public", true)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  // Current ratings preview (ELO delta estimate)
  const { data: ratings } = useQuery({
    queryKey: ["ratings-preview", user?.id, opponent?.id, form.game],
    enabled: !!user && !!opponent && open,
    queryFn: async () => {
      const ids = [user!.id, opponent!.id];
      const { data } = await supabase
        .from("user_ratings")
        .select("user_id,rating")
        .in("user_id", ids)
        .eq("game", form.game);
      const me = data?.find((r) => r.user_id === user!.id)?.rating ?? 1000;
      const op = data?.find((r) => r.user_id === opponent!.id)?.rating ?? 1000;
      return { me, op };
    },
  });

  const expected = ratings ? 1 / (1 + Math.pow(10, (ratings.op - ratings.me) / 400)) : 0.5;
  const sSelf = form.result === "win" ? 1 : form.result === "loss" ? 0 : 0.5;
  const previewDelta = Math.round(32 * (sSelf - expected));

  useEffect(() => {
    if (!open) return;
    setForm(initial());
    setOpponent(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lastMatch?.id]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(input|textarea|select)$/i.test(target.tagName)) return;
      const map: Record<string, Result> = { w: "win", l: "loss", d: "draw" };
      const r = map[e.key.toLowerCase()];
      if (r) setForm((f) => ({ ...f, result: r }));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const finalize = (raw: string) => (keepRaw ? raw.trim() : normalizeDeckName(raw, form.game));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const myDeck = form.deck_id
      ? (decks.find((d) => d.id === form.deck_id)?.name ?? form.my_deck)
      : finalize(form.my_deck);
    if (!myDeck) {
      toast.error(t("matches.myDeckRequiredToast"));
      return;
    }
    let oppLeader = finalize(form.opp_leader);
    let oppDeck = finalize(form.opp_deck);
    if (form.opponent_deck_id) {
      const od = oppDecks.find((d) => d.id === form.opponent_deck_id);
      if (od) {
        oppDeck = od.name;
        oppLeader = od.leader || oppLeader;
      }
    }
    const { error } = await supabase.from("matches").insert({
      user_id: user.id,
      game: form.game,
      event: form.event,
      my_deck: myDeck,
      opp_leader: oppLeader || null,
      opp_deck: oppDeck || null,
      went_first: form.went_first === "true",
      result: form.result,
      notes: form.notes.trim() || null,
      deck_id: form.deck_id || null,
      played_at: form.played_at.toISOString(),
      opponent_user_id: opponent?.id ?? null,
      opponent_deck_id: form.opponent_deck_id || null,
      tournament_note: form.tournament_note.trim() || null,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      opponent
        ? t("matches.recordedWithElo").replace(
            "{delta}",
            `${previewDelta >= 0 ? "+" : ""}${previewDelta}`,
          )
        : t("matches.recordedToast"),
    );
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["matches"] });
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1 h-4 w-4" />
          {t("matches.addMatch")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t("matches.addTitle")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {/* 1) 날짜 + 게임 + 이벤트 */}
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>{t("matches.date")}</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className={cn(
                      "justify-start text-left font-normal",
                      !form.played_at && "text-muted-foreground",
                    )}
                  >
                    <CalendarIcon className="mr-1 h-4 w-4" />
                    {format(form.played_at, "MM/dd")}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={form.played_at}
                    onSelect={(d) => d && setForm({ ...form, played_at: d })}
                    initialFocus
                    className={cn("p-3 pointer-events-auto")}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("matches.game")}</Label>
              <Select
                value={form.game}
                onValueChange={(v) =>
                  setForm({ ...form, game: v as Game, deck_id: "", opponent_deck_id: "" })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {games.map((g) => (
                    <SelectItem key={g.code} value={g.code}>
                      {labelOf(g.code)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("matches.event")}</Label>
              <Select
                value={form.event}
                onValueChange={(v) => setForm({ ...form, event: v as EventT })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="friendly">{t("matches.eventFriendly")}</SelectItem>
                  <SelectItem value="shop">{t("matches.eventShop")}</SelectItem>
                  <SelectItem value="official">{t("matches.eventOfficial")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 2) 선/후, 결과 (게임 바로 밑) */}
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>{t("matches.turn")}</Label>
              <Select
                value={form.went_first}
                onValueChange={(v) => setForm({ ...form, went_first: v })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="true">{t("matches.first")}</SelectItem>
                  <SelectItem value="false">{t("matches.second")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("matches.resultLabel")}</Label>
              <Select
                value={form.result}
                onValueChange={(v) => setForm({ ...form, result: v as Result })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="win">{t("matches.win")}</SelectItem>
                  <SelectItem value="loss">{t("matches.lose")}</SelectItem>
                  <SelectItem value="draw">{t("matches.draw")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* 3) 내 덱 (저장된 덱 우선, 없으면 직접 입력) */}
          <div className="flex flex-col gap-1.5">
            <Label>{t("matches.myDeck")}</Label>
            {decks.length > 0 ? (
              <Select
                value={form.deck_id || "manual"}
                onValueChange={(v) => {
                  if (v === "manual") {
                    setForm({ ...form, deck_id: "" });
                    return;
                  }
                  const d = decks.find((x) => x.id === v);
                  setForm({ ...form, deck_id: v, my_deck: d?.name ?? form.my_deck });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("matches.selectSavedDeck")} />
                </SelectTrigger>
                <SelectContent>
                  {decks.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                      {d.leader ? ` · ${d.leader}` : ""}
                    </SelectItem>
                  ))}
                  <SelectItem value="manual">{t("matches.manualInput")}</SelectItem>
                </SelectContent>
              </Select>
            ) : null}
            {(decks.length === 0 || !form.deck_id) && (
              <>
                <Input
                  value={form.my_deck}
                  onChange={(e) => setForm({ ...form, my_deck: e.target.value })}
                  placeholder={
                    decks.length === 0 ? t("matches.noSavedDecks") : t("matches.deckPlaceholder")
                  }
                  required
                />
                {!keepRaw && (
                  <CanonicalHint
                    raw={form.my_deck}
                    game={form.game}
                    onApply={(v) => setForm({ ...form, my_deck: v })}
                  />
                )}
              </>
            )}
          </div>

          {/* 4) 상대 정보 — 사용자 태그 + 상대 덱 */}
          <div className="space-y-2 rounded-md border border-border p-3">
            <Label>{t("matches.opponent")}</Label>
            <OpponentSearch
              selected={opponent}
              onSelect={(u) => {
                setOpponent(u);
                setForm({ ...form, opponent_deck_id: "" });
              }}
              onClear={() => {
                setOpponent(null);
                setForm({ ...form, opponent_deck_id: "" });
              }}
            />

            {opponent && oppDecks.length > 0 && (
              <Select
                value={form.opponent_deck_id || "manual"}
                onValueChange={(v) =>
                  setForm({ ...form, opponent_deck_id: v === "manual" ? "" : v })
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder={t("matches.oppSavedDeck")} />
                </SelectTrigger>
                <SelectContent>
                  {oppDecks.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                      {d.leader ? ` · ${d.leader}` : ""}
                    </SelectItem>
                  ))}
                  <SelectItem value="manual">{t("matches.manualInput")}</SelectItem>
                </SelectContent>
              </Select>
            )}
            {opponent && oppDecks.length === 0 && (
              <p className="text-[11px] text-muted-foreground">{t("matches.noOppDecksDesc")}</p>
            )}

            {!form.opponent_deck_id && (
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={form.opp_leader}
                  onChange={(e) => setForm({ ...form, opp_leader: e.target.value })}
                  placeholder={t("matches.oppLeader")}
                />
                <Input
                  value={form.opp_deck}
                  onChange={(e) => setForm({ ...form, opp_deck: e.target.value })}
                  placeholder={t("matches.oppDeck")}
                />
              </div>
            )}
          </div>

          {/* 5) 대회 메모 + ELO 미리보기 */}
          {form.event !== "friendly" && (
            <div className="flex flex-col gap-1.5">
              <Label>{t("matches.tournamentNote")}</Label>
              <Textarea
                value={form.tournament_note}
                onChange={(e) => setForm({ ...form, tournament_note: e.target.value })}
                placeholder={t("matches.tournamentNotePlaceholder")}
                rows={2}
              />
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <Label>{t("matches.matchNote")}</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder={t("matches.matchNotePlaceholder")}
              rows={2}
            />
          </div>

          {opponent && ratings && (
            <div className="rounded-md bg-muted/40 px-3 py-2 text-xs">
              <p className="text-muted-foreground">
                {t("matches.eloPreviewTitle")}{" "}
                <span className="font-medium text-foreground">{ratings.me}</span> vs{" "}
                <span className="font-medium text-foreground">{ratings.op}</span>
              </p>
              <p className="mt-0.5">
                {t("matches.expectedChange")}{" "}
                <span
                  className={cn(
                    "font-semibold",
                    previewDelta > 0 ? "text-emerald-600" : previewDelta < 0 ? "text-rose-600" : "",
                  )}
                >
                  {previewDelta > 0 ? "+" : ""}
                  {previewDelta}
                  {t("matches.points")}
                </span>
                <span className="ml-2 text-muted-foreground">
                  (K=32, {t("matches.expectedWinRate")} {Math.round(expected * 100)}%)
                </span>
              </p>
            </div>
          )}

          <div className="flex items-center justify-between gap-2 pt-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="h-3.5 w-3.5"
                checked={keepRaw}
                onChange={(e) => setKeepRaw(e.target.checked)}
              />
              {t("matches.keepRaw")}
            </label>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                {t("common.cancel")}
              </Button>
              <Button type="submit">{t("common.save")}</Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Mobile 3-step bottom sheet ───────────────────────────────────────────────

const GAME_OPTIONS: { value: Game; label: string; sub: string }[] = [
  { value: "optcg", label: "원피스 TCG", sub: "ONE PIECE CARD GAME" },
  { value: "ptcg", label: "포켓몬 TCG", sub: "Pokémon Trading Card Game" },
  { value: "dtcg", label: "디지몬 TCG", sub: "Digimon Card Game" },
];

function NewMatchMobileDrawer({
  onCreated,
  lastMatch,
}: {
  onCreated: () => void;
  lastMatch?: Match;
}) {
  const { user } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState(1);
  const [keepRaw, setKeepRaw] = useState(false);

  const initial = () => ({
    game: (lastMatch?.game ?? "optcg") as Game,
    my_deck: lastMatch?.my_deck ?? "",
    deck_id: "" as string,
    went_first: "true",
    result: "win" as Result,
    played_at: new Date(),
  });
  const [form, setForm] = useState(initial);

  const { data: decks = [] } = useQuery({
    queryKey: ["decks-for-match", user?.id, form.game],
    enabled: !!user && open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("decks")
        .select("id,name,leader,game")
        .eq("user_id", user!.id)
        .eq("game", form.game)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  useEffect(() => {
    if (!open) return;
    setForm(initial());
    setStep(1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lastMatch?.id]);

  const submit = async () => {
    if (!user) return;
    const myDeck = form.deck_id
      ? (decks.find((d) => d.id === form.deck_id)?.name ?? form.my_deck)
      : keepRaw
        ? form.my_deck.trim()
        : normalizeDeckName(form.my_deck, form.game);
    if (!myDeck) {
      toast.error(t("matches.myDeckRequiredToast"));
      return;
    }
    const { error } = await supabase.from("matches").insert({
      user_id: user.id,
      game: form.game,
      event: "friendly" as EventT,
      my_deck: myDeck,
      opp_leader: null,
      opp_deck: null,
      went_first: form.went_first === "true",
      result: form.result,
      notes: null,
      deck_id: form.deck_id || null,
      played_at: form.played_at.toISOString(),
      opponent_user_id: null,
      opponent_deck_id: null,
      tournament_note: null,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("matches.recordedToast"));
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["matches"] });
    onCreated();
  };

  const stepDots = (
    <div className="flex items-center gap-1.5">
      {[1, 2, 3].map((s) => (
        <div
          key={s}
          className={cn(
            "h-1.5 rounded-full transition-all duration-200",
            step === s
              ? "w-5 bg-foreground"
              : step > s
                ? "w-2.5 bg-foreground/40"
                : "w-2.5 bg-muted",
          )}
        />
      ))}
    </div>
  );

  return (
    <Drawer open={open} onOpenChange={setOpen}>
      <DrawerTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1 h-4 w-4" />
          {t("matches.addMatch")}
        </Button>
      </DrawerTrigger>
      <DrawerContent className="max-h-[82vh]">
        <DrawerHeader className="flex flex-row items-center justify-between pb-0">
          <DrawerTitle className="text-base">{t("matches.addTitle")}</DrawerTitle>
          {stepDots}
        </DrawerHeader>

        <div className="overflow-y-auto px-4 pb-8 pt-4" data-vaul-no-drag>
          {/* ── Step 1: 게임 선택 ── */}
          {step === 1 && (
            <div className="space-y-3">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {t("matches.game")}
              </p>
              {GAME_OPTIONS.map((g) => (
                <button
                  key={g.value}
                  type="button"
                  onClick={() => {
                    setForm((f) => ({ ...f, game: g.value, deck_id: "" }));
                    setStep(2);
                  }}
                  className={cn(
                    "flex w-full items-center gap-4 rounded-2xl border-2 px-5 py-4 text-left transition-all active:scale-[0.98]",
                    form.game === g.value
                      ? "border-foreground bg-accent"
                      : "border-border hover:border-foreground/30",
                  )}
                >
                  <div>
                    <p className="text-base font-semibold">{g.label}</p>
                    <p className="text-[11px] text-muted-foreground">{g.sub}</p>
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* ── Step 2: 선/후공 + 승패 ── */}
          {step === 2 && (
            <div className="space-y-5">
              {/* 선/후공 */}
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("matches.turn")}
                </p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { value: "true", label: t("matches.first") },
                    { value: "false", label: t("matches.second") },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, went_first: opt.value }))}
                      className={cn(
                        "rounded-2xl border-2 py-4 text-sm font-semibold transition-all active:scale-[0.98]",
                        form.went_first === opt.value
                          ? "border-foreground bg-foreground text-background"
                          : "border-border hover:border-foreground/30",
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* 승패 */}
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("matches.resultLabel")}
                </p>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    {
                      value: "win",
                      label: t("matches.win"),
                      active: "bg-emerald-600 border-emerald-600 text-white",
                    },
                    {
                      value: "loss",
                      label: t("matches.lose"),
                      active: "bg-rose-600 border-rose-600 text-white",
                    },
                    {
                      value: "draw",
                      label: t("matches.draw"),
                      active: "bg-foreground border-foreground text-background",
                    },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setForm((f) => ({ ...f, result: opt.value as Result }))}
                      className={cn(
                        "rounded-2xl border-2 py-4 text-sm font-semibold transition-all active:scale-[0.98]",
                        form.result === opt.value
                          ? opt.active
                          : "border-border hover:border-foreground/30",
                      )}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setStep(1)}
                >
                  ← {t("common.back")}
                </Button>
                <Button type="button" className="flex-1" onClick={() => setStep(3)}>
                  {t("common.confirm")} →
                </Button>
              </div>
            </div>
          )}

          {/* ── Step 3: 덱 선택 ── */}
          {step === 3 && (
            <div className="space-y-4">
              <div className="space-y-2">
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t("matches.myDeck")}
                </p>
                {decks.length > 0 && (
                  <Select
                    value={form.deck_id || "manual"}
                    onValueChange={(v) => {
                      if (v === "manual") {
                        setForm((f) => ({ ...f, deck_id: "" }));
                        return;
                      }
                      const d = decks.find((x) => x.id === v);
                      setForm((f) => ({ ...f, deck_id: v, my_deck: d?.name ?? f.my_deck }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t("matches.selectSavedDeck")} />
                    </SelectTrigger>
                    <SelectContent>
                      {decks.map((d) => (
                        <SelectItem key={d.id} value={d.id}>
                          {d.name}
                          {d.leader ? ` · ${d.leader}` : ""}
                        </SelectItem>
                      ))}
                      <SelectItem value="manual">{t("matches.manualInput")}</SelectItem>
                    </SelectContent>
                  </Select>
                )}
                {(decks.length === 0 || !form.deck_id) && (
                  <>
                    <Input
                      value={form.my_deck}
                      onChange={(e) => setForm((f) => ({ ...f, my_deck: e.target.value }))}
                      placeholder={
                        decks.length === 0
                          ? t("matches.noSavedDecks")
                          : t("matches.deckPlaceholder")
                      }
                      autoComplete="off"
                    />
                    {!keepRaw && (
                      <CanonicalHint
                        raw={form.my_deck}
                        game={form.game}
                        onApply={(v) => setForm((f) => ({ ...f, my_deck: v }))}
                      />
                    )}
                  </>
                )}
              </div>

              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  className="h-3.5 w-3.5"
                  checked={keepRaw}
                  onChange={(e) => setKeepRaw(e.target.checked)}
                />
                {t("matches.keepRaw")}
              </label>

              <div className="flex gap-2 pt-1">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={() => setStep(2)}
                >
                  ← {t("common.back")}
                </Button>
                <Button type="button" className="flex-1" onClick={submit}>
                  {t("common.save")}
                </Button>
              </div>
            </div>
          )}
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function NewMatchButton({ onCreated, lastMatch }: { onCreated: () => void; lastMatch?: Match }) {
  const isMobile = useIsMobile();
  return isMobile ? (
    <NewMatchMobileDrawer onCreated={onCreated} lastMatch={lastMatch} />
  ) : (
    <NewMatchDialog onCreated={onCreated} lastMatch={lastMatch} />
  );
}

const PAGE_SIZE = 500; // rows per select page (Supabase default cap = 1000)
const UPDATE_CONCURRENCY = 8; // parallel updates per batch

async function runWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T) => Promise<void>,
) {
  let i = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (i < items.length) {
      const idx = i++;
      await worker(items[idx]);
    }
  });
  await Promise.all(runners);
}

function NormalizeButton({ onDone }: { onDone: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{
    scanned: number;
    total: number;
    updated: number;
  } | null>(null);

  const run = async () => {
    if (!user) return;
    if (!confirm(t("matches.normalizeConfirm"))) return;

    setBusy(true);
    const toastId = toast.loading(t("matches.normalizingPrepare"));
    try {
      // 1) Total count up-front for progress.
      const { count, error: cErr } = await supabase
        .from("matches")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);
      if (cErr) throw cErr;
      const total = count ?? 0;
      if (total === 0) {
        toast.info(t("matches.noNormalizingMatches"), { id: toastId });
        return;
      }
      setProgress({ scanned: 0, total, updated: 0 });

      // 2) Page through rows, accumulate diffs only.
      type Update = {
        id: string;
        my_deck: string;
        opp_leader: string | null;
        opp_deck: string | null;
      };
      const updates: Update[] = [];
      let scanned = 0;

      for (let from = 0; from < total; from += PAGE_SIZE) {
        const to = Math.min(from + PAGE_SIZE - 1, total - 1);
        const { data, error } = await supabase
          .from("matches")
          .select("id, game, my_deck, opp_leader, opp_deck")
          .eq("user_id", user.id)
          .order("id", { ascending: true })
          .range(from, to);
        if (error) throw error;

        for (const m of data ?? []) {
          const myDeck = normalizeDeckName(m.my_deck, m.game) || m.my_deck;
          const oppLeader = m.opp_leader ? normalizeDeckName(m.opp_leader, m.game) || null : null;
          const oppDeck = m.opp_deck ? normalizeDeckName(m.opp_deck, m.game) || null : null;
          if (
            myDeck !== m.my_deck ||
            (oppLeader ?? null) !== (m.opp_leader ?? null) ||
            (oppDeck ?? null) !== (m.opp_deck ?? null)
          ) {
            updates.push({
              id: m.id,
              my_deck: myDeck,
              opp_leader: oppLeader,
              opp_deck: oppDeck,
            });
          }
        }

        scanned += data?.length ?? 0;
        setProgress({ scanned, total, updated: 0 });
        toast.loading(
          t("matches.normalizingScan")
            .replace("{scanned}", String(scanned))
            .replace("{total}", String(total)),
          { id: toastId },
        );
      }

      if (updates.length === 0) {
        toast.success(t("matches.alreadyNormalized"), { id: toastId });
        return;
      }

      // 3) Apply updates in concurrency-limited batches.
      let ok = 0;
      let fail = 0;
      const tickEvery = Math.max(10, Math.floor(updates.length / 20));

      await runWithConcurrency(updates, UPDATE_CONCURRENCY, async (u) => {
        const { error: uerr } = await supabase
          .from("matches")
          .update({
            my_deck: u.my_deck,
            opp_leader: u.opp_leader,
            opp_deck: u.opp_deck,
          })
          .eq("id", u.id);
        if (uerr) fail++;
        else ok++;
        const done = ok + fail;
        if (done % tickEvery === 0 || done === updates.length) {
          setProgress({ scanned: total, total, updated: ok });
          toast.loading(
            t("matches.normalizingUpdate")
              .replace("{done}", String(done))
              .replace("{total}", String(updates.length)),
            { id: toastId },
          );
        }
      });

      if (fail > 0) {
        toast.error(
          t("matches.normalizedSuccessWithFailures")
            .replace("{ok}", String(ok))
            .replace("{fail}", String(fail)),
          { id: toastId },
        );
      } else {
        toast.success(
          t("matches.normalizedSuccess")
            .replace("{ok}", String(ok))
            .replace("{total}", String(total)),
          { id: toastId },
        );
      }

      qc.invalidateQueries({ queryKey: ["matches"] });
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t("matches.normalizeFailed"), { id: toastId });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const label = busy
    ? progress
      ? progress.scanned < progress.total
        ? `${t("matches.scan")} ${progress.scanned}/${progress.total}`
        : `${t("matches.apply")} ${progress.updated}`
      : t("matches.normalizingInProgress")
    : t("matches.normalizeBtn");

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={run}
      disabled={busy}
      title={t("matches.normalizeTooltip")}
    >
      <Wand2 className="mr-1 h-4 w-4" />
      {label}
    </Button>
  );
}

// ============================================================
// Filters + helpers
// ============================================================

type ResultFilter = "all" | "win" | "loss" | "draw";

interface Filters {
  result: ResultFilter;
  myDeck: string;
  opp: string;
  event: EventT | "all";
  q: string;
  from: string; // yyyy-mm-dd
  to: string;
}

const emptyFilters: Filters = {
  result: "all",
  myDeck: "",
  opp: "",
  event: "all",
  q: "",
  from: "",
  to: "",
};

function applyFilters(rows: Match[], f: Filters): Match[] {
  return rows.filter((m) => {
    if (f.result !== "all" && m.result !== f.result) return false;
    if (f.event !== "all" && m.event !== f.event) return false;
    if (f.myDeck && !m.my_deck.toLowerCase().includes(f.myDeck.toLowerCase())) return false;
    if (f.opp) {
      const o = `${m.opp_leader ?? ""} ${m.opp_deck ?? ""}`.toLowerCase();
      if (!o.includes(f.opp.toLowerCase())) return false;
    }
    if (f.q) {
      const hay =
        `${m.my_deck} ${m.opp_leader ?? ""} ${m.opp_deck ?? ""} ${m.notes ?? ""}`.toLowerCase();
      if (!hay.includes(f.q.toLowerCase())) return false;
    }
    if (f.from) {
      if (new Date(m.played_at).getTime() < new Date(f.from).getTime()) return false;
    }
    if (f.to) {
      // include the whole 'to' day
      const t = new Date(f.to).getTime() + 24 * 60 * 60 * 1000;
      if (new Date(m.played_at).getTime() >= t) return false;
    }
    return true;
  });
}

function FilterBar({
  rows,
  value,
  onChange,
}: {
  rows: Match[];
  value: Filters;
  onChange: (f: Filters) => void;
}) {
  const [open, setOpen] = useState(false);
  const { t } = useI18n();
  const active =
    value.result !== "all" ||
    value.event !== "all" ||
    !!value.myDeck ||
    !!value.opp ||
    !!value.q ||
    !!value.from ||
    !!value.to;
  const filteredCount = useMemo(() => applyFilters(rows, value).length, [rows, value]);

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) => onChange({ ...value, [k]: v });

  return (
    <section className="mt-6 rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="text-sm font-medium hover:underline"
          >
            {t("matches.filter")} {open ? t("matches.close") : t("matches.open")}
          </button>
          {active && (
            <span className="text-xs text-muted-foreground">
              · {filteredCount}/{rows.length}
              {t("matches.countMatched")}
            </span>
          )}
        </div>
        {active && (
          <button
            type="button"
            onClick={() => onChange(emptyFilters)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" /> {t("matches.reset")}
          </button>
        )}
      </div>
      {open && (
        <div className="grid grid-cols-2 gap-3 border-t border-border p-4 md:grid-cols-4">
          <div className="flex flex-col gap-1">
            <Label className="text-[11px]">{t("matches.result")}</Label>
            <Select value={value.result} onValueChange={(v) => set("result", v as ResultFilter)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("matches.all")}</SelectItem>
                <SelectItem value="win">{t("matches.win")}</SelectItem>
                <SelectItem value="loss">{t("matches.lose")}</SelectItem>
                <SelectItem value="draw">{t("matches.draw")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-[11px]">{t("matches.event")}</Label>
            <Select value={value.event} onValueChange={(v) => set("event", v as EventT | "all")}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">{t("matches.all")}</SelectItem>
                <SelectItem value="friendly">{t("matches.eventFriendly")}</SelectItem>
                <SelectItem value="shop">{t("matches.eventShop")}</SelectItem>
                <SelectItem value="official">{t("matches.eventOfficial")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-[11px]">{t("matches.myDeck")}</Label>
            <Input
              value={value.myDeck}
              onChange={(e) => set("myDeck", e.target.value)}
              placeholder={t("matches.namePartial")}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-[11px]">{t("matches.opponent")}</Label>
            <Input
              value={value.opp}
              onChange={(e) => set("opp", e.target.value)}
              placeholder={t("matches.leaderPartial")}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-[11px]">{t("matches.startDate")}</Label>
            <Input type="date" value={value.from} onChange={(e) => set("from", e.target.value)} />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-[11px]">{t("matches.endDate")}</Label>
            <Input type="date" value={value.to} onChange={(e) => set("to", e.target.value)} />
          </div>
          <div className="col-span-2 flex flex-col gap-1">
            <Label className="text-[11px]">{t("matches.keyword")}</Label>
            <Input
              value={value.q}
              onChange={(e) => set("q", e.target.value)}
              placeholder={t("matches.searchPlaceholder")}
            />
          </div>
        </div>
      )}
    </section>
  );
}

// ============================================================
// Import / Export
// ============================================================

function ImportExportButton({ rows, onImported }: { rows: Match[]; onImported: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const exportCsv = () => {
    downloadFile(
      `duelnight-matches-${new Date().toISOString().slice(0, 10)}.csv`,
      matchesToCsv(rows),
      "text/csv;charset=utf-8",
    );
  };
  const exportJson = () => {
    downloadFile(
      `duelnight-matches-${new Date().toISOString().slice(0, 10)}.json`,
      matchesToJson(rows),
      "application/json",
    );
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;
    setBusy(true);
    const toastId = toast.loading(t("matches.analyzingFile"));
    try {
      const text = await file.text();
      const rows = parseImport(text);
      if (rows.length === 0) {
        toast.error(t("matches.noValidRows"), { id: toastId });
        return;
      }
      const payload = rows.map((r) => ({
        user_id: user.id,
        game: r.game,
        event: r.event,
        my_deck: r.my_deck,
        opp_leader: r.opp_leader,
        opp_deck: r.opp_deck,
        went_first: r.went_first,
        result: r.result,
        notes: r.notes,
        ...(r.played_at ? { played_at: r.played_at } : {}),
      }));
      // Insert in chunks of 200
      let ok = 0;
      for (let i = 0; i < payload.length; i += 200) {
        const chunk = payload.slice(i, i + 200);
        const { error } = await supabase.from("matches").insert(chunk);
        if (error) {
          toast.error(error.message, { id: toastId });
          return;
        }
        ok += chunk.length;
        toast.loading(`${t("matches.importing")} ${ok}/${payload.length}`, { id: toastId });
      }
      toast.success(t("matches.importedSuccess").replace("{count}", String(ok)), { id: toastId });
      qc.invalidateQueries({ queryKey: ["matches"] });
      onImported();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : t("matches.importFailed"), { id: toastId });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Download className="mr-1 h-4 w-4" />
          {t("matches.importExport")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("matches.importExportTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <p className="text-xs text-muted-foreground mb-2">
              {t("matches.backupDesc").replace("{count}", String(rows.length))}
            </p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={exportCsv}>
                <Download className="mr-1 h-4 w-4" /> CSV
              </Button>
              <Button size="sm" variant="outline" onClick={exportJson}>
                <Download className="mr-1 h-4 w-4" /> JSON
              </Button>
            </div>
          </div>
          <div className="border-t border-border pt-4">
            <p className="text-xs text-muted-foreground mb-2">
              {t("matches.importDesc").replace(
                "{headers}",
                "game, event, my_deck, opp_leader, opp_deck, went_first, result, notes, played_at",
              )}
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.json,text/csv,application/json"
              onChange={onFile}
              className="hidden"
            />
            <Button size="sm" onClick={() => fileRef.current?.click()} disabled={busy}>
              <Upload className="mr-1 h-4 w-4" />
              {busy ? t("matches.importing") : t("matches.selectFile")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ===== Tagged-as-opponent section =====
// Lists matches where the current user was tagged as the opponent,
// letting them fill in their own deck info via update_opponent_match RPC.
function TaggedAsOpponentSection({ onSaved }: { onSaved: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { t, language } = useI18n();
  const { labelOf } = useGames();

  const { data: rows = [], refetch } = useQuery({
    queryKey: ["matches-as-opponent", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("matches")
        .select("*")
        .eq("opponent_user_id", user!.id)
        .order("played_at", { ascending: false })
        .limit(30);
      if (error) throw error;
      return data as Match[];
    },
  });

  const [editing, setEditing] = useState<Match | null>(null);

  const { data: myDecks = [] } = useQuery({
    queryKey: ["my-decks-for-opp", user?.id, editing?.game],
    enabled: !!user && !!editing,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("decks")
        .select("id,name,leader,game")
        .eq("user_id", user!.id)
        .eq("game", editing!.game)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return data ?? [];
    },
  });

  if (!user || rows.length === 0) return null;

  return (
    <section className="mt-8">
      <h2 className="text-sm font-medium">{t("matches.taggedMatches")}</h2>
      <p className="text-[11px] text-muted-foreground">{t("matches.taggedMatchesDesc")}</p>
      <div className="mt-3 overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">{t("matches.date")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("matches.game")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("matches.opponent")}</th>
              <th className="px-3 py-2 text-left font-medium">{t("matches.myDeck")}</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((m) => (
              <tr key={m.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2 text-muted-foreground">
                  {new Date(m.played_at).toLocaleDateString(
                    language === "ko" ? "ko-KR" : language === "ja" ? "ja-JP" : "en-US",
                  )}
                </td>
                <td className="px-3 py-2">{labelOf(m.game)}</td>
                <td className="px-3 py-2">{m.my_deck}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {m.opp_leader || m.opp_deck || (
                    <span className="italic">{t("matches.notEntered")}</span>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <Button size="sm" variant="outline" onClick={() => setEditing(m)}>
                    <Pencil className="mr-1 h-3.5 w-3.5" />
                    {t("common.edit")}
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t("matches.oppSelfEditTitle")}</DialogTitle>
          </DialogHeader>
          {editing && (
            <OpponentSelfEditForm
              match={editing}
              myDecks={myDecks}
              onClose={() => setEditing(null)}
              onSaved={() => {
                setEditing(null);
                refetch();
                qc.invalidateQueries({ queryKey: ["matches"] });
                onSaved();
              }}
            />
          )}
        </DialogContent>
      </Dialog>
    </section>
  );
}

function OpponentSelfEditForm({
  match,
  myDecks,
  onClose,
  onSaved,
}: {
  match: Match;
  myDecks: Array<{ id: string; name: string; leader: string | null; game: Game }>;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [deckId, setDeckId] = useState<string>(match.opponent_deck_id ?? "");
  const [oppLeader, setOppLeader] = useState(match.opp_leader ?? "");
  const [oppDeck, setOppDeck] = useState(match.opp_deck ?? "");
  const [busy, setBusy] = useState(false);
  const { t } = useI18n();

  const onPickDeck = (id: string) => {
    setDeckId(id);
    if (id === "_manual_") return;
    const d = myDecks.find((x) => x.id === id);
    if (d) {
      setOppDeck(d.name);
      setOppLeader(d.leader ?? "");
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const { error } = await supabase.rpc("update_opponent_match", {
      _match_id: match.id,
      _opp_deck: oppDeck.trim(),
      _opp_leader: oppLeader.trim(),
      _opp_deck_id: (deckId && deckId !== "_manual_" ? deckId : null) as string,
    });
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("matches.editedToast"));
    onSaved();
  };

  return (
    <form onSubmit={submit} className="grid gap-3">
      {myDecks.length > 0 && (
        <div className="flex flex-col gap-1.5">
          <Label>{t("matches.selectMyDeck")}</Label>
          <Select value={deckId || "_manual_"} onValueChange={onPickDeck}>
            <SelectTrigger>
              <SelectValue placeholder={t("matches.chooseDeck")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="_manual_">{t("matches.manualInputOption")}</SelectItem>
              {myDecks.map((d) => (
                <SelectItem key={d.id} value={d.id}>
                  {d.name}
                  {d.leader ? ` · ${d.leader}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}
      <div className="flex flex-col gap-1.5">
        <Label>{t("matches.deckName")}</Label>
        <Input value={oppDeck} onChange={(e) => setOppDeck(e.target.value)} />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>{t("matches.leaderArchetype")}</Label>
        <Input value={oppLeader} onChange={(e) => setOppLeader(e.target.value)} />
      </div>
      <div className="mt-2 flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={busy}>
          {busy ? t("common.loading") : t("common.save")}
        </Button>
      </div>
    </form>
  );
}
