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
import { CreditCard, Globe, CheckCircle2, Loader2, FlaskConical } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { processPortOnePayment, initPayPalButtons, PaymentOptions } from "@/lib/payment";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

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
  onSuccess,
}: PaymentDialogProps) {
  const [method, setMethod] = useState<"domestic" | "intl" | null>(null);
  const [busy, setBusy] = useState(false);
  const [showPayPal, setShowPayPal] = useState(false);
  const [isTest, setIsTest] = useState(true); // Default to test mode for safety

  const handleDomesticPayment = async () => {
    setBusy(true);
    try {
      // PortOne User Code (Can be any valid one for testing, e.g., imp31011697)
      const userCode = isTest ? "imp31011697" : "imp00000000"; 
      const result = await processPortOnePayment(userCode, {
        ...options,
        sandbox: isTest,
      });
      toast.success("결제가 완료되었습니다!");
      onSuccess(result);
      onOpenChange(false);
    } catch (err) {
      toast.error(`결제 실패: ${(err as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  const handleIntlSelection = () => {
    setMethod("intl");
    setShowPayPal(true);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px]">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <DialogTitle className="text-2xl font-bold">결제 방법 선택</DialogTitle>
            <div className="flex items-center space-x-2 rounded-full bg-muted px-3 py-1">
              <FlaskConical className={cn("h-3.5 w-3.5", isTest ? "text-amber-500" : "text-muted-foreground")} />
              <Label htmlFor="test-mode" className="text-[10px] font-bold uppercase tracking-wider">Test Mode</Label>
              <Switch 
                id="test-mode" 
                checked={isTest} 
                onCheckedChange={setIsTest} 
                className="h-4 w-7 data-[state=checked]:bg-amber-500"
              />
            </div>
          </div>
          <DialogDescription>
            {options.orderName} - {options.amount.toLocaleString()}원
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-4">
          <button
            onClick={() => {
              setMethod("domestic");
              setShowPayPal(false);
            }}
            className={cn(
              "flex items-center gap-4 rounded-xl border-2 p-4 text-left transition-all hover:border-primary/50",
              method === "domestic" ? "border-primary bg-primary/5" : "border-border"
            )}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 text-blue-600">
              <CreditCard className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <div className="font-bold">국내 결제</div>
              <div className="text-xs text-muted-foreground">신용카드, 계좌이체, 간편결제 (포트원)</div>
            </div>
            {method === "domestic" && <CheckCircle2 className="h-5 w-5 text-primary" />}
          </button>

          <button
            onClick={handleIntlSelection}
            className={cn(
              "flex items-center gap-4 rounded-xl border-2 p-4 text-left transition-all hover:border-primary/50",
              method === "intl" ? "border-primary bg-primary/5" : "border-border"
            )}
          >
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-yellow-100 text-yellow-600">
              <Globe className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <div className="font-bold">해외 결제</div>
              <div className="text-xs text-muted-foreground">PayPal, International Credit Cards</div>
            </div>
            {method === "intl" && <CheckCircle2 className="h-5 w-5 text-primary" />}
          </button>
        </div>

        {method === "intl" && showPayPal && (
          <div className="mt-2 min-h-[150px] rounded-lg bg-muted/50 p-4">
            <p className="mb-4 text-center text-xs text-muted-foreground">
              PayPal 버튼을 클릭하여 결제를 진행해 주세요.
            </p>
            {/* PayPal Button Container would go here */}
            <div id="paypal-button-container" className="flex justify-center">
               <Button variant="outline" className="w-full" disabled>
                 PayPal SDK 연동 준비 중... (Client ID 필요)
               </Button>
            </div>
          </div>
        )}

        <DialogFooter className="mt-4">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            취소
          </Button>
          {method === "domestic" && (
            <Button onClick={handleDomesticPayment} disabled={busy} className="min-w-[100px]">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : "결제하기"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
