import { createFileRoute } from "@tanstack/react-router";
import { Swords } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { GameFilter } from "@/components/game-filter";
import { EmptyState } from "@/components/empty-state";

export const Route = createFileRoute("/matches")({
  head: () => ({
    meta: [
      { title: "전적 기록 — TCG Hub" },
      {
        name: "description",
        content: "대전 결과를 기록하고 승률·매치업 통계를 확인하세요.",
      },
    ],
  }),
  component: MatchesPage,
});

function MatchesPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <PageHeader
        title="전적 기록"
        description="대전 결과를 기록하고 통계를 분석"
      >
        <GameFilter />
      </PageHeader>
      <div className="mt-6 grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { l: "전체 승률", v: "—%" },
          { l: "총 판수", v: "0" },
          { l: "선공 승률", v: "—%" },
          { l: "후공 승률", v: "—%" },
        ].map((s) => (
          <div
            key={s.l}
            className="rounded-lg border border-border bg-card p-4"
          >
            <p className="text-xs text-muted-foreground">{s.l}</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">{s.v}</p>
          </div>
        ))}
      </div>
      <div className="mt-6">
        <EmptyState
          icon={Swords}
          title="기록된 전적이 없어요"
          description="대전 결과를 기록하면 덱별 승률과 매치업 통계가 표시됩니다."
        />
      </div>
    </div>
  );
}
