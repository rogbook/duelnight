import { createFileRoute } from "@tanstack/react-router";
import { Lock } from "lucide-react";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

const PAGE_SIZE = 50;

type PaymentRow = {
  id: string;
  email: string | null;
  order_id: string;
  amount: number;
  currency: string;
  provider: string;
  status: string;
  created_at: string;
  total_count: number;
};

type SubscriptionRow = {
  user_id: string;
  email: string | null;
  plan: string;
  status: string;
  started_at: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
};

export const Route = createFileRoute("/admin/billing")({
  head: () => ({
    meta: [
      { title: "요금관리 — DuelNight" },
      { name: "description", content: "결제 내역과 구독 현황 관리." },
    ],
  }),
  component: BillingPage,
});

function fmtAmount(amount: number, currency: string): string {
  return `${Number(amount).toLocaleString("ko-KR")} ${currency}`;
}

function fmtDate(value: string | null): string {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("ko-KR");
}

function BillingPage() {
  const { user } = useAuth();
  const { isAdmin, loading: adminLoading } = useIsAdmin();
  const [page, setPage] = useState(0);

  const { data: payments = [], isLoading: loadingPay } = useQuery({
    queryKey: ["admin-payments", page],
    enabled: !!user && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_payments", {
        _limit: PAGE_SIZE,
        _offset: page * PAGE_SIZE,
      });
      if (error) throw error;
      return (data ?? []) as PaymentRow[];
    },
  });

  const { data: subs = [], isLoading: loadingSubs } = useQuery({
    queryKey: ["admin-subscriptions"],
    enabled: !!user && isAdmin,
    queryFn: async () => {
      const { data, error } = await supabase.rpc("admin_list_subscriptions");
      if (error) throw error;
      return (data ?? []) as SubscriptionRow[];
    },
  });

  if (adminLoading) return null;
  if (!isAdmin) {
    return (
      <div className="mx-auto w-full max-w-6xl px-6 py-8">
        <EmptyState icon={Lock} title="권한 없음" description="관리자만 접근할 수 있습니다." />
      </div>
    );
  }

  const total = payments[0]?.total_count ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const now = new Date();
  const paidThisMonth = payments
    .filter(
      (p) =>
        p.status === "paid" &&
        new Date(p.created_at).getMonth() === now.getMonth() &&
        new Date(p.created_at).getFullYear() === now.getFullYear(),
    )
    .reduce((sum, p) => sum + Number(p.amount), 0);
  const activeSubs = subs.filter((s) => s.status === "active" || s.status === "trialing");

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <PageHeader title="요금관리" description="결제 내역과 구독 현황" />

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">이번 달 결제액</p>
          <p className="mt-1 text-xl font-semibold">{paidThisMonth.toLocaleString("ko-KR")}원</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">결제 건수(전체)</p>
          <p className="mt-1 text-xl font-semibold">{total}건</p>
        </div>
        <div className="rounded-lg border p-4">
          <p className="text-xs text-muted-foreground">활성 구독</p>
          <p className="mt-1 text-xl font-semibold">{activeSubs.length}명</p>
        </div>
      </div>

      <h2 className="mt-8 text-sm font-semibold">결제 내역</h2>
      <div className="mt-2 rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>일시</TableHead>
              <TableHead>이메일</TableHead>
              <TableHead>주문번호</TableHead>
              <TableHead className="text-right">금액</TableHead>
              <TableHead>수단</TableHead>
              <TableHead>상태</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadingPay && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  불러오는 중...
                </TableCell>
              </TableRow>
            )}
            {!loadingPay && payments.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="py-8 text-center text-muted-foreground">
                  결제 내역이 없습니다. (테스트 단계 — 결제는 정식 오픈 후 활성화)
                </TableCell>
              </TableRow>
            )}
            {payments.map((p) => (
              <TableRow key={p.id}>
                <TableCell>{fmtDate(p.created_at)}</TableCell>
                <TableCell>{p.email ?? "(탈퇴)"}</TableCell>
                <TableCell className="font-mono text-xs">{p.order_id}</TableCell>
                <TableCell className="text-right">{fmtAmount(p.amount, p.currency)}</TableCell>
                <TableCell>{p.provider}</TableCell>
                <TableCell>
                  <Badge variant={p.status === "paid" ? "secondary" : "outline"}>{p.status}</Badge>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      {totalPages > 1 && (
        <div className="mt-3 flex items-center justify-center gap-2 text-sm">
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

      <h2 className="mt-8 text-sm font-semibold">구독 현황</h2>
      <div className="mt-2 rounded-lg border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>이메일</TableHead>
              <TableHead>플랜</TableHead>
              <TableHead>상태</TableHead>
              <TableHead>시작일</TableHead>
              <TableHead>만료일</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loadingSubs && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  불러오는 중...
                </TableCell>
              </TableRow>
            )}
            {!loadingSubs && subs.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                  구독자가 없습니다.
                </TableCell>
              </TableRow>
            )}
            {subs.map((s) => (
              <TableRow key={s.user_id}>
                <TableCell>{s.email ?? "(탈퇴)"}</TableCell>
                <TableCell>{s.plan}</TableCell>
                <TableCell>
                  <Badge variant={s.status === "active" ? "secondary" : "outline"}>
                    {s.status}
                    {s.cancel_at_period_end ? " (해지 예약)" : ""}
                  </Badge>
                </TableCell>
                <TableCell>{fmtDate(s.started_at)}</TableCell>
                <TableCell>{fmtDate(s.current_period_end)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
