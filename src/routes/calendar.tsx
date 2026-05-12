import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CalendarDays, Plus, Trash2, MapPin, ExternalLink } from "lucide-react";
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
import { toast } from "sonner";
import { GAME_LABEL } from "@/lib/match-stats";
import type { Database } from "@/integrations/supabase/types";

type Game = Database["public"]["Enums"]["tcg_game"];
type Event = {
  id: string;
  user_id: string;
  game: Game;
  title: string;
  starts_at: string;
  ends_at: string | null;
  location: string | null;
  url: string | null;
  notes: string | null;
};

export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { title: "대회 캘린더 — TCG Hub" },
      { name: "description", content: "지역·게임별 TCG 대회 일정." },
    ],
  }),
  component: CalendarPage,
});

function CalendarPage() {
  const { user } = useAuth();
  const [game, setGame] = useState<Game | "all">("all");
  const [scope, setScope] = useState<"upcoming" | "past">("upcoming");

  const { data: events = [], refetch } = useQuery({
    queryKey: ["events", game, scope],
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      let q = supabase.from("events").select("*");
      if (game !== "all") q = q.eq("game", game);
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

  const grouped = useMemo(() => {
    const map = new Map<string, Event[]>();
    for (const ev of events) {
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
  }, [events]);

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8">
      <PageHeader title="대회 캘린더" description="지역·게임별 대회 일정">
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

      {events.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={CalendarDays}
            title="등록된 대회가 없어요"
            description="첫 대회를 등록해 주세요."
          />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {grouped.map(([date, items]) => (
            <section key={date}>
              <h2 className="text-xs font-medium text-muted-foreground">{date}</h2>
              <ul className="mt-2 space-y-2">
                {items.map((ev) => (
                  <li
                    key={ev.id}
                    className="rounded-lg border border-border bg-card p-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                            {GAME_LABEL[ev.game]}
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
                          {ev.location && (
                            <span className="inline-flex items-center gap-1">
                              <MapPin className="h-3 w-3" />
                              {ev.location}
                            </span>
                          )}
                          {ev.url && (
                            <a
                              href={ev.url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1 text-foreground hover:underline"
                            >
                              <ExternalLink className="h-3 w-3" />
                              상세
                            </a>
                          )}
                        </div>
                        {ev.notes && (
                          <p className="mt-2 whitespace-pre-wrap text-xs text-foreground/80">
                            {ev.notes}
                          </p>
                        )}
                      </div>
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
                  </li>
                ))}
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
    game: "optcg" as Game,
    title: "",
    starts_at: "",
    ends_at: "",
    location: "",
    url: "",
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
      game: form.game,
      title: form.title.trim(),
      starts_at: new Date(form.starts_at).toISOString(),
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      location: form.location.trim() || null,
      url: form.url.trim() || null,
      notes: form.notes.trim() || null,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("등록됨");
    setOpen(false);
    setForm({
      game: "optcg",
      title: "",
      starts_at: "",
      ends_at: "",
      location: "",
      url: "",
      notes: "",
    });
    qc.invalidateQueries({ queryKey: ["events"] });
    onCreated();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1 h-4 w-4" />
          대회 등록
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader><DialogTitle>대회 등록</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
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
            <div className="flex flex-col gap-1.5">
              <Label>장소</Label>
              <Input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
                placeholder="매장/지역"
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>제목</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>시작</Label>
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
          <div className="flex flex-col gap-1.5">
            <Label>상세 URL</Label>
            <Input
              type="url"
              value={form.url}
              onChange={(e) => setForm({ ...form, url: e.target.value })}
              placeholder="https://"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>비고</Label>
            <Textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder="포맷, 참가비, 인원 등"
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
