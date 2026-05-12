import { createFileRoute } from "@tanstack/react-router";
import { MapPin } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { GameFilter } from "@/components/game-filter";
import { EmptyState } from "@/components/empty-state";

export const Route = createFileRoute("/stores")({
  head: () => ({
    meta: [
      { title: "매장 찾기 — TCG Hub" },
      {
        name: "description",
        content: "내 주변 TCG 매장과 공인 점포 위치 정보.",
      },
    ],
  }),
  component: StoresPage,
});

function StoresPage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <PageHeader
        title="매장 찾기"
        description="내 주변 TCG 취급점·공인 점포"
      >
        <GameFilter />
      </PageHeader>
      <div className="mt-6">
        <EmptyState
          icon={MapPin}
          title="지도 연동 준비 중"
          description="네이버 지도/카카오맵 API를 통해 주변 매장을 표시합니다."
        />
      </div>
    </div>
  );
}
