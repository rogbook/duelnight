import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Trophy, Save, Share2, Trash2, ImageOff, Plus } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Database } from "@/integrations/supabase/types";

type Card = Database["public"]["Tables"]["cards"]["Row"];
type TierList = Database["public"]["Tables"]["tier_lists"]["Row"];
type Game = Database["public"]["Enums"]["tcg_game"];

const GAME_OPTIONS: { value: Game; label: string }[] = [
  { value: "optcg", label: "원피스" },
  { value: "ptcg", label: "포켓몬" },
  { value: "dtcg", label: "디지몬" },
];

const TIERS = ["S", "A", "B", "C", "D"] as const;
type Tier = (typeof TIERS)[number] | "pool";

const TIER_COLOR: Record<(typeof TIERS)[number], string> = {
  S: "bg-red-500/15 border-red-500/40",
  A: "bg-orange-500/15 border-orange-500/40",
  B: "bg-yellow-500/15 border-yellow-500/40",
  C: "bg-green-500/15 border-green-500/40",
  D: "bg-blue-500/15 border-blue-500/40",
};

type Placements = Record<(typeof TIERS)[number], string[]>;

const emptyPlacements = (): Placements => ({
  S: [], A: [], B: [], C: [], D: [],
});

export const Route = createFileRoute("/tier/")({
  head: () => ({
    meta: [
      { title: "티어 메이킹 — DuelNight" },
      { name: "description", content: "리더 카드를 S/A/B/C/D 티어로 배치하고 공유하세요." },
    ],
  }),
  component: TierPage,
});

function TierPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [title, setTitle] = useState("내 티어표");
  const [isPublic, setIsPublic] = useState(true);
  const [placements, setPlacements] = useState<Placements>(emptyPlacements());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  const [game, setGame] = useState<Game>("optcg");
  const [setCode, setSetCode] = useState<string>("all");

  const { data: leaders = [] } = useQuery({
    queryKey: ["tier-leaders", game],
    queryFn: async () => {
      let q = supabase.from("cards").select("*").eq("game", game);
      // 원피스는 리더 카드만, 그 외 게임은 모든 카드 후보
      if (game === "optcg") q = q.eq("type", "leader");
      const { data, error } = await q.order("code", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Card[];
    },
  });

  const setOptions = useMemo(() => {
    const set = new Set<string>();
    for (const c of leaders) if (c.set_code) set.add(c.set_code);
    return [...set].sort();
  }, [leaders]);

  // setCode가 현재 game에 없으면 리셋
  useEffect(() => {
    if (setCode !== "all" && !setOptions.includes(setCode)) {
      setSetCode("all");
    }
  }, [setOptions, setCode]);

  const filteredLeaders = useMemo(
    () => (setCode === "all" ? leaders : leaders.filter((c) => c.set_code === setCode)),
    [leaders, setCode],
  );

  const { data: myLists = [] } = useQuery({
    queryKey: ["tier-lists-mine", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tier_lists")
        .select("*")
        .eq("user_id", user!.id)
        .order("updated_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as TierList[];
    },
  });

  const { data: publicLists = [] } = useQuery({
    queryKey: ["tier-lists-public"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tier_lists")
        .select("*")
        .eq("is_public", true)
        .order("updated_at", { ascending: false })
        .limit(12);
      if (error) throw error;
      return (data ?? []) as TierList[];
    },
  });

  const placedCodes = useMemo(
    () => new Set(TIERS.flatMap((t) => placements[t])),
    [placements],
  );
  const pool = filteredLeaders.filter((c) => !placedCodes.has(c.code));
  const cardByCode = useMemo(() => {
    const m = new Map<string, Card>();
    for (const c of leaders) m.set(c.code, c);
    return m;
  }, [leaders]);

  const moveTo = (code: string, target: Tier) => {
    setPlacements((prev) => {
      const next: Placements = {
        S: prev.S.filter((c) => c !== code),
        A: prev.A.filter((c) => c !== code),
        B: prev.B.filter((c) => c !== code),
        C: prev.C.filter((c) => c !== code),
        D: prev.D.filter((c) => c !== code),
      };
      if (target !== "pool") next[target] = [...next[target], code];
      return next;
    });
  };

  const reset = () => {
    setEditingId(null);
    setTitle("내 티어표");
    setIsPublic(true);
    setPlacements(emptyPlacements());
    setSetCode("all");
  };

  const load = (l: TierList) => {
    const raw = (l.placements ?? {}) as Partial<Placements>;
    setEditingId(l.id);
    setTitle(l.title);
    setIsPublic(l.is_public);
    setGame(l.game);
    setSetCode("all");
    setPlacements({
      S: raw.S ?? [],
      A: raw.A ?? [],
      B: raw.B ?? [],
      C: raw.C ?? [],
      D: raw.D ?? [],
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const save = async () => {
    if (!user) return toast.error("로그인이 필요합니다");
    if (!title.trim()) return toast.error("제목을 입력하세요");
    const payload = {
      user_id: user.id,
      title: title.trim(),
      is_public: isPublic,
      placements: placements as unknown as Database["public"]["Tables"]["tier_lists"]["Insert"]["placements"],
      game,
    };
    if (editingId) {
      const { error } = await supabase
        .from("tier_lists")
        .update(payload)
        .eq("id", editingId);
      if (error) return toast.error(error.message);
      toast.success("티어표를 저장했어요");
    } else {
      const { data, error } = await supabase
        .from("tier_lists")
        .insert(payload)
        .select("id")
        .single();
      if (error) return toast.error(error.message);
      setEditingId(data.id);
      toast.success("티어표를 저장했어요");
    }
    qc.invalidateQueries({ queryKey: ["tier-lists-mine"] });
    qc.invalidateQueries({ queryKey: ["tier-lists-public"] });
  };

  const remove = async (id: string) => {
    if (!confirm("이 티어표를 삭제할까요?")) return;
    const { error } = await supabase.from("tier_lists").delete().eq("id", id);
    if (error) return toast.error(error.message);
    if (id === editingId) reset();
    qc.invalidateQueries({ queryKey: ["tier-lists-mine"] });
    qc.invalidateQueries({ queryKey: ["tier-lists-public"] });
    toast.success("삭제했어요");
  };

  const share = async () => {
    if (!editingId) return toast.error("먼저 저장한 뒤 공유하세요");
    const url = `${window.location.origin}/tier?id=${editingId}`;
    try {
      await navigator.clipboard.writeText(url);
      toast.success("공유 링크를 복사했어요");
    } catch {
      toast.message(url);
    }
  };

  // ?id=... 로딩
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    if (!id) return;
    (async () => {
      const { data, error } = await supabase
        .from("tier_lists")
        .select("*")
        .eq("id", id)
        .maybeSingle();
      if (error || !data) return;
      load(data as TierList);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <PageHeader title="티어 메이킹" description="리더를 드래그해 S/A/B/C/D 티어에 배치하세요">
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={reset}>
            <Plus className="mr-1 h-4 w-4" /> 새로 만들기
          </Button>
          <Button variant="outline" size="sm" onClick={share} disabled={!editingId}>
            <Share2 className="mr-1 h-4 w-4" /> 공유
          </Button>
          <Button size="sm" onClick={save}>
            <Save className="mr-1 h-4 w-4" /> 저장
          </Button>
        </div>
      </PageHeader>

      <div className="mt-6 grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-[1fr_auto_auto_auto]">
        <div className="space-y-1">
          <Label htmlFor="tier-title">제목</Label>
          <Input
            id="tier-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="예: 2026년 5월 메타 티어"
          />
        </div>
        <div className="space-y-1">
          <Label>게임</Label>
          <Select value={game} onValueChange={(v) => setGame(v as Game)}>
            <SelectTrigger className="w-[120px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GAME_OPTIONS.map((g) => (
                <SelectItem key={g.value} value={g.value}>
                  {g.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label>세트</Label>
          <Select value={setCode} onValueChange={setSetCode}>
            <SelectTrigger className="w-[140px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">전체 세트</SelectItem>
              {setOptions.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="flex items-end gap-2">
          <Switch id="tier-public" checked={isPublic} onCheckedChange={setIsPublic} />
          <Label htmlFor="tier-public">공개</Label>
        </div>
      </div>

      <div className="mt-6 space-y-2">
        {TIERS.map((t) => (
          <TierRow
            key={t}
            tier={t}
            codes={placements[t]}
            cardByCode={cardByCode}
            onDropCard={(code) => moveTo(code, t)}
            onRemove={(code) => moveTo(code, "pool")}
            dragging={dragging}
            setDragging={setDragging}
          />
        ))}
      </div>

      <section className="mt-8">
        <h2 className="text-sm font-semibold">리더 풀 ({pool.length})</h2>
        {leaders.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">
            등록된 리더 카드가 없습니다. 카드 DB에 리더 데이터를 추가하세요.
          </p>
        ) : (
          <div
            className="mt-3 min-h-32 rounded-lg border border-dashed border-border bg-muted/20 p-3"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const code = e.dataTransfer.getData("text/plain");
              if (code) moveTo(code, "pool");
              setDragging(null);
            }}
          >
            <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-9">
              {pool.map((c) => (
                <CardChip
                  key={c.code}
                  card={c}
                  onDragStart={() => setDragging(c.code)}
                  onDragEnd={() => setDragging(null)}
                />
              ))}
            </ul>
          </div>
        )}
      </section>

      {user && (
        <section className="mt-8">
          <h2 className="text-sm font-semibold">내 티어표</h2>
          {myLists.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">아직 저장한 티어표가 없어요.</p>
          ) : (
            <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
              {myLists.map((l) => (
                <li
                  key={l.id}
                  className={`rounded-lg border p-3 ${
                    editingId === l.id ? "border-primary" : "border-border"
                  } bg-card`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{l.title}</p>
                      <p className="text-[11px] text-muted-foreground">
                        {l.is_public ? "공개" : "비공개"} ·{" "}
                        {new Date(l.updated_at).toLocaleDateString()}
                      </p>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="outline" onClick={() => load(l)}>
                        편집
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => remove(l.id)}
                        aria-label="삭제"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      <section className="mt-8">
        <h2 className="text-sm font-semibold">최근 공개 티어표</h2>
        {publicLists.length === 0 ? (
          <div className="mt-3">
            <EmptyState
              icon={Trophy}
              title="공개된 티어표가 없어요"
              description="첫 번째 티어표를 만들어 공유해 보세요."
            />
          </div>
        ) : (
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2 md:grid-cols-3">
            {publicLists.map((l) => (
              <li key={l.id} className="rounded-lg border border-border bg-card p-3">
                <p className="truncate text-sm font-medium">{l.title}</p>
                <p className="text-[11px] text-muted-foreground">
                  {new Date(l.updated_at).toLocaleDateString()}
                </p>
                <Link
                  to="/tier/$id"
                  params={{ id: l.id }}
                  className="mt-2 inline-block text-xs text-primary hover:underline"
                >
                  자세히 보기 →
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function TierRow({
  tier,
  codes,
  cardByCode,
  onDropCard,
  onRemove,
  dragging,
  setDragging,
}: {
  tier: (typeof TIERS)[number];
  codes: string[];
  cardByCode: Map<string, Card>;
  onDropCard: (code: string) => void;
  onRemove: (code: string) => void;
  dragging: string | null;
  setDragging: (s: string | null) => void;
}) {
  const [over, setOver] = useState(false);
  return (
    <div
      className={`flex gap-2 rounded-lg border-2 ${TIER_COLOR[tier]} ${
        over ? "ring-2 ring-primary/60" : ""
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        const code = e.dataTransfer.getData("text/plain");
        if (code) onDropCard(code);
        setDragging(null);
      }}
    >
      <div className="flex w-14 shrink-0 items-center justify-center rounded-l-md bg-background/40 text-2xl font-bold">
        {tier}
      </div>
      <ul className="flex min-h-20 flex-1 flex-wrap content-start gap-2 p-2">
        {codes.map((code) => {
          const c = cardByCode.get(code);
          if (!c) return null;
          return (
            <CardChip
              key={code}
              card={c}
              onDoubleClick={() => onRemove(code)}
              onDragStart={() => setDragging(code)}
              onDragEnd={() => setDragging(null)}
              isDragging={dragging === code}
              title="더블클릭으로 풀로 이동"
            />
          );
        })}
      </ul>
    </div>
  );
}

function CardChip({
  card,
  onDragStart,
  onDragEnd,
  onDoubleClick,
  isDragging,
  title,
}: {
  card: Card;
  onDragStart?: () => void;
  onDragEnd?: () => void;
  onDoubleClick?: () => void;
  isDragging?: boolean;
  title?: string;
}) {
  return (
    <li
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData("text/plain", card.code);
        e.dataTransfer.effectAllowed = "move";
        onDragStart?.();
      }}
      onDragEnd={onDragEnd}
      onDoubleClick={onDoubleClick}
      title={title ?? card.name}
      className={`group relative w-16 cursor-grab overflow-hidden rounded border border-border bg-card active:cursor-grabbing ${
        isDragging ? "opacity-40" : ""
      }`}
    >
      <div className="aspect-[5/7] w-full bg-muted">
        {card.image_url ? (
          <img
            src={card.image_url}
            alt={card.name}
            className="h-full w-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <ImageOff className="h-4 w-4" />
          </div>
        )}
      </div>
      <p className="truncate px-1 py-0.5 text-[9px] text-muted-foreground">
        {card.code}
      </p>
    </li>
  );
}
