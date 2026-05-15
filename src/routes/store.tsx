import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Coins, Zap, ShieldCheck, Gem } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { PaymentDialog } from "@/components/payment/PaymentDialog";
import { toast } from "sonner";

export const Route = createFileRoute("/store")({
  head: () => ({
    meta: [{ title: "상점 — 덱로그" }],
  }),
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
  const [selectedPack, setSelectedPack] = useState<typeof CREDIT_PACKS[0] | null>(null);
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);

  const handlePurchase = (pack: typeof CREDIT_PACKS[0]) => {
    if (!session) {
      toast.error("로그인이 필요한 서비스입니다.");
      return;
    }
    setSelectedPack(pack);
    setIsPaymentOpen(true);
  };

  const handlePaymentSuccess = (data: any) => {
    console.log("Payment success data:", data);
    toast.success(`${selectedPack?.name} 구매가 성공적으로 완료되었습니다!`);
    // Here you would typically call a Supabase function to update user credits
  };

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <PageHeader
        title="크레딧 상점"
        description="팩 개봉 및 프리미엄 기능을 위한 크레딧을 충전하세요"
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
                {pack.bonus > 0 ? `+${pack.bonus.toLocaleString()} Bonus Credits` : 'Standard Pack'}
              </p>
            </CardHeader>
            <CardContent className="text-center">
              <div className="text-3xl font-bold">{pack.amount.toLocaleString()}원</div>
            </CardContent>
            <CardFooter>
              <Button onClick={() => handlePurchase(pack)} className="w-full" variant={pack.popular ? "default" : "outline"}>
                구매하기
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
            <h3 className="text-lg font-bold">안전한 결제 보장</h3>
            <p className="max-w-md text-sm text-muted-foreground">
              덱로그는 국내외 검증된 결제 대행사(PortOne, PayPal)를 통해 안전한 결제 환경을 제공합니다. 
              결제 정보는 시스템에 직접 저장되지 않습니다.
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
          }}
          onSuccess={handlePaymentSuccess}
        />
      )}
    </div>
  );
}
