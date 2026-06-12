import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import { Library, Search, Star, X, ImageOff, Pencil, Trash2 } from "lucide-react";
import { useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useIsMobile } from "@/hooks/use-mobile";
import { PageHeader } from "@/components/page-header";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
  PaginationLink,
  PaginationNext,
  PaginationPrevious,
} from "@/components/ui/pagination";
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
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { EditCardDialog } from "@/components/cards/edit-card-dialog";
import { normalizeImageUrl } from "@/components/cards/card-uploader";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { useI18n } from "@/i18n/language-context";
import { colorLabel, COLORS_BY_GAME } from "@/lib/deck-colors";
import { useGames } from "@/hooks/use-games";
import { displayImageSrc } from "@/lib/image-proxy";

type Card = Database["public"]["Tables"]["cards"]["Row"];
type Review = Database["public"]["Tables"]["card_reviews"]["Row"];
type Illustration = Database["public"]["Tables"]["card_illustrations"]["Row"];

const PAGE_SIZE = 24;

type Game = string;

export const Route = createFileRoute("/cards/")({
  head: () => {
    let locale = "ko";
    if (typeof window !== "undefined") {
      locale = localStorage.getItem("duelnight.i18n.locale") || "ko";
    }
    const titles: Record<string, string> = {
      ko: "카드 DB — DuelNight",
      en: "Card DB — DuelNight",
      ja: "カードDB — DuelNight",
    };
    const descs: Record<string, string> = {
      ko: "원피스·포켓몬·디지몬 TCG 카드 데이터베이스 검색·필터·즐겨찾기·평가.",
      en: "One Piece, Pokémon, and Digimon TCG card database search, filters, favorites, and reviews.",
      ja: "ワンピース・ポケモン・デジモンTCGカードデータベース検索・フィルター・お気に入り・評価。",
    };
    return {
      meta: [
        { title: titles[locale] || titles.ko },
        {
          name: "description",
          content: descs[locale] || descs.ko,
        },
      ],
    };
  },
  component: CardsPage,
});

/**
 * 카드 썸네일. 이미지가 없거나(로드 실패 포함) 깨지면 흉한 깨짐 아이콘 대신
 * 카드 이름 placeholder로 폴백해 어떤 카드인지 식별 가능하게 한다.
 */
function CardThumb({
  src,
  name,
  noImageLabel,
}: {
  src: string | null;
  name: string;
  noImageLabel: string;
}) {
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);

  if (!src || failed) {
    return (
      <div className="flex h-full w-full flex-col items-center justify-center gap-1 px-1.5 text-center text-game-text-dim">
        <ImageOff className="h-6 w-6" />
        <span className="line-clamp-2 text-[11px] font-medium">{failed ? name : noImageLabel}</span>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-game-bg">
          <div className="h-full w-full animate-pulse bg-game-line/10" />
        </div>
      )}
      <img
        src={src}
        alt={name}
        loading="lazy"
        className={`h-full w-full object-cover transition-opacity duration-300 ${
          loading ? "opacity-0" : "opacity-100"
        }`}
        onLoad={() => setLoading(false)}
        onError={() => setFailed(true)}
      />
    </div>
  );
}

