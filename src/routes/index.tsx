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
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/i18n/language-context";

export const Route = createFileRoute("/")({
  head: () => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("duelnight.i18n.locale") : "ko";
    const title = saved === "ja" ? "ダッシュボード — DuelNight" : saved === "en" ? "Dashboard — DuelNight" : "대시보드 — DuelNight";
    const desc = saved === "ja" ? "ワンピース・ポケモン・デジモンTCGの日程、カード、戦績、店舗、マッチングを1箇所で。" : saved === "en" ? "Manage One Piece, Pokémon, and Digimon TCG schedules, cards, records, stores, and matchings in one place." : "원피스·포켓몬·디지몬 TCG 일정, 카드, 전적, 매장, 매칭을 한 곳에서.";
    return {
      meta: [
        { title },
        { name: "description", content: desc },
      ],
    };
  },
  component: Dashboard,
});

/** 이번 시즌: 최근 90일 */
const SEASON_START = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

function useDashboardStats(userId: string) {
  const { t } = useI18n();

  // 이번 시즌 승률 (최근 90일)
  const { data: matchData } = useQuery({
    queryKey: ["dashboard-matches", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("matches")
        .select("result")
        .eq("user_id", userId)
        .gte("played_at", SEASON_START);
      if (error) throw error;
      return data ?? [];
    },
    enabled: !!userId,
  });

  // 보유 카드 종류 수 (user_collection row 수)
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

  // 저장된 덱 수
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

  // 최고 레이팅 순위 (전 게임 중 가장 높은 rating의 순위 반환)
  const { data: rankData } = useQuery({
    queryKey: ["dashboard-rating", userId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_ratings")
        .select("rating, game, matches_count")
        .eq("user_id", userId)
        .order("rating", { ascending: false })
        .limit(1);
      if (error) throw error;
      return data?.[0] ?? null;
    },
    enabled: !!userId,
  });

  // 승률 계산
  const wins = matchData?.filter((m) => m.result === "win").length ?? 0;
  const losses = matchData?.filter((m) => m.result === "loss").length ?? 0;
  const decided = wins + losses;
  const winRateStr =
    decided === 0 ? "—%" : `${Math.round((wins / decided) * 100)}%`;
  const winRateHint =
    decided === 0
      ? t("dashboard.winRateHintEmpty")
      : t("dashboard.winRateHint")
          .replace("{wins}", String(wins))
          .replace("{losses}", String(losses));

  // 랭킹 텍스트
  const ratingStr = rankData ? `${rankData.rating}${t("matches.points", "점")}` : "—";
  const ratingHint = rankData
    ? t("dashboard.ratingHint")
        .replace("{game}", rankData.game.toUpperCase())
        .replace("{count}", String(rankData.matches_count))
    : t("dashboard.ratingHintEmpty");

  return [
    { label: t("dashboard.winRate"), value: winRateStr, hint: winRateHint },
    {
      label: t("dashboard.cards"),
      value: collectionCount?.toLocaleString() ?? "0",
      hint: collectionCount ? t("dashboard.cardsHint") : t("dashboard.cardsHintEmpty"),
    },
    {
      label: t("dashboard.decks"),
      value: deckCount?.toLocaleString() ?? "0",
      hint: deckCount ? t("dashboard.decksHint") : t("dashboard.decksHintEmpty"),
    },
    { label: t("dashboard.rating"), value: ratingStr, hint: ratingHint },
  ];
}

function Dashboard() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { t } = useI18n();
  const stats = useDashboardStats(user?.id ?? "");

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/intro", replace: true });
    }
  }, [user, loading, navigate]);

  if (loading || !user) {
    return null;
  }

  const localizedShortcuts = [
    {
      title: t("dashboard.shortcutCalendarTitle"),
      desc: t("dashboard.shortcutCalendarDesc"),
      to: "/calendar",
      icon: Calendar,
    },
    { title: t("dashboard.shortcutCardsTitle"), desc: t("dashboard.shortcutCardsDesc"), to: "/cards", icon: Library },
    { title: t("dashboard.shortcutDecksTitle"), desc: t("dashboard.shortcutDecksDesc"), to: "/decks", icon: Layers },
    {
      title: t("dashboard.shortcutCollectionTitle"),
      desc: t("dashboard.shortcutCollectionDesc"),
      to: "/collection",
      icon: PackageOpen,
    },
    { title: t("dashboard.shortcutMatchesTitle"), desc: t("dashboard.shortcutMatchesDesc"), to: "/matches", icon: Swords },
    {
      title: t("dashboard.shortcutLeaderboardTitle"),
      desc: t("dashboard.shortcutLeaderboardDesc"),
      to: "/leaderboard",
      icon: Trophy,
    },
    { title: t("dashboard.shortcutStoreTitle"), desc: t("dashboard.shortcutStoreDesc"), to: "/stores", icon: MapPin },
    { title: t("dashboard.shortcutLfgTitle"), desc: t("dashboard.shortcutLfgDesc"), to: "/lfg", icon: Users },
  ];

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <PageHeader
        title={t("dashboard.title")}
        description={t("dashboard.desc")}
      >
        <GameFilter />
      </PageHeader>

      <section className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {stats.map((s) => (
          <div
            key={s.label}
            className="rounded-lg border border-border bg-card p-4"
          >
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight text-foreground">
              {s.value}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">{s.hint}</p>
          </div>
        ))}
      </section>

      <section className="mt-8">
        <h2 className="text-sm font-medium text-foreground">{t("dashboard.quickLinks")}</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {localizedShortcuts.map((s) => (
            <Link
              key={s.to}
              to={s.to}
              className="group flex flex-col gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:bg-accent"
            >
              <div className="flex items-center justify-between">
                <div className="flex h-8 w-8 items-center justify-center rounded-md bg-muted">
                  <s.icon className="h-4 w-4 text-foreground" />
                </div>
                <ArrowUpRight className="h-4 w-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{s.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{s.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}
