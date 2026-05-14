import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Layers, Plus, Pencil, Trash2, Search, X, Check } from "lucide-react";

import { RecipeEditor } from "@/components/decks/recipe-editor";
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { toast } from "sonner";
import { GAME_LABEL } from "@/lib/match-stats";
import { normalizeDeckName } from "@/lib/normalize-deck";
import {
  COLORS_BY_GAME,
  HAS_LEADER,
  REQUIRES_MULTI_COLOR,
  colorHex,
  colorLabel,
  type Game,
} from "@/lib/deck-colors";
import type { Tables } from "@/integrations/supabase/types";

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
                <div className="min-w-0 flex-1">
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
                  </p>
                  {d.colors && d.colors.length > 0 && (
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {d.colors.map((c) => (
                        <ColorChip key={c} game={d.game} colorId={c} />
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Link
                    to="/decks/$id"
                    params={{ id: d.id }}
                    aria-label="덱 레시피"
                    title="덱 레시피 편집"
                    className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <Layers className="h-4 w-4" />
                  </Link>
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

function ColorChip({ game, colorId }: { game: Game; colorId: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
      <span
        className="h-2 w-2 rounded-full ring-1 ring-border"
        style={{ backgroundColor: colorHex(game, colorId) }}
      />
      {colorLabel(game, colorId)}
    </span>
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
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"info" | "recipe">("info");
  const [createdDeck, setCreatedDeck] = useState<Deck | null>(null);
  const [form, setForm] = useState({
    game: (deck?.game ?? "optcg") as Game,
    name: deck?.name ?? "",
    leader: deck?.leader ?? "",
    colors: (deck?.colors ?? []) as string[],
    notes: deck?.notes ?? "",
    is_public: deck?.is_public ?? false,
  });

  // Reset on open
  useEffect(() => {
    if (!open) return;
    if (deck) {
      setForm({
        game: deck.game,
        name: deck.name,
        leader: deck.leader ?? "",
        colors: deck.colors ?? [],
        notes: deck.notes ?? "",
        is_public: deck.is_public,
      });
    } else {
      setForm({
        game: "optcg",
        name: "",
        leader: "",
        colors: [],
        notes: "",
        is_public: false,
      });
    }
    setTab("info");
    setCreatedDeck(null);
  }, [open, deck]);

  const palette = COLORS_BY_GAME[form.game];

  const toggleColor = (id: string) => {
    setForm((f) => ({
      ...f,
      colors: f.colors.includes(id)
        ? f.colors.filter((x) => x !== id)
        : [...f.colors, id],
    }));
  };

  const persist = async (): Promise<Deck | null> => {
    if (!user) return null;
    const name = form.name.trim();
    if (!name) {
      toast.error("덱 이름을 입력해 주세요");
      return null;
    }
    if (form.colors.length === 0) {
      toast.error("색상(타입)을 1개 이상 선택해 주세요");
      return null;
    }
    if (REQUIRES_MULTI_COLOR[form.game] && form.colors.length < 2) {
      toast.error("색상(타입)을 2개 이상 선택해 주세요");
      return null;
    }
    setBusy(true);
    const payload = {
      game: form.game,
      name,
      leader:
        HAS_LEADER[form.game] && form.leader.trim()
          ? normalizeDeckName(form.leader, form.game) || form.leader.trim()
          : null,
      archetype: null as string | null,
      colors: form.colors,
      notes: form.notes.trim() || null,
      is_public: form.is_public,
    };
    const targetId = mode === "edit" ? deck!.id : createdDeck?.id;
    const result = targetId
      ? await supabase
          .from("decks")
          .update(payload)
          .eq("id", targetId)
          .select("*")
          .single()
      : await supabase
          .from("decks")
          .insert({ ...payload, user_id: user.id })
          .select("*")
          .single();
    setBusy(false);
    if (result.error) {
      toast.error(result.error.message);
      return null;
    }
    qc.invalidateQueries({ queryKey: ["deck-cards"] });
    onSaved();
    return result.data as Deck;
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const saved = await persist();
    if (!saved) return;
    toast.success(mode === "create" && !createdDeck ? "덱이 추가되었어요" : "덱이 수정되었어요");
    if (mode === "create") setCreatedDeck(saved);
    setOpen(false);
  };

  const handleRecipeTab = async () => {
    if (mode === "edit" || createdDeck) {
      setTab("recipe");
      return;
    }
    const saved = await persist();
    if (!saved) return;
    toast.success("덱이 저장되었어요. 이제 카드를 등록할 수 있어요.");
    setCreatedDeck(saved);
    setTab("recipe");
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
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "create" ? "덱 추가" : "덱 수정"}</DialogTitle>
        </DialogHeader>

        <div className="mb-3 inline-flex rounded-md border border-border p-0.5 text-xs">
          <button
            type="button"
            onClick={() => setTab("info")}
            className={`rounded px-3 py-1 ${
              tab === "info"
                ? "bg-foreground text-background"
                : "text-muted-foreground"
            }`}
          >
            기본 정보
          </button>
          <button
            type="button"
            onClick={handleRecipeTab}
            disabled={busy}
            className={`rounded px-3 py-1 ${
              tab === "recipe"
                ? "bg-foreground text-background"
                : "text-muted-foreground"
            } disabled:opacity-40`}
            title={
              mode === "create" && !createdDeck
                ? "클릭하면 먼저 저장한 뒤 카드 등록 화면으로 이동합니다"
                : ""
            }
          >
            덱 레시피
          </button>
        </div>

        {tab === "info" ? (
          <form onSubmit={submit} className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>게임</Label>
              <Select
                value={form.game}
                onValueChange={(v) =>
                  setForm({
                    ...form,
                    game: v as Game,
                    colors: [],
                    leader: HAS_LEADER[v as Game] ? form.leader : "",
                  })
                }
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
              <Label>공개 여부</Label>
              <label className="flex h-10 items-center gap-2 rounded-md border border-input px-3 text-xs text-muted-foreground">
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
            </div>

            <div className="col-span-2 flex flex-col gap-1.5">
              <Label>
                색상 / 타입{" "}
                <span className="ml-1 text-[10px] text-muted-foreground">
                  ({REQUIRES_MULTI_COLOR[form.game] ? "2개" : "1개"} 이상 선택)
                </span>
              </Label>
              <div className="flex flex-wrap gap-1.5">
                {palette.map((c) => {
                  const active = form.colors.includes(c.id);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      onClick={() => toggleColor(c.id)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition ${
                        active
                          ? "border-foreground bg-foreground text-background"
                          : "border-border text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      <span
                        className="h-2.5 w-2.5 rounded-full ring-1 ring-border"
                        style={{ backgroundColor: c.hex }}
                      />
                      {c.label}
                      {active && <Check className="h-3 w-3" />}
                    </button>
                  );
                })}
              </div>
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

            {HAS_LEADER[form.game] && (
              <div className="col-span-2 flex flex-col gap-1.5">
                <Label>리더</Label>
                <LeaderPicker
                  game={form.game}
                  value={form.leader}
                  onChange={(v) => setForm({ ...form, leader: v })}
                />
              </div>
            )}

            <div className="col-span-2 flex flex-col gap-1.5">
              <Label>메모</Label>
              <Textarea
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                rows={3}
                placeholder="구성, 운영 포인트 등"
              />
            </div>

            <div className="col-span-2 flex justify-end gap-2 pt-1">
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
          </form>
        ) : deck ? (
          <RecipeEditor deck={deck} />
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

/* ───────────── Leader picker (OPTCG, searchable) ───────────── */

function LeaderPicker({
  game,
  value,
  onChange,
}: {
  game: Game;
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const { data: leaders = [], isFetching } = useQuery({
    queryKey: ["leaders", game, q],
    enabled: open,
    queryFn: async () => {
      let query = supabase
        .from("cards")
        .select("code,name,colors,image_url")
        .eq("game", game)
        .eq("type", "leader")
        .order("code", { ascending: true })
        .limit(50);
      if (q.trim()) {
        const t = q.trim();
        query = query.or(`name.ilike.%${t}%,code.ilike.%${t}%`);
      }
      const { data, error } = await query;
      if (error) throw error;
      return data ?? [];
    },
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="justify-between font-normal"
        >
          <span className={value ? "" : "text-muted-foreground"}>
            {value || "리더 선택…"}
          </span>
          {value && (
            <X
              className="h-3.5 w-3.5 text-muted-foreground hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
            />
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[--radix-popover-trigger-width] p-0">
        <div className="border-b border-border p-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="리더 검색 (이름·코드)"
              className="h-8 pl-7 text-xs"
            />
          </div>
        </div>
        <ul className="max-h-64 overflow-y-auto py-1">
          {isFetching && (
            <li className="px-3 py-2 text-xs text-muted-foreground">
              검색 중…
            </li>
          )}
          {!isFetching && leaders.length === 0 && (
            <li className="px-3 py-2 text-xs text-muted-foreground">
              일치하는 리더 없음
            </li>
          )}
          {leaders.map((l) => (
            <li key={l.code}>
              <button
                type="button"
                onClick={() => {
                  onChange(`${l.name} (${l.code})`);
                  setOpen(false);
                }}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-xs hover:bg-accent"
              >
                {l.image_url && (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={l.image_url}
                    alt=""
                    className="h-8 w-6 rounded object-cover"
                    loading="lazy"
                  />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{l.name}</p>
                  <p className="truncate text-[10px] text-muted-foreground">
                    {l.code}
                  </p>
                </div>
              </button>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

