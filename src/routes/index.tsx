import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
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

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "TCG Hub — 통합 관리 플랫폼" },
      {
        name: "description",
        content:
          "원피스·포켓몬·디지몬 TCG 일정, 카드, 전적, 매장, 매칭을 한 곳에서.",
      },
    ],
  }),
  component: Dashboard,
});

const stats = [
  { label: "이번 시즌 승률", value: "—%", hint: "전적을 기록하면 표시" },
  { label: "보유 카드", value: "0", hint: "컬렉션을 등록해 주세요" },
  { label: "저장된 덱", value: "0", hint: "덱 빌더에서 생성" },
  { label: "랭킹", value: "—", hint: "리더보드 진입 전" },
];

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

function Dashboard() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();

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
