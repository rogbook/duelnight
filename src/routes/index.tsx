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

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "DuelNight — 통합 관리 플랫폼" },
      {
        name: "description",
        content:
          "원피스·포켓몬·디지몬 TCG 일정, 카드, 전적, 매장, 매칭을 한 곳에서.",
      },
    ],
  }),
  component: Dashboard,
});

/** 이번 시즌: 최근 90일 */
const SEASON_START = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();

const shortcuts = [
  {
    title: "캘린더",
    desc: "발매·대회 일정 한눈에",
    to: "/calendar",
    icon: Calendar,
  },
  { title: "카드 DB", desc: "전체 카드 검색", to: "/cards", icon: Library },
  { title: "덱 빌더", desc: "레시피 작성·공유", to: "/decks", icon: Layers },
  {
    title: "내 컬렉션",
    desc: "보유 카드와 자산",
    to: "/collection",
    icon: PackageOpen,
  },
  { title: "전적 기록", desc: "대전 결과 추적", to: "/matches", icon: Swords },
  {
    title: "리더보드",
    desc: "시즌 랭킹과 티어",
    to: "/leaderboard",
    icon: Trophy,
  },
  { title: "매장 찾기", desc: "주변 TCG 매장", to: "/stores", icon: MapPin },
  { title: "오프라인 매칭", desc: "LFG 세션", to: "/lfg", icon: Users },
] as const;

function useDashboardStats(userId: string) {
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
      ? "전적을 기록하면 표시"
      : `${wins}승 ${losses}패 (최근 90일)`;

  // 랭킹 텍스트
  const ratingStr = rankData ? `${rankData.rating}점` : "—";
  const ratingHint = rankData
    ? `${rankData.game.toUpperCase()} · ${rankData.matches_count}전`
    : "리더보드 진입 전";

  return [
    { label: "이번 시즌 승률", value: winRateStr, hint: winRateHint },
    {
      label: "보유 카드",
      value: collectionCount?.toLocaleString() ?? "0",
      hint: collectionCount ? "컬렉션 등록 완료" : "컬렉션을 등록해 주세요",
    },
    {
      label: "저장된 덱",
      value: deckCount?.toLocaleString() ?? "0",
      hint: deckCount ? "덱 빌더에서 확인" : "덱 빌더에서 생성",
    },
    { label: "최고 레이팅", value: ratingStr, hint: ratingHint },
  ];
}

function Dashboard() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const stats = useDashboardStats(user?.id ?? "");

  useEffect(() => {
    if (!loading && !user) {
      navigate({ to: "/intro", replace: true });
    }
  }, [user, loading, navigate]);

  if (loading || !user) {
    return null;
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <PageHeader
        title="대시보드"
        description="원피스·포켓몬·디지몬 TCG를 한 곳에서 관리하세요."
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
        <h2 className="text-sm font-medium text-foreground">바로가기</h2>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {shortcuts.map((s) => (
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
