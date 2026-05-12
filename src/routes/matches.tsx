import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Swords, Trash2, Plus, Wand2, Pencil, Download, Upload, X } from "lucide-react";
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
import {
  matchesToCsv,
  matchesToJson,
  parseImport,
  downloadFile,
} from "@/lib/csv";
import type { Database } from "@/integrations/supabase/types";

type Game = Database["public"]["Enums"]["tcg_game"];
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
  head: () => ({
    meta: [
      { title: "전적 기록 — TCG Hub" },
      {
        name: "description",
        content: "대전 결과를 기록하고 덱·선후공·매치업 통계를 자동 계산.",
      },
    ],
  }),
  component: MatchesPage,
});

function MatchesPage() {
  const { user, loading } = useAuth();
  const [game, setGame] = useState<Game | "all">("all");
  const [period, setPeriod] = useState<Period>("30");
  const [chartUnit, setChartUnit] = useState<ChartUnit>("day");
  const [filters, setFilters] = useState<Filters>(emptyFilters);

  const { data: allRows = [], refetch } = useQuery({
    queryKey: ["matches", user?.id, game],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from("matches")
        .select("*")
        .order("played_at", { ascending: false });
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
        불러오는 중...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-8">
        <PageHeader
          title="전적 기록"
          description="로그인하면 전적이 자동으로 저장되고 통계가 계산됩니다."
        />
        <div className="mt-6 rounded-lg border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">로그인이 필요합니다</p>
          <Link
            to="/login"
            className="mt-4 inline-flex items-center justify-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
          >
            로그인하러 가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <PageHeader
        title="전적 기록"
        description="대전 결과를 기록하면 덱·선후공·매치업 통계가 자동 갱신됩니다"
      />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">게임</span>
            <GameTabs value={game} onChange={setGame} />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">기간</span>
            <PeriodTabs value={period} onChange={setPeriod} />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ImportExportButton rows={allRows} onImported={() => refetch()} />
          <NormalizeButton onDone={() => refetch()} />
          <NewMatchDialog onCreated={() => refetch()} lastMatch={allRows[0]} />
        </div>
      </div>

      <FilterBar
        rows={periodRows}
        value={filters}
        onChange={setFilters}
      />

      <StatGrid stats={stats} streak={streak} />

      <section className="mt-6 rounded-lg border border-border bg-card">
        <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
          <div>
            <h3 className="text-sm font-medium">승률 추이</h3>
            <p className="text-xs text-muted-foreground">
              누적 승률(%) — 전체 · 사용 상위 덱 3개 · 최근 7판 이동평균
            </p>
          </div>
          <ChartUnitTabs value={chartUnit} onChange={setChartUnit} />
        </div>
        <WinRateChart rows={rows} unit={chartUnit} />
      </section>

      <AiCoachCard rows={rows} stats={stats} period={period} game={game} />

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DeckTable rows={stats.byDeck} />
        <MatchupTable rows={stats.matchups} />
      </div>

      <div className="mt-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <EventTable rows={stats.byEvent} />
        <OpponentTable rows={stats.topOpponents} />
      </div>

      <RecentList rows={rows} onDeleted={() => refetch()} />
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
  const items: { id: ChartUnit; label: string }[] = [
    { id: "day", label: "일" },
    { id: "week", label: "주" },
    { id: "month", label: "월" },
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

function PeriodTabs({
  value,
  onChange,
}: {
  value: Period;
  onChange: (v: Period) => void;
}) {
  const items: { id: Period; label: string }[] = [
    { id: "7", label: "7일" },
    { id: "30", label: "30일" },
    { id: "90", label: "90일" },
    { id: "all", label: "전체" },
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
  const items: { id: Game | "all"; label: string }[] = [
    { id: "all", label: "전체" },
    { id: "optcg", label: "원피스" },
    { id: "ptcg", label: "포켓몬" },
    { id: "dtcg", label: "디지몬" },
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
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
        {fmtPct(pack)}
      </p>
      <p className="mt-1 text-[11px] text-muted-foreground">
        {pack.wins}승 {pack.losses}패{pack.draws ? ` ${pack.draws}무` : ""} ·{" "}
        {pack.total}판
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
  const cur = streak.current;
  const curLabel =
    cur === 0 ? "—" : cur > 0 ? `${cur}연승 🔥` : `${-cur}연패`;
  const curClass =
    cur > 0
      ? "text-emerald-600 dark:text-emerald-400"
      : cur < 0
        ? "text-rose-600 dark:text-rose-400"
        : "text-foreground";
  return (
    <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-5">
      <StatCard label="전체 승률" pack={stats.overall} />
      <StatCard label="선공 승률" pack={stats.first} />
      <StatCard label="후공 승률" pack={stats.second} />
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">현재 연속</p>
        <p className={`mt-2 text-2xl font-semibold tracking-tight ${curClass}`}>
          {curLabel}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          최고 {streak.best}연승 · 최장 {streak.worst}연패
        </p>
      </div>
      <div className="rounded-lg border border-border bg-card p-4">
        <p className="text-xs text-muted-foreground">사용 덱</p>
        <p className="mt-2 text-2xl font-semibold tracking-tight">
          {stats.byDeck.length}
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          매치업 {stats.matchups.length}종
        </p>
      </div>
    </section>
  );
}

function DeckTable({ rows }: { rows: DeckStat[] }) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-medium">덱별 승률</h3>
        <p className="text-[11px] text-muted-foreground">선/후공 분리 · 신뢰하한(95%)</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-xs text-muted-foreground">
          데이터 없음
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.deck} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-sm">{r.deck}</span>
                <span className="text-xs text-muted-foreground">
                  <span className="mr-2 font-medium text-foreground">
                    {fmtPct(r.stats)}
                  </span>
                  {r.stats.wins}-{r.stats.losses}
                  {r.stats.draws ? `-${r.stats.draws}` : ""}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                <span>선공 {fmtPct(r.first)} ({r.first.total})</span>
                <span>후공 {fmtPct(r.second)} ({r.second.total})</span>
                <span>신뢰하한 {fmtPctVal(r.stats.wilsonLow)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MatchupTable({ rows }: { rows: MatchupStat[] }) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-medium">매치업 (내 덱 × 상대)</h3>
        <p className="text-[11px] text-muted-foreground">선/후공 · 신뢰하한 표시</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-xs text-muted-foreground">
          상대 덱/리더를 입력한 전적이 필요합니다
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
                  <span className="mr-2 font-medium text-foreground">
                    {fmtPct(r.stats)}
                  </span>
                  {r.stats.wins}-{r.stats.losses}
                  {r.stats.draws ? `-${r.stats.draws}` : ""}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-3 text-[11px] text-muted-foreground">
                <span>선공 {fmtPct(r.first)} ({r.first.total})</span>
                <span>후공 {fmtPct(r.second)} ({r.second.total})</span>
                <span>신뢰하한 {fmtPctVal(r.stats.wilsonLow)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EventTable({ rows }: { rows: EventStat[] }) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-medium">이벤트별 승률</h3>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-xs text-muted-foreground">데이터 없음</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.event} className="flex items-center justify-between px-4 py-3">
              <span className="text-sm">{EVENT_LABEL[r.event]}</span>
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

function OpponentTable({ rows }: { rows: OpponentFreq[] }) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-medium">상대 메타 Top</h3>
        <p className="text-[11px] text-muted-foreground">자주 만난 상대 · 그 상대 대상 내 승률</p>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-xs text-muted-foreground">데이터 없음</p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li key={r.opponent} className="px-4 py-3">
              <div className="flex items-center justify-between gap-3">
                <span className="truncate text-sm">{r.opponent}</span>
                <span className="text-xs text-muted-foreground">
                  <span className="mr-2 font-medium text-foreground">{fmtPct(r.stats)}</span>
                  {r.count}회 · {fmtPctVal(r.share)}
                </span>
              </div>
              <div className="mt-1 h-1.5 w-full overflow-hidden rounded bg-muted">
                <div
                  className="h-full bg-foreground/70"
                  style={{ width: `${Math.round(r.share * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function RecentList({
  rows,
  onDeleted,
}: {
  rows: Match[];
  onDeleted: () => void;
}) {
  const [editing, setEditing] = useState<Match | null>(null);
  const [page, setPage] = useState(1);
  const PAGE = 30;
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE));
  const safePage = Math.min(page, totalPages);
  const pageRows = rows.slice((safePage - 1) * PAGE, safePage * PAGE);
  useEffect(() => {
    setPage(1);
  }, [rows.length]);

  if (rows.length === 0) {
    return (
      <div className="mt-8">
        <EmptyState
          icon={Swords}
          title="기록된 전적이 없어요"
          description="우측 상단 '전적 추가'로 첫 결과를 기록해 보세요."
        />
      </div>
    );
  }
  const onDelete = async (id: string) => {
    if (!confirm("이 전적을 삭제할까요?")) return;
    const { error } = await supabase.from("matches").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("삭제됨");
      onDeleted();
    }
  };
  return (
    <section className="mt-8">
      <h2 className="text-sm font-medium">최근 전적</h2>
      <div className="mt-3 overflow-hidden rounded-lg border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/30 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">일자</th>
              <th className="px-3 py-2 text-left font-medium">게임</th>
              <th className="px-3 py-2 text-left font-medium">이벤트</th>
              <th className="px-3 py-2 text-left font-medium">내 덱</th>
              <th className="px-3 py-2 text-left font-medium">상대</th>
              <th className="px-3 py-2 text-left font-medium">선/후</th>
              <th className="px-3 py-2 text-left font-medium">결과</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {pageRows.map((m) => (
              <tr key={m.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2 text-muted-foreground">
                  {new Date(m.played_at).toLocaleDateString("ko-KR")}
                </td>
                <td className="px-3 py-2">{GAME_LABEL[m.game]}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {EVENT_LABEL[m.event]}
                </td>
                <td className="px-3 py-2">{m.my_deck}</td>
                <td className="px-3 py-2 text-muted-foreground">
                  {m.opp_leader || m.opp_deck || "—"}
                </td>
                <td className="px-3 py-2">{m.went_first ? "선공" : "후공"}</td>
                <td className="px-3 py-2">
                  <ResultBadge r={m.result} />
                </td>
                <td className="px-3 py-2 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => setEditing(m)}
                      className="text-muted-foreground hover:text-foreground"
                      aria-label="수정"
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => onDelete(m.id)}
                      className="text-muted-foreground hover:text-destructive"
                      aria-label="삭제"
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
      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            총 {rows.length}건 · {safePage}/{totalPages} 페이지
          </span>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={safePage <= 1}
            >
              이전
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={safePage >= totalPages}
            >
              다음
            </Button>
          </div>
        </div>
      )}
      <EditMatchDialog
        match={editing}
        onOpenChange={(o) => !o && setEditing(null)}
        onSaved={() => {
          setEditing(null);
          onDeleted();
        }}
      />
    </section>
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
      toast.error("내 덱 이름을 입력해 주세요");
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
    toast.success("수정됨");
    qc.invalidateQueries({ queryKey: ["matches"] });
    onSaved();
  };

  return (
    <Dialog open={!!match} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>전적 수정</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid grid-cols-2 gap-3">
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label>이벤트</Label>
            <Select
              value={form.event}
              onValueChange={(v) => setForm({ ...form, event: v as EventT })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="friendly">친선</SelectItem>
                <SelectItem value="shop">매장 대회</SelectItem>
                <SelectItem value="official">공식 대회</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label>내 덱</Label>
            <Input
              value={form.my_deck}
              onChange={(e) => setForm({ ...form, my_deck: e.target.value })}
              required
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>상대 리더</Label>
            <Input
              value={form.opp_leader}
              onChange={(e) => setForm({ ...form, opp_leader: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>상대 덱</Label>
            <Input
              value={form.opp_deck}
              onChange={(e) => setForm({ ...form, opp_deck: e.target.value })}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>선/후</Label>
            <Select
              value={form.went_first}
              onValueChange={(v) => setForm({ ...form, went_first: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">선공</SelectItem>
                <SelectItem value="false">후공</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>결과</Label>
            <Select
              value={form.result}
              onValueChange={(v) => setForm({ ...form, result: v as Result })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="win">승</SelectItem>
                <SelectItem value="loss">패</SelectItem>
                <SelectItem value="draw">무</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 mt-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              취소
            </Button>
            <Button type="submit">저장</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ResultBadge({ r }: { r: Result }) {
  const map = {
    win: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    loss: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
    draw: "bg-muted text-muted-foreground",
  } as const;
  const label = { win: "승", loss: "패", draw: "무" }[r];
  return (
    <span
      className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${map[r]}`}
    >
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
  const canonical = normalizeDeckName(raw, game);
  if (!canonical || canonical === raw.trim()) return null;
  return (
    <div className="flex items-center gap-2 text-xs text-muted-foreground">
      <span>
        저장 시:{" "}
        <span className="font-medium text-foreground">{canonical}</span>
      </span>
      <button
        type="button"
        onClick={() => onApply(canonical)}
        className="rounded border border-border px-1.5 py-0.5 text-[10px] hover:bg-accent"
      >
        적용
      </button>
    </div>
  );
}

function NewMatchDialog({
  onCreated,
  lastMatch,
}: {
  onCreated: () => void;
  lastMatch?: Match;
}) {
  const { user } = useAuth();
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
    deck_id: (lastMatch?.deck_id ?? "") as string,
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

  // When opening, refresh defaults from the most recent match (if any).
  useEffect(() => {
    if (!open) return;
    setForm(initial());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, lastMatch?.id]);

  // W / L / D keyboard shortcuts while dialog is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (target && /^(input|textarea|select)$/i.test(target.tagName)) return;
      const map: Record<string, Result> = { w: "win", l: "loss", d: "draw" };
      const r = map[e.key.toLowerCase()];
      if (r) {
        setForm((f) => ({ ...f, result: r }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const finalize = (raw: string) =>
    keepRaw ? raw.trim() : normalizeDeckName(raw, form.game);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const myDeck = finalize(form.my_deck);
    if (!myDeck) {
      toast.error("내 덱 이름을 입력해 주세요");
      return;
    }
    const oppLeader = finalize(form.opp_leader);
    const oppDeck = finalize(form.opp_deck);
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
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("기록됨");
    setOpen(false);
    qc.invalidateQueries({ queryKey: ["matches"] });
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1 h-4 w-4" />
          전적 추가
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>전적 기록</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="grid grid-cols-2 gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>게임</Label>
            <Select
              value={form.game}
              onValueChange={(v) => setForm({ ...form, game: v as Game })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="optcg">원피스</SelectItem>
                <SelectItem value="ptcg">포켓몬</SelectItem>
                <SelectItem value="dtcg">디지몬</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>이벤트</Label>
            <Select
              value={form.event}
              onValueChange={(v) => setForm({ ...form, event: v as EventT })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="friendly">친선</SelectItem>
                <SelectItem value="shop">매장 대회</SelectItem>
                <SelectItem value="official">공식 대회</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {decks.length > 0 && (
            <div className="col-span-2 flex flex-col gap-1.5">
              <Label>내 덱 선택 (선택사항)</Label>
              <Select
                value={form.deck_id || "none"}
                onValueChange={(v) => {
                  if (v === "none") {
                    setForm({ ...form, deck_id: "" });
                    return;
                  }
                  const d = decks.find((x) => x.id === v);
                  setForm({
                    ...form,
                    deck_id: v,
                    my_deck: d?.leader || d?.name || form.my_deck,
                  });
                }}
              >
                <SelectTrigger>
                  <SelectValue placeholder="내 덱 목록에서 선택" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">직접 입력</SelectItem>
                  {decks.map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                      {d.leader ? ` · ${d.leader}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label>내 덱 (리더/덱 이름)</Label>
            <Input
              value={form.my_deck}
              onChange={(e) => setForm({ ...form, my_deck: e.target.value })}
              placeholder="예: 적 루피"
              required
            />
            {!keepRaw && (
              <CanonicalHint
                raw={form.my_deck}
                game={form.game}
                onApply={(v) => setForm({ ...form, my_deck: v })}
              />
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>상대 리더</Label>
            <Input
              value={form.opp_leader}
              onChange={(e) =>
                setForm({ ...form, opp_leader: e.target.value })
              }
              placeholder="예: 검은수염"
            />
            {!keepRaw && (
              <CanonicalHint
                raw={form.opp_leader}
                game={form.game}
                onApply={(v) => setForm({ ...form, opp_leader: v })}
              />
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>상대 덱 타입</Label>
            <Input
              value={form.opp_deck}
              onChange={(e) => setForm({ ...form, opp_deck: e.target.value })}
              placeholder="선택"
            />
            {!keepRaw && (
              <CanonicalHint
                raw={form.opp_deck}
                game={form.game}
                onApply={(v) => setForm({ ...form, opp_deck: v })}
              />
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>선/후</Label>
            <Select
              value={form.went_first}
              onValueChange={(v) => setForm({ ...form, went_first: v })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="true">선공</SelectItem>
                <SelectItem value="false">후공</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>결과</Label>
            <Select
              value={form.result}
              onValueChange={(v) => setForm({ ...form, result: v as Result })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="win">승</SelectItem>
                <SelectItem value="loss">패</SelectItem>
                <SelectItem value="draw">무</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="col-span-2 mt-2 flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="h-3.5 w-3.5"
                checked={keepRaw}
                onChange={(e) => setKeepRaw(e.target.checked)}
              />
              원문 그대로 저장
            </label>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                취소
              </Button>
              <Button type="submit">저장</Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
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
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{
    scanned: number;
    total: number;
    updated: number;
  } | null>(null);

  const run = async () => {
    if (!user) return;
    if (
      !confirm(
        "기존 전적의 덱·리더 이름을 정규화 규칙으로 일괄 정리할까요? 변경된 항목만 업데이트됩니다.",
      )
    )
      return;

    setBusy(true);
    const toastId = toast.loading("정리 준비 중...");
    try {
      // 1) Total count up-front for progress.
      const { count, error: cErr } = await supabase
        .from("matches")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);
      if (cErr) throw cErr;
      const total = count ?? 0;
      if (total === 0) {
        toast.info("정리할 전적이 없습니다", { id: toastId });
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
          const oppLeader = m.opp_leader
            ? normalizeDeckName(m.opp_leader, m.game) || null
            : null;
          const oppDeck = m.opp_deck
            ? normalizeDeckName(m.opp_deck, m.game) || null
            : null;
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
        toast.loading(`스캔 ${scanned}/${total}...`, { id: toastId });
      }

      if (updates.length === 0) {
        toast.success("이미 모두 정규화되어 있습니다", { id: toastId });
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
          toast.loading(`업데이트 ${done}/${updates.length}...`, { id: toastId });
        }
      });

      if (fail > 0) {
        toast.error(`${ok}건 정리 / ${fail}건 실패`, { id: toastId });
      } else {
        toast.success(`${ok}건 정리됨 (총 ${total}건 중)`, { id: toastId });
      }

      qc.invalidateQueries({ queryKey: ["matches"] });
      onDone();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "정리 실패", { id: toastId });
    } finally {
      setBusy(false);
      setProgress(null);
    }
  };

  const label = busy
    ? progress
      ? progress.scanned < progress.total
        ? `스캔 ${progress.scanned}/${progress.total}`
        : `정리 ${progress.updated}`
      : "정리 중..."
    : "이름 정리";

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={run}
      disabled={busy}
      title="기존 전적의 덱·리더 이름을 페이지/배치 단위로 정규화"
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
    if (f.myDeck && !m.my_deck.toLowerCase().includes(f.myDeck.toLowerCase()))
      return false;
    if (f.opp) {
      const o = `${m.opp_leader ?? ""} ${m.opp_deck ?? ""}`.toLowerCase();
      if (!o.includes(f.opp.toLowerCase())) return false;
    }
    if (f.q) {
      const hay = `${m.my_deck} ${m.opp_leader ?? ""} ${m.opp_deck ?? ""} ${m.notes ?? ""}`.toLowerCase();
      if (!hay.includes(f.q.toLowerCase())) return false;
    }
    if (f.from) {
      if (new Date(m.played_at).getTime() < new Date(f.from).getTime())
        return false;
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
  const active =
    value.result !== "all" ||
    value.event !== "all" ||
    !!value.myDeck ||
    !!value.opp ||
    !!value.q ||
    !!value.from ||
    !!value.to;
  const filteredCount = useMemo(() => applyFilters(rows, value).length, [rows, value]);

  const set = <K extends keyof Filters>(k: K, v: Filters[K]) =>
    onChange({ ...value, [k]: v });

  return (
    <section className="mt-6 rounded-lg border border-border bg-card">
      <div className="flex items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            className="text-sm font-medium hover:underline"
          >
            필터 {open ? "닫기" : "열기"}
          </button>
          {active && (
            <span className="text-xs text-muted-foreground">
              · {filteredCount}/{rows.length}건 일치
            </span>
          )}
        </div>
        {active && (
          <button
            type="button"
            onClick={() => onChange(emptyFilters)}
            className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            <X className="h-3 w-3" /> 초기화
          </button>
        )}
      </div>
      {open && (
        <div className="grid grid-cols-2 gap-3 border-t border-border p-4 md:grid-cols-4">
          <div className="flex flex-col gap-1">
            <Label className="text-[11px]">결과</Label>
            <Select
              value={value.result}
              onValueChange={(v) => set("result", v as ResultFilter)}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="win">승</SelectItem>
                <SelectItem value="loss">패</SelectItem>
                <SelectItem value="draw">무</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-[11px]">이벤트</Label>
            <Select
              value={value.event}
              onValueChange={(v) => set("event", v as EventT | "all")}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">전체</SelectItem>
                <SelectItem value="friendly">친선</SelectItem>
                <SelectItem value="shop">매장 대회</SelectItem>
                <SelectItem value="official">공식 대회</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-[11px]">내 덱</Label>
            <Input
              value={value.myDeck}
              onChange={(e) => set("myDeck", e.target.value)}
              placeholder="이름 일부"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-[11px]">상대</Label>
            <Input
              value={value.opp}
              onChange={(e) => set("opp", e.target.value)}
              placeholder="리더/덱 일부"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-[11px]">시작일</Label>
            <Input
              type="date"
              value={value.from}
              onChange={(e) => set("from", e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-[11px]">종료일</Label>
            <Input
              type="date"
              value={value.to}
              onChange={(e) => set("to", e.target.value)}
            />
          </div>
          <div className="col-span-2 flex flex-col gap-1">
            <Label className="text-[11px]">키워드 (메모 포함)</Label>
            <Input
              value={value.q}
              onChange={(e) => set("q", e.target.value)}
              placeholder="검색어"
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

function ImportExportButton({
  rows,
  onImported,
}: {
  rows: Match[];
  onImported: () => void;
}) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  const exportCsv = () => {
    downloadFile(
      `tcghub-matches-${new Date().toISOString().slice(0, 10)}.csv`,
      matchesToCsv(rows),
      "text/csv;charset=utf-8",
    );
  };
  const exportJson = () => {
    downloadFile(
      `tcghub-matches-${new Date().toISOString().slice(0, 10)}.json`,
      matchesToJson(rows),
      "application/json",
    );
  };

  const onFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !user) return;
    setBusy(true);
    const toastId = toast.loading("파일 분석 중...");
    try {
      const text = await file.text();
      const rows = parseImport(text);
      if (rows.length === 0) {
        toast.error("가져올 유효한 행이 없습니다", { id: toastId });
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
        toast.loading(`가져오는 중... ${ok}/${payload.length}`, { id: toastId });
      }
      toast.success(`${ok}건 가져옴`, { id: toastId });
      qc.invalidateQueries({ queryKey: ["matches"] });
      onImported();
      setOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "가져오기 실패", { id: toastId });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          <Download className="mr-1 h-4 w-4" />
          내보내기/가져오기
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>전적 내보내기 / 가져오기</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div>
            <p className="text-xs text-muted-foreground mb-2">
              현재 로드된 {rows.length}건을 백업합니다.
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
              CSV 또는 JSON 파일에서 가져오기. 헤더: game, event, my_deck,
              opp_leader, opp_deck, went_first, result, notes, played_at
            </p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv,.json,text/csv,application/json"
              onChange={onFile}
              className="hidden"
            />
            <Button
              size="sm"
              onClick={() => fileRef.current?.click()}
              disabled={busy}
            >
              <Upload className="mr-1 h-4 w-4" />
              {busy ? "가져오는 중..." : "파일 선택"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
