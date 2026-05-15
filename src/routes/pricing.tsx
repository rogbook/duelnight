import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Check, ArrowLeft, Coins, Sparkles, Loader2 } from "lucide-react";
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
import { toast } from "sonner";
import {
  BRAND_NAME,
  IS_BETA,
  IS_TEST_MODE,
  SITE_URL,
} from "@/lib/brand";
import {
  PLANS,
  CREDIT_PACKS,
  formatKRW,
} from "@/lib/pricing";
import { supabase } from "@/integrations/supabase/client";
import { processPortOnePayment } from "@/lib/payment";

export const Route = createFileRoute("/pricing")({
  head: () => ({
    meta: [
      { title: `요금제 — ${BRAND_NAME}` },
      {
        name: "description",
        content: "Free·Pro 멤버십과 크레딧 충전 안내. 베타 기간 모든 기능 무료.",
      },
      { property: "og:title", content: `요금제 — ${BRAND_NAME}` },
      { property: "og:url", content: `${SITE_URL}/pricing` },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/pricing` }],
  }),
  component: PricingPage,
});

function PricingPage() {
  const navigate = useNavigate();
  const [userId, setUserId] = useState<string | null>(null);
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      setUserId(data.user?.id ?? null);
      setUserEmail(data.user?.email ?? null);
    });
  }, []);

  const requireLogin = () => {
    if (!userId) {
      toast.error("결제하려면 먼저 로그인하세요.");
      navigate({ to: "/login" });
      return false;
    }
    return true;
  };

  const handleSubscribePro = async () => {
    if (!requireLogin()) return;
    const plan = PLANS.find((p) => p.id === "pro")!;
    const orderId = `pro_${userId}_${Date.now()}`;
    setBusy("pro");
    try {
      const result = await processPortOnePayment({
        amount: plan.priceKRW,
        orderName: `${BRAND_NAME} Pro 멤버십 (월간)`,
        orderId,
        userEmail: userEmail ?? undefined,
        sandbox: IS_TEST_MODE,
        custom_data: { purpose: "pro_subscribe" },
      });

      if (!result?.success) {
        toast.error(result?.error_msg || "결제가 취소되었습니다.");
        return;
      }

      const { error } = await supabase.rpc("process_successful_payment", {
        p_user_id: userId!,
        p_amount: plan.priceKRW,
        p_order_id: orderId,
        p_provider: "portone",
        p_imp_uid: result.imp_uid ?? null,
        p_purpose: "pro_subscribe",
        p_credits: null,
        p_period_days: 30,
        p_billing_key: null,
        p_mode: IS_TEST_MODE ? "test" : "live",
      });
      if (error) throw error;
      toast.success("Pro 멤버십이 활성화되었습니다 🎉");
      navigate({ to: "/billing" });
    } catch (err) {
      console.error(err);
      toast.error("결제 처리 중 오류가 발생했습니다.");
    } finally {
      setBusy(null);
    }
  };

  const handleBuyCredits = async (packId: string) => {
    if (!requireLogin()) return;
    const pack = CREDIT_PACKS.find((p) => p.id === packId)!;
    const orderId = `credits_${userId}_${Date.now()}`;
    setBusy(packId);
    try {
      const result = await processPortOnePayment({
        amount: pack.priceKRW,
        orderName: `${BRAND_NAME} 크레딧 ${pack.credits}C`,
        orderId,
        userEmail: userEmail ?? undefined,
        sandbox: IS_TEST_MODE,
        custom_data: { purpose: "credits_topup", credits: pack.credits },
      });

      if (!result?.success) {
        toast.error(result?.error_msg || "결제가 취소되었습니다.");
        return;
      }

      const { error } = await supabase.rpc("process_successful_payment", {
        p_user_id: userId!,
        p_amount: pack.priceKRW,
        p_order_id: orderId,
        p_provider: "portone",
        p_imp_uid: result.imp_uid ?? null,
        p_purpose: "credits_topup",
        p_credits: pack.credits,
        p_period_days: 30,
        p_billing_key: null,
        p_mode: IS_TEST_MODE ? "test" : "live",
      });
      if (error) throw error;
      toast.success(`${pack.credits} 크레딧이 충전되었습니다 ✨`);
      navigate({ to: "/billing" });
    } catch (err) {
      console.error(err);
      toast.error("결제 처리 중 오류가 발생했습니다.");
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="mx-auto w-full max-w-5xl px-6 py-10">
      <div className="mb-6 flex items-center justify-between">
        <Button variant="ghost" size="sm" asChild>
          <Link to="/intro">
            <ArrowLeft className="mr-1 size-4" /> 소개로 돌아가기
          </Link>
        </Button>
        <TestModeBadge />
      </div>

      <div className="text-center">
        <Badge variant="secondary" className="mb-3">
          요금제
        </Badge>
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">
          필요한 만큼만 결제하세요
        </h1>
        <p className="mt-3 text-muted-foreground">
          핵심 기능은 영구 무료. AI 고급 기능은 멤버십 또는 크레딧으로 선택.
        </p>
      </div>

      {IS_BETA && <TestModeBadge variant="banner" className="mx-auto mt-8 max-w-2xl" />}

      {/* Plans */}
      <section className="mt-10 grid gap-5 md:grid-cols-2">
        {PLANS.map((plan) => (
          <Card
            key={plan.id}
            className={plan.highlight ? "relative border-primary shadow-lg shadow-primary/10" : "relative"}
          >
            {plan.highlight && (
              <Badge className="absolute -top-3 left-6">추천</Badge>
            )}
            <CardHeader>
              <CardTitle className="text-xl">{plan.name}</CardTitle>
              <div className="mt-3 flex items-baseline gap-1">
                <span className="text-4xl font-bold">
                  {plan.priceKRW === 0 ? "무료" : formatKRW(plan.priceKRW)}
                </span>
                {plan.period && (
                  <span className="text-sm text-muted-foreground">/월</span>
                )}
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <ul className="space-y-2 text-sm">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2">
                    <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              {plan.id === "pro" ? (
                <Button
                  className="w-full"
                  onClick={handleSubscribePro}
                  disabled={busy !== null}
                >
                  {busy === "pro" ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      처리 중…
                    </>
                  ) : (
                    <>
                      <Sparkles className="mr-2 size-4" />
                      {plan.cta}
                    </>
                  )}
                </Button>
              ) : (
                <Button className="w-full" variant="outline" asChild>
                  <Link to={userId ? "/" : "/login"}>{plan.cta}</Link>
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </section>

      {/* Credits */}
      <section className="mt-12">
        <div className="mb-6 flex items-center gap-2">
          <Coins className="size-5 text-primary" />
          <h2 className="text-xl font-semibold">크레딧 충전</h2>
          <Badge variant="outline" className="ml-2">
            단발성 사용
          </Badge>
        </div>
        <p className="mb-6 text-sm text-muted-foreground">
          AI OCR 1회 = 5C · AI 코치 1회 = 10C. 충전한 크레딧은 만료되지 않습니다.
        </p>

        <div className="grid gap-4 md:grid-cols-3">
          {CREDIT_PACKS.map((pack) => (
            <Card key={pack.id} className="relative">
              {pack.bonus && (
                <Badge variant="secondary" className="absolute -top-3 right-6">
                  {pack.bonus}
                </Badge>
              )}
              <CardHeader>
                <CardTitle className="text-2xl font-bold tabular-nums">
                  {pack.credits.toLocaleString()}
                  <span className="ml-1 text-sm font-normal text-muted-foreground">
                    Credits
                  </span>
                </CardTitle>
                <CardDescription className="text-base">
                  {formatKRW(pack.priceKRW)}
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={() => handleBuyCredits(pack.id)}
                  disabled={busy !== null}
                >
                  {busy === pack.id ? (
                    <>
                      <Loader2 className="mr-2 size-4 animate-spin" />
                      처리 중…
                    </>
                  ) : (
                    "충전하기"
                  )}
                </Button>
              </CardContent>
            </Card>
          ))}
        </div>
      </section>

      <p className="mt-12 text-center text-xs text-muted-foreground">
        결제는 PortOne(이니시스/카카오페이)를 통해 안전하게 처리됩니다 · 영수증은 마이페이지에서 확인
      </p>
    </div>
  );
}
