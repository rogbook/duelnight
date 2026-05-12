import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { ArrowLeft, MapPin, Clock, User as UserIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { GAME_LABEL } from "@/lib/match-stats";
import type { Database } from "@/integrations/supabase/types";

type Post = Database["public"]["Tables"]["lfg_posts"]["Row"];
type Profile = { display_name: string | null; username: string | null };

const SITE = "https://tcg-hub.lovable.app";

export const Route = createFileRoute("/lfg/$id")({
  loader: async ({ params }) => {
    const { data, error } = await supabase
      .from("lfg_posts")
      .select("*")
      .eq("id", params.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound();
    const { data: prof } = await supabase
      .from("profiles")
      .select("display_name, username")
      .eq("id", data.user_id)
      .maybeSingle();
    return { post: data as Post, profile: (prof ?? null) as Profile | null };
  },
  head: ({ loaderData }) => {
    const p = loaderData?.post;
    if (!p) return { meta: [{ title: "글을 찾을 수 없음 — TCG Hub" }] };
    const title = `${p.title} — LFG · TCG Hub`;
    const desc =
      (p.body ?? `${GAME_LABEL[p.game]} · ${p.location ?? "지역 미지정"}`)
        .replace(/\s+/g, " ")
        .slice(0, 150);
    const url = `${SITE}/lfg/${p.id}`;
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
  component: LfgDetailPage,
  notFoundComponent: () => (
    <div className="mx-auto max-w-3xl px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">글을 찾을 수 없어요</h1>
      <Link
        to="/lfg"
        className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline"
      >
        <ArrowLeft className="h-4 w-4" /> LFG 목록으로
      </Link>
    </div>
  ),
});

function LfgDetailPage() {
  const { post, profile } = Route.useLoaderData();
  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <Link
        to="/lfg"
        className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> LFG
      </Link>
      <div className="mt-4 rounded-lg border border-border bg-card p-6">
        <div className="flex items-center gap-2">
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {GAME_LABEL[post.game]}
          </span>
          <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
            {post.status}
          </span>
        </div>
        <h1 className="mt-2 text-2xl font-semibold">{post.title}</h1>
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <UserIcon className="h-3.5 w-3.5" />
            {profile?.display_name || profile?.username || "익명"}
          </span>
          {post.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {post.location}
            </span>
          )}
          {post.meet_at && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {new Date(post.meet_at).toLocaleString("ko-KR")}
            </span>
          )}
          <span>{new Date(post.created_at).toLocaleDateString("ko-KR")} 작성</span>
        </div>
        {post.body && (
          <p className="mt-5 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
            {post.body}
          </p>
        )}
        {post.contact && (
          <div className="mt-5 rounded-md bg-muted/50 p-3 text-sm">
            <p className="text-xs font-semibold text-muted-foreground">연락 방법</p>
            <p className="mt-1">{post.contact}</p>
          </div>
        )}
      </div>
    </div>
  );
}
