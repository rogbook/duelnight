import { createFileRoute } from "@tanstack/react-router";
import { Users } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { GameFilter } from "@/components/game-filter";
import { EmptyState } from "@/components/empty-state";

export const Route = createFileRoute("/lfg")({
  head: () => ({
    meta: [
      { title: "오프라인 매칭 — TCG Hub" },
      {
        name: "description",
        content: "시간·장소·게임을 정해 오프라인 친선전 세션을 모집하세요.",
      },
    ],
  }),
  component: LfgPage,
});

function LfgPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <PageHeader
        title="오프라인 매칭 (LFG)"
        description="시간·장소·게임으로 세션을 만들고 참가"
      >
        <GameFilter />
      </PageHeader>
      <div className="mt-6">
        <EmptyState
          icon={Users}
          title="열린 세션이 없어요"
          description="세션 생성, 참가 승인, 인앱 채팅과 매너 평가가 추가될 예정입니다."
        />
      </div>
    </div>
  );
}
