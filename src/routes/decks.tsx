import { createFileRoute } from "@tanstack/react-router";
import { Layers } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { GameFilter } from "@/components/game-filter";
import { EmptyState } from "@/components/empty-state";

export const Route = createFileRoute("/decks")({
  head: () => ({
    meta: [
      { title: "덱 빌더 — TCG Hub" },
      {
        name: "description",
        content: "덱 레시피 생성, 저장, 커뮤니티 공유.",
      },
    ],
  }),
  component: DecksPage,
});

function DecksPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <PageHeader
        title="덱 빌더"
        description="레시피를 작성하고 저장·공유하세요"
      >
        <GameFilter />
      </PageHeader>
      <div className="mt-6">
        <EmptyState
          icon={Layers}
          title="저장된 덱이 없어요"
          description="카드 검색 기반 덱 작성과 공유 기능이 곧 제공됩니다."
        />
      </div>
    </div>
  );
}
