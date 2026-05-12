import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Database, RefreshCw, AlertTriangle, Lock } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";

export const Route = createFileRoute("/admin/seed")({
  head: () => ({
    meta: [
      { title: "시드 재생성 — 관리자 — TCG Hub" },
      { name: "description", content: "더미 시드 데이터를 재생성합니다." },
    ],
  }),
  component: SeedPage,
});

function SeedPage() {
  const { user, loading } = useAuth();
  const { isAdmin, isLoading } = useIsAdmin();
  const [running, setRunning] = useState(false);

  if (loading || isLoading) {
    return <div className="flex flex-col gap-6 p-6 md:p-8"><PageHeader title="시드 재생성" /></div>;
  }
  if (!user || !isAdmin) {
    return (
      <div className="flex flex-col gap-6 p-6 md:p-8">
        <PageHeader title="시드 재생성" description="관리자 전용" />
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-muted-foreground" />
              <CardTitle>접근 권한이 없습니다</CardTitle>
            </div>
            <CardDescription>이 화면은 관리자 전용입니다. 일반 사용자는 “샘플 데이터 둘러보기”에서 시드 데이터를 확인하실 수 있어요.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline"><Link to="/sandbox">샘플 데이터 둘러보기</Link></Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  const onRun = async () => {
    setRunning(true);
    try {
      await new Promise((r) => setTimeout(r, 800));
      toast.success("시드 재생성 요청을 큐에 등록했습니다 (데모)");
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <PageHeader title="시드 재생성" description="테스트 계정·카드·덱·공지 등 더미 데이터를 다시 채웁니다." />
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <CardTitle>전체 시드 재생성</CardTitle>
          </div>
          <CardDescription>기존 데이터는 보존하고 누락된 더미 레코드만 재삽입합니다 (UPSERT).</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
            <span>운영 데이터가 있을 경우 충돌하지 않도록 확인 후 실행하세요.</span>
          </div>
          <div className="flex gap-2">
            <Button onClick={onRun} disabled={running}>
              <RefreshCw className={`mr-2 h-4 w-4 ${running ? "animate-spin" : ""}`} />
              {running ? "실행 중..." : "시드 재생성 실행"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
