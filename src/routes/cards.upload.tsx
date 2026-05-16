import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export const Route = createFileRoute("/cards/upload")({
  head: () => ({
    meta: [
      { title: "카드 등록 — 덱로그" },
      { name: "description", content: "관리자만 카드 데이터를 등록할 수 있습니다." },
    ],
  }),
  component: CardsUploadPage,
});

function CardsUploadPage() {
  const { user, loading } = useAuth();
  const { isAdmin, isLoading } = useIsAdmin();

  if (loading || isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl px-6 py-8">
        <PageHeader title="카드 등록" description="권한 확인 중…" />
      </div>
    );
  }

  // 관리자는 관리자 페이지로 이동
  if (user && isAdmin) {
    return <Navigate to="/admin/cards" replace />;
  }

  // 일반 사용자/비로그인 모두 접근 차단
  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <PageHeader title="카드 등록" description="관리자 전용 기능입니다" />
      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-muted-foreground" />
            <CardTitle>접근 권한이 없습니다</CardTitle>
          </div>
          <CardDescription>
            카드 등록·수정은 관리자만 수행할 수 있어요. 누락되었거나 잘못된 카드를 발견하면 운영자에게 문의해 주세요.
          </CardDescription>
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
