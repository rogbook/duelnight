import { createFileRoute } from "@tanstack/react-router";
import { PackageOpen } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { GameFilter } from "@/components/game-filter";
import { EmptyState } from "@/components/empty-state";

export const Route = createFileRoute("/collection")({
  head: () => ({
    meta: [
      { title: "내 컬렉션 — TCG Hub" },
      {
        name: "description",
        content: "보유 카드 등록과 자산 가치 시각화.",
      },
    ],
  }),
  component: CollectionPage,
});

function CollectionPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <PageHeader
        title="내 컬렉션"
        description="보유 카드와 자산 가치를 관리하세요"
      >
        <GameFilter />
      </PageHeader>
      <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3">
        {["총 자산", "보유 카드 수", "최근 시세 변동"].map((label) => (
          <div
            key={label}
            className="rounded-lg border border-border bg-card p-4"
          >
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className="mt-2 text-2xl font-semibold tracking-tight">—</p>
          </div>
        ))}
      </div>
      <div className="mt-6">
        <EmptyState
          icon={PackageOpen}
          title="등록된 카드가 없어요"
          description="카드 DB에서 보유 카드를 등록하면 자산 그래프가 표시됩니다."
        />
      </div>
    </div>
  );
}
