import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Beaker, Info } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/sandbox")({
  head: () => ({
    meta: [
      { title: "샘플 데이터 둘러보기 — TCG Hub" },
      { name: "description", content: "운영팀이 준비한 데모용 샘플 데이터를 둘러보세요." },
    ],
  }),
  component: SandboxPage,
});

function SandboxPage() {
  const { isAdmin } = useIsAdmin();
  const { user } = useAuth();

  const cards = useQuery({
    queryKey: ["sandbox-cards"],
    queryFn: async () => {
      const { data } = await supabase.from("cards").select("code,name,colors,type,image_url").limit(8);
      return data ?? [];
    },
  });

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <PageHeader title="샘플 데이터 둘러보기" description="데모용으로 준비된 카드·덱·공지 샘플을 미리 살펴보세요." />

      {isAdmin && (
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Info className="h-5 w-5 text-primary" />
              <CardTitle>관리자 안내</CardTitle>
            </div>
            <CardDescription>
              관리자는 데이터를 직접 수정할 수 있습니다. 좌측 “더미 데이터 운영” 메뉴를 사용하세요.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Button asChild size="sm" variant="outline"><Link to="/admin/seed">시드 재생성</Link></Button>
            <Button asChild size="sm" variant="outline"><Link to="/admin/card-generator">카드 자동생성</Link></Button>
            <Button asChild size="sm" variant="outline"><Link to="/admin/inspect">데이터 검수</Link></Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Beaker className="h-5 w-5 text-primary" />
            <CardTitle>샘플 카드 미리보기</CardTitle>
          </div>
          <CardDescription>읽기 전용입니다. 자유롭게 둘러보세요.</CardDescription>
        </CardHeader>
        <CardContent>
          {cards.isLoading ? (
            <p className="text-sm text-muted-foreground">로딩 중...</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4">
              {cards.data?.map((c) => (
                <div key={c.code} className="rounded-md border border-border bg-card p-3">
                  <div className="text-xs text-muted-foreground">{c.code}</div>
                  <div className="mt-1 text-sm font-semibold">{c.name}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{c.type} · {c.colors?.join(", ")}</div>
                </div>
              ))}
            </div>
          )}
          {!user && (
            <p className="mt-4 text-xs text-muted-foreground">로그인하면 내 컬렉션·덱과 함께 샘플 데이터를 비교해볼 수 있어요.</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
