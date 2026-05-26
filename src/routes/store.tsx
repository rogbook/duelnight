import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Coins, Zap, ShieldCheck, Gem } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { PaymentDialog } from "@/components/payment/PaymentDialog";
import { verifyStripePayment } from "@/lib/payment.functions";
import { toast } from "sonner";
import { useI18n } from "@/i18n/language-context";

export const Route = createFileRoute("/store")({
  head: () => {
    let locale = "ko";
    if (typeof window !== "undefined") {
      locale = localStorage.getItem("duelnight.i18n.locale") || "ko";
    }
    const titles: Record<string, string> = {
      ko: "상점 — DuelNight",
      en: "Store — DuelNight",
      ja: "ショップ — DuelNight",
    };
    return {
      meta: [{ title: titles[locale] || titles.ko }],
    };
  },
  component: StorePage,
});

const CREDIT_PACKS = [
  {
    id: "credits-small",
    name: "1,000 Credits",
    amount: 10000,
    bonus: 0,
    icon: Coins,
    color: "text-amber-500",
  },
  {
    id: "credits-medium",
    name: "5,000 Credits",
    amount: 45000,
    bonus: 500,
    icon: Zap,
    color: "text-blue-500",
    popular: true,
  },
  {
    id: "credits-large",
    name: "10,000 Credits",
    amount: 85000,
    bonus: 1500,
    icon: Gem,
    color: "text-purple-500",
  },
];

function StorePage() {
  const { session } = useAuth();
  const { t, language } = useI18n();
  const [selectedPack, setSelectedPack] = useState<typeof CREDIT_PACKS[0] | null>(null);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);

  // 1. Stripe Checkout 리디렉션 파라미터 감지 및 검증
  useEffect(() => {
    if (typeof window === "undefined") return;

    const params = new URLSearchParams(window.location.search);
    const success = params.get("success");
    const sessionId = params.get("session_id");

    if (success === "true" && sessionId) {
      const verify = async () => {
        const toastId = toast.loading(t("common.loading", "결제 결과 확인 중..."));
        try {
          const res = await verifyStripePayment({
            data: { session_id: sessionId }
          });

          if (res.success) {
            toast.success(t("creditStore.purchaseSuccess", { name: "Credits" }), { id: toastId });
            
            // 성공 시 URL 지분 제거하여 리프레시 중복 방지
            const cleanUrl = window.location.pathname;
            window.history.replaceState({}, document.title, cleanUrl);
          } else {
            toast.error(res.error || "결제 검증에 실패했습니다.", { id: toastId });
          }
        } catch (err) {
          toast.error(`결제 처리 오류: ${(err as Error).message}`, { id: toastId });
        }
      };
      verify();
    }
  }, [t]);

  const handlePurchase = (pack: typeof CREDIT_PACKS[0]) => {
    if (!session) {
      toast.error(t("creditStore.loginRequired"));
      return;
    }
    setSelectedPack(pack);
    setIsPaymentOpen(true);
  };

  const renderPrice = (amount: number) => {
    if (language === "en") {
      return t("creditStore.priceUSD", { price: (amount / 1000).toFixed(2) });
    }
    if (language === "ja") {
      return t("creditStore.priceJPY", { price: (amount / 10).toLocaleString() });
    }
    return t("creditStore.priceKRW", { price: amount.toLocaleString() });
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <PageHeader
        title={t("creditStore.title")}
        description={t("creditStore.desc")}
      />

      <div className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {CREDIT_PACKS.map((pack) => (
          <Card key={pack.id} className={`relative overflow-hidden transition-all hover:shadow-lg ${pack.popular ? 'border-primary ring-1 ring-primary' : ''}`}>
            {pack.popular && (
              <div className="absolute right-0 top-0 rounded-bl-lg bg-primary px-3 py-1 text-[10px] font-bold text-primary-foreground">
                POPULAR
              </div>
            )}
            <CardHeader className="text-center pb-2">
              <div className={`mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-muted ${pack.color}`}>
                <pack.icon className="h-8 w-8" />
              </div>
              <CardTitle className="text-xl">{pack.name}</CardTitle>
              <p className="text-sm text-muted-foreground">
                {pack.bonus > 0
                  ? t("creditStore.bonusCredits", { bonus: pack.bonus.toLocaleString() })
                  : t("creditStore.standardPack")}
              </p>
            </CardHeader>
            <CardContent className="text-center">
              <div className="text-3xl font-bold">{renderPrice(pack.amount)}</div>
            </CardContent>
            <CardFooter>
              <Button onClick={() => handlePurchase(pack)} className="w-full" variant={pack.popular ? "default" : "outline"}>
                {t("creditStore.purchaseBtn")}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

      <div className="mt-12 rounded-2xl bg-muted/50 p-8">
        <div className="flex flex-col items-center gap-4 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ShieldCheck className="h-6 w-6" />
          </div>
          <div>
            <h3 className="text-lg font-bold">{t("creditStore.secureTitle")}</h3>
            <p className="max-w-md text-sm text-muted-foreground">
              {t("creditStore.secureDesc")}
            </p>
          </div>
        </div>
      </div>

      {selectedPack && (
        <PaymentDialog
          open={isPaymentOpen}
          onOpenChange={setIsPaymentOpen}
          options={{
            amount: selectedPack.amount,
            orderName: selectedPack.name,
            orderId: `order_${Date.now()}`,
            packId: selectedPack.id,
          }}
          onSuccess={() => {}}
        />
      )}
    </div>
  );
}
