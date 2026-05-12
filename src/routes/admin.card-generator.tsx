import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Sparkles, Wand2, Lock } from "lucide-react";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { generateCards } from "@/lib/admin-content.functions";

export const Route = createFileRoute("/admin/card-generator")({
  head: () => ({
    meta: [
      { title: "카드 자동생성 — 관리자 — TCG Hub" },
      { name: "description", content: "AI로 더미 카드 데이터를 생성합니다." },
    ],
  }),
  component: CardGenPage,
});

function CardGenPage() {
  const { user, loading } = useAuth();
  const { isAdmin, isLoading } = useIsAdmin();
  const [setCode, setSetCode] = useState("OP12");
  const [count, setCount] = useState(5);
  const qc = useQueryClient();
  const generate = useServerFn(generateCards);
  const m = useMutation({
    mutationFn: (input: { setCode: string; count: number }) =>
      generate({ data: input }),
    onSuccess: (res) => {
      toast.success(`${res.inserted}장 생성 완료 (${res.codes[0]} …)`);
      qc.invalidateQueries({ queryKey: ["cards"] });
      qc.invalidateQueries({ queryKey: ["pack-sets"] });
      qc.invalidateQueries({ queryKey: ["pack-pool"] });
    },
    onError: (e: Error) => toast.error(e.message ?? "생성 실패"),
  });

  if (loading || isLoading) {
    return <div className="flex flex-col gap-6 p-6 md:p-8"><PageHeader title="카드 자동생성" /></div>;
  }
  if (!user || !isAdmin) {
    return (
      <div className="flex flex-col gap-6 p-6 md:p-8">
        <PageHeader title="카드 자동생성" description="관리자 전용" />
        <Card>
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-muted-foreground" />
              <CardTitle>접근 권한이 없습니다</CardTitle>
            </div>
            <CardDescription>카드 자동생성은 관리자만 사용할 수 있습니다.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline"><Link to="/cards">카드 DB 둘러보기</Link></Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 p-6 md:p-8">
      <PageHeader title="카드 자동생성" description="세트 코드를 지정해 더미 카드를 일괄 생성합니다." />
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <CardTitle>일괄 생성</CardTitle>
          </div>
          <CardDescription>이미지 URL은 <code>/cards/&lt;code&gt;.png</code> 패턴을 사용합니다.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="grid gap-3 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="setCode">세트 코드</Label>
              <Input id="setCode" value={setCode} onChange={(e) => setSetCode(e.target.value)} placeholder="OP12" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="count">생성 수량</Label>
              <Input id="count" type="number" min={1} max={50} value={count} onChange={(e) => setCount(Number(e.target.value))} />
            </div>
          </div>
          <Button
            onClick={() => m.mutate({ setCode: setCode.trim(), count })}
            disabled={m.isPending}
            className="w-fit"
          >
            <Wand2 className="mr-2 h-4 w-4" />
            {m.isPending ? "생성 중..." : "자동 생성 실행"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
