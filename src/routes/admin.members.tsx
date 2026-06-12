import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Search, ShieldBan, ShieldCheck, Coins, Lock } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";

const PAGE_SIZE = 20;

type MemberRow = {
  user_id: string;
  email: string;
  display_name: string | null;
  username: string | null;
  created_at: string;
  last_sign_in_at: string | null;
  is_admin: boolean;
  banned: boolean;
  credit_balance: number;
  plan: string | null;
  sub_status: string | null;
  total_count: number;
};

export const Route = createFileRoute("/admin/members")({
  head: () => ({
    meta: [
      { title: "회원관리 — DuelNight" },
      { name: "description", content: "회원 목록·권한·정지·크레딧 관리." },
    ],
  }),
  component: MembersPage,
});

function fmtDate(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("ko-KR");
}

function MembersPage() {
  const { user } = useAuth();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [submitted, setSubmitted] = useState("");
  const [page, setPage] = useState(0);
  const [creditTarget, setCreditTarget] = useState<MemberRow | null>(null);
  const [creditDelta, setCreditDelta] = useState("");

  const { data, isLoading } = useQuery({
    queryKey: ["admin-members", submitted, page],
    enabled: !!user && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_members", {
        _search: submitted || null,
        _limit: PAGE_SIZE,
        _offset: page * PAGE_SIZE,
      });
      if (error) throw error;
      return (data ?? []) as MemberRow[];
    },
  });

  const rows = data ?? [];
  const total = rows[0]?.total_count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-members"] });

  const toggleBan = async (row: MemberRow) => {
    const { error } = await supabase.rpc("admin_set_ban", {
      _user_id: row.user_id,
      _banned: !row.banned,
    });
    if (error) return toast.error(error.message);
    toast.success(row.banned ? "정지를 해제했습니다." : "계정을 정지했습니다.");
    refresh();
  };

  const submitCredits = async () => {
    if (!creditTarget) return;
    const delta = Number(creditDelta);
    if (!Number.isInteger(delta) || delta === 0) {
      return toast.error("0이 아닌 정수를 입력하세요 (차감은 음수).");
    }
    const { data, error } = await supabase.rpc("admin_adjust_credits", {
      _user_id: creditTarget.user_id,
      _delta: delta,
    });
    if (error) return toast.error(error.message);
    toast.success(`크레딧 ${delta > 0 ? "지급" : "차감"} 완료 — 새 잔액 ${data}C`);
    setCreditTarget(null);
    setCreditDelta("");
    refresh();
  };

  if (adminLoading) return null;
  if (!isAdmin) {
    return (
      <div className="mx-auto w-full max-w-6xl px-6 py-8">
        <EmptyState icon={Lock} title="권한 없음" description="관리자만 접근할 수 있습니다." />
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <PageHeader title="회원관리" description={`전체 ${total}명`} />

      <form
        className="mt-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          setPage(0);
          setSubmitted(search.trim());
        }}
      >
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="이메일·닉네임 검색"
            className="pl-8"
          />
        </div>
        <Button type="submit" variant="outline">
          검색
        </Button>
      </form>

      <div className="mt-4 rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>이메일</TableHead>
              <TableHead>닉네임</TableHead>
              <TableHead>가입일</TableHead>
              <TableHead>최근 로그인</TableHead>
              <TableHead>구독</TableHead>
              <TableHead className="text-right">크레딧</TableHead>
              <TableHead>상태</TableHead>
              <TableHead className="text-right">동작</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  불러오는 중...
                </TableCell>
              </TableRow>
            )}
            {!isLoading && rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                  검색 결과가 없습니다.
                </TableCell>
              </TableRow>
            )}
            {rows.map((row) => (
              <TableRow key={row.user_id}>
                <TableCell className="font-medium">
                  {row.email}
                  {row.is_admin && (
                    <Badge className="ml-1.5" variant="secondary">
                      관리자
                    </Badge>
                  )}
                </TableCell>
                <TableCell>{row.display_name ?? row.username ?? "-"}</TableCell>
                <TableCell>{fmtDate(row.created_at)}</TableCell>
                <TableCell>{fmtDate(row.last_sign_in_at)}</TableCell>
                <TableCell>
                  {row.plan ? `${row.plan} (${row.sub_status})` : "-"}
                </TableCell>
                <TableCell className="text-right">{row.credit_balance}C</TableCell>
                <TableCell>
                  {row.banned ? <Badge variant="destructive">정지</Badge> : "정상"}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-1">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setCreditTarget(row)}
                      title="크레딧 지급/차감"
                    >
                      <Coins className="h-3.5 w-3.5" />
                    </Button>
                    {row.user_id !== user?.id && !row.is_admin && (
                      <Button
                        size="sm"
                        variant={row.banned ? "outline" : "destructive"}
                        onClick={() => toggleBan(row)}
                        title={row.banned ? "정지 해제" : "계정 정지"}
                      >
                        {row.banned ? (
                          <ShieldCheck className="h-3.5 w-3.5" />
                        ) : (
                          <ShieldBan className="h-3.5 w-3.5" />
                        )}
                      </Button>
                    )}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-center gap-2 text-sm">
          <Button
            variant="outline"
            size="sm"
            disabled={page === 0}
            onClick={() => setPage((p) => p - 1)}
          >
            이전
          </Button>
          <span className="px-2 text-muted-foreground">
            {page + 1} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            disabled={page + 1 >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            다음
          </Button>
        </div>
      )}

      <Dialog open={!!creditTarget} onOpenChange={(o) => !o && setCreditTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>크레딧 지급/차감</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            {creditTarget?.email} — 현재 잔액 {creditTarget?.credit_balance}C
          </p>
          <Input
            type="number"
            value={creditDelta}
            onChange={(e) => setCreditDelta(e.target.value)}
            placeholder="지급은 양수, 차감은 음수 (예: 100, -50)"
          />
          <Button onClick={submitCredits}>적용</Button>
        </DialogContent>
      </Dialog>
    </div>
  );
}
