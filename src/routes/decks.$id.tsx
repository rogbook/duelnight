import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useMemo, useEffect } from "react";
import {
  ArrowLeft,
  Layers,
  Pencil,
  Check,
  Copy,
  User,
  Calendar,
  Info,
  List,
  X,
  Swords,
} from "lucide-react";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RecipeEditor } from "@/components/decks/recipe-editor";
import { DeckDialog } from "@/components/decks/deck-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { GAME_LABEL } from "@/lib/match-stats";
import { colorHex, colorLabel, type Game } from "@/lib/deck-colors";
import { toast } from "sonner";
import type { Tables } from "@/integrations/supabase/types";
import { useI18n } from "@/i18n/language-context";

type Deck = Tables<"decks">;
type Profile = Tables<"profiles">;
type CardRow = Tables<"cards">;
type DeckCard = Tables<"deck_cards">;
type MatchRow = Tables<"matches">;


export const Route = createFileRoute("/decks/$id")({
  head: () => {
    let locale = "ko";
    if (typeof window !== "undefined") {
      locale = localStorage.getItem("duelnight.i18n.locale") || "ko";
    }
    const titles: Record<string, string> = {
      ko: "덱 레시피 상세 — DuelNight",
      en: "Deck Recipe Detail — DuelNight",
      ja: "デッキレシピ詳細 — DuelNight",
    };
    const descs: Record<string, string> = {
      ko: "등록된 덱 레시피 상세 정보 및 카드 목록.",
      en: "Detailed information and card list of the registered deck recipe.",
      ja: "登録されたデッキレシピの詳細情報とカードリスト。",
    };
    return {
      meta: [
        { title: titles[locale] || titles.ko },
        { name: "description", content: descs[locale] || descs.ko },
      ],
    };
  },
  component: DeckDetailPage,
  errorComponent: ({ error }) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { t } = useI18n();
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="text-xl font-bold">{t("decks.loadFailed")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <Link
          to="/decks"
          className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> {t("decks.backToBuilder")}
        </Link>
      </div>
    );
  },
  notFoundComponent: () => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const { t } = useI18n();
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="text-xl font-bold">{t("decks.notFound")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("decks.notFoundDesc")}</p>
        <Link
          to="/decks"
          className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> {t("decks.backToBuilder")}
        </Link>
      </div>
    );
  },
});

