import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Coins,
  Crown,
  Receipt,
  ArrowLeft,
  Calendar,
  CheckCircle2,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TestModeBadge } from "@/components/test-mode-badge";
import { Skeleton } from "@/components/ui/skeleton";
import { BRAND_NAME, SITE_URL } from "@/lib/brand";
import { formatKRW } from "@/lib/pricing";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/billing")({
  head: () => ({
    meta: [
      { title: `결제 관리 — ${BRAND_NAME}` },
      { name: "description", content: "구독 상태, 잔여 크레딧, 결제 내역 관리." },
      { property: "og:url", content: `${SITE_URL}/billing` },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: BillingPage,
});

interface Subscription {
  status: string;
  plan: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
}

interface Credit {
  balance: number;
  lifetime_purchased: number;
  lifetime_used: number;
}

interface Payment {
  id: string;
  amount: number;
  status: string;
  provider: string;
  purpose: string;
  mode: string;
  created_at: string;
}

function BillingPage() {
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [credits, setCredits] = useState<Credit | null>(null);
  const [payments, setPayments] = useState<Payment[]>([]);

  useEffect(() => {
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) {
        setLoading(false);
        return;
      }
      setUserId(u.user.id);

      const [subRes, credRes, payRes] = await Promise.all([
        supabase
          .from("subscriptions")
          .select("status, plan, current_period_end, cancel_at_period_end")
          .eq("user_id", u.user.id)
          .maybeSingle(),
        supabase
          .from("user_credits")
          .select("balance, lifetime_purchased, lifetime_used")
          .eq("user_id", u.user.id)
          .maybeSingle(),
        supabase
          .from("payments")
          .select("id, amount, status, provider, purpose, mode, created_at")
          .eq("user_id", u.user.id)
          .order("created_at", { ascending: false })
          .limit(20),
      ]);

      if (subRes.data) setSub(subRes.data as Subscription);
      if (credRes.data) setCredits(credRes.data as Credit);
      if (payRes.data) setPayments(payRes.data as Payment[]);
      setLoading(false);
    })();
  }, []);

  const handleCancelSubscription = async () => {
    if (!userId) return;
    if (!confirm("구독을 취소하시겠습니까? 다음 결제일까지는 계속 사용 가능합니다.")) return;
    const { error } = await supabase
      .from("subscriptions")
      .update({ cancel_at_period_end: true })
      .eq("user_id", userId);
    if (error) {
      toast.error("취소 처리에 실패했습니다.");
      return;
    }
    toast.success("다음 결제일에 구독이 종료됩니다.");
    setSub((s) => (s ? { ...s, cancel_at_period_end: true } : s));
  };

  if (!loading && !userId) {
    return (
      <div className="mx-auto w-full max-w-2xl px-6 py-16 text-center">
        <h1 className="text-2xl font-bold">로그인이 필요합니다</h1>
        <Button className="mt-6" asChild>
          <Link to="/login">로그인</Link>
        </Button>
      </div>
    );
  }

  const isProActive =
    sub?.status === "active" && new Date(sub.current_period_end) > new Date();

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/profile">
            <ArrowLeft className="mr-1 size-4" /> 마이페이지로
          </Link>
        </Button>
        <TestModeBadge />
      </div>

      <h1 className="mb-8 text-3xl font-bold tracking-tight">결제 관리</h1>

      {/* 현재 플랜 + 크레딧 */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2 text-base">
                <Crown className="size-4 text-primary" /> 현재 플랜
              </CardTitle>
              {isProActive ? (
                <Badge>Pro</Badge>
              ) : (
                <Badge variant="outline">Free</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-16 w-full" />
            ) : isProActive ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Calendar className="size-4" />
                  다음 결제일:{" "}
                  <span className="font-medium text-foreground">
                    {new Date(sub!.current_period_end).toLocaleDateString("ko-KR")}
                  </span>
                </div>
                {sub!.cancel_at_period_end ? (
                  <p className="text-sm text-amber-600 dark:text-amber-400">
                    다음 결제일에 자동 종료 예정입니다.
                  </p>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleCancelSubscription}
                  >
                    구독 취소
                  </Button>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <p className="text-sm text-muted-foreground">
                  Pro로 업그레이드하면 AI 기능을 무제한 사용할 수 있습니다.
                </p>
                <Button asChild>
                  <Link to="/pricing">Pro 시작하기</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Coins className="size-4 text-primary" /> 크레딧
            </CardTitle>
            <CardDescription>AI 단발 사용에 차감됩니다</CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-16 w-full" />
            ) : (
              <div>
                <div className="text-3xl font-bold tabular-nums">
                  {credits?.balance.toLocaleString() ?? 0}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">
                    C
                  </span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">
                  누적 충전 {credits?.lifetime_purchased.toLocaleString() ?? 0}C ·
                  사용 {credits?.lifetime_used.toLocaleString() ?? 0}C
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  className="mt-4"
                  asChild
                >
                  <Link to="/pricing">충전하기</Link>
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 결제 내역 */}
      <Card className="mt-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Receipt className="size-4 text-primary" /> 결제 내역
          </CardTitle>
          <CardDescription>최근 20건</CardDescription>
        </CardHeader>
        <CardContent>
          {loading ? (
            <Skeleton className="h-32 w-full" />
          ) : payments.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              아직 결제 내역이 없습니다.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {payments.map((p) => (
                <li key={p.id} className="flex items-center justify-between py-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-medium">
                        {p.purpose === "pro_subscribe" ? "Pro 구독" : "크레딧 충전"}
                      </span>
                      {p.mode === "test" && (
                        <Badge variant="outline" className="text-[10px]">
                          test
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {new Date(p.created_at).toLocaleString("ko-KR")} · {p.provider}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="font-semibold tabular-nums">
                      {formatKRW(Number(p.amount))}
                    </span>
                    {p.status === "completed" ? (
                      <CheckCircle2 className="size-4 text-emerald-500" />
                    ) : (
                      <XCircle className="size-4 text-muted-foreground" />
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
