import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Database, RefreshCw, AlertTriangle, Lock } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { reseedDemo } from "@/lib/admin-content.functions";

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
  const qc = useQueryClient();
  const run = useServerFn(reseedDemo);
  const m = useMutation({
    mutationFn: () => run({ data: undefined as never }),
    onSuccess: (res) => {
      const parts: string[] = [];
      if (res.announcements) parts.push(`공지 ${res.announcements}건`);
      if (res.cards) parts.push(`카드 ${res.cards}장`);
      toast.success(parts.length ? `보충 완료: ${parts.join(", ")}` : "이미 모든 시드가 채워져 있어요");
      qc.invalidateQueries({ queryKey: ["cards"] });
      qc.invalidateQueries({ queryKey: ["announcements"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "재생성 실패"),
  });

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
            <CardDescription>이 화면은 관리자 전용입니다. 일반 사용자는 카드 DB·덱 빌더·컬렉션 등 실제 기능을 자유롭게 사용하실 수 있어요.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline"><Link to="/cards">카드 DB로 이동</Link></Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <PageHeader title="시드 재생성" description="누락된 더미 공지·카드 등을 다시 채웁니다 (UPSERT)." />
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Database className="h-5 w-5 text-primary" />
            <CardTitle>전체 시드 보충</CardTitle>
          </div>
          <CardDescription>기존 데이터는 보존하고 비어있는 항목만 채웁니다.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-start gap-2 rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-500" />
            <span>운영 데이터에는 영향이 없지만, 데모용 카드(set_code=DEMO)와 환영 공지가 추가될 수 있습니다.</span>
          </div>
          <div className="flex gap-2">
            <Button onClick={() => m.mutate()} disabled={m.isPending}>
              <RefreshCw className={`mr-2 h-4 w-4 ${m.isPending ? "animate-spin" : ""}`} />
              {m.isPending ? "실행 중..." : "시드 보충 실행"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
