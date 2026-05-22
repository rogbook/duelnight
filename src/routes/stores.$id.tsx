import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, MapPin, Phone, ExternalLink, Star, Map as MapIcon } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { GAME_LABEL } from "@/lib/match-stats";
import type { Database } from "@/integrations/supabase/types";

type Store = Database["public"]["Tables"]["stores"]["Row"];

const SITE = "https://duelnight.app";

export const Route = createFileRoute("/stores/$id")({
  loader: async ({ params }) => {
    const { data, error } = await supabase
      .from("stores")
      .select("*")
      .eq("id", params.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound();
    return { store: data as Store };
  },
  head: ({ loaderData }) => {
    const s = loaderData?.store;
    if (!s) return { meta: [{ title: "매장을 찾을 수 없음 — DuelNight" }] };
    const title = `${s.name} — 매장 · DuelNight`;
    const desc =
      [s.region, s.address, s.notes]
        .filter(Boolean)
        .join(" · ")
        .replace(/\s+/g, " ")
        .slice(0, 150) || "TCG 매장 정보";
    const url = `${SITE}/stores/${s.id}`;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: desc },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Store",
            name: s.name,
            address: s.address ?? undefined,
            telephone: s.phone ?? undefined,
            url: s.url ?? undefined,
            areaServed: s.region ?? undefined,
          }),
        },
      ],
    };
  },
  component: StoreDetailPage,
  notFoundComponent: () => (
    <div className="mx-auto max-w-3xl px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">매장을 찾을 수 없어요</h1>
      <Link
        to="/stores"
        className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> 매장 목록으로
      </Link>
    </div>
  ),
});

function StoreDetailPage() {
  const { store } = Route.useLoaderData();
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: isFav = false } = useQuery({
    queryKey: ["store-fav", store.id, user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("store_favorites")
        .select("store_id")
        .eq("user_id", user!.id)
        .eq("store_id", store.id)
        .maybeSingle();
      return !!data;
    },
  });

  const toggleFav = async () => {
    if (!user) {
      toast.error("로그인이 필요합니다");
      return;
    }
    if (isFav) {
      const { error } = await supabase
        .from("store_favorites")
        .delete()
        .eq("user_id", user.id)
        .eq("store_id", store.id);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase
        .from("store_favorites")
        .insert({ user_id: user.id, store_id: store.id });
      if (error) return toast.error(error.message);
    }
    qc.invalidateQueries({ queryKey: ["store-fav", store.id, user.id] });
    qc.invalidateQueries({ queryKey: ["store-favorites", user.id] });
  };

  const mapHref = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
    store.address || `${store.name} ${store.region ?? ""}`.trim()
  )}`;

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <Link
        to="/stores"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> 매장
      </Link>
      <div className="mt-4 rounded-lg border border-border bg-card p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-2xl font-semibold">{store.name}</h1>
            {store.region && (
              <p className="mt-1 inline-flex items-center gap-1 text-sm text-muted-foreground">
                <MapPin className="h-3.5 w-3.5" />
                {store.region}
              </p>
            )}
          </div>
          <Button
            variant={isFav ? "default" : "outline"}
            size="sm"
            onClick={toggleFav}
            className="shrink-0"
          >
            <Star className={`mr-1 h-4 w-4 ${isFav ? "fill-current" : ""}`} />
            {isFav ? "즐겨찾기됨" : "즐겨찾기"}
          </Button>
        </div>
        {store.address && (
          <p className="mt-2 text-sm text-foreground/90">{store.address}</p>
        )}
        <div className="mt-3">
          <p className="text-xs font-medium text-muted-foreground">취급 제품</p>
          <div className="mt-1 flex flex-wrap gap-1">
            {store.games.length === 0 ? (
              <span className="text-xs text-muted-foreground">정보 없음</span>
            ) : (
              store.games.map((g: Store["games"][number]) => (
                <span
                  key={g}
                  className="rounded bg-muted px-2 py-0.5 text-xs font-medium text-foreground/80"
                >
                  {GAME_LABEL[g]}
                </span>
              ))
            )}
          </div>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
          <a
            href={mapHref}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-foreground hover:underline"
          >
            <MapIcon className="h-3.5 w-3.5" />
            지도에서 보기
          </a>
          {store.phone && (
            <a
              href={`tel:${store.phone}`}
              className="inline-flex items-center gap-1 text-foreground hover:underline"
            >
              <Phone className="h-3.5 w-3.5" />
              {store.phone}
            </a>
          )}
          {store.url && (
            <a
              href={store.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-foreground hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              웹사이트
            </a>
          )}
        </div>
        {store.notes && (
          <p className="mt-5 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
            {store.notes}
          </p>
        )}
      </div>
    </div>
  );
}
