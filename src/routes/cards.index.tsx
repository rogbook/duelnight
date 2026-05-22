import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { Library, Search, Star, X, ImageOff, Pencil, Trash2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EditCardDialog } from "@/components/cards/edit-card-dialog";
import { normalizeImageUrl } from "@/components/cards/card-uploader";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type Card = Database["public"]["Tables"]["cards"]["Row"];
type Review = Database["public"]["Tables"]["card_reviews"]["Row"];
type Illustration = Database["public"]["Tables"]["card_illustrations"]["Row"];

const PAGE_SIZE = 24;
const TYPE_LABEL: Record<string, string> = {
  leader: "리더",
  character: "캐릭터",
  event: "이벤트",
  stage: "스테이지",
  don: "DON!!",
};
const COLOR_LABEL: Record<string, string> = {
  red: "적",
  green: "녹",
  blue: "청",
  purple: "자",
  black: "흑",
  yellow: "황",
};

type Game = Database["public"]["Enums"]["tcg_game"];
const GAME_LABEL: Record<Game, string> = {
  optcg: "원피스",
  ptcg: "포켓몬",
  dtcg: "디지몬",
};

export const Route = createFileRoute("/cards/")({
  head: () => ({
    meta: [
      { title: "카드 DB — DuelNight" },
      {
        name: "description",
        content: "원피스·포켓몬·디지몬 TCG 카드 데이터베이스 검색·필터·즐겨찾기·평가.",
      },
    ],
  }),
  component: CardsPage,
});

