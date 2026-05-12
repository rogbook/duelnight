import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, Layers } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GAME_LABEL } from "@/lib/match-stats";
import type { Tables } from "@/integrations/supabase/types";

type Deck = Tables<"decks">;
type Profile = Tables<"profiles">;

const SITE = "https://tcg-hub.lovable.app";

export const Route = createFileRoute("/decks/$id")({
  loader: async ({ params }) => {
    const { data: deck, error } = await supabase
      .from("decks")
      .select("*")
      .eq("id", params.id)
      .maybeSingle();
    if (error) throw error;
    if (!deck) throw notFound();
    let author: Profile | null = null;
    if (deck.is_public) {
      const { data: p } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", deck.user_id)
        .maybeSingle();
      author = (p as Profile | null) ?? null;
    }
    return { deck: deck as Deck, author, isPublic: deck.is_public };
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
  const { deck, author, isPublic } = Route.useLoaderData();

  if (!isPublic) {
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
        <p className="mt-2 text-sm text-muted-foreground">
          {deck.leader && <>리더: <span className="text-foreground">{deck.leader}</span></>}
          {deck.leader && deck.archetype && <span className="mx-1.5">·</span>}
          {deck.archetype && <>아키타입: <span className="text-foreground">{deck.archetype}</span></>}
        </p>
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
      </div>
    </div>
  );
}
