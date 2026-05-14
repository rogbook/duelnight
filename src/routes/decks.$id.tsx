import { createFileRoute, Link, notFound, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { ArrowLeft, Layers, Pencil, Check, Copy, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { RecipeEditor } from "@/components/decks/recipe-editor";
import { supabase } from "@/integrations/supabase/client";
import { GAME_LABEL } from "@/lib/match-stats";
import { colorHex, colorLabel, type Game } from "@/lib/deck-colors";
import type { Tables } from "@/integrations/supabase/types";

type Deck = Tables<"decks">;
type Profile = Tables<"profiles">;
type CardRow = Tables<"cards">;
type DeckCard = Tables<"deck_cards">;

const SITE = "https://tcg-hub.lovable.app";

export const Route = createFileRoute("/decks/$id")({
  loader: async ({ params }) => {
    // 현재 로그인 사용자 확인
    const { data: { user } } = await supabase.auth.getUser();
    const currentUserId = user?.id ?? null;

    const { data: deck, error } = await supabase
      .from("decks")
      .select("*")
      .eq("id", params.id)
      .maybeSingle();
    if (error) throw error;
    if (!deck) throw notFound();

    // 소유자이거나 공개 덱이면 레시피 열람 가능
    const isOwner = currentUserId === deck.user_id;
    const canView = deck.is_public || isOwner;

    let author: Profile | null = null;
    let deckCards: DeckCard[] = [];
    let cardMeta: Record<string, CardRow> = {};
    if (canView) {
      const [{ data: p }, { data: dc }] = await Promise.all([
        supabase.from("profiles").select("*").eq("id", deck.user_id).maybeSingle(),
        supabase
          .from("deck_cards")
          .select("*")
          .eq("deck_id", deck.id)
          .order("position", { ascending: true }),
      ]);
      author = (p as Profile | null) ?? null;
      deckCards = (dc ?? []) as DeckCard[];
      if (deckCards.length > 0) {
        const codes = deckCards.map((c) => c.card_code);
        const { data: cards } = await supabase
          .from("cards")
          .select("*")
          .in("code", codes);
        cardMeta = Object.fromEntries(
          (cards ?? []).map((c) => [c.code, c as CardRow]),
        );
      }
    }
    return {
      deck: deck as Deck,
      author,
      isPublic: deck.is_public,
      isOwner,
      canView,
      currentUserId,
      deckCards,
      cardMeta,
    };
  },
  head: ({ loaderData }) => {
    const d = loaderData?.deck;
    if (!d || !loaderData?.isPublic) {
      return { meta: [{ title: "비공개 덱 — TCG Hub" }] };
    }
    const title = `${d.name} — TCG Hub 덱`;
    const desc =
      d.notes?.replace(/\s+/g, " ").slice(0, 150) ??
      `${GAME_LABEL[d.game]}${d.leader ? ` · ${d.leader}` : ""}${
        d.archetype ? ` · ${d.archetype}` : ""
      }`;
    const url = `${SITE}/decks/${d.id}`;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "article" },
        { property: "og:url", content: url },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: desc },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: DeckDetailPage,
  notFoundComponent: () => (
    <div className="mx-auto max-w-3xl px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">덱을 찾을 수 없어요</h1>
      <Link to="/decks" className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> 덱 빌더로
      </Link>
    </div>
  ),
});

function DeckDetailPage() {
  const { deck, author, isPublic, isOwner, canView, currentUserId, deckCards, cardMeta } = Route.useLoaderData() as {
    deck: Deck;
    author: Profile | null;
    isPublic: boolean;
    isOwner: boolean;
    canView: boolean;
    currentUserId: string | null;
    deckCards: DeckCard[];
    cardMeta: Record<string, CardRow>;
  };

  const [isEditing, setIsEditing] = useState(false);
  const [copying, setCopying] = useState(false);
  const navigate = useNavigate();

  const canCopy = !!currentUserId && !isOwner && isPublic;

  const handleCopy = async () => {
    if (!currentUserId) return;
    setCopying(true);
    try {
      const { data: newDeck, error: e1 } = await supabase
        .from("decks")
        .insert({
          user_id: currentUserId,
          game: deck.game,
          name: `${deck.name} (복사본)`,
          colors: deck.colors,
          leader: deck.leader,
          archetype: deck.archetype,
          notes: deck.notes,
          is_public: false,
        })
        .select()
        .single();
      if (e1 || !newDeck) throw e1 ?? new Error("덱 생성 실패");

      if (deckCards.length > 0) {
        const rows = deckCards.map((dc, i) => ({
          deck_id: newDeck.id,
          card_code: dc.card_code,
          quantity: dc.quantity,
          position: i,
        }));
        const { error: e2 } = await supabase.from("deck_cards").insert(rows);
        if (e2) throw e2;
      }
      toast.success("내 덱에 복사되었습니다");
      navigate({ to: "/decks/$id", params: { id: newDeck.id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "복사 실패");
    } finally {
      setCopying(false);
    }
  };


  if (!canView) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <Layers className="mx-auto h-10 w-10 text-muted-foreground" />
        <h1 className="mt-4 text-xl font-semibold">비공개 덱입니다</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          덱 소유자만 열람할 수 있어요.
        </p>
        <Link
          to="/decks"
          className="mt-6 inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> 덱 목록으로
        </Link>
      </div>
    );
  }

  const totalCards = deckCards.reduce((s, c) => s + c.quantity, 0);

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <Link
        to="/decks"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> 덱 빌더
      </Link>
      <div className="mt-4 rounded-lg border border-border bg-card p-6">
        <p className="text-xs text-muted-foreground">{GAME_LABEL[deck.game]}</p>
        <h1 className="mt-1 text-2xl font-semibold">{deck.name}</h1>
        {deck.colors && deck.colors.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {deck.colors.map((c) => (
              <span
                key={c}
                className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
              >
                <span
                  className="h-2 w-2 rounded-full ring-1 ring-border"
                  style={{ backgroundColor: colorHex(deck.game as Game, c) }}
                />
                {colorLabel(deck.game as Game, c)}
              </span>
            ))}
          </div>
        )}
        {deck.leader && (
          <p className="mt-2 text-sm text-muted-foreground">
            리더: <span className="text-foreground">{deck.leader}</span>
          </p>
        )}
        {deck.notes && (
          <div className="mt-4">
            <p className="text-xs font-semibold text-muted-foreground">메모</p>
            <p className="mt-1 whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-sm leading-relaxed">
              {deck.notes}
            </p>
          </div>
        )}
        <div className="mt-4 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            작성: {author?.display_name ?? author?.username ?? "익명"}
          </span>
          <span>{new Date(deck.updated_at).toLocaleDateString("ko-KR")}</span>
        </div>
        
        {(isOwner || canCopy) && (
          <div className="mt-4 flex flex-col gap-2 border-t pt-4 sm:flex-row">
            {isOwner && (
              <button
                onClick={() => setIsEditing(!isEditing)}
                className="flex flex-1 items-center justify-center gap-2 rounded-md bg-muted px-4 py-2 text-sm font-medium hover:bg-muted/80"
              >
                {isEditing ? (
                  <>
                    <Check className="h-4 w-4" /> 조회 모드로 전환
                  </>
                ) : (
                  <>
                    <Pencil className="h-4 w-4" /> 레시피 편집하기
                  </>
                )}
              </button>
            )}
            {canCopy && (
              <button
                onClick={handleCopy}
                disabled={copying}
                className="flex flex-1 items-center justify-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90 disabled:opacity-60"
              >
                {copying ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> 복사 중...
                  </>
                ) : (
                  <>
                    <Copy className="h-4 w-4" /> 내 덱에 복사
                  </>
                )}
              </button>
            )}
          </div>
        )}
      </div>

      {isEditing ? (
        <div className="mt-6 rounded-lg border border-border bg-card p-6">
          <h2 className="mb-4 text-sm font-semibold">덱 레시피 편집</h2>
          <RecipeEditor deck={deck} />
        </div>
      ) : deckCards.length > 0 && (
        <div className="mt-6 rounded-lg border border-border bg-card p-6">
          <h2 className="text-sm font-semibold">
            덱 레시피{" "}
            <span className="font-normal text-muted-foreground">
              ({deckCards.length}종 · 총 {totalCards}장)
            </span>
          </h2>
          <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {deckCards.map((dc) => {
              const card = cardMeta[dc.card_code];
              return (
                <li
                  key={dc.id}
                  className="flex items-center gap-2 rounded border border-border p-2 text-xs"
                >
                  {card?.image_url ? (
                    <img
                      src={card.image_url}
                      alt=""
                      className="h-12 w-9 rounded object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <div className="h-12 w-9 rounded bg-muted" />
                  )}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">
                      {card?.name ?? dc.card_code}
                    </p>
                    <p className="truncate text-[10px] text-muted-foreground">
                      {dc.card_code}
                    </p>
                  </div>
                  <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-semibold">
                    ×{dc.quantity}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
