/**
 * 전역 뒤로가기. 상세(서브) 라우트(경로 깊이 ≥ 2)에서만 헤더에 노출.
 * 앱 내 히스토리가 있으면 '이전 단계로', 없으면(딥링크 진입) 상위 경로로 이동.
 * 예: /lfg/abc → /lfg, /cards/OP01-001 → /cards, /messages/xyz → /messages
 */
import { useRouter, useRouterState } from "@tanstack/react-router";
import { ChevronLeft } from "lucide-react";
import { useI18n } from "@/i18n/language-context";

export function BackButton() {
  const router = useRouter();
  const { t } = useI18n();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  const parts = pathname.split("/").filter(Boolean);
  if (parts.length < 2) return null; // 최상위 메뉴에선 숨김

  const parent = "/" + parts.slice(0, -1).join("/");

  const onClick = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.history.back();
    } else {
      router.navigate({ to: parent as string });
    }
  };

  return (
    <button
      onClick={onClick}
      aria-label={t("common.back", "뒤로")}
      className="flex shrink-0 items-center gap-1 rounded-lg px-2 py-1.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <ChevronLeft className="h-4 w-4" />
      <span className="hidden sm:inline">{t("common.back", "뒤로")}</span>
    </button>
  );
}
