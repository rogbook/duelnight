import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CreditCard, Loader2, ShieldAlert, ShieldCheck, Lock } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { createStripeCheckoutSession } from "@/lib/payment.functions";
import { PaymentOptions } from "@/lib/payment";
import { toast } from "sonner";
import { useI18n } from "@/i18n/language-context";

interface PaymentDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  options: PaymentOptions;
  onSuccess: (data: any) => void;
}

export function PaymentDialog({
  open,
  onOpenChange,
  options,
}: PaymentDialogProps) {
  const { session } = useAuth();
  const { t, language } = useI18n();
  const [busy, setBusy] = useState(false);
  
  const isTestMode = import.meta.env.DEV;

  const handleStripeCheckout = async () => {
    if (!session) {
      toast.error(t("creditStore.loginRequired"));
      return;
    }
    
    setBusy(true);
    try {
      // 1. Stripe Checkout Session 발급 (TanStack Server Function)
      const result = await createStripeCheckoutSession({
        data: { packId: options.packId }
      });

      if (!result.url) {
        throw new Error("결제 세션 주소를 발급받지 못했습니다.");
      }

      toast.loading(t("common.loading", "결제 페이지로 이동 중..."));
      
      // 2. Stripe Checkout 결제창 리디렉션
      window.location.href = result.url;
    } catch (err) {
      toast.error(`결제 오류: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const renderPriceLabel = () => {
    if (language === "en") {
      return t("creditStore.priceUSD", { price: (options.amount / 1000).toFixed(2) });
    }
    if (language === "ja") {
      return t("creditStore.priceJPY", { price: (options.amount / 10).toLocaleString() });
    }
    return t("creditStore.priceKRW", { price: options.amount.toLocaleString() });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px] border border-border bg-card/95 backdrop-blur-md">
        <DialogHeader className="text-center pb-2">
          <div className="flex items-center justify-between">
            <DialogTitle className="text-xl font-bold tracking-tight">
              {t("creditStore.title")}
            </DialogTitle>
            {isTestMode && (
              <div className="flex items-center space-x-1.5 rounded-full bg-amber-500/10 px-2.5 py-0.5 text-amber-500 text-[10px] font-bold uppercase tracking-wider">
                Sandbox
              </div>
            )}
          </div>
          <DialogDescription className="text-sm text-muted-foreground mt-1">
            {options.orderName} Recharge
          </DialogDescription>
        </DialogHeader>

        {!session ? (
          <div className="flex flex-col items-center gap-3 rounded-xl border border-destructive/20 bg-destructive/5 p-5 text-destructive mt-2">
            <ShieldAlert className="h-10 w-10 text-destructive/80 animate-pulse" />
            <p className="text-sm font-medium text-center leading-relaxed">
              {t("creditStore.loginRequired")}
            </p>
          </div>
        ) : (
          <div className="mt-2 space-y-4">
            {/* Purchase Item Card */}
            <div className="rounded-2xl border border-border bg-muted/30 p-5 text-center shadow-inner">
              <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                <CreditCard className="h-5 w-5" />
              </div>
              <h3 className="text-md font-semibold text-foreground">{options.orderName}</h3>
              <p className="text-3xl font-extrabold text-primary tracking-tight mt-1">
                {renderPriceLabel()}
              </p>
            </div>

            {/* Secure Badges */}
            <div className="rounded-xl border border-border/50 bg-background/50 p-4 space-y-2.5 text-xs">
              <div className="flex items-start gap-2.5">
                <ShieldCheck className="h-4.5 w-4.5 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-foreground">{t("creditStore.secureTitle")}</p>
                  <p className="text-muted-foreground mt-0.5 leading-relaxed">
                    {t("creditStore.secureDesc")}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 pt-2 border-t border-border/30 text-[10px] text-muted-foreground">
                <Lock className="h-3 w-3 shrink-0" />
                <span>SSL Secured & Stripe Global Compliance</span>
              </div>
            </div>
          </div>
        )}

        <DialogFooter className="mt-5 flex gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy}
            className="flex-1"
          >
            {t("common.cancel")}
          </Button>
          {session && (
            <Button
              onClick={handleStripeCheckout}
              disabled={busy}
              className="flex-1 min-w-[120px] font-medium"
            >
              {busy ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {t("auth.processing")}
                </>
              ) : (
                t("creditStore.purchaseBtn")
              )}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
