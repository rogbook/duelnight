import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Calendar,
  Library,
  Layers,
  PackageOpen,
  Swords,
  Trophy,
  MapPin,
  Users,
  ArrowUpRight,
} from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { GameFilter } from "@/components/game-filter";
import { SeasonReport } from "@/components/season-report/season-report";
import { PwaInstallBanner } from "@/components/pwa-install-banner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { getSeasonStartISO } from "@/lib/season";
import { useI18n } from "@/i18n/language-context";

export const Route = createFileRoute("/")({
  head: () => {
    const saved =
      typeof window !== "undefined" ? localStorage.getItem("duelnight.i18n.locale") : "ko";
    const title =
      saved === "ja"
        ? "ダッシュボード — DuelNight"
        : saved === "en"
          ? "Dashboard — DuelNight"
          : "대시보드 — DuelNight";
    const desc =
      saved === "ja"
        ? "ワンピース・ポケモン・デジモンTCGの日程、カード、戦績、店舗、マッチングを1箇所で。"
        : saved === "en"
          ? "Manage One Piece, Pokémon, and Digimon TCG schedules, cards, records, stores, and matchings in one place."
          : "원피스·포켓몬·디지몬 TCG 일정, 카드, 전적, 매장, 매칭을 한 곳에서.";
    return {
      meta: [{ title }, { name: "description", content: desc }],
    };
  },
  component: Dashboard,
});

/** 내가 가장 많이 플레이한 게임(시즌 성적표 기본 대상). */
function usePrimaryGame(userId: string) {
  return useQuery({
    queryKey: ["home-primary-game", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_ratings")
        .select("game, rating, matches_count")
        .eq("user_id", userId)
        .order("matches_count", { ascending: false })
        .limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
    enabled: !!userId,
  });
}

/** 이번 시즌(2개월) 내 전적 — 기본 게임 기준. */
function useSeasonMatches(userId: string, game: string | null | undefined) {
  return useQuery({
    queryKey: ["home-season-matches", userId, game],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("matches")
        .select("*")
        .eq("user_id", userId)
        .eq("game", game as "dtcg" | "optcg" | "ptcg")
        .gte("played_at", getSeasonStartISO());
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!userId && !!game,
  });
}

function useProfile(userId: string) {
  return useQuery({
    queryKey: ["home-profile", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("display_name, username, avatar_url")
        .eq("id", userId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!userId,
  });
}

function useKpiCounts(userId: string) {
  const { data: collectionCount } = useQuery({
    queryKey: ["dashboard-collection", userId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("user_collection")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!userId,
  });

  const { data: deckCount } = useQuery({
    queryKey: ["dashboard-decks", userId],
    queryFn: async () => {
      const { count, error } = await supabase
        .from("decks")
        .select("*", { count: "exact", head: true })
        .eq("user_id", userId);
      if (error) throw error;
      return count ?? 0;
    },
    enabled: !!userId,
  });

  return {
    collectionCount: collectionCount ?? 0,
    deckCount: deckCount ?? 0,
  };
}

function Dashboard() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { t } = useI18n();

  const userId = user?.id ?? "";
  const { data: primary } = usePrimaryGame(userId);
  const game = primary?.game ?? null;
  const { data: matches } = useSeasonMatches(userId, game);
  const { data: profile } = useProfile(userId);
  const { collectionCount, deckCount } = useKpiCounts(userId);

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/intro", replace: true });
    }
  }, [user, loading, navigate]);

  if (loading || !user) {
    return null;
  }

  const hasSeasonData = !!game && !!matches && matches.length > 0;
  const displayName =
    profile?.display_name || profile?.username || user.email?.split("@")[0] || "Player";

  const localizedShortcuts = [
    {
      title: t("dashboard.shortcutCalendarTitle"),
      desc: t("dashboard.shortcutCalendarDesc"),
      to: "/calendar",
      icon: Calendar,
      color: "bg-rose-500/10 text-rose-500",
    },
    {
      title: t("dashboard.shortcutCardsTitle"),
      desc: t("dashboard.shortcutCardsDesc"),
      to: "/cards",
      icon: Library,
      color: "bg-violet-500/10 text-violet-500",
      badge: collectionCount > 0 ? collectionCount.toLocaleString() : undefined,
    },
    {
      title: t("dashboard.shortcutDecksTitle"),
      desc: t("dashboard.shortcutDecksDesc"),
      to: "/decks",
      icon: Layers,
      color: "bg-blue-500/10 text-blue-500",
      badge: deckCount > 0 ? deckCount.toLocaleString() : undefined,
    },
    {
      title: t("dashboard.shortcutCollectionTitle"),
      desc: t("dashboard.shortcutCollectionDesc"),
      to: "/collection",
      icon: PackageOpen,
      color: "bg-amber-500/10 text-amber-500",
    },
    {
      title: t("dashboard.shortcutMatchesTitle"),
      desc: t("dashboard.shortcutMatchesDesc"),
      to: "/matches",
      icon: Swords,
      color: "bg-red-500/10 text-red-500",
    },
    {
      title: t("dashboard.shortcutLeaderboardTitle"),
      desc: t("dashboard.shortcutLeaderboardDesc"),
      to: "/leaderboard",
      icon: Trophy,
      color: "bg-yellow-500/10 text-yellow-600 dark:text-yellow-500",
    },
    {
      title: t("dashboard.shortcutStoreTitle"),
      desc: t("dashboard.shortcutStoreDesc"),
      to: "/stores",
      icon: MapPin,
      color: "bg-emerald-500/10 text-emerald-500",
    },
    {
      title: t("dashboard.shortcutLfgTitle"),
      desc: t("dashboard.shortcutLfgDesc"),
      to: "/lfg",
      icon: Users,
      color: "bg-cyan-500/10 text-cyan-500",
    },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <PageHeader title={t("dashboard.title")} description={t("dashboard.desc")}>
        <GameFilter />
      </PageHeader>

      <PwaInstallBanner />

      {/* 내 시즌 성적표 (가장 많이 한 게임 기준) */}
      <section className="mt-6">
        {hasSeasonData ? (
          <SeasonReport
            mode="me"
            game={game!}
            matches={matches!}
            rating={primary?.rating ?? null}
            displayName={displayName}
            username={profile?.username}
            avatarUrl={profile?.avatar_url}
          />
        ) : (
          <div className="rounded-2xl border border-border bg-card p-8 text-center">
            <Swords className="mx-auto h-8 w-8 text-muted-foreground" />
            <p className="mt-3 text-sm font-medium">{t("seasonReport.emptyTitle")}</p>
            <p className="mt-1 text-xs text-muted-foreground">{t("seasonReport.emptyDesc")}</p>
            <Link
              to="/matches"
              className="mt-4 inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              {t("seasonReport.recordFirst")}
            </Link>
          </div>
        )}
      </section>

      {/* 퀵 링크 */}
      <section className="mt-6">
        <h2 className="text-sm font-bold text-foreground">{t("dashboard.quickLinks")}</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {localizedShortcuts.map((s) => (
            <Link
              key={s.to}
              to={s.to}
              className="group flex items-center gap-3 rounded-2xl border border-border bg-card p-4 transition-all hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-md"
            >
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${s.color}`}
              >
                <s.icon className="h-5 w-5" />
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <p className="text-sm font-semibold text-foreground">{s.title}</p>
                  {s.badge && (
                    <span className="inline-flex items-center justify-center rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">
                      {s.badge}
                    </span>
                  )}
                </div>
                <p className="mt-0.5 truncate text-xs text-muted-foreground">{s.desc}</p>
              </div>
              <ArrowUpRight className="h-4 w-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
