import { createFileRoute } from "@tanstack/react-router";
import { User } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "프로필 — TCG Hub" },
      {
        name: "description",
        content: "내 프로필, 매너 온도, 활동 내역.",
      },
    ],
  }),
  component: ProfilePage,
});

function ProfilePage() {
  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <PageHeader
        title="프로필"
        description="내 정보, 매너 온도, 활동 내역"
      />
      <div className="mt-6">
        <EmptyState
          icon={User}
          title="로그인 후 이용 가능"
          description="회원가입·로그인 시스템이 곧 연결됩니다."
        />
      </div>
    </div>
  );
}