function DeckDetailPage() {
  const { id } = Route.useParams();
  const { user, loading: authLoading } = useAuth();
  const currentUserId = user?.id ?? null;
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"info" | "recipe" | "matches">("info");
  const [matchPeriod, setMatchPeriod] = useState<"all" | "30d" | "7d">("all");

  const [zoomCard, setZoomCard] = useState<{ url: string; name: string } | null>(null);
  const { t, language } = useI18n();

  // ⚠️ 모든 훅은 조건부 return 이전에 호출되어야 함 (React Hooks rule).

  // 1. 덱 본체
  const {
    data: initialDeck,
    isLoading: deckLoading,
    error: deckError,
  } = useQuery({
    queryKey: ["deck", id],
    queryFn: async () => {
      const { data, error } = await supabase.from("decks").select("*").eq("id", id).maybeSingle();
      if (error) throw error;
      return (data as Deck | null) ?? null;
    },
  });

  // 로컬 상태로 미러링 (수정 즉시 반영)
  const [deck, setDeck] = useState<Deck | null>(null);
  useEffect(() => {
    if (initialDeck) setDeck(initialDeck);
  }, [initialDeck]);

  const isOwner = !!currentUserId && !!deck && currentUserId === deck.user_id;
  const canView = !!deck && (deck.is_public || isOwner);

  // 2. 작성자 프로필
  const { data: author } = useQuery({
    queryKey: ["profile", deck?.user_id],
    enabled: !!deck?.user_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", deck!.user_id)
        .maybeSingle();
      return data as Profile | null;
    },
  });

  // 3. 덱 카드 목록
  const { data: deckCards = [] } = useQuery<DeckCard[]>({
    queryKey: ["deck-cards", deck?.id],
    enabled: !!deck && canView,
    queryFn: async () => {
      const { data } = await supabase
        .from("deck_cards")
        .select("*")
        .eq("deck_id", deck!.id)
        .order("position", { ascending: true });
      return (data ?? []) as DeckCard[];
    },
  });

  // 4. 카드 메타
  const codes = useMemo(() => deckCards.map((c) => c.card_code), [deckCards]);
  const { data: cardMeta = {} } = useQuery<Record<string, CardRow>>({
    queryKey: ["deck-cards-meta", deck?.id, [...codes].sort().join(",")],
    enabled: codes.length > 0,
    queryFn: async () => {
      const { data } = await supabase.from("cards").select("*").in("code", codes);
      return Object.fromEntries((data ?? []).map((c) => [c.code, c as CardRow]));
    },
  });

  // 5. 리더 카드(원피스) — leader 문자열 형식: "이름 (CODE)" 또는 "이름"
  const { data: leaderCard } = useQuery({
    queryKey: ["leader-card", deck?.game, deck?.leader],
    enabled: !!deck?.leader && deck?.game === "optcg",
    queryFn: async () => {
      const raw = deck!.leader!.trim();
      const codeMatch = raw.match(/\(([A-Z0-9-]+)\)\s*$/i);
      const code = codeMatch?.[1];
      const nameOnly = raw.replace(/\s*\([A-Z0-9-]+\)\s*$/i, "").trim();

      let query = supabase.from("cards").select("*").eq("game", "optcg").eq("type", "leader");
      query = code ? query.eq("code", code) : query.eq("name", nameOnly);
      const { data } = await query.limit(1).maybeSingle();
      return data as CardRow | null;
    },
  });

  // 6. 내 전적 (이 덱으로 기록한 매치)
  const { data: deckMatches = [] } = useQuery<MatchRow[]>({
    queryKey: ["deck-matches", deck?.id, currentUserId],
    enabled: !!deck?.id && !!currentUserId && currentUserId === deck?.user_id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("matches")
        .select("*")
        .eq("user_id", currentUserId!)
        .eq("deck_id", deck!.id)
        .order("played_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as MatchRow[];
    },
  });

  // ===== 여기서부터 조건부 return =====
  if (deckLoading || authLoading) {

    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center text-sm text-muted-foreground">
        {t("decks.loading")}
      </div>
    );
  }

  if (deckError) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="text-xl font-bold">{t("decks.loadFailed")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{(deckError as Error).message}</p>
        <Link
          to="/decks"
          className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> {t("decks.backToBuilder")}
        </Link>
      </div>
    );
  }

  if (!deck) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <Layers className="mx-auto h-12 w-12 text-muted-foreground opacity-20" />
        <h1 className="mt-4 text-xl font-bold">{t("decks.notFound")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          {t("decks.notFoundDesc")}
        </p>
        <Link
          to="/decks"
          className="mt-6 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> {t("decks.backToBuilder")}
        </Link>
      </div>
    );
  }

  if (!canView) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <Layers className="mx-auto h-12 w-12 text-muted-foreground opacity-20" />
        <h1 className="mt-4 text-xl font-bold">{t("decks.privateDeck")}</h1>
        <p className="mt-2 text-sm text-muted-foreground">{t("decks.privateDeckDesc")}</p>
        <Link
          to="/decks"
          className="mt-8 inline-flex items-center gap-2 text-sm font-medium text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> {t("decks.backToBuilder")}
        </Link>
      </div>
    );
  }

  const totalCards = deckCards.reduce((s, c) => s + c.quantity, 0);
  const openZoom = (url: string | null | undefined, name: string | null | undefined) => {
    if (!url) return;
    setZoomCard({ url, name: name ?? "카드 이미지" });
  };

  const onCopy = async () => {
    if (!currentUserId) return toast.error(t("matches.loginRequired"));
    const confirmCopy = confirm(t("decks.copyConfirm"));
    if (!confirmCopy) return;

    try {
      // 1. Create deck metadata
      const { data: newDeck, error: deckErr } = await supabase
        .from("decks")
        .insert({
          name: language === "ko" ? `복사본: ${deck.name}` : language === "ja" ? `コピー: ${deck.name}` : `Copy of ${deck.name}`,
          game: deck.game,
          leader: deck.leader,
          archetype: deck.archetype,
          notes: deck.notes,
          colors: deck.colors,
          is_public: false,
          user_id: currentUserId,
        })
        .select()
        .single();

      if (deckErr) throw deckErr;

      // 2. Copy cards
      if (deckCards.length > 0) {
        const { error: cardsErr } = await supabase.from("deck_cards").insert(
          deckCards.map((dc) => ({
            deck_id: newDeck.id,
            card_code: dc.card_code,
            quantity: dc.quantity,
            position: dc.position,
          })),
        );
        if (cardsErr) throw cardsErr;
      }

      toast.success(t("decks.copySuccess"));
      navigate({ to: "/decks" });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : t("decks.copyFailed"));
    }
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8">
      {zoomCard && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-background/90 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label={language === "ko" ? `${zoomCard.name} 확대 이미지` : language === "ja" ? `${zoomCard.name}拡大画像` : `${zoomCard.name} Zoomed Image`}
          onClick={() => setZoomCard(null)}
        >
          <button
            type="button"
            className="absolute right-4 top-4 inline-flex h-10 w-10 items-center justify-center rounded-full border border-border bg-card text-foreground shadow-sm transition-opacity hover:opacity-80"
            onClick={() => setZoomCard(null)}
            aria-label={t("decks.closeZoom")}
          >
            <X className="h-5 w-5" />
          </button>
          <img
            src={zoomCard.url}
            alt={language === "ko" ? `${zoomCard.name} 확대` : language === "ja" ? `${zoomCard.name}拡大` : `${zoomCard.name} Zoomed`}
            className="max-h-[88vh] max-w-[92vw] rounded-lg border border-border bg-card object-contain shadow-lg"
            onClick={(event) => event.stopPropagation()}
          />
        </div>
      )}

      {/* Breadcrumb */}
      <nav className="mb-6">
        <Link
          to="/decks"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> {t("decks.title")}
        </Link>
      </nav>

      {/* Header Card */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
        <div className="flex flex-col md:flex-row">
          {/* Visual Area (Leader Card or Default) */}
          <div className="w-full md:w-64 bg-muted/30 p-6 flex flex-col items-center justify-center border-b md:border-b-0 md:border-r border-border">
            {deck.game === "optcg" && leaderCard ? (
              <div className="space-y-3 text-center">
                <img
                  src={leaderCard.image_url ?? ""}
                  alt={deck.leader!}
                  className="h-64 w-44 rounded-lg object-cover shadow-xl ring-1 ring-border"
                />
                <p className="text-xs font-bold text-primary">{t("decks.leaderLabel")}</p>
              </div>
            ) : (
              <div className="flex h-64 w-44 flex-col items-center justify-center rounded-lg border-2 border-dashed border-border bg-background/50 text-muted-foreground">
                <Layers className="h-10 w-10 opacity-20" />
                <p className="mt-2 text-[10px] uppercase tracking-widest font-bold">
                  {t(`matches.${deck.game}`)}
                </p>
              </div>
            )}
          </div>

          {/* Info Area */}
          <div className="flex-1 p-6 md:p-8 flex flex-col">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <p className="text-xs font-bold text-primary uppercase tracking-tighter">
                  {t(`matches.${deck.game}`)}
                </p>
                <h1 className="text-2xl md:text-3xl font-black tracking-tight">{deck.name}</h1>
                <div className="mt-3 flex flex-wrap gap-1.5">
                  {(deck.colors ?? []).map((c) => (
                    <span
                      key={c}
                      className="inline-flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1 text-[11px] font-bold text-foreground ring-1 ring-border"
                    >
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ backgroundColor: colorHex(deck.game as Game, c) }}
                      />
                      {colorLabel(deck.game as Game, c, language)}
                    </span>
                  ))}
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-foreground text-background px-2.5 py-1 text-[11px] font-bold">
                    {t("decks.cardsCount").replace("{count}", String(totalCards))}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-2 shrink-0">
                {isOwner ? (
                  <DeckDialog
                    mode="edit"
                    deck={deck}
                    onSaved={(d) => {
                      setDeck(d);
                      qc.invalidateQueries({ queryKey: ["decks"] });
                    }}
                    trigger={
                      <button className="flex items-center justify-center gap-2 rounded-lg bg-foreground px-4 py-2 text-xs font-bold text-background hover:opacity-90 transition-opacity shadow-lg">
                        <Pencil className="h-3.5 w-3.5" /> {t("decks.editInfo")}
                      </button>
                    }
                  />
                ) : (
                  <button
                    onClick={onCopy}
                    className="flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 transition-opacity shadow-lg"
                  >
                    <Copy className="h-3.5 w-3.5" /> {t("decks.copyDeck")}
                  </button>
                )}
              </div>
            </div>

            {deck.notes && (
              <div className="mt-6">
                <p className="text-[10px] font-black uppercase text-muted-foreground tracking-widest mb-1.5">
                  {t("decks.memoTitle")}
                </p>
                <div className="rounded-xl bg-muted/50 p-4 text-sm leading-relaxed text-foreground/80 whitespace-pre-wrap border border-border/50">
                  {deck.notes}
                </div>
              </div>
            )}

            <div className="mt-auto pt-6 flex items-center justify-between border-t border-border/50 text-[11px] text-muted-foreground">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-1.5">
                  <User className="h-3 w-3" />
                  <span className="font-medium text-foreground">
                    {author?.display_name ?? author?.username ?? t("decks.anonymous")}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3 w-3" />
                  <span>{new Date(deck.updated_at).toLocaleDateString(language === "ko" ? "ko-KR" : language === "ja" ? "ja-JP" : "en-US")}</span>
                </div>
              </div>
              <span className="font-bold tracking-tighter">
                {deck.is_public ? t("decks.publicDeckLabel") : t("decks.privateDeckLabel")}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="mt-8">
        <div className="flex items-center gap-2 border-b border-border mb-6">
          <button
            onClick={() => setTab("info")}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-bold transition-all border-b-2 ${
              tab === "info"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <Info className="h-4 w-4" /> {t("decks.tabInfo")}
          </button>
          <button
            onClick={() => setTab("recipe")}
            className={`flex items-center gap-2 px-6 py-3 text-sm font-bold transition-all border-b-2 ${
              tab === "recipe"
                ? "border-primary text-primary"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            <List className="h-4 w-4" /> {t("decks.tabRecipe").replace("{count}", String(deckCards.length))}
          </button>
          {isOwner && (
            <button
              onClick={() => setTab("matches")}
              className={`flex items-center gap-2 px-6 py-3 text-sm font-bold transition-all border-b-2 ${
                tab === "matches"
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
            >
              <Swords className="h-4 w-4" /> {t("decks.tabMatches").replace("{count}", String(deckMatches.length))}
            </button>
          )}
        </div>

        {tab === "info" ? (

          <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <h3 className="text-sm font-black mb-4 flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary" /> {t("decks.archetypeTitle")}
                </h3>
                <div className="space-y-4">
                  <div className="flex justify-between items-center py-2 border-b border-border/50">
                    <span className="text-xs text-muted-foreground">{t("decks.leader")}</span>
                    <span className="text-sm font-bold">{deck.leader || t("decks.none")}</span>
                  </div>
                  <div className="flex justify-between items-center py-2 border-b border-border/50">
                    <span className="text-xs text-muted-foreground">{t("decks.archetype")}</span>
                    <span className="text-sm font-bold">{deck.archetype || t("decks.noArchetypeInfo")}</span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <h3 className="text-sm font-black mb-4 flex items-center gap-2">
                  <Check className="h-4 w-4 text-primary" /> {t("decks.summaryTitle")}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {t("decks.summaryDesc")
                    .replace("{game}", t(`matches.${deck.game}`))
                    .replace("{total}", String(totalCards))
                    .replace("{status}", deck.is_public ? t("decks.public") : t("decks.private"))}
                </p>
              </div>
            </div>

            {/* 투입 카드 미리보기 (수량만큼 펼침) */}
            {deckCards.length > 0 && (
              <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
                <h3 className="text-sm font-black mb-4 flex items-center gap-2">
                  <Layers className="h-4 w-4 text-primary" /> {t("decks.cardsInDeck").replace("{count}", String(totalCards))}
                </h3>
                <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 lg:grid-cols-10 gap-2">
                  {deckCards.flatMap((dc) => {
                    const card = cardMeta[dc.card_code];
                    const missing = !card;
                    return Array.from({ length: dc.quantity }).map((_, i) => (
                      <button
                        key={`${dc.id}-${i}`}
                        type="button"
                        onClick={() => openZoom(card?.image_url, card?.name ?? dc.card_code)}
                        className={`relative aspect-[2/3] overflow-hidden rounded border bg-muted shadow-sm transition-all hover:ring-2 hover:ring-primary/40 ${
                          missing ? "border-dashed border-amber-500/60" : "border-border"
                        }`}
                        title={
                          missing
                            ? t("decks.notRegisteredDbTooltip").replace("{code}", dc.card_code)
                            : `${card?.name ?? dc.card_code} (${i + 1}/${dc.quantity})`
                        }
                        aria-label={language === "ko" ? `${card?.name ?? dc.card_code} 확대 보기` : language === "ja" ? `${card?.name ?? dc.card_code}拡大表示` : `Zoom ${card?.name ?? dc.card_code}`}
                      >
                        {card?.image_url ? (
                          <img
                            src={card.image_url}
                            alt={card?.name ?? dc.card_code}
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        ) : (
                          <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-1 text-center">
                            <span className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[8px] font-bold text-amber-600 dark:text-amber-400">
                              {t("decks.notRegisteredDb")}
                            </span>
                            <span className="text-[8px] text-muted-foreground break-all">
                              {dc.card_code}
                            </span>
                          </div>
                        )}
                      </button>
                    ));
                  })}
                </div>
              </div>
            )}
          </div>
        ) : tab === "recipe" ? (

          <div className="space-y-6">
            {isOwner && (
              <div className="mb-4">
                <RecipeEditor deck={deck} />
              </div>
            )}

            {!isOwner && deckCards.length > 0 && (
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
                {deckCards.map((dc) => {
                  const card = cardMeta[dc.card_code];
                  return (
                    <button
                      key={dc.id}
                      type="button"
                      onClick={() => openZoom(card?.image_url, card?.name ?? dc.card_code)}
                      className="group relative aspect-[2/3] overflow-hidden rounded-lg border border-border bg-muted text-left shadow-sm transition-all hover:shadow-md hover:ring-2 hover:ring-primary/40"
                      aria-label={language === "ko" ? `${card?.name ?? dc.card_code} 확대 보기` : language === "ja" ? `${card?.name ?? dc.card_code}拡大表示` : `Zoom ${card?.name ?? dc.card_code}`}
                    >
                      {card?.image_url ? (
                        <img
                          src={card.image_url}
                          alt={card.name}
                          className="h-full w-full object-cover transition-transform group-hover:scale-105"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full w-full flex-col items-center justify-center gap-2 p-3 text-center">
                          <span className="rounded bg-amber-500/15 px-2 py-0.5 text-[10px] font-bold text-amber-600 dark:text-amber-400">
                            {t("decks.notRegisteredDb")}
                          </span>
                          <span className="text-[10px] text-muted-foreground break-all">
                            {dc.card_code}
                          </span>
                        </div>
                      )}

                      <div className="absolute inset-x-0 bottom-0 bg-black/70 p-2 text-[10px] text-white">
                        <div className="flex items-center justify-between gap-1">
                          <span className="truncate font-bold">{card?.name || dc.card_code}</span>
                          <span className="bg-primary px-1.5 py-0.5 rounded font-black">
                            ×{dc.quantity}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
            {deckCards.length === 0 && (
              <div className="py-20 text-center rounded-2xl border-2 border-dashed border-border bg-muted/10">
                <Layers className="mx-auto h-12 w-12 text-muted-foreground opacity-20" />
                <p className="mt-4 text-sm text-muted-foreground">
                  {language === "ko" ? "등록된 카드가 아직 없습니다." : language === "ja" ? "登録されたカードがまだありません。" : "No cards registered yet."}
                </p>
              </div>
            )}
          </div>
        ) : (
          <DeckMatchesTab
            matches={deckMatches}
            period={matchPeriod}
            onPeriodChange={setMatchPeriod}
          />
        )}

      </div>
    </div>
  );
}

// ============================================================
// 덱 전적 탭 컴포넌트
// ============================================================
function DeckMatchesTab({
  matches,
  period,
  onPeriodChange,
}: {
  matches: MatchRow[];
  period: "all" | "30d" | "7d";
  onPeriodChange: (p: "all" | "30d" | "7d") => void;
}) {
  const { t, language } = useI18n();

  const filtered = useMemo(() => {
    if (period === "all") return matches;
    const days = period === "7d" ? 7 : 30;
    const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
    return matches.filter((m) => new Date(m.played_at).getTime() >= cutoff);
  }, [matches, period]);

  const stats = useMemo(() => {
    const wins = filtered.filter((m) => m.result === "win").length;
    const losses = filtered.filter((m) => m.result === "loss").length;
    const draws = filtered.filter((m) => m.result === "draw").length;
    const decisive = wins + losses;
    const winRate = decisive === 0 ? 0 : Math.round((wins / decisive) * 1000) / 10;
    return { wins, losses, draws, total: filtered.length, winRate };
  }, [filtered]);

  const matchups = useMemo(() => {
    const map = new Map<string, { wins: number; losses: number; draws: number; total: number }>();
    for (const m of filtered) {
      const key = (m.opp_deck?.trim() || m.opp_leader?.trim() || "__unknown__");
      const cur = map.get(key) ?? { wins: 0, losses: 0, draws: 0, total: 0 };
      cur.total += 1;
      if (m.result === "win") cur.wins += 1;
      else if (m.result === "loss") cur.losses += 1;
      else cur.draws += 1;
      map.set(key, cur);
    }
    const arr = Array.from(map.entries())
      .filter(([k, v]) => k !== "__unknown__" && v.total >= 2)
      .map(([name, v]) => {
        const decisive = v.wins + v.losses;
        const winRate = decisive === 0 ? 0 : Math.round((v.wins / decisive) * 1000) / 10;
        return { name, ...v, winRate };
      });
    const strong = [...arr].sort((a, b) => b.winRate - a.winRate || b.total - a.total).slice(0, 5);
    const weak = [...arr].sort((a, b) => a.winRate - b.winRate || b.total - a.total).slice(0, 5);
    return { strong, weak };
  }, [filtered]);

  const periods: { id: "all" | "30d" | "7d"; label: string }[] = [
    { id: "all", label: t("decks.matchesPeriodAll") },
    { id: "30d", label: t("decks.matchesPeriod30d") },
    { id: "7d", label: t("decks.matchesPeriod7d") },
  ];

  const locale = language === "ko" ? "ko-KR" : language === "ja" ? "ja-JP" : "en-US";

  return (
    <div className="space-y-6">
      {/* 기간 필터 */}
      <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1">
        {periods.map((p) => (
          <button
            key={p.id}
            type="button"
            onClick={() => onPeriodChange(p.id)}
            className={
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors " +
              (period === p.id
                ? "bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground")
            }
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* 통계 요약 */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label={t("decks.matchesTotal").replace("{count}", String(stats.total))}
          value={stats.total}
        />
        <StatCard label={t("decks.matchesWinRate")} value={`${stats.winRate}%`} accent />
        <StatCard
          label={`${t("decks.matchesWins")} / ${t("decks.matchesLosses")} / ${t("decks.matchesDraws")}`}
          value={`${stats.wins} / ${stats.losses} / ${stats.draws}`}
        />
        <StatCard label={t("decks.matchesPeriodAll")} value={periods.find((p) => p.id === period)?.label ?? ""} />
      </div>

      {filtered.length === 0 ? (
        <div className="py-20 text-center rounded-2xl border-2 border-dashed border-border bg-muted/10">
          <Swords className="mx-auto h-12 w-12 text-muted-foreground opacity-20" />
          <p className="mt-4 text-sm text-muted-foreground">{t("decks.matchesEmpty")}</p>
        </div>
      ) : (
        <>
          {/* 강/약 매치업 */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <MatchupList
              title={t("decks.strongMatchups")}
              items={matchups.strong}
              tone="strong"
              gamesLabel={t("decks.matchupGames")}
              winRateLabel={t("decks.matchesWinRate")}
            />
            <MatchupList
              title={t("decks.weakMatchups")}
              items={matchups.weak}
              tone="weak"
              gamesLabel={t("decks.matchupGames")}
              winRateLabel={t("decks.matchesWinRate")}
            />
          </div>

          {/* 최근 전적 리스트 */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
            <h3 className="text-sm font-black mb-4 flex items-center gap-2">
              <Swords className="h-4 w-4 text-primary" /> {t("decks.recentMatchesTitle")}
            </h3>
            <ul className="divide-y divide-border/50">
              {filtered.slice(0, 15).map((m) => (
                <li key={m.id} className="flex items-center justify-between py-2.5 text-sm">
                  <div className="flex items-center gap-3 min-w-0">
                    <ResultBadge result={m.result} />
                    <span className="truncate font-medium">
                      {m.opp_deck?.trim() ||
                        m.opp_leader?.trim() ||
                        t("decks.matchupUnknown")}
                    </span>
                  </div>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {new Date(m.played_at).toLocaleDateString(locale)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="mt-4 text-right">
              <Link
                to="/matches"
                className="text-xs font-medium text-primary hover:underline"
              >
                {t("decks.viewAllMatches")} →
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string | number;
  accent?: boolean;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <p className="text-[10px] font-black uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <p className={`mt-1 text-2xl font-black ${accent ? "text-primary" : "text-foreground"}`}>
        {value}
      </p>
    </div>
  );
}

function MatchupList({
  title,
  items,
  tone,
  gamesLabel,
  winRateLabel,
}: {
  title: string;
  items: { name: string; total: number; wins: number; losses: number; draws: number; winRate: number }[];
  tone: "strong" | "weak";
  gamesLabel: string;
  winRateLabel: string;
}) {
  const dotClass = tone === "strong" ? "bg-emerald-500" : "bg-rose-500";
  return (
    <div className="rounded-2xl border border-border bg-card p-6 shadow-sm">
      <h3 className="text-sm font-black mb-4 flex items-center gap-2">
        <span className={`h-2 w-2 rounded-full ${dotClass}`} />
        {title}
      </h3>
      {items.length === 0 ? (
        <p className="text-xs text-muted-foreground">—</p>
      ) : (
        <ul className="space-y-2">
          {items.map((it) => (
            <li key={it.name} className="flex items-center justify-between gap-2">
              <span className="min-w-0 truncate text-sm font-medium">{it.name}</span>
              <span className="flex items-center gap-2 text-xs text-muted-foreground whitespace-nowrap">
                <span>{gamesLabel.replace("{count}", String(it.total))}</span>
                <span className="font-bold text-foreground">
                  {winRateLabel} {it.winRate}%
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ResultBadge({ result }: { result: MatchRow["result"] }) {
  const map = {
    win: { label: "W", cls: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" },
    loss: { label: "L", cls: "bg-rose-500/15 text-rose-600 dark:text-rose-400" },
    draw: { label: "D", cls: "bg-muted text-muted-foreground" },
  } as const;
  const v = map[result as keyof typeof map] ?? map.draw;
  return (
    <span
      className={`inline-flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-black ${v.cls}`}
    >
      {v.label}
    </span>
  );
}

