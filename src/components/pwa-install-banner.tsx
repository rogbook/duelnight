import { useState, useEffect } from "react";
import { Download, Smartphone, X } from "lucide-react";
import { Button } from "./ui/button";
import { useI18n } from "@/i18n/language-context";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

export function PwaInstallBanner() {
  const { language } = useI18n();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isVisible, setIsVisible] = useState(false);

  const title =
    language === "ja"
      ? "DuelNightをアプリとして使用する"
      : language === "en"
        ? "Use DuelNight as an App"
        : "DuelNight 앱으로 사용해 보세요";

  const desc =
    language === "ja"
      ? "ホーム画面に追加すると、オフライン機能とより快適な画面でご利用いただけます。"
      : language === "en"
        ? "Add to home screen to enjoy offline support and a better full-screen experience."
        : "홈 화면에 앱으로 추가하면 오프라인 지원 및 더욱 쾌적한 화면으로 이용할 수 있습니다.";

  const installText =
    language === "ja" ? "インストール" : language === "en" ? "Install App" : "앱 설치";

  const iosGuideText =
    language === "ja"
      ? "Safariブラウザ下部の[共有]ボタンを押した後、[ホーム画面に追加]を選択してください。"
      : language === "en"
        ? "Tap the [Share] button at the bottom of Safari and select [Add to Home Screen]."
        : "Safari 브라우저 하단의 [공유] 버튼을 누른 후 [홈 화면에 추가]를 선택해 주세요.";

  useEffect(() => {
    // 1. 이미 앱이 standalone 모드로 실행 중인 경우 표시하지 않음
    const isStandalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      (window.navigator as any).standalone;
    if (isStandalone) {
      return;
    }

    // 2. 사용자가 이전에 닫은 경우 표시하지 않음 (로컬 스토리지 확인)
    const isDismissed = localStorage.getItem("duelnight.pwa.dismissed") === "true";
    if (isDismissed) {
      return;
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      // Chrome/Android 등에서 기본 브라우저 배너 방지
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // iOS Safari 대응
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !(window as any).MSStream;
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    if (isIOS && isSafari && !isStandalone) {
      setIsVisible(true);
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      const { outcome } = await deferredPrompt.userChoice;
      if (outcome === "accepted") {
        setDeferredPrompt(null);
        setIsVisible(false);
      }
    } else {
      alert(iosGuideText);
    }
  };

  const handleDismiss = () => {
    localStorage.setItem("duelnight.pwa.dismissed", "true");
    setIsVisible(false);
  };

  if (!isVisible) return null;

  return (
    <div className="relative mb-6 overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-r from-primary/10 via-card to-accent/10 p-4 shadow-md transition-all hover:border-primary/30">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/20 text-primary">
            <Smartphone className="h-5 w-5 animate-bounce" />
          </span>
          <div className="space-y-1">
            <h3 className="text-sm font-bold text-foreground">{title}</h3>
            <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 self-end sm:self-center">
          <Button
            onClick={handleInstallClick}
            size="sm"
            className="h-8 text-xs font-bold gap-1 shadow bg-primary text-primary-foreground hover:opacity-95"
          >
            <Download className="h-3.5 w-3.5" />
            {installText}
          </Button>
          <button
            onClick={handleDismiss}
            className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
