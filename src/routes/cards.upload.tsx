import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useI18n } from "@/i18n/language-context";

export const Route = createFileRoute("/cards/upload")({
  head: () => {
    let locale = "ko";
    if (typeof window !== "undefined") {
      locale = localStorage.getItem("duelnight.i18n.locale") || "ko";
    }
    const titles: Record<string, string> = {
      ko: "카드 등록 — DuelNight",
      en: "Card Upload — DuelNight",
      ja: "カード登録 — DuelNight",
    };
    const descs: Record<string, string> = {
      ko: "관리자만 카드 데이터를 등록할 수 있습니다.",
      en: "Only administrators can upload card data.",
      ja: "管理者のみがカードデータを登録できます。",
    };
    return {
      meta: [
        { title: titles[locale] || titles.ko },
        { name: "description", content: descs[locale] || descs.ko },
      ],
    };
  },
  component: CardsUploadPage,
});

function CardsUploadPage() {
  const { t } = useI18n();
  const { user, loading } = useAuth();
  const { isAdmin, isLoading } = useIsAdmin();

  if (loading || isLoading) {
    return (
      <div className="mx-auto w-full max-w-5xl px-6 py-8">
        <PageHeader title={t("cards.uploadTitle")} description={t("cards.checkingPermission")} />
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
      <PageHeader title={t("cards.uploadTitle")} description={t("cards.adminOnlyFunc")} />
      <Card className="mt-6">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-muted-foreground" />
            <CardTitle>{t("cards.noPermissionTitle")}</CardTitle>
          </div>
          <CardDescription>{t("cards.noPermissionDesc")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline">
            <Link to="/cards">{t("cards.browseDb")}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
