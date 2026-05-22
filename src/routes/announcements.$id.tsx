import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect } from "react";
import { ArrowLeft, Eye, Pin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { useI18n } from "@/i18n/language-context";

type Announcement = Database["public"]["Tables"]["announcements"]["Row"];

const SITE = "https://duelnight.app";

export const Route = createFileRoute("/announcements/$id")({
  loader: async ({ params }) => {
    const { data, error } = await supabase
      .from("announcements")
      .select("*")
      .eq("id", params.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound();
    return { item: data as Announcement };
  },
  head: ({ loaderData }) => {
    const a = loaderData?.item;
    let locale = "ko";
    if (typeof window !== "undefined") {
      locale = localStorage.getItem("duelnight.i18n.locale") || "ko";
    }
    if (!a) {
      const notFounds: Record<string, string> = {
        ko: "공지를 찾을 수 없음 — DuelNight",
        en: "Announcement Not Found — DuelNight",
        ja: "お知らせが見つかりません — DuelNight",
      };
      return { meta: [{ title: notFounds[locale] || notFounds.ko }] };
    }
    const suffix = {
      ko: "DuelNight 공지",
      en: "DuelNight Announcement",
      ja: "DuelNight お知らせ",
    }[locale] || "DuelNight 공지";

    const title = `${a.title} — ${suffix}`;
    const desc = a.body.replace(/\s+/g, " ").slice(0, 150);
    const url = `${SITE}/announcements/${a.id}`;
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
            "@type": "NewsArticle",
            headline: a.title,
            datePublished: a.created_at,
            dateModified: a.updated_at,
            description: desc,
          }),
        },
      ],
    };
  },
  component: AnnouncementDetailPage,
  notFoundComponent: () => {
    const { t } = useI18n();
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="text-2xl font-semibold">{t("announcements.notFoundTitle")}</h1>
        <Link
          to="/announcements"
          className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline"
        >
          <ArrowLeft className="h-4 w-4" /> {t("announcements.backToList")}
        </Link>
      </div>
    );
  },
});

function AnnouncementDetailPage() {
  const { item } = Route.useLoaderData();
  const { t, language } = useI18n();

  useEffect(() => {
    supabase.rpc("increment_announcement_views", { _id: item.id });
  }, [item.id]);

  const dateLocale = language === "ko" ? "ko-KR" : language === "ja" ? "ja-JP" : "en-US";

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <Link
        to="/announcements"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> {t("announcements.breadcrumb")}
      </Link>
      <article className="mt-4 rounded-lg border border-border bg-card p-6">
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          {item.pinned && <Pin className="h-5 w-5 fill-primary text-primary" />}
          {item.title}
        </h1>
        <p className="mt-2 text-xs text-muted-foreground">
          {new Date(item.created_at).toLocaleString(dateLocale)} ·{" "}
          <Eye className="inline h-3 w-3" /> {t("announcements.viewCount", { count: item.view_count })}
        </p>
        <div className="mt-6 whitespace-pre-wrap text-sm leading-relaxed">
          {item.body}
        </div>
      </article>
    </div>
  );
}
