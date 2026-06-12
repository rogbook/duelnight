import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Calendar,
  Library,
  Layers,
  Swords,
  Trophy,
  Users,
  MessageCircle,
  Gamepad,
} from "lucide-react";
import { ProfileBar } from "@/components/game/ProfileBar";
import { SeasonStatWidget } from "@/components/game/SeasonStatWidget";
import { MenuTile } from "@/components/game/MenuTile";
import { PwaInstallBanner } from "@/components/pwa-install-banner";
import { useAuth } from "@/hooks/use-auth";
import { supabase } from "@/integrations/supabase/client";
import { getSeasonStartISO, getDaysLeftInSeason } from "@/lib/season";
import { useI18n } from "@/i18n/language-context";
import { getTier } from "@/lib/tier";
import type { Tables } from "@/integrations/supabase/types";

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

function LeagueCard({ rating }: { rating: number | null }) {
  const { t } = useI18n();
  const tier = rating !== null ? getTier(rating) : null;

  return (
    <div className="bg-game-card border border-game-line rounded-2xl p-4 shadow-md flex flex-col justify-between h-full min-h-[140px]">
      <div>
        <span className="text-[11px] font-semibold text-game-text-dim uppercase tracking-wider block">
          현재 리그
        </span>
        <div className="flex items-center gap-2 mt-2">
          <Trophy className="h-6 w-6 text-game-gold fill-current" />
          <span className="text-lg font-bold text-game-text">
            {tier ? t(tier.labelKey) : "브론즈"}
          </span>
        </div>
      </div>
      <div className="text-xs font-semibold text-game-text-mid mt-auto pt-4 border-t border-game-line/30">
        ELO 레이팅: <span className="text-game-gold">{rating ?? 1000} RP</span>
      </div>
    </div>
  );
}

function TodayMatchesCard({ matches }: { matches: Tables<"matches">[] }) {
  const todayMatches = useMemo(() => {
    if (!matches) return [];
    const todayStr = new Date().toLocaleDateString();
    return matches.filter((m) => new Date(m.played_at).toLocaleDateString() === todayStr);
  }, [matches]);

  const wins = todayMatches.filter((m) => m.result === "win").length;
  const losses = todayMatches.filter((m) => m.result === "loss").length;

  return (
    <div className="bg-game-card border border-game-line rounded-2xl p-4 shadow-md flex flex-col justify-between h-full min-h-[140px]">
      <div>
        <span className="text-[11px] font-semibold text-game-text-dim uppercase tracking-wider block">
          오늘의 기록
        </span>
        <div className="flex items-center gap-2 mt-2">
          <Swords className="h-5 w-5 text-game-blue" />
          <span className="text-lg font-bold text-game-text">
            {todayMatches.length}판 대전
          </span>
        </div>
      </div>
      <div className="flex gap-2 text-xs font-bold mt-auto pt-4 border-t border-game-line/30">
        <span className="text-game-win">{wins}승</span>
        <span className="text-game-text-dim">/</span>
        <span className="text-game-loss">{losses}패</span>
      </div>
    </div>
  );
}

function Dashboard() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const { t } = useI18n();

  const userId = user?.id ?? "";
  const { data: primary } = usePrimaryGame(userId);
  const game = primary?.game ?? null;
  const { data: matches = [] } = useSeasonMatches(userId, game);
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

  const displayName =
    profile?.display_name || profile?.username || user.email?.split("@")[0] || "Player";

  const daysLeft = getDaysLeftInSeason();

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 md:px-6 md:py-8 space-y-6">
      <PwaInstallBanner />

      {/* 1. 모바일 레이아웃 (<768px) */}
      <div className="block md:hidden space-y-4">
        <ProfileBar
          displayName={displayName}
          avatarUrl={profile?.avatar_url}
          rating={primary?.rating ?? null}
        />
        <SeasonStatWidget matches={matches} />
        <div className="grid grid-cols-2 gap-3">
          <MenuTile
            title={t("nav.cards")}
            liveValue={`카드 ${collectionCount.toLocaleString()}장`}
            to="/cards"
            icon={Library}
            colorKey="purple"
          />
          <MenuTile
            title={t("nav.decks")}
            liveValue={`덱 ${deckCount}개`}
            to="/decks"
            icon={Layers}
            colorKey="teal"
          />
          <MenuTile
            title={t("nav.matches")}
            liveValue={`이번 시즌 ${matches.length}판`}
            to="/matches"
            icon={Swords}
            colorKey="coral"
          />
          <MenuTile
            title={t("nav.lfg")}
            desc="새 대전 상대 찾기"
            to="/lfg"
            icon={Users}
            colorKey="pink"
          />
        </div>
      </div>

      {/* 2. 태블릿 레이아웃 (768~1024px) */}
      <div className="hidden md:block lg:hidden space-y-4">
        <ProfileBar
          displayName={displayName}
          avatarUrl={profile?.avatar_url}
          rating={primary?.rating ?? null}
        />
        <div className="grid grid-cols-[1.4fr_1fr_1fr] gap-3">
          <SeasonStatWidget matches={matches} />
          <LeagueCard rating={primary?.rating ?? null} />
          <TodayMatchesCard matches={matches} />
        </div>
        <div className="grid grid-cols-4 gap-3">
          <MenuTile
            title={t("nav.cards")}
            liveValue={`카드 ${collectionCount.toLocaleString()}장`}
            to="/cards"
            icon={Library}
            colorKey="purple"
          />
          <MenuTile
            title={t("nav.decks")}
            liveValue={`덱 ${deckCount}개`}
            to="/decks"
            icon={Layers}
            colorKey="teal"
          />
          <MenuTile
            title={t("nav.matches")}
            liveValue={`이번 시즌 ${matches.length}판`}
            to="/matches"
            icon={Swords}
            colorKey="coral"
          />
          <MenuTile
            title={t("nav.lfg")}
            desc="새 대전 상대 찾기"
            to="/lfg"
            icon={Users}
            colorKey="pink"
          />
        </div>
      </div>

      {/* 3. PC 레이아웃 (>1024px) */}
      <div className="hidden lg:block space-y-6">
        <ProfileBar
          displayName={displayName}
          avatarUrl={profile?.avatar_url}
          rating={primary?.rating ?? null}
          daysLeft={daysLeft}
        />
        <div className="grid grid-cols-[1.5fr_1fr] gap-4">
          <SeasonStatWidget matches={matches} />
          <LeagueCard rating={primary?.rating ?? null} />
        </div>
        <div className="grid grid-cols-4 gap-4">
          <MenuTile
            title={t("nav.cards")}
            liveValue={`카드 ${collectionCount.toLocaleString()}장`}
            to="/cards"
            icon={Library}
            colorKey="purple"
          />
          <MenuTile
            title={t("nav.decks")}
            liveValue={`덱 ${deckCount}개`}
            to="/decks"
            icon={Layers}
            colorKey="teal"
          />
          <MenuTile
            title={t("nav.matches")}
            liveValue={`이번 시즌 ${matches.length}판`}
            to="/matches"
            icon={Swords}
            colorKey="coral"
          />
          <MenuTile
            title={t("nav.lfg")}
            desc="새 대전 상대 찾기"
            to="/lfg"
            icon={Users}
            colorKey="pink"
          />
        </div>
      </div>
    </div>
  );
}
