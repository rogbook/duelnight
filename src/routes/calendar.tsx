import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CalendarDays, Plus, Trash2, MapPin, ExternalLink, Star } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { GAME_LABEL } from "@/lib/match-stats";
import type { Database } from "@/integrations/supabase/types";

type Game = Database["public"]["Enums"]["tcg_game"];
type EventKind = Database["public"]["Enums"]["event_kind"];
type Event = Database["public"]["Tables"]["events"]["Row"];

const KIND_LABEL: Record<EventKind | "all", string> = {
  all: "전체",
  tournament: "대회",
  release: "발매",
  match: "매칭",
};

export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { title: "대회·발매 캘린더 — 덱로그" },
      { name: "description", content: "지역·게임별 TCG 대회, 상품 발매, 매칭 일정." },
    ],
  }),
  component: CalendarPage,
});

function CalendarPage() {
  const { user } = useAuth();
  const [game, setGame] = useState<Game | "all">("all");
  const [kind, setKind] = useState<EventKind | "all">("all");
  const [scope, setScope] = useState<"upcoming" | "past">("upcoming");

  const { data: profile } = useQuery({
    queryKey: ["profile-primary-game", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("primary_game")
        .eq("id", user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });
  const primaryGame = profile?.primary_game ?? null;

  const { data: events = [], refetch } = useQuery({
    queryKey: ["events", game, kind, scope],
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      let q = supabase.from("events").select("*");
      if (game !== "all") q = q.eq("game", game);
      if (kind !== "all") q = q.eq("kind", kind);
      if (scope === "upcoming") {
        q = q.gte("starts_at", nowIso).order("starts_at", { ascending: true });
      } else {
        q = q.lt("starts_at", nowIso).order("starts_at", { ascending: false });
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Event[];
    },
  });

  const { data: favIds = new Set<string>() } = useQuery({
    queryKey: ["event-favorites", user?.id],
    queryFn: async () => {
      if (!user) return new Set<string>();
      const { data } = await supabase
        .from("event_favorites")
        .select("event_id")
        .eq("user_id", user.id);
      return new Set((data ?? []).map((r) => r.event_id));
    },
    enabled: !!user,
  });

  const sortedEvents = useMemo(() => {
    if (!primaryGame) return events;
    // Pin primary-game events to top within each day-group while preserving time order
    return [...events].sort((a, b) => {
      const aP = a.game === primaryGame ? 0 : 1;
      const bP = b.game === primaryGame ? 0 : 1;
      if (aP !== bP) return aP - bP;
      return new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
    });
  }, [events, primaryGame]);

  const grouped = useMemo(() => {
    const map = new Map<string, Event[]>();
    for (const ev of sortedEvents) {
      const key = new Date(ev.starts_at).toLocaleDateString("ko-KR", {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "short",
      });
      const arr = map.get(key) ?? [];
      arr.push(ev);
      map.set(key, arr);
    }
    return [...map.entries()];
  }, [sortedEvents]);

  const toggleFav = async (eventId: string, isFav: boolean) => {
    if (!user) {
      toast.error("로그인이 필요합니다");
      return;
    }
    if (isFav) {
      await supabase
        .from("event_favorites")
        .delete()
        .eq("user_id", user.id)
        .eq("event_id", eventId);
    } else {
      await supabase
        .from("event_favorites")
        .insert({ user_id: user.id, event_id: eventId });
    }
    refetch();
    // also refresh favorites
    void supabase
      .from("event_favorites")
      .select("event_id")
      .eq("user_id", user.id);
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8">
      <PageHeader title="캘린더" description="대회 · 발매 · 매칭 일정">
        <Select value={game} onValueChange={(v) => setGame(v as Game | "all")}>
          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="optcg">원피스</SelectItem>
            <SelectItem value="ptcg">포켓몬</SelectItem>
            <SelectItem value="dtcg">디지몬</SelectItem>
          </SelectContent>
        </Select>
        <Select value={scope} onValueChange={(v) => setScope(v as "upcoming" | "past")}>
          <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="upcoming">예정</SelectItem>
            <SelectItem value="past">지난</SelectItem>
          </SelectContent>
        </Select>
        {user ? (
          <NewEventDialog onCreated={() => refetch()} />
        ) : (
          <Button asChild size="sm">
            <Link to="/login">로그인하고 등록</Link>
          </Button>
        )}
      </PageHeader>

      <Tabs value={kind} onValueChange={(v) => setKind(v as EventKind | "all")} className="mt-4">
        <TabsList>
          <TabsTrigger value="all">{KIND_LABEL.all}</TabsTrigger>
          <TabsTrigger value="tournament">{KIND_LABEL.tournament}</TabsTrigger>
          <TabsTrigger value="release">{KIND_LABEL.release}</TabsTrigger>
          <TabsTrigger value="match">{KIND_LABEL.match}</TabsTrigger>
        </TabsList>
      </Tabs>

      {primaryGame && (
        <p className="mt-3 text-xs text-muted-foreground">
          내 주력: <span className="font-medium text-foreground">{GAME_LABEL[primaryGame]}</span> · 같은 게임 일정이 우선 표시됩니다.
        </p>
      )}

      {events.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={CalendarDays}
            title="등록된 일정이 없어요"
            description="첫 일정을 등록해 주세요."
          />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {grouped.map(([date, items]) => (
            <section key={date}>
              <h2 className="text-xs font-medium text-muted-foreground">{date}</h2>
              <ul className="mt-2 space-y-2">
                {items.map((ev) => {
                  const isFav = favIds.has(ev.id);
                  const isPrimary = primaryGame && ev.game === primaryGame;
                  return (
                    <li
                      key={ev.id}
                      className={`rounded-lg border bg-card p-4 ${isPrimary ? "border-primary/40" : "border-border"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                              {GAME_LABEL[ev.game]}
                            </span>
                            <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
                              {KIND_LABEL[ev.kind]}
                            </span>
                            <Link
                              to="/events/$id"
                              params={{ id: ev.id }}
                              className="truncate text-sm font-semibold hover:underline"
                            >
                              {ev.title}
                            </Link>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span>
                              {new Date(ev.starts_at).toLocaleTimeString("ko-KR", {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            {ev.early_release_at && (
                              <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-600 dark:text-amber-400">
                                선행 {new Date(ev.early_release_at).toLocaleDateString("ko-KR")}
                              </span>
                            )}
                            {ev.location && (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {ev.location}
                              </span>
                            )}
                            {(ev.product_url || ev.url) && (
                              <a
                                href={ev.product_url ?? ev.url ?? "#"}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-foreground hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink className="h-3 w-3" />
                                {ev.kind === "release" ? "공식" : "상세"}
                              </a>
                            )}
                          </div>
                          {ev.notes && (
                            <p className="mt-2 whitespace-pre-wrap text-xs text-foreground/80">
                              {ev.notes}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {user && (
                            <button
                              onClick={() => toggleFav(ev.id, isFav)}
                              className={isFav ? "text-amber-500" : "text-muted-foreground hover:text-amber-500"}
                              title={isFav ? "즐겨찾기 해제" : "즐겨찾기"}
                            >
                              <Star className="h-4 w-4" fill={isFav ? "currentColor" : "none"} />
                            </button>
                          )}
                          {user?.id === ev.user_id && (
                            <button
                              onClick={async () => {
                                if (!confirm("일정을 삭제할까요?")) return;
                                const { error } = await supabase
                                  .from("events")
                                  .delete()
                                  .eq("id", ev.id);
                                if (error) toast.error(error.message);
                                else {
                                  toast.success("삭제됨");
                                  refetch();
                                }
                              }}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function NewEventDialog({ onCreated }: { onCreated: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    kind: "tournament" as EventKind,
    game: "optcg" as Game,
    title: "",
    starts_at: "",
    ends_at: "",
    early_release_at: "",
    has_early: false,
    location: "",
    url: "",
    product_url: "",
    notes: "",
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!form.title.trim() || !form.starts_at) {
      toast.error("제목과 시작일은 필수입니다");
      return;
    }
    const { error } = await supabase.from("events").insert({
      user_id: user.id,
      kind: form.kind,
      game: form.game,
      title: form.title.trim(),
      starts_at: new Date(form.starts_at).toISOString(),
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      early_release_at:
        form.kind === "release" && form.has_early && form.early_release_at
          ? new Date(form.early_release_at).toISOString()
          : null,
      location: form.location.trim() || null,
      url: form.url.trim() || null,
      product_url: form.kind === "release" ? form.product_url.trim() || null : null,
      notes: form.notes.trim() || null,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("등록됨");
    setOpen(false);
    setForm({
      kind: "tournament",
      game: "optcg",
      title: "",
      starts_at: "",
      ends_at: "",
      early_release_at: "",
      has_early: false,
      location: "",
      url: "",
      product_url: "",
      notes: "",
    });
    qc.invalidateQueries({ queryKey: ["events"] });
    onCreated();
  };

  const isRelease = form.kind === "release";
  const isMatch = form.kind === "match";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1 h-4 w-4" />
          일정 등록
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>일정 등록</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>종류</Label>
              <Select
                value={form.kind}
                onValueChange={(v) => setForm({ ...form, kind: v as EventKind })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tournament">대회</SelectItem>
                  <SelectItem value="release">상품 발매</SelectItem>
                  <SelectItem value="match">매칭 일정</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>게임</Label>
              <Select
                value={form.game}
                onValueChange={(v) => setForm({ ...form, game: v as Game })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="optcg">원피스</SelectItem>
                  <SelectItem value="ptcg">포켓몬</SelectItem>
                  <SelectItem value="dtcg">디지몬</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{isRelease ? "상품명" : "제목"}</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>{isRelease ? "발매일" : "시작"}</Label>
              <Input
                type="datetime-local"
                value={form.starts_at}
                onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>종료 (선택)</Label>
              <Input
                type="datetime-local"
                value={form.ends_at}
                onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
              />
            </div>
          </div>
          {isRelease && (
            <>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.has_early}
                  onChange={(e) => setForm({ ...form, has_early: e.target.checked })}
                />
                선행 발매가 있어요
              </label>
              {form.has_early && (
                <div className="flex flex-col gap-1.5">
                  <Label>선행 발매일</Label>
                  <Input
                    type="datetime-local"
                    value={form.early_release_at}
                    onChange={(e) => setForm({ ...form, early_release_at: e.target.value })}
                  />
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <Label>공식 홈페이지 URL</Label>
                <Input
                  type="url"
                  value={form.product_url}
                  onChange={(e) => setForm({ ...form, product_url: e.target.value })}
                  placeholder="https://"
                />
              </div>
            </>
          )}
          {!isRelease && (
            <div className="flex flex-col gap-1.5">
              <Label>{isMatch ? "장소 / 매장" : "장소"}</Label>
              <Input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="매장/지역"
              />
            </div>
          )}
          {!isRelease && (
            <div className="flex flex-col gap-1.5">
              <Label>상세 URL</Label>
              <Input
                type="url"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://"
              />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label>비고</Label>
            <Textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder={isMatch ? "상대, 포맷 등" : "포맷, 참가비, 인원 등"}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button type="submit">등록</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