function CardsPage() {
  const { t, language } = useI18n();
  const { games, labelOf } = useGames();
  const { user } = useAuth();

  const getCardTypeLabel = (type: string) => {
    if (type === "leader") return t("cards.typeLeader");
    if (type === "character") return t("cards.typeCharacter");
    if (type === "event") return t("cards.typeEvent");
    if (type === "stage") return t("cards.typeStage");
    if (type === "don") return t("cards.typeDon");
    return type;
  };
  const isMobile = useIsMobile();
  const [game, setGame] = useState<Game>("optcg");
  const [q, setQ] = useState("");
  const [debouncedQ, setDebouncedQ] = useState("");
  const [type, setType] = useState<string>("all");
  const [setCode, setSetCode] = useState<string>("all");
  const [color, setColor] = useState<string>("all");
  const [favOnly, setFavOnly] = useState(false);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Card | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedQ(q);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [q]);

  const { data: sets = [] } = useQuery({
    queryKey: ["card-sets-list", game],
    staleTime: 10 * 60_000,
    queryFn: async () => {
      // card_sets 테이블에서 직접 조회 (cards에서 distinct를 뽑으면
      // PostgREST max-rows(기본 1000)에 잘려 오래된 세트가 누락됨)
      const { data, error } = await supabase
        .from("card_sets")
        .select("name")
        .eq("game", game)
        .order("name", { ascending: false })
        .limit(2000);
      if (error) throw error;
      return Array.from(new Set((data ?? []).map((r) => r.name)));
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
  const filters = { game, q: debouncedQ, type, setCode, color, favOnly, page };
  const { data, isFetching } = useQuery({
    queryKey: ["cards", filters, favKey],
    placeholderData: keepPreviousData,
    queryFn: async () => {
      let query = supabase
        .from("cards")
        .select("*", { count: "exact" })
        .eq("game", game)
        .order("code", { ascending: true });
      if (type !== "all") query = query.eq("type", type as Card["type"]);
      if (setCode !== "all") query = query.eq("set_code", setCode);
      if (color !== "all") query = query.contains("colors", [color]);
      if (debouncedQ.trim()) {
        const term = debouncedQ.trim();
        // 이름/코드는 부분일치, 특징(traits)은 정확 일치(배열 contains)
        const safe = term.replace(/[",{}\\]/g, "");
        query = query.or(`name.ilike.%${term}%,code.ilike.%${term}%,traits.cs.{"${safe}"}`);
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

  // 이전에 스크롤 시 카드가 사라지는 효과(opacity/scale)를 적용했으나,
  // 카드 DB 가독성을 해쳐 제거함. (관련 CSS animation-timeline: view() 도 제거됨)

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <PageHeader title={t("cards.title")} description={`${labelOf(game)} ${t("cards.desc")}`}>
        <div className="inline-flex rounded-md border border-game-line bg-game-card p-0.5">
          {games.map((g) => (
            <button
              key={g.code}
              type="button"
              onClick={() => {
                setGame(g.code);
                setSetCode("all");
                resetPage();
              }}
              className={`rounded px-3 py-1 text-xs font-medium transition ${
                game === g.code
                  ? "bg-primary text-primary-foreground"
                  : "text-game-text-dim hover:text-game-text"
              }`}
            >
              {labelOf(g.code)}
            </button>
          ))}
        </div>
      </PageHeader>

      <div className="mt-6 space-y-4 rounded-2xl border border-game-line bg-game-card p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-game-text-dim" />
          <Input
            value={q}
            onChange={(e) => {
              setQ(e.target.value);
              resetPage();
            }}
            placeholder={t("cards.searchPlaceholder")}
            className="pl-9 h-10 rounded-xl"
          />
        </div>

        {/* 타입 필터 칩 */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold text-game-text-dim">{t("cards.type")}</span>
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
            {[
              { value: "all", label: t("cards.typeAll") },
              { value: "leader", label: t("cards.typeLeader") },
              { value: "character", label: t("cards.typeCharacter") },
              { value: "event", label: t("cards.typeEvent") },
              { value: "stage", label: t("cards.typeStage") },
            ].map((item) => {
              const active = type === item.value;
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => {
                    setType(item.value);
                    resetPage();
                  }}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium border transition-all duration-200 ${
                    active
                      ? "bg-primary border-primary text-primary-foreground font-semibold shadow-sm"
                      : "bg-game-bg border-game-line text-game-text-dim hover:text-game-text hover:border-game-line-accent"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* 색상 필터 칩 */}
        <div className="flex flex-col gap-1.5">
          <span className="text-[11px] font-semibold text-game-text-dim">{t("cards.color")}</span>
          <div className="flex gap-1.5 overflow-x-auto scrollbar-none pb-1 -mx-4 px-4 sm:mx-0 sm:px-0">
            <button
              type="button"
              onClick={() => {
                setColor("all");
                resetPage();
              }}
              className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium border transition-all duration-200 ${
                color === "all"
                  ? "bg-primary border-primary text-primary-foreground font-semibold shadow-sm"
                  : "bg-game-bg border-game-line text-game-text-dim hover:text-game-text hover:border-game-line-accent"
              }`}
            >
              {t("cards.colorAll")}
            </button>
            {(COLORS_BY_GAME[game] || []).map((c) => {
              const active = color === c.id;
              let colorClass = "bg-game-bg border-game-line text-game-text-dim hover:text-game-text hover:border-game-line-accent";
              if (active) {
                if (c.id === "red") colorClass = "bg-red-500 border-red-500 text-white font-semibold shadow-sm";
                else if (c.id === "blue") colorClass = "bg-blue-500 border-blue-500 text-white font-semibold shadow-sm";
                else if (c.id === "green") colorClass = "bg-emerald-600 border-emerald-600 text-white font-semibold shadow-sm";
                else if (c.id === "yellow") colorClass = "bg-amber-400 border-amber-400 text-slate-900 font-semibold shadow-sm";
                else if (c.id === "black") colorClass = "bg-slate-800 border-slate-800 text-white font-semibold shadow-sm";
                else if (c.id === "purple") colorClass = "bg-purple-600 border-purple-600 text-white font-semibold shadow-sm";
                else if (c.id === "white") colorClass = "bg-slate-200 border-slate-300 text-slate-800 font-semibold shadow-sm";
                else {
                  colorClass = "bg-primary border-primary text-primary-foreground font-semibold shadow-sm";
                }
              }
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => {
                    setColor(c.id);
                    resetPage();
                  }}
                  className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-medium border transition-all duration-200 ${colorClass}`}
                >
                  {colorLabel(game, c.id, language)}
                </button>
              );
            })}
          </div>
        </div>

        {/* 세트 필터(Select 유지) 및 즐겨찾기 버튼 */}
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <Select
            value={setCode}
            onValueChange={(v) => {
              setSetCode(v);
              resetPage();
            }}
          >
            <SelectTrigger className="w-full h-10 rounded-xl">
              <SelectValue placeholder={t("cards.set")} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">{t("cards.setAll")}</SelectItem>
              {sets.map((s) => (
                <SelectItem key={s} value={s}>
                  {s}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant={favOnly ? "default" : "outline"}
            onClick={() => {
              if (!user) {
                toast.error(t("cards.toastLoginRequired"));
                return;
              }
              setFavOnly((v) => !v);
              resetPage();
            }}
            className="w-full gap-1.5 h-10 rounded-xl"
          >
            <Star className={`h-4 w-4 ${favOnly ? "fill-current" : ""}`} />
            {t("cards.favoritesOnly")}
          </Button>
        </div>
      </div>

      <p className="mt-4 text-xs text-game-text-dim">
        {t("cards.totalCards").replace("{total}", String(total))}
        {isFetching && ` · ${t("common.loading")}`}
      </p>

      {rows.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={Library}
            title={t("cards.noResults")}
            description={t("cards.noResultsDesc")}
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
        <Pagination className="mt-6">
          <PaginationContent className="flex-wrap">
            <PaginationItem>
              <PaginationPrevious
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  if (page > 0) setPage(page - 1);
                }}
                className={page === 0 ? "pointer-events-none opacity-50" : "cursor-pointer"}
              />
            </PaginationItem>

            <PaginationItem>
              <PaginationLink
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  setPage(0);
                }}
                isActive={page === 0}
                className="cursor-pointer"
              >
                1
              </PaginationLink>
            </PaginationItem>

            {(() => {
              const siblingCount = isMobile ? 0 : 1;
              const leftSiblingIndex = Math.max(1, page - siblingCount);
              const rightSiblingIndex = Math.min(totalPages - 2, page + siblingCount);
              const items = [];

              if (leftSiblingIndex > 1) {
                items.push(
                  <PaginationItem key="left-ellipsis">
                    <PaginationEllipsis />
                  </PaginationItem>,
                );
              }

              for (let i = leftSiblingIndex; i <= rightSiblingIndex; i++) {
                items.push(
                  <PaginationItem key={i}>
                    <PaginationLink
                      href="#"
                      onClick={(e) => {
                        e.preventDefault();
                        setPage(i);
                      }}
                      isActive={page === i}
                      className="cursor-pointer"
                    >
                      {i + 1}
                    </PaginationLink>
                  </PaginationItem>,
                );
              }

              if (rightSiblingIndex < totalPages - 2) {
                items.push(
                  <PaginationItem key="right-ellipsis">
                    <PaginationEllipsis />
                  </PaginationItem>,
                );
              }

              return items;
            })()}

            {totalPages > 1 && (
              <PaginationItem>
                <PaginationLink
                  href="#"
                  onClick={(e) => {
                    e.preventDefault();
                    setPage(totalPages - 1);
                  }}
                  isActive={page === totalPages - 1}
                  className="cursor-pointer"
                >
                  {totalPages}
                </PaginationLink>
              </PaginationItem>
            )}

            <PaginationItem>
              <PaginationNext
                href="#"
                onClick={(e) => {
                  e.preventDefault();
                  if (page < totalPages - 1) setPage(page + 1);
                }}
                className={
                  page + 1 >= totalPages ? "pointer-events-none opacity-50" : "cursor-pointer"
                }
              />
            </PaginationItem>
          </PaginationContent>
        </Pagination>
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

function CardTile({ card, isFav, onClick }: { card: Card; isFav: boolean; onClick: () => void }) {
  const { t, language } = useI18n();
  return (
    <li className="group relative scroll-reveal-card">
      <button
        onClick={onClick}
        className="block w-full overflow-hidden rounded-2xl border border-game-line bg-game-card text-left transition-all duration-300 hover:border-primary/55 hover:-translate-y-1 hover:shadow-md"
      >
        <div className="relative aspect-[5/7] w-full bg-game-bg">
          {(() => {
            const u = normalizeImageUrl(card.image_url);
            const src = u ? (displayImageSrc(u) ?? null) : null;
            return <CardThumb src={src} name={card.name} noImageLabel={t("cards.noImage")} />;
          })()}
          {card.type === "leader" && (
            <span className="absolute left-1.5 top-1.5 rounded-md bg-primary px-2 py-0.5 text-[10px] font-extrabold text-primary-foreground uppercase tracking-wide">
              {t("cards.typeLeader")}
            </span>
          )}
          {isFav && (
            <Star className="absolute right-1.5 top-1.5 h-4.5 w-4.5 fill-yellow-400 text-yellow-400 drop-shadow-sm" />
          )}
        </div>
        <div className="p-3">
          <p className="truncate text-[10px] font-semibold tracking-wider text-game-text-dim uppercase">{card.code}</p>
          <p className="truncate text-sm font-semibold text-game-text mt-0.5">{card.name}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {card.colors.map((c) => (
              <span
                key={c}
                className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary"
              >
                {colorLabel(card.game as Game, c, language)}
              </span>
            ))}
            {card.rarity && (
              <span className="rounded-md bg-game-bg px-1.5 py-0.5 text-[10px] font-semibold text-accent-foreground">
                {card.rarity}
              </span>
            )}
          </div>
          {card.traits && card.traits.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {card.traits.slice(0, 2).map((t) => (
                <span
                  key={t}
                  className="rounded-md border border-game-line bg-game-bg px-1.5 py-0.5 text-[10px] text-game-text-dim"
                >
                  {t}
                </span>
              ))}
              {card.traits.length > 2 && (
                <span className="text-[10px] text-game-text-dim font-medium self-center pl-0.5">+{card.traits.length - 2}</span>
              )}
            </div>
          )}
        </div>
      </button>
      <Link
        to="/cards/$code"
        params={{ code: card.code }}
        className="absolute bottom-2 right-2 rounded-md bg-game-bg px-2 py-0.5 text-[10px] font-medium text-game-text-dim opacity-0 transition group-hover:opacity-100 hover:text-game-text border border-game-line shadow-sm"
        onClick={(e) => e.stopPropagation()}
        aria-label={t("cards.detailAria")}
      >
        {t("cards.detail")}
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
  const { t, language } = useI18n();
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const getCardTypeLabel = (type: string) => {
    if (type === "leader") return t("cards.typeLeader");
    if (type === "character") return t("cards.typeCharacter");
    if (type === "event") return t("cards.typeEvent");
    if (type === "stage") return t("cards.typeStage");
    if (type === "don") return t("cards.typeDon");
    return type;
  };

  // 디지몬 전용 표시 (확장 필드)
  const isDtcg = card?.game === "dtcg";
  const ex = (card?.extra ?? {}) as Record<string, string>;

  const handleDelete = async () => {
    if (!card) return;
    setDeleting(true);
    try {
      const { error } = await supabase.from("cards").delete().eq("code", card.code);
      if (error) throw error;
      toast.success(t("cards.deleteSuccess"));
      setConfirmDelete(false);
      onOpenChange(false);
      qc.invalidateQueries({ queryKey: ["cards"] });
    } catch (err) {
      toast.error(t("cards.deleteFailed") + (err as Error).message);
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
    if (main) list.push({ url: main, label: t("cards.primaryIllust") });
    for (const il of illusts) {
      const u = normalizeImageUrl(il.image_url);
      if (!u || list.some((x) => x.url === u)) continue;
      list.push({ url: u, label: il.variant_label || t("cards.altIllust") });
    }
    return list;
  }, [card?.image_url, illusts, t]);

  const [activeUrl, setActiveUrl] = useState<string | null>(null);
  const [zoomOpen, setZoomOpen] = useState(false);
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
      toast.error(t("cards.toastLoginRequired"));
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
                <p className="text-xs text-game-text-dim">{card.code}</p>
                <DialogTitle className="flex items-center gap-2">
                  {card.name}
                  <button
                    onClick={toggleFav}
                    aria-label={t("cards.favoritesOnly")}
                    className="ml-auto rounded-md p-1 hover:bg-game-bg"
                  >
                    <Star
                      className={`h-5 w-5 ${
                        isFav ? "fill-yellow-400 text-yellow-400" : "text-game-text-dim"
                      }`}
                    />
                  </button>
                </DialogTitle>
              </DialogHeader>
              {isAdmin && (
                <div className="flex justify-end gap-1.5">
                  <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                    <Pencil className="h-3.5 w-3.5 mr-1" />
                    {t("common.edit")}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive hover:text-destructive"
                    onClick={() => setConfirmDelete(true)}
                  >
                    <Trash2 className="h-3.5 w-3.5 mr-1" />
                    {t("common.delete")}
                  </Button>
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
                <div>
                  {displayUrl ? (
                    <button
                      type="button"
                      onClick={() => setZoomOpen(true)}
                      className="block aspect-[5/7] w-full overflow-hidden rounded-md bg-game-bg cursor-zoom-in"
                      title="크게 보기"
                    >
                      <img
                        src={displayImageSrc(displayUrl)}
                        alt={card.name}
                        className="h-full w-full object-cover"
                      />
                    </button>
                  ) : (
                    <div className="aspect-[5/7] w-full overflow-hidden rounded-md bg-game-bg">
                      <div className="flex h-full items-center justify-center text-game-text-dim">
                        <ImageOff className="h-8 w-8" />
                      </div>
                    </div>
                  )}
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
                              : "border-game-line"
                          }`}
                        >
                          <img
                            src={displayImageSrc(g.url)}
                            alt={g.label}
                            className="h-full w-full object-cover"
                          />
                          <span className="absolute inset-x-0 bottom-0 truncate bg-game-bg/80 px-0.5 text-[8px] leading-3">
                            {g.label}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
                <div className="space-y-2 text-sm">
                  <div className="flex flex-wrap gap-1">
                    <Badge>
                      {isDtcg && ex.category ? ex.category : getCardTypeLabel(card.type)}
                    </Badge>
                    {isDtcg && ex.form && <Badge>{ex.form}</Badge>}
                    {card.colors.map((c) => (
                      <Badge key={c}>{colorLabel(card.game as Game, c, language)}</Badge>
                    ))}
                    {card.rarity && <Badge>{card.rarity}</Badge>}
                  </div>
                  {isDtcg ? (
                    <>
                      <Stat label="DP" value={card.power?.toLocaleString()} />
                      <Stat label="등장 코스트" value={card.cost} />
                      <Stat label="진화 코스트 1" value={ex.evo_cost_1} />
                      <Stat label="진화 코스트 2" value={ex.evo_cost_2} />
                      <Stat label={t("cards.attribute")} value={card.attribute} />
                      <Stat label={t("cards.set")} value={card.set_code} />
                    </>
                  ) : (
                    <>
                      <Stat
                        label={card.type === "leader" ? t("cards.life") : t("cards.cost")}
                        value={card.cost}
                      />
                      <Stat label={t("cards.power")} value={card.power?.toLocaleString()} />
                      <Stat label={t("cards.counter")} value={card.counter?.toLocaleString()} />
                      <Stat label={t("cards.attribute")} value={card.attribute} />
                      <Stat label={t("cards.set")} value={card.set_code} />
                    </>
                  )}
                  {card.traits && card.traits.length > 0 && (
                    <div>
                      <p className="text-xs font-semibold text-game-text-dim">
                        {isDtcg ? "유형" : t("cards.traits")}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {card.traits.map((t) => (
                          <Badge key={t}>{t}</Badge>
                        ))}
                      </div>
                    </div>
                  )}
                  {isDtcg && (ex.text_top || ex.text_bottom) ? (
                    <>
                      {ex.text_top && (
                        <div>
                          <p className="text-xs font-semibold text-game-text-dim">상단 텍스트</p>
                          <p className="mt-1 whitespace-pre-wrap rounded-md bg-game-bg/50 p-2 text-sm leading-relaxed">
                            {ex.text_top}
                          </p>
                        </div>
                      )}
                      {ex.text_bottom && (
                        <div>
                          <p className="text-xs font-semibold text-game-text-dim">하단 텍스트</p>
                          <p className="mt-1 whitespace-pre-wrap rounded-md bg-game-bg/50 p-2 text-sm leading-relaxed">
                            {ex.text_bottom}
                          </p>
                        </div>
                      )}
                    </>
                  ) : card.effect ? (
                    <div>
                      <p className="text-xs font-semibold text-game-text-dim">
                        {t("cards.effect")}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap rounded-md bg-game-bg/50 p-2 text-sm leading-relaxed">
                        {card.effect}
                      </p>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className="mt-4 border-t border-game-line pt-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold">
                    {t("cards.reviewsTitle")}{" "}
                    <span className="font-normal text-game-text-dim">({reviews.length})</span>
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
                  <p className="mt-3 text-sm text-game-text-dim">
                    {t("cards.ratingRequiredLogin")}
                  </p>
                )}
                <ul className="mt-3 space-y-2">
                  {reviews.length === 0 ? (
                    <li className="text-sm text-game-text-dim">
                      {t("cards.firstReviewPrompt")}
                    </li>
                  ) : (
                    reviews.map((r) => (
                      <li
                        key={r.id}
                        className="rounded-md border border-game-line bg-game-card p-3 text-sm"
                      >
                        <div className="flex items-center gap-2">
                          <RatingStars value={r.rating} />
                          <span className="text-xs text-game-text-dim">
                            {new Date(r.created_at).toLocaleDateString(
                              language === "ko" ? "ko-KR" : language === "ja" ? "ja-JP" : "en-US",
                            )}
                          </span>
                        </div>
                        {r.body && (
                          <p className="mt-1 whitespace-pre-wrap text-game-text/90">{r.body}</p>
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

      <AlertDialog
        open={confirmDelete}
        onOpenChange={(o) => {
          if (!o && !deleting) setConfirmDelete(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("cards.deleteConfirmTitle")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("cards.deleteConfirmDesc")
                .replace("{code}", card?.code || "")
                .replace("{name}", card?.name || "")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>{t("common.cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleDelete}
              disabled={deleting}
            >
              {deleting ? t("cards.deleting") : t("common.delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={zoomOpen} onOpenChange={setZoomOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-2xl p-2 bg-game-bg/95">
          <DialogTitle className="sr-only">{card?.name ?? "card"}</DialogTitle>
          {displayUrl && (
            <img
              src={displayImageSrc(displayUrl)}
              alt={card?.name ?? ""}
              className="max-h-[85vh] w-full rounded object-contain"
            />
          )}
        </DialogContent>
      </Dialog>
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
  const { t } = useI18n();
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
    toast.success(existing ? t("cards.toastReviewUpdated") : t("cards.toastReviewSaved"));
    onSaved();
  };

  const remove = async () => {
    if (!user || !existing) return;
    if (!confirm(t("cards.toastDeleteReviewConfirm"))) return;
    const { error } = await supabase.from("card_reviews").delete().eq("id", existing.id);
    if (error) toast.error(error.message);
    else {
      toast.success(t("cards.toastReviewDeleted"));
      setBody("");
      setRating(5);
      onSaved();
    }
  };

  return (
    <form onSubmit={submit} className="mt-3 space-y-2">
      <div className="flex items-center gap-2">
        <Label className="text-xs">{t("cards.myRating")}</Label>
        <RatingInput value={rating} onChange={setRating} />
      </div>
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder={t("cards.opinionPlaceholder")}
        rows={2}
        maxLength={500}
      />
      <div className="flex justify-end gap-2">
        {existing && (
          <Button type="button" variant="ghost" size="sm" onClick={remove}>
            {t("common.delete")}
          </Button>
        )}
        <Button type="submit" size="sm" disabled={busy}>
          {existing ? t("common.edit") : t("common.confirm")}
        </Button>
      </div>
    </form>
  );
}

function RatingInput({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="flex items-center gap-0.5">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" onClick={() => onChange(n)} aria-label={`${n}점`}>
          <Star
            className={`h-5 w-5 ${
              n <= value ? "fill-yellow-400 text-yellow-400" : "text-game-text-dim"
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
            n <= value ? "fill-yellow-400 text-yellow-400" : "text-game-text-dim/40"
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
      <span className="w-14 shrink-0 text-xs text-game-text-dim">{label}</span>
      <span className="text-sm">{value}</span>
    </div>
  );
}

function Badge({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-game-bg px-2 py-0.5 text-xs text-game-text-dim">
      {children}
    </span>
  );
}
