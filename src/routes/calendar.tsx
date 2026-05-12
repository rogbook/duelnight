import { createFileRoute } from "@tanstack/react-router";
import { Calendar } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { GameFilter } from "@/components/game-filter";
import { EmptyState } from "@/components/empty-state";

export const Route = createFileRoute("/calendar")({
  head: () => ({
    meta: [
      { title: "캘린더 — TCG Hub" },
      {
        name: "description",
        content: "TCG 발매일, 공식 대회, 매장 미니 대회 일정을 확인하세요.",
      },
    ],
  }),
  component: CalendarPage,
});

function CalendarPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <PageHeader
        title="캘린더"
        description="발매일·공식 대회·매장 대회 일정을 한눈에"
      >
        <GameFilter />
      </PageHeader>
      <div className="mt-6">
        <EmptyState
          icon={Calendar}
          title="일정이 아직 없어요"
          description="공식 일정 연동과 매장 대회 등록 기능이 추가될 예정입니다."
        />
      </div>
    </div>
  );
}
