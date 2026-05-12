import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Layers, Plus, Pencil, Trash2 } from "lucide-react";
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
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { GAME_LABEL } from "@/lib/match-stats";
import { normalizeDeckName } from "@/lib/normalize-deck";
import type { Database, Tables } from "@/integrations/supabase/types";

type Game = Database["public"]["Enums"]["tcg_game"];
type Deck = Tables<"decks">;

export const Route = createFileRoute("/decks")({
  head: () => ({
    meta: [
      { title: "덱 빌더 — TCG Hub" },
      { name: "description", content: "덱 레시피 저장 및 관리." },
    ],
  }),
  component: DecksPage,
});

function DecksPage() {
  const { user, loading } = useAuth();
  const qc = useQueryClient();
  const [game, setGame] = useState<Game | "all">("all");

  const { data: decks = [] } = useQuery({
    queryKey: ["decks", user?.id, game],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from("decks")
        .select("*")
        .eq("user_id", user!.id)
        .order("updated_at", { ascending: false });
      if (game !== "all") q = q.eq("game", game);
      const { data, error } = await q;
      if (error) throw error;
      return data as Deck[];
    },
  });

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of decks) m.set(d.game, (m.get(d.game) ?? 0) + 1);
    return m;
  }, [decks]);

  const onDelete = async (id: string) => {
    if (!confirm("이 덱을 삭제할까요? 연결된 전적은 유지됩니다.")) return;
    const { error } = await supabase.from("decks").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("삭제됨");
      qc.invalidateQueries({ queryKey: ["decks"] });
    }
  };

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
        <PageHeader title="덱 빌더" description="로그인 후 이용 가능" />
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
      <PageHeader title="덱 빌더" description="내 덱을 저장하고 전적과 연결하세요">
        <DeckGameTabs value={game} onChange={setGame} counts={counts} />
        <DeckDialog
          mode="create"
          onSaved={() => qc.invalidateQueries({ queryKey: ["decks"] })}
        />
      </PageHeader>

      {decks.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={Layers}
            title="저장된 덱이 없어요"
            description="우측 상단 '덱 추가'로 첫 덱을 등록해 보세요."
          />
        </div>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {decks.map((d) => (
            <li
              key={d.id}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link
                    to="/decks/$id"
                    params={{ id: d.id }}
                    className="block truncate text-sm font-medium hover:text-primary hover:underline"
                  >
                    {d.name}
                  </Link>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {GAME_LABEL[d.game]}
                    {d.leader ? ` · ${d.leader}` : ""}
                    {d.archetype ? ` · ${d.archetype}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <DeckDialog
                    mode="edit"
                    deck={d}
                    onSaved={() =>
                      qc.invalidateQueries({ queryKey: ["decks"] })
                    }
                  />
                  <button
                    onClick={() => onDelete(d.id)}
                    aria-label="삭제"
                    className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {d.notes && (
                <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">
                  {d.notes}
                </p>
              )}
              <p className="mt-3 text-[10px] text-muted-foreground">
                {d.is_public ? "공개" : "비공개"} ·{" "}
                {new Date(d.updated_at).toLocaleDateString("ko-KR")}
              </p>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function DeckGameTabs({
  value,
  onChange,
  counts,
}: {
  value: Game | "all";
  onChange: (v: Game | "all") => void;
  counts: Map<string, number>;
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
          {g.id !== "all" && counts.get(g.id) ? (
            <span className="ml-1 text-[10px] opacity-70">
              {counts.get(g.id)}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

function DeckDialog({
  mode,
  deck,
  onSaved,
}: {
  mode: "create" | "edit";
  deck?: Deck;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [form, setForm] = useState({
    game: (deck?.game ?? "optcg") as Game,
    name: deck?.name ?? "",
    leader: deck?.leader ?? "",
    archetype: deck?.archetype ?? "",
    notes: deck?.notes ?? "",
    is_public: deck?.is_public ?? false,
  });

  useEffect(() => {
    if (open && deck) {
      setForm({
        game: deck.game,
        name: deck.name,
        leader: deck.leader ?? "",
        archetype: deck.archetype ?? "",
        notes: deck.notes ?? "",
        is_public: deck.is_public,
      });
    }
    if (open && !deck) {
      setForm({
        game: "optcg",
        name: "",
        leader: "",
        archetype: "",
        notes: "",
        is_public: false,
      });
    }
  }, [open, deck]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    const name = form.name.trim();
    if (!name) {
      toast.error("덱 이름을 입력해 주세요");
      return;
    }
    setBusy(true);
    const payload = {
      game: form.game,
      name,
      leader: form.leader.trim()
        ? normalizeDeckName(form.leader, form.game) || form.leader.trim()
        : null,
      archetype: form.archetype.trim() || null,
      notes: form.notes.trim() || null,
      is_public: form.is_public,
    };
    const { error } =
      mode === "create"
        ? await supabase.from("decks").insert({ ...payload, user_id: user.id })
        : await supabase.from("decks").update(payload).eq("id", deck!.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(mode === "create" ? "덱이 추가되었어요" : "덱이 수정되었어요");
    setOpen(false);
    onSaved();
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {mode === "create" ? (
          <Button size="sm">
            <Plus className="mr-1 h-4 w-4" />덱 추가
          </Button>
        ) : (
          <button
            aria-label="수정"
            className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Pencil className="h-4 w-4" />
          </button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "덱 추가" : "덱 수정"}</DialogTitle>
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
            <Label>아키타입</Label>
            <Input
              value={form.archetype}
              onChange={(e) => setForm({ ...form, archetype: e.target.value })}
              placeholder="예: 어그로"
            />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label>덱 이름</Label>
            <Input
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              placeholder="예: 적 루피 어그로"
              required
            />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label>리더</Label>
            <Input
              value={form.leader}
              onChange={(e) => setForm({ ...form, leader: e.target.value })}
              placeholder="예: 적 루피"
            />
          </div>
          <div className="col-span-2 flex flex-col gap-1.5">
            <Label>메모</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={3}
              placeholder="구성, 운영 포인트 등"
            />
          </div>
          <div className="col-span-2 flex items-center justify-between">
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input
                type="checkbox"
                className="h-3.5 w-3.5"
                checked={form.is_public}
                onChange={(e) =>
                  setForm({ ...form, is_public: e.target.checked })
                }
              />
              공개 (다른 사용자도 볼 수 있음)
            </label>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => setOpen(false)}
              >
                취소
              </Button>
              <Button type="submit" disabled={busy}>
                {busy ? "저장 중..." : "저장"}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
