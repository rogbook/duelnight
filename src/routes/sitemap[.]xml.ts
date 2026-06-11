import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

const BASE_URL = "https://duelnight.app";

interface SitemapEntry {
  path: string;
  lastmod?: string;
  changefreq?: "always" | "hourly" | "daily" | "weekly" | "monthly" | "yearly" | "never";
  priority?: string;
}

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const entries: SitemapEntry[] = [
          { path: "/", changefreq: "weekly", priority: "1.0" },
          { path: "/cards", changefreq: "daily", priority: "0.9" },
          { path: "/decks", changefreq: "daily", priority: "0.8" },
          { path: "/leaderboard", changefreq: "daily", priority: "0.7" },
          { path: "/tier", changefreq: "weekly", priority: "0.7" },
          { path: "/calendar", changefreq: "daily", priority: "0.6" },
          { path: "/stores", changefreq: "weekly", priority: "0.6" },
          { path: "/lfg", changefreq: "daily", priority: "0.6" },
          { path: "/packs", changefreq: "weekly", priority: "0.5" },
          { path: "/announcements", changefreq: "daily", priority: "0.7" },
          { path: "/login", changefreq: "yearly", priority: "0.3" },
        ];

        const [{ data: cards }, { data: decks }, { data: anns }] = await Promise.all([
          supabase
            .from("cards")
            .select("code, updated_at")
            .order("updated_at", { ascending: false })
            .limit(1000),
          supabase
            .from("decks")
            .select("id, updated_at")
            .eq("is_public", true)
            .order("updated_at", { ascending: false })
            .limit(500),
          supabase
            .from("announcements")
            .select("id, updated_at")
            .order("updated_at", { ascending: false })
            .limit(500),
        ]);

        for (const c of cards ?? []) {
          entries.push({
            path: `/cards/${encodeURIComponent(c.code)}`,
            lastmod: c.updated_at,
            changefreq: "monthly",
            priority: "0.6",
          });
        }
        for (const d of decks ?? []) {
          entries.push({
            path: `/decks/${d.id}`,
            lastmod: d.updated_at,
            changefreq: "weekly",
            priority: "0.6",
          });
        }
        for (const a of anns ?? []) {
          entries.push({
            path: `/announcements/${a.id}`,
            lastmod: a.updated_at,
            changefreq: "weekly",
            priority: "0.6",
          });
        }

        const urls = entries.map((e) =>
          [
            `  <url>`,
            `    <loc>${BASE_URL}${e.path}</loc>`,
            e.lastmod ? `    <lastmod>${e.lastmod}</lastmod>` : null,
            e.changefreq ? `    <changefreq>${e.changefreq}</changefreq>` : null,
            e.priority ? `    <priority>${e.priority}</priority>` : null,
            `  </url>`,
          ]
            .filter(Boolean)
            .join("\n"),
        );

        const xml = [
          `<?xml version="1.0" encoding="UTF-8"?>`,
          `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">`,
          ...urls,
          `</urlset>`,
        ].join("\n");

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml",
            "Cache-Control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
