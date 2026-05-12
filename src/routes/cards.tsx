import { createFileRoute } from "@tanstack/react-router";
import { Library } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { GameFilter } from "@/components/game-filter";
import { EmptyState } from "@/components/empty-state";

export const Route = createFileRoute("/cards")({
  head: () => ({
    meta: [
      { title: "카드 DB — TCG Hub" },
      {
        name: "description",
        content: "원피스·포켓몬·디지몬 TCG 카드 데이터베이스 검색.",
      },
    ],
  }),
  component: CardsPage,
});

function CardsPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <PageHeader
        title="카드 DB"
        description="게임별 전체 카드와 팩·스타터덱 분류"
      >
        <GameFilter />
      </PageHeader>
      <div className="mt-6">
        <EmptyState
          icon={Library}
          title="카드 데이터를 준비 중입니다"
          description="검색·필터·팩 단위 분류 기능이 추가될 예정입니다."
        />
      </div>
    </div>
  );
}
