import { createFileRoute } from "@tanstack/react-router";
import { Trophy } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { GameFilter } from "@/components/game-filter";
import { EmptyState } from "@/components/empty-state";

export const Route = createFileRoute("/leaderboard")({
  head: () => ({
    meta: [
      { title: "리더보드 — TCG Hub" },
      {
        name: "description",
        content: "시즌별 티어와 상위 랭커.",
      },
    ],
  }),
  component: LeaderboardPage,
});

function LeaderboardPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <PageHeader title="리더보드" description="시즌 티어와 상위 랭커">
        <GameFilter />
      </PageHeader>
      <div className="mt-6">
        <EmptyState
          icon={Trophy}
          title="시즌 데이터가 준비 중이에요"
          description="레이팅(MMR/ELO) 기반 랭킹이 곧 적용됩니다."
        />
      </div>
    </div>
  );
}
