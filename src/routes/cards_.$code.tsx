import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, ImageOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type Card = Database["public"]["Tables"]["cards"]["Row"];

const SITE = "https://tcg-hub.lovable.app";
const TYPE_LABEL: Record<string, string> = {
  leader: "리더",
  character: "캐릭터",
  event: "이벤트",
  stage: "스테이지",
  don: "DON!!",
};
const COLOR_LABEL: Record<string, string> = {
  red: "적", green: "녹", blue: "청",
  purple: "자", black: "흑", yellow: "황",
};

export const Route = createFileRoute("/cards_/$code")({
  loader: async ({ params }) => {
    const { data, error } = await supabase
      .from("cards")
      .select("*")
      .eq("code", params.code)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound();
    return { card: data as Card };
  },
  head: ({ loaderData }) => {
    const c = loaderData?.card;
    if (!c) return { meta: [{ title: "카드를 찾을 수 없음 — 덱로그" }] };
    const title = `${c.name} (${c.code}) — 덱로그`;
    const desc =
      (c.effect?.replace(/\s+/g, " ").slice(0, 150) ??
        `${TYPE_LABEL[c.type] ?? c.type} · ${c.set_code}`) +
      ` · ${c.set_code}`;
    const url = `${SITE}/cards/${encodeURIComponent(c.code)}`;
    const ogImage = c.image_url ?? undefined;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "article" },
        { property: "og:url", content: url },
        ...(ogImage
          ? [
              { property: "og:image", content: ogImage },
              { name: "twitter:image", content: ogImage },
              { name: "twitter:card", content: "summary_large_image" },
            ]
          : []),
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: desc },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Product",
            name: c.name,
            sku: c.code,
            image: ogImage,
            description: c.effect ?? undefined,
            category: TYPE_LABEL[c.type] ?? c.type,
            brand: { "@type": "Brand", name: "One Piece TCG" },
          }),
        },
      ],
    };
  },
  component: CardDetailPage,
  notFoundComponent: () => (
    <div className="mx-auto max-w-3xl px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">카드를 찾을 수 없어요</h1>
      <Link
        to="/cards"
        className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> 카드 DB로
      </Link>
    </div>
  ),
});

function CardDetailPage() {
  const { card } = Route.useLoaderData();
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <Link
        to="/cards"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> 카드 DB
      </Link>
      <div className="mt-4 grid gap-6 sm:grid-cols-[260px_1fr]">
        <div className="aspect-[5/7] w-full overflow-hidden rounded-lg border border-border bg-muted">
          {card.image_url ? (
            <img
              src={card.image_url}
              alt={card.name}
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full items-center justify-center text-muted-foreground">
              <ImageOff className="h-10 w-10" />
            </div>
          )}
        </div>
        <div>
          <div className="flex items-center gap-2">
            <p className="text-xs text-muted-foreground">{card.code}</p>
            {card.status === "pending" && (
              <span className="rounded-md bg-yellow-500/15 px-2 py-0.5 text-[10px] font-semibold text-yellow-600 dark:text-yellow-400">
                검수 중
              </span>
            )}
            {card.status === "rejected" && (
              <span className="rounded-md bg-destructive/15 px-2 py-0.5 text-[10px] font-semibold text-destructive">
                반려됨
              </span>
            )}
          </div>
          <h1 className="mt-1 text-2xl font-semibold">{card.name}</h1>
          {card.status === "rejected" && card.review_note && (
            <p className="mt-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
              반려 사유: {card.review_note}
            </p>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <Tag>{TYPE_LABEL[card.type] ?? card.type}</Tag>
            {card.colors.map((c: string) => (
              <Tag key={c}>{COLOR_LABEL[c] ?? c}</Tag>
            ))}
            {card.rarity && <Tag>{card.rarity}</Tag>}
            <Tag>{card.set_code}</Tag>
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
            <Stat label={card.type === "leader" ? "라이프" : "코스트"} value={card.cost} />
            <Stat label="파워" value={card.power?.toLocaleString()} />
            <Stat label="카운터" value={card.counter?.toLocaleString()} />
            <Stat label="속성" value={card.attribute} />
          </dl>
          {card.effect && (
            <div className="mt-4">
              <p className="text-xs font-semibold text-muted-foreground">효과</p>
              <p className="mt-1 whitespace-pre-wrap rounded-md bg-muted/50 p-3 text-sm leading-relaxed">
                {card.effect}
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
      {children}
    </span>
  );
}

function Stat({
  label,
  value,
}: {
  label: string;
  value?: string | number | null;
}) {
  if (value === null || value === undefined || value === "") return null;
  return (
    <div className="flex gap-2">
      <dt className="w-14 shrink-0 text-xs text-muted-foreground">{label}</dt>
      <dd className="text-sm">{value}</dd>
    </div>
  );
}