function CardsPage() {
  const { user } = useAuth();
  const [game, setGame] = useState<Game>("optcg");
  const [q, setQ] = useState("");
  const [type, setType] = useState<string>("all");
  const [setCode, setSetCode] = useState<string>("all");
  const [color, setColor] = useState<string>("all");
  const [favOnly, setFavOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Card | null>(null);

  const { data: sets = [] } = useQuery({
    queryKey: ["card-sets", game],
    staleTime: 10 * 60_000, // 세트 목록은 거의 안 바뀌므로 10분 캐시
    queryFn: async () => {
      // 게임당 카드가 수천 개여도 set_code만 가져오면 작지만,
      // 그래도 상한을 두어 회귀 안전장치 마련
      const { data, error } = await supabase
        .from("cards")
        .select("set_code")
        .eq("game", game)
        .order("set_code", { ascending: false })
        .limit(5000);
      if (error) throw error;
      return Array.from(new Set((data ?? []).map((r) => r.set_code)));
    },
  });

  const { data: favSet = new Set<string>() } = useQuery({
    queryKey: ["card-favs", user?.id],
    enabled: !!user,
    staleTime: 5 * 60_000,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("card_favorites")
        .select("card_code")
        .eq("user_id", user!.id);
      if (error) throw error;
      return new Set((data ?? []).map((r) => r.card_code));
    },
  });

  // 즐겨찾기 키는 favOnly가 true일 때만 쿼리 키에 포함
  // (즐겨찾기 토글이 전체 목록 재요청을 트리거하지 않도록)
  const favKey = favOnly ? Array.from(favSet).sort().join(",") : "";
  const filters = { game, q, type, setCode, color, favOnly, page };
  const { data, isFetching } = useQuery({
    queryKey: ["cards", filters, favKey],
    queryFn: async () => {
      let query = supabase
        .from("cards")
        .select("*", { count: "exact" })
        .eq("game", game)
        .order("code", { ascending: true });
      if (type !== "all") query = query.eq("type", type as Card["type"]);
      if (setCode !== "all") query = query.eq("set_code", setCode);
      if (color !== "all") query = query.contains("colors", [color]);
      if (q.trim()) {
        const term = q.trim();
        // 이름/코드는 부분일치, 특징(traits)은 정확 일치(배열 contains)
        const safe = term.replace(/[",{}\\]/g, "");
        query = query.or(
          `name.ilike.%${term}%,code.ilike.%${term}%,traits.cs.{"${safe}"}`
        );
      }
      if (favOnly) {
        const codes = Array.from(favSet);
        if (codes.length === 0) return { rows: [] as Card[], total: 0 };
        query = query.in("code", codes);
      }
      const from = page * PAGE_SIZE;
      const to = from + PAGE_SIZE - 1;
      const { data, error, count } = await query.range(from, to);
      if (error) throw error;
      return { rows: (data ?? []) as Card[], total: count ?? 0 };
    },
  });

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const resetPage = () => setPage(0);

  useEffect(() => {
    if (typeof window !== "undefined" && !CSS.supports("(animation-timeline: view()) and (animation-range: entry)")) {
      const observer = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            const ratio = entry.intersectionRatio;
            const el = entry.target as HTMLElement;
            // Smooth scaling & opacity transition for non-supported browsers
            el.style.opacity = String(0.3 + ratio * 0.7);
            el.style.transform = `scale(${0.85 + ratio * 0.15}) translateY(${20 - ratio * 20}px)`;
            el.style.transition = "opacity 0.15s ease-out, transform 0.15s ease-out";
          });
        },
        {
          threshold: Array.from({ length: 21 }, (_, i) => i / 20),
        }
      );

      // Wait briefly for DOM commit to complete under TanStack Start / React 19, then observe elements
      const timer = setTimeout(() => {
        const elements = document.querySelectorAll(".scroll-reveal-card");
        elements.forEach((el) => observer.observe(el));
      }, 50);

      return () => {
        clearTimeout(timer);
        observer.disconnect();
      };
    }
  }, [rows]);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <PageHeader title="카드 DB" description={`${GAME_LABEL[game]} 카드 검색·필터·즐겨찾기`}>
        <div className="inline-flex rounded-md border border-border bg-card p-0.5">
          {(Object.keys(GAME_LABEL) as Game[]).map((g) => (
            <button
              key={g}
              type="button"
              onClick={() => {
                setGame(g);
                setSetCode("all");
                resetPage();
              }}
              className={`rounded px-3 py-1 text-xs font-medium transition ${
                game === g
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {GAME_LABEL[g]}
            </button>
          ))}
        </div>
      </PageHeader>

      <div className="mt-6 space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              resetPage();
            }}
            placeholder="카드명 · 카드번호 · 특징 (예: 루피, OP12-004, 밀짚모자 해적단)"
            className="pl-9"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Select
            value={type}
            onValueChange={(v) => {
              setType(v);
              resetPage();
            }}
          >
            <SelectTrigger><SelectValue placeholder="종류" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">종류: 전체</SelectItem>
              <SelectItem value="leader">리더</SelectItem>
              <SelectItem value="character">캐릭터</SelectItem>
              <SelectItem value="event">이벤트</SelectItem>
              <SelectItem value="stage">스테이지</SelectItem>
            </SelectContent>
          </Select>
          <Select
            value={setCode}
            onValueChange={(v) => {
              setSetCode(v);
              resetPage();
            }}
          >
            <SelectTrigger><SelectValue placeholder="세트" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">세트: 전체</SelectItem>
              {sets.map((s) => (
                <SelectItem key={s} value={s}>{s}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={color}
            onValueChange={(v) => {
              setColor(v);
              resetPage();
            }}
          >
            <SelectTrigger><SelectValue placeholder="색상" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">색: 전체</SelectItem>
              {Object.entries(COLOR_LABEL).map(([k, v]) => (
                <SelectItem key={k} value={k}>{v}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant={favOnly ? "default" : "outline"}
            onClick={() => {
              if (!user) {
                toast.error("로그인이 필요합니다");
                return;
              }
              setFavOnly((v) => !v);
              resetPage();
            }}
            className="gap-1"
          >
            <Star
              className={`h-4 w-4 ${favOnly ? "fill-current" : ""}`}
            />
            즐겨찾기만
          </Button>
        </div>
      </div>

      <p className="mt-4 text-xs text-muted-foreground">
        총 <span className="font-semibold text-foreground">{total}</span>장
        {isFetching && " · 로딩…"}
      </p>

      {rows.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={Library}
            title="검색 결과가 없어요"
            description="다른 키워드나 필터로 다시 시도해 보세요."
          />
        </div>
      ) : (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
          {rows.map((c) => (
            <CardTile
              key={c.id}
              card={c}
              isFav={favSet.has(c.code)}
              onClick={() => setSelected(c)}
            />
          ))}
        </ul>
      )}

      {totalPages > 1 && (
        <div className="mt-6 flex items-center justify-center gap-2 text-sm">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => Math.max(0, p - 1))}
          >
            이전
          </Button>
          <span className="px-2 text-muted-foreground">
            {page + 1} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            다음
          </Button>
        </div>
      )}

      <CardDetailDialog
        card={selected}
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
        isFav={selected ? favSet.has(selected.code) : false}
      />
    </div>
  );
}

function CardTile({
  card,
  isFav,
  onClick,
}: {
  card: Card;
  isFav: boolean;
  onClick: () => void;
}) {
  return (
    <li className="group relative scroll-reveal-card">
      <button
        onClick={onClick}
        className="block w-full overflow-hidden rounded-lg border border-border bg-card text-left transition hover:border-primary"
      >
        <div className="relative aspect-[5/7] w-full bg-muted">
          {(() => { const u = normalizeImageUrl(card.image_url); return u ? (
            <img
              src={u}
              alt={card.name}
              loading="lazy"
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-1 text-muted-foreground">
              <ImageOff className="h-6 w-6" />
              <span className="text-[10px]">이미지 없음</span>
            </div>
          ); })()}
          {card.type === "leader" && (
            <span className="absolute left-1 top-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
              리더
            </span>
          )}
          {isFav && (
            <Star className="absolute right-1 top-1 h-4 w-4 fill-yellow-400 text-yellow-400 drop-shadow" />
          )}
        </div>
        <div className="p-2">
          <p className="truncate text-[11px] text-muted-foreground">
            {card.code}
          </p>
          <p className="truncate text-sm font-medium">{card.name}</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {card.colors.map((c) => (
              <span
                key={c}
                className="rounded bg-muted px-1 py-px text-[10px] text-muted-foreground"
              >
                {COLOR_LABEL[c] ?? c}
              </span>
            ))}
            {card.rarity && (
              <span className="rounded bg-accent px-1 py-px text-[10px] text-accent-foreground">
                {card.rarity}
              </span>
            )}
          </div>
          {card.traits && card.traits.length > 0 && (
            <div className="mt-1 flex flex-wrap gap-1">
              {card.traits.slice(0, 3).map((t) => (
                <span
                  key={t}
                  className="rounded border border-border bg-background px-1 py-px text-[10px] text-muted-foreground"
                >
                  {t}
                </span>
              ))}
              {card.traits.length > 3 && (
                <span className="text-[10px] text-muted-foreground">+{card.traits.length - 3}</span>
              )}
            </div>
          )}
        </div>
      </button>
      <Link
        to="/cards/$code"
        params={{ code: card.code }}
        className="absolute bottom-1 right-1 rounded bg-background/80 px-1.5 py-0.5 text-[10px] text-muted-foreground opacity-0 backdrop-blur transition group-hover:opacity-100 hover:text-foreground"
        onClick={(e) => e.stopPropagation()}
        aria-label="공유 가능한 상세 페이지로 이동"
      >
        상세 →
      </Link>
    </li>
  );
}

function CardDetailDialog({
  card,
  open,
  onOpenChange,
  isFav,
}: {
  card: Card | null;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  isFav: boolean;
}) {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const handleDelete = async () => {
    if (!card) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("cards").delete().eq("code", card.code);
      if (error) throw error;
      toast.success("카드 삭제 완료");
      setConfirmDelete(false);
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["cards"] });
    } catch (err) {
      toast.error("삭제 실패: " + (err as Error).message);
    } finally {
      setDeleting(false);
    }
  };

  const { data: reviews = [] } = useQuery({
    queryKey: ["card-reviews", card?.code],
    enabled: !!card,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("card_reviews")
        .select("*")
        .eq("card_code", card!.code)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Review[];
    },
  });

  const { data: illusts = [] } = useQuery({
    queryKey: ["card-illusts", card?.code],
    enabled: !!card,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("card_illustrations")
        .select("*")
        .eq("card_code", card!.code)
        .eq("status", "approved")
        .order("is_primary", { ascending: false })
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Illustration[];
    },
  });

  const gallery = useMemo(() => {
    const list: { url: string; label: string }[] = [];
    const main = normalizeImageUrl(card?.image_url);
    if (main) list.push({ url: main, label: "기본" });
    for (const il of illusts) {
      const u = normalizeImageUrl(il.image_url);
      if (!u || list.some((x) => x.url === u)) continue;
      list.push({ url: u, label: il.variant_label || "얼터" });
    }
    return list;
  }, [card?.image_url, illusts]);

  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const displayUrl = activeUrl ?? normalizeImageUrl(card?.image_url) ?? null;

  useEffect(() => {
    setActiveUrl(null);
  }, [card?.code]);

  const myReview = reviews.find((r) => r.user_id === user?.id) ?? null;
  const avg = useMemo(() => {
    if (reviews.length === 0) return null;
    return reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
  }, [reviews]);

  const toggleFav = async () => {
    if (!user || !card) {
      toast.error("로그인이 필요합니다");
      return;
    }
    if (isFav) {
      const { error } = await supabase
        .from("card_favorites")
        .delete()
        .eq("user_id", user.id)
        .eq("card_code", card.code);
      if (error) toast.error(error.message);
    } else {
      const { error } = await supabase
        .from("card_favorites")
        .insert({ user_id: user.id, card_code: card.code });
      if (error) toast.error(error.message);
    }
    qc.invalidateQueries({ queryKey: ["card-favs"] });
    qc.invalidateQueries({ queryKey: ["cards"] });
  };

  return (
    <>
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto">
        {card && (
          <>
            <DialogHeader>
              <p className="text-xs text-muted-foreground">{card.code}</p>
              <DialogTitle className="flex items-center gap-2">
                {card.name}
                <button
                  onClick={toggleFav}
                  aria-label="즐겨찾기"
                  className="ml-auto rounded-md p-1 hover:bg-muted"
                >
                  <Star
                    className={`h-5 w-5 ${
                      isFav
                        ? "fill-yellow-400 text-yellow-400"
                        : "text-muted-foreground"
                    }`}
                  />
                </button>
              </DialogTitle>
            </DialogHeader>
            {isAdmin && (
              <div className="flex justify-end gap-1.5">
                <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                  <Pencil className="h-3.5 w-3.5 mr-1" />편집
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="text-destructive hover:text-destructive"
                  onClick={() => setConfirmDelete(true)}
                >
                  <Trash2 className="h-3.5 w-3.5 mr-1" />삭제
                </Button>
              </div>
            )}
            <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
              <div>
                <div className="aspect-[5/7] w-full overflow-hidden rounded-md bg-muted">
                  {displayUrl ? (
                    <img
                      src={displayUrl}
                      alt={card.name}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <ImageOff className="h-8 w-8" />
                    </div>
                  )}
                </div>
                {gallery.length > 1 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {gallery.map((g) => (
                      <button
                        key={g.url}
                        type="button"
                        onClick={() => setActiveUrl(g.url)}
                        title={g.label}
                        className={`relative h-14 w-10 overflow-hidden rounded border ${
                          displayUrl === g.url
                            ? "border-primary ring-1 ring-primary"
                            : "border-border"
                        }`}
                      >
                        <img src={g.url} alt={g.label} className="h-full w-full object-cover" />
                        <span className="absolute inset-x-0 bottom-0 truncate bg-background/80 px-0.5 text-[8px] leading-3">
                          {g.label}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div className="space-y-2 text-sm">
                <div className="flex flex-wrap gap-1">
                  <Badge>{TYPE_LABEL[card.type] ?? card.type}</Badge>
                  {card.colors.map((c) => (
                    <Badge key={c}>{COLOR_LABEL[c] ?? c}</Badge>
                  ))}
                  {card.rarity && <Badge>{card.rarity}</Badge>}
                </div>
                <Stat label={card.type === "leader" ? "라이프" : "코스트"} value={card.cost} />
                <Stat label="파워" value={card.power?.toLocaleString()} />
                <Stat label="카운터" value={card.counter?.toLocaleString()} />
                <Stat label="속성" value={card.attribute} />
                <Stat label="세트" value={card.set_code} />
                {card.traits && card.traits.length > 0 && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">특징</p>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {card.traits.map((t) => (
                        <Badge key={t}>{t}</Badge>
                      ))}
                    </div>
                  </div>
                )}
                {card.effect && (
                  <div>
                    <p className="text-xs font-semibold text-muted-foreground">
                      효과
                    </p>
                    <p className="mt-1 whitespace-pre-wrap rounded-md bg-muted/50 p-2 text-sm leading-relaxed">
                      {card.effect}
                    </p>
                  </div>
                )}
              </div>
            </div>

            <div className="mt-4 border-t border-border pt-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-semibold">
                  카드 평가{" "}
                  <span className="font-normal text-muted-foreground">
                    ({reviews.length})
                  </span>
                </h3>
                {avg !== null && (
                  <span className="flex items-center gap-1 text-sm">
                    <Star className="h-4 w-4 fill-yellow-400 text-yellow-400" />
                    {avg.toFixed(1)}
                  </span>
                )}
              </div>
              {user ? (
                <ReviewForm
                  cardCode={card.code}
                  existing={myReview}
                  onSaved={() =>
                    qc.invalidateQueries({
                      queryKey: ["card-reviews", card.code],
                    })
                  }
                />
              ) : (
                <p className="mt-3 text-sm text-muted-foreground">
                  평가를 남기려면 로그인하세요.
                </p>
              )}
              <ul className="mt-3 space-y-2">
                {reviews.length === 0 ? (
                  <li className="text-sm text-muted-foreground">
                    첫 번째 평가를 남겨보세요.
                  </li>
                ) : (
                  reviews.map((r) => (
                    <li
                      key={r.id}
                      className="rounded-md border border-border bg-card p-3 text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <RatingStars value={r.rating} />
                        <span className="text-xs text-muted-foreground">
                          {new Date(r.created_at).toLocaleDateString("ko-KR")}
                        </span>
                      </div>
                      {r.body && (
                        <p className="mt-1 whitespace-pre-wrap text-foreground/90">
                          {r.body}
                        </p>
                      )}
                    </li>
                  ))
                )}
              </ul>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>

      {editing && card && (
        <EditCardDialog
          card={card}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            qc.invalidateQueries({ queryKey: ["cards"] });
          }}
        />
      )}

      <AlertDialog open={confirmDelete} onOpenChange={(o) => { if (!o && !deleting) setConfirmDelete(false); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>카드를 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {card?.code} · {card?.name} 카드를 영구 삭제합니다. 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? "삭제 중…" : "삭제"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function ReviewForm({
  cardCode,
  existing,
  onSaved,
}: {
  cardCode: string;
  existing: Review | null;
  onSaved: () => void;
}) {
  const { user } = useAuth();
  const [rating, setRating] = useState(existing?.rating ?? 5);
  const [body, setBody] = useState(existing?.body ?? "");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setBusy(true);
    const { error } = await supabase.from("card_reviews").upsert(
      {
        user_id: user.id,
        card_code: cardCode,
        rating,
        body: body.trim() || null,
      },
      { onConflict: "user_id,card_code" },
    );
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(existing ? "평가를 수정했어요" : "평가를 등록했어요");
    onSaved();
  };

  const remove = async () => {
    if (!user || !existing) return;
    if (!confirm("내 평가를 삭제할까요?")) return;
    const { error } = await supabase
      .from("card_reviews")
      .delete()
      .eq("id", existing.id);
    if (error) toast.error(error.message);
    else {
      toast.success("삭제됨");
      setBody("");
      setRating(5);
      onSaved();
    }
  };

  return (
    <form onSubmit={submit} className="mt-3 space-y-2">
      <div className="flex items-center gap-2">
        <Label className="text-xs">내 평점</Label>
        <RatingInput value={rating} onChange={setRating} />
      </div>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="이 카드에 대한 의견을 남겨보세요"
        rows={2}
        maxLength={500}
      />
      <div className="flex justify-end gap-2">
        {existing && (
          <Button type="button" variant="ghost" size="sm" onClick={remove}>
            삭제
          </Button>
        )}
        <Button type="submit" size="sm" disabled={busy}>
          {existing ? "수정" : "등록"}
        </Button>
      </div>
    </form>
  );
}

function RatingInput({
  value,
  onChange,
}: {
  value: number;
  onChange: (n: number) => void;
}) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          onClick={() => onChange(n)}
          aria-label={`${n}점`}
        >
          <Star
            className={`h-5 w-5 ${
              n <= value
                ? "fill-yellow-400 text-yellow-400"
                : "text-muted-foreground"
            }`}
          />
        </button>
      ))}
    </div>
  );
}

function RatingStars({ value }: { value: number }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          className={`h-3.5 w-3.5 ${
            n <= value
              ? "fill-yellow-400 text-yellow-400"
              : "text-muted-foreground/40"
          }`}
        />
      ))}
    </div>
  );
}

function Stat({ label, value }: { label: string; value?: string | number | null }) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex gap-3">
      <span className="w-14 shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      {children}
    </span>
  );
}
