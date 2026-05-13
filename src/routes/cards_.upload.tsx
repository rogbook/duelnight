import { createFileRoute, Link } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { CardUploader } from "@/components/cards/card-uploader";

export const Route = createFileRoute("/cards_/upload")({
  head: () => ({
    meta: [
      { title: "카드 등록 — TCG Hub" },
      { name: "description", content: "엑셀·이미지·폼으로 카드 데이터를 간편하게 등록합니다." },
    ],
  }),
  component: CardsUploadPage,
});

function CardsUploadPage() {
  const { user, loading } = useAuth();
  const { isAdmin } = useIsAdmin();

  if (loading) {
    return (
      <div className="mx-auto w-full max-w-5xl px-6 py-8">
        <PageHeader title="카드 등록" description="확인 중…" />
      </div>
    );
  }
  if (!user) {
    return (
      <div className="mx-auto w-full max-w-5xl px-6 py-8">
        <PageHeader title="카드 등록" description="로그인이 필요합니다" />
        <Card className="mt-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-muted-foreground" />
              <CardTitle>로그인 후 이용해 주세요</CardTitle>
            </div>
            <CardDescription>로그인한 사용자만 카드를 등록할 수 있어요.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link to="/login">로그인</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-8">
      <PageHeader
        title="카드 등록"
        description={
          isAdmin
            ? "관리자: 같은 코드는 자동 갱신됩니다. 한 장씩 · 엑셀/CSV · 이미지 대량 중 편한 방식을 선택하세요."
            : "한 장씩 · 엑셀/CSV · 이미지 대량 중 편한 방식을 선택하세요. 이미 등록된 카드(코드 중복)는 건너뜁니다."
        }
      />
      <div className="mt-6">
        <CardUploader isAdmin={isAdmin} />
      </div>
    </div>
  );
}
