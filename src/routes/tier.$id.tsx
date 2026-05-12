import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, ImageOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";

type TierList = Database["public"]["Tables"]["tier_lists"]["Row"];
type Card = Database["public"]["Tables"]["cards"]["Row"];

const TIERS = ["S", "A", "B", "C", "D"] as const;
type Placements = Record<(typeof TIERS)[number], string[]>;

const TIER_COLOR: Record<(typeof TIERS)[number], string> = {
  S: "bg-red-500/15 border-red-500/40",
  A: "bg-orange-500/15 border-orange-500/40",
  B: "bg-yellow-500/15 border-yellow-500/40",
  C: "bg-green-500/15 border-green-500/40",
  D: "bg-blue-500/15 border-blue-500/40",
};

const SITE = "https://tcg-hub.lovable.app";

export const Route = createFileRoute("/tier/$id")({
  loader: async ({ params }) => {
    const { data, error } = await supabase
      .from("tier_lists")
      .select("*")
      .eq("id", params.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound();
    const list = data as TierList;
    const raw = (list.placements ?? {}) as Partial<Placements>;
    const placements: Placements = {
      S: raw.S ?? [], A: raw.A ?? [], B: raw.B ?? [],
      C: raw.C ?? [], D: raw.D ?? [],
    };
    const allCodes = TIERS.flatMap((t) => placements[t]);
    let cards: Card[] = [];
    if (allCodes.length) {
      const { data: cs } = await supabase
        .from("cards")
        .select("*")
        .in("code", allCodes);
      cards = (cs ?? []) as Card[];
    }
    return { list, placements, cards };
  },
  head: ({ loaderData }) => {
    const l = loaderData?.list;
    if (!l) return { meta: [{ title: "티어표를 찾을 수 없음 — TCG Hub" }] };
    const title = `${l.title} — 티어표 · TCG Hub`;
    const desc = `${l.title} 티어 메이킹 결과를 확인하세요.`;
    const url = `${SITE}/tier/${l.id}`;
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
  component: TierDetailPage,
  notFoundComponent: () => (
    <div className="mx-auto max-w-3xl px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">티어표를 찾을 수 없어요</h1>
      <Link
        to="/tier"
        className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> 티어 메이킹으로
      </Link>
    </div>
  ),
});

function TierDetailPage() {
  const { list, placements, cards } = Route.useLoaderData();
  const cardByCode = new Map<string, Card>();
  for (const c of cards) cardByCode.set(c.code, c);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <Link
        to="/tier"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> 티어 메이킹
      </Link>
      <div className="mt-4">
        <h1 className="text-2xl font-semibold">{list.title}</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          {list.is_public ? "공개" : "비공개"} ·{" "}
          {new Date(list.updated_at).toLocaleDateString("ko-KR")} 업데이트
        </p>
      </div>
      <div className="mt-6 space-y-2">
        {TIERS.map((t) => (
          <div
            key={t}
            className={`flex gap-2 rounded-lg border-2 ${TIER_COLOR[t]}`}
          >
            <div className="flex w-14 shrink-0 items-center justify-center rounded-l-md bg-background/40 text-2xl font-bold">
              {t}
            </div>
            <ul className="flex min-h-20 flex-1 flex-wrap content-start gap-2 p-2">
              {placements[t].map((code: string) => {
                const c = cardByCode.get(code);
                if (!c) return null;
                return (
                  <li
                    key={code}
                    className="w-16 overflow-hidden rounded border border-border bg-card"
                    title={c.name}
                  >
                    <div className="aspect-[5/7] w-full bg-muted">
                      {c.image_url ? (
                        <img
                          src={c.image_url}
                          alt={c.name}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <div className="flex h-full items-center justify-center text-muted-foreground">
                          <ImageOff className="h-4 w-4" />
                        </div>
                      )}
                    </div>
                    <p className="truncate px-1 py-0.5 text-[9px] text-muted-foreground">
                      {c.code}
                    </p>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </div>
    </div>
  );
}
