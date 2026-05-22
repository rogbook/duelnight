import { createFileRoute, Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CardUploader } from "@/components/cards/card-uploader";

export const Route = createFileRoute("/admin/cards")({
  head: () => ({
    meta: [
      { title: "카드 DB 업로드 — 관리자 — DuelNight" },
      { name: "description", content: "엑셀·이미지·폼으로 카드 데이터를 간편하게 등록·수정합니다." },
    ],
  }),
  component: AdminCardsPage,
});

function AdminCardsPage() {
  const { user, loading } = useAuth();
  const { isAdmin, isLoading } = useIsAdmin();

  if (loading || isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl px-6 py-8">
        <PageHeader title="카드 DB 업로드" description="권한 확인 중…" />
      </div>
    );
  }
  if (!user || !isAdmin) {
    return (
      <div className="mx-auto w-full max-w-5xl px-6 py-8">
        <PageHeader title="카드 DB 업로드" description="관리자 전용" />
        <Card className="mt-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-muted-foreground" />
              <CardTitle>접근 권한이 없습니다</CardTitle>
            </div>
            <CardDescription>관리자만 사용할 수 있어요.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link to="/cards">카드 DB 둘러보기</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <PageHeader
        title="카드 DB 업로드 (관리자)"
        description="한 장씩 폼 입력 · 엑셀/CSV 업로드 · 이미지 대량 업로드 후 표에서 편집할 수 있습니다. 같은 코드는 자동 갱신됩니다."
      />
      <div className="mt-4 flex flex-wrap gap-2">
        <Button asChild variant="outline" size="sm">
          <Link to="/cards">카드 DB에서 편집·삭제 →</Link>
        </Button>
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/cards/review">검수 큐 · 감사 로그 →</Link>
        </Button>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        등록된 카드의 편집·삭제는 카드 DB 상세 페이지에서 관리자 전용으로 진행됩니다.
      </p>
      <div className="mt-6">
        <CardUploader isAdmin />
      </div>
    </div>
  );
}
