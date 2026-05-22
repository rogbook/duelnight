import { useEffect, useState } from "react";
import { AlertTriangle, X } from "lucide-react";

/**
 * 현재 호스트를 보고 Preview(테스트) 환경이면 상단에 경고 배너를 띄운다.
 * - Published(duelnight.app, 커스텀 도메인)에서는 표시 안 함.
 * - 사용자가 닫으면 세션 동안 다시 뜨지 않음.
 */
export function EnvBanner() {
  const [hidden, setHidden] = useState(true);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const host = window.location.hostname;
    const isPreview =
      host.includes("id-preview") ||
      host.includes("lovableproject.com") ||
      host === "localhost" ||
      host === "127.0.0.1";

    if (!isPreview) return;
    if (sessionStorage.getItem("env-banner-dismissed") === "1") return;
    setHidden(false);
  }, []);

  if (hidden) return null;

  return (
    <div className="flex items-center gap-2 border-b border-yellow-500/40 bg-yellow-500/15 px-3 py-1.5 text-[11px] text-yellow-900 dark:text-yellow-200 sm:text-xs">
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      <span className="flex-1 leading-tight">
        <strong className="font-semibold">테스트 환경</strong> — 여기서의 변경은
        실 운영 데이터베이스에 영향을 줄 수 있습니다. 검증 후 Publish하면
        실사용자에게 반영됩니다.
      </span>
      <button
        type="button"
        onClick={() => {
          sessionStorage.setItem("env-banner-dismissed", "1");
          setHidden(true);
        }}
        className="rounded p-0.5 hover:bg-yellow-500/20"
        aria-label="배너 닫기"
      >
        <X className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}
