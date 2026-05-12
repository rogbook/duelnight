import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, MapPin, Clock, ExternalLink } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GAME_LABEL } from "@/lib/match-stats";
import type { Database } from "@/integrations/supabase/types";

type Event = Database["public"]["Tables"]["events"]["Row"];

const SITE = "https://tcg-hub.lovable.app";

export const Route = createFileRoute("/events/$id")({
  loader: async ({ params }) => {
    const { data, error } = await supabase
      .from("events")
      .select("*")
      .eq("id", params.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound();
    return { event: data as Event };
  },
  head: ({ loaderData }) => {
    const e = loaderData?.event;
    if (!e) return { meta: [{ title: "대회를 찾을 수 없음 — TCG Hub" }] };
    const title = `${e.title} — 대회 · TCG Hub`;
    const desc =
      (e.notes ?? `${GAME_LABEL[e.game]} · ${e.location ?? ""}`)
        .replace(/\s+/g, " ")
        .slice(0, 150);
    const url = `${SITE}/events/${e.id}`;
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
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Event",
            name: e.title,
            startDate: e.starts_at,
            endDate: e.ends_at ?? undefined,
            location: e.location
              ? { "@type": "Place", name: e.location }
              : undefined,
            url: e.url ?? undefined,
            description: e.notes ?? undefined,
          }),
        },
      ],
    };
  },
  component: EventDetailPage,
  notFoundComponent: () => (
    <div className="mx-auto max-w-3xl px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">대회를 찾을 수 없어요</h1>
      <Link
        to="/calendar"
        className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> 캘린더로
      </Link>
    </div>
  ),
});

function EventDetailPage() {
  const { event } = Route.useLoaderData();
  const fmt = (iso: string) => new Date(iso).toLocaleString("ko-KR");
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <Link
        to="/calendar"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> 캘린더
      </Link>
      <div className="mt-4 rounded-lg border border-border bg-card p-6">
        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {GAME_LABEL[event.game]}
        </span>
        <h1 className="mt-2 text-2xl font-semibold">{event.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {fmt(event.starts_at)}
            {event.ends_at && ` ~ ${fmt(event.ends_at)}`}
          </span>
          {event.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {event.location}
            </span>
          )}
          {event.url && (
            <a
              href={event.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-foreground hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              공식 링크
            </a>
          )}
        </div>
        {event.notes && (
          <p className="mt-5 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
            {event.notes}
          </p>
        )}
      </div>
    </div>
  );
}
