import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { ClipboardList, Lock } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/inspect")({
  head: () => ({
    meta: [
      { title: "데이터 검수 — 관리자 — TCG Hub" },
      { name: "description", content: "더미/운영 데이터 무결성 점검." },
    ],
  }),
  component: InspectPage,
});

function InspectPage() {
  const { user, loading } = useAuth();
  const { isAdmin, isLoading } = useIsAdmin();

  const stats = useQuery({
    queryKey: ["admin-inspect-stats"],
    enabled: !!user && isAdmin,
    queryFn: async () => {
      const tables = ["profiles", "cards", "decks", "announcements", "user_collection", "lfg_posts", "tier_lists"] as const;
      const out: Record<string, number | string> = {};
      for (const t of tables) {
        const { count, error } = await supabase.from(t).select("*", { count: "exact", head: true });
        out[t] = error ? "—" : (count ?? 0);
      }
      return out;
    },
  });

  if (loading || isLoading) {
    return <div className="flex flex-col gap-6 p-6 md:p-8"><PageHeader title="데이터 검수" /></div>;
  }
  if (!user || !isAdmin) {
    return (
      <div className="flex flex-col gap-6 p-6 md:p-8">
        <PageHeader title="데이터 검수" description="관리자 전용" />
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-muted-foreground" />
              <CardTitle>접근 권한이 없습니다</CardTitle>
            </div>
            <CardDescription>데이터 검수 화면은 관리자만 접근할 수 있어요.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline"><Link to="/sandbox">샘플 데이터 둘러보기</Link></Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <PageHeader title="데이터 검수" description="주요 테이블의 레코드 수를 확인합니다." />
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            <CardTitle>테이블 현황</CardTitle>
          </div>
          <CardDescription>RLS 권한 내에서 집계된 카운트입니다.</CardDescription>
        </CardHeader>
        <CardContent>
          {stats.isLoading ? (
            <p className="text-sm text-muted-foreground">로딩 중...</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-3">
              {Object.entries(stats.data ?? {}).map(([k, v]) => (
                <div key={k} className="rounded-md border border-border bg-card p-3">
                  <div className="text-xs uppercase text-muted-foreground">{k}</div>
                  <div className="mt-1 text-2xl font-semibold">{v}</div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
