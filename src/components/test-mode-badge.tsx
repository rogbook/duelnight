import { IS_TEST_MODE } from "@/lib/brand";
import { AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  className?: string;
  variant?: "pill" | "banner";
}

/**
 * 테스트 결제 모드 배지
 * - pill: 작은 알약 형태 (헤더/사이드바용)
 * - banner: 전체폭 배너 (요금제 페이지 상단용)
 */
export function TestModeBadge({ className, variant = "pill" }: Props) {
  if (!IS_TEST_MODE) return null;

  if (variant === "banner") {
    return (
      <div
        className={cn(
          "flex items-start gap-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-300",
          className,
        )}
      >
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <div>
          <p className="font-semibold">현재 베타 / 테스트 결제 모드</p>
          <p className="mt-0.5 text-xs opacity-90">
            정식 오픈 전이므로 결제는 시뮬레이션으로 동작하며 실제 금액이 청구되지
            않습니다. 모든 유료 기능을 자유롭게 사용해 보세요.
          </p>
        </div>
      </div>
    );
  }

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-amber-700 dark:text-amber-300",
        className,
      )}
    >
      <AlertTriangle className="size-3" />
      Test Mode
    </span>
  );
}
