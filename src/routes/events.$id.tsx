import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, MapPin, Clock, ExternalLink, Star, Download, Calendar as CalIcon } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { downloadIcs } from "@/lib/ics";
import { GAME_LABEL } from "@/lib/match-stats";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { useI18n } from "@/i18n/language-context";

type Event = Database["public"]["Tables"]["events"]["Row"];

const SITE = "https://duelnight.app";

function googleCalendarUrl(ev: Event) {
  const fmt = (iso: string) =>
    new Date(iso).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const start = fmt(ev.starts_at);
  const end = fmt(ev.ends_at ?? new Date(new Date(ev.starts_at).getTime() + 60 * 60 * 1000).toISOString());
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: ev.title,
    dates: `${start}/${end}`,
    details: ev.notes ?? "",
    location: ev.location ?? "",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

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
    let locale = "ko";
    if (typeof window !== "undefined") {
      locale = localStorage.getItem("duelnight.i18n.locale") || "ko";
    }
    const e = loaderData?.event;
    if (!e) {
      const notFoundTitles: Record<string, string> = {
        ko: "일정을 찾을 수 없음 — DuelNight",
        en: "Event Not Found — DuelNight",
        ja: "日程が見つかりません — DuelNight",
      };
      return { meta: [{ title: notFoundTitles[locale] || notFoundTitles.ko }] };
    }
    const kindLabels: Record<string, string> = {
      tournament: locale === "ja" ? "大会" : locale === "en" ? "Tournament" : "대회",
      release: locale === "ja" ? "発売" : locale === "en" ? "Release" : "발매",
      match: locale === "ja" ? "マッチ" : locale === "en" ? "Match" : "매칭",
    };
    const title = `${e.title} — ${kindLabels[e.kind] || e.kind} · DuelNight`;
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
            url: e.url ?? e.product_url ?? undefined,
            description: e.notes ?? undefined,
          }),
        },
      ],
    };
  },
  component: EventDetailPage,
  notFoundComponent: () => {
    const { t } = useI18n();
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold">{t("eventsDetail.notFoundTitle")}</h1>
        <Link
          to="/calendar"
          className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> {t("eventsDetail.backToCalendar")}
        </Link>
      </div>
    );
  },
});

function EventDetailPage() {
  const { event } = Route.useLoaderData() as { event: Event };
  const { user } = useAuth();
  const { t, language } = useI18n();

  const dateLocale = language === "ja" ? "ja-JP" : language === "en" ? "en-US" : "ko-KR";
  const fmt = (iso: string) => new Date(iso).toLocaleString(dateLocale);

  const kindLabels: Record<string, string> = {
    tournament: t("eventsDetail.kindTournament"),
    release: t("eventsDetail.kindRelease"),
    match: t("eventsDetail.kindMatch"),
  };

  const { data: isFav = false, refetch: refetchFav } = useQuery({
    queryKey: ["event-fav", event.id, user?.id],
    queryFn: async () => {
      if (!user) return false;
      const { data } = await supabase
        .from("event_favorites")
        .select("event_id")
        .eq("user_id", user.id)
        .eq("event_id", event.id)
        .maybeSingle();
      return !!data;
    },
    enabled: !!user,
  });

  const toggleFav = async () => {
    if (!user) {
      toast.error(t("eventsDetail.loginRequired"));
      return;
    }
    if (isFav) {
      await supabase
        .from("event_favorites")
        .delete()
        .eq("user_id", user.id)
        .eq("event_id", event.id);
      toast.success(t("eventsDetail.favRemoveSuccess"));
    } else {
      await supabase
        .from("event_favorites")
        .insert({ user_id: user.id, event_id: event.id });
      toast.success(t("eventsDetail.favAddSuccess"));
    }
    refetchFav();
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <Link
        to="/calendar"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> {t("eventsDetail.backToCalendarLink")}
      </Link>
      <div className="mt-4 rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-2">
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {GAME_LABEL[event.game]}
          </span>
          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
            {kindLabels[event.kind] || event.kind}
          </span>
        </div>
        <h1 className="mt-2 text-2xl font-semibold">{event.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" />
            {fmt(event.starts_at)}
            {event.ends_at && ` ~ ${fmt(event.ends_at)}`}
          </span>
          {event.early_release_at && (
            <span className="rounded bg-amber-500/10 px-2 py-0.5 text-amber-600 dark:text-amber-400">
              {t("eventsDetail.earlyRelease", { date: fmt(event.early_release_at) })}
            </span>
          )}
          {event.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {event.location}
            </span>
          )}
          {(event.product_url || event.url) && (
            <a
              href={event.product_url ?? event.url ?? "#"}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-foreground hover:underline"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              {event.kind === "release" ? t("eventsDetail.officialHomepage") : t("eventsDetail.officialLink")}
            </a>
          )}
        </div>

        {event.notes && (
          <p className="mt-5 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
            {event.notes}
          </p>
        )}

        <div className="mt-6 flex flex-wrap gap-2">
          <Button
            size="sm"
            variant={isFav ? "default" : "outline"}
            onClick={toggleFav}
          >
            <Star className="mr-1 h-4 w-4" fill={isFav ? "currentColor" : "none"} />
            {isFav ? t("eventsDetail.favRemove") : t("eventsDetail.favAdd")}
          </Button>
          <Button size="sm" variant="outline" asChild>
            <a
              href={googleCalendarUrl(event)}
              target="_blank"
              rel="noopener noreferrer"
            >
              <CalIcon className="mr-1 h-4 w-4" />
              {t("eventsDetail.addToGoogleCalendar")}
            </a>
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              downloadIcs({
                uid: event.id,
                title: event.title,
                startsAt: event.starts_at,
                endsAt: event.ends_at,
                location: event.location,
                description: event.notes,
                url: event.url ?? event.product_url,
              })
            }
          >
            <Download className="mr-1 h-4 w-4" />
            {t("eventsDetail.downloadIcs")}
          </Button>
        </div>
      </div>
    </div>
  );
}
