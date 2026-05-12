import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Swords, Trash2, Plus } from "lucide-react";
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
  fmtPct,
  GAME_LABEL,
  EVENT_LABEL,
  type Match,
  type RatePack,
} from "@/lib/match-stats";
import { WinRateChart } from "@/components/winrate-chart";
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

  const { data: rows = [], refetch } = useQuery({
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

  const stats = useMemo(() => computeStats(rows), [rows]);

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
      >
        <GameTabs value={game} onChange={setGame} />
        <NewMatchDialog onCreated={() => refetch()} />
      </PageHeader>

      <StatGrid stats={stats} />

      <div className="mt-8 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <DeckTable rows={stats.byDeck} />
        <MatchupTable rows={stats.matchups} />
      </div>

      <RecentList rows={rows} onDeleted={() => refetch()} />
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

function StatGrid({ stats }: { stats: ReturnType<typeof computeStats> }) {
  return (
    <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
      <StatCard label="전체 승률" pack={stats.overall} />
      <StatCard label="선공 승률" pack={stats.first} />
      <StatCard label="후공 승률" pack={stats.second} />
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

function DeckTable({
  rows,
}: {
  rows: Array<{ deck: string; stats: RatePack }>;
}) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-medium">덱별 승률</h3>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-xs text-muted-foreground">
          데이터 없음
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.map((r) => (
            <li
              key={r.deck}
              className="flex items-center justify-between px-4 py-3"
            >
              <span className="truncate text-sm">{r.deck}</span>
              <span className="text-xs text-muted-foreground">
                <span className="mr-2 font-medium text-foreground">
                  {fmtPct(r.stats)}
                </span>
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

function MatchupTable({
  rows,
}: {
  rows: Array<{ deck: string; opponent: string; stats: RatePack }>;
}) {
  return (
    <div className="rounded-lg border border-border bg-card">
      <div className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-medium">매치업 (내 덱 × 상대)</h3>
      </div>
      {rows.length === 0 ? (
        <p className="px-4 py-8 text-center text-xs text-muted-foreground">
          상대 덱/리더를 입력한 전적이 필요합니다
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {rows.slice(0, 12).map((r) => (
            <li
              key={`${r.deck}-${r.opponent}`}
              className="flex items-center justify-between px-4 py-3"
            >
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
            {rows.slice(0, 30).map((m) => (
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
                  <button
                    onClick={() => onDelete(m.id)}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="삭제"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
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

function NewMatchDialog({ onCreated }: { onCreated: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    game: "optcg" as Game,
    event: "friendly" as EventT,
    my_deck: "",
    opp_leader: "",
    opp_deck: "",
    went_first: "true",
    result: "win" as Result,
    notes: "",
  });

  useEffect(() => {
    if (!open) return;
    setForm((f) => ({ ...f, my_deck: f.my_deck, opp_leader: "" }));
  }, [open]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const { error } = await supabase.from("matches").insert({
      user_id: user.id,
      game: form.game,
      event: form.event,
      my_deck: form.my_deck.trim(),
      opp_leader: form.opp_leader.trim() || null,
      opp_deck: form.opp_deck.trim() || null,
      went_first: form.went_first === "true",
      result: form.result,
      notes: form.notes.trim() || null,
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
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label>내 덱 (리더/덱 이름)</Label>
            <Input
              value={form.my_deck}
              onChange={(e) => setForm({ ...form, my_deck: e.target.value })}
              placeholder="예: 적 루피"
              required
            />
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
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>상대 덱 타입</Label>
            <Input
              value={form.opp_deck}
              onChange={(e) => setForm({ ...form, opp_deck: e.target.value })}
              placeholder="선택"
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
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button type="submit">저장</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
