/**
 * 게이미피케이션 티어 — rating(정수) → 티어/색상 매핑 + 백분위 헬퍼.
 *
 * (docs/INTRO_HOME_REDESIGN.md §4)
 * ⚠️ 구간 임계값은 초기값. user_ratings 실제 분포 확인 후 재조정 필요.
 */

export type TierKey = "challenger" | "diamond" | "platinum" | "gold" | "silver" | "bronze";

export interface Tier {
  key: TierKey;
  /** 이 티어의 최소 rating(이상). */
  minRating: number;
  /** i18n 키: t(`tier.${key}`) */
  labelKey: string;
  /** Tailwind 색상 클래스 */
  text: string;
  bg: string;
  border: string;
}

/** 높은 티어부터 내림차순 정렬(매핑은 위에서부터 첫 매치). */
const TIERS: Tier[] = [
  {
    key: "challenger",
    minRating: 1600,
    labelKey: "tier.challenger",
    text: "text-amber-400",
    bg: "bg-amber-400/10",
    border: "border-amber-400/30",
  },
  {
    key: "diamond",
    minRating: 1400,
    labelKey: "tier.diamond",
    text: "text-sky-400",
    bg: "bg-sky-400/10",
    border: "border-sky-400/30",
  },
  {
    key: "platinum",
    minRating: 1250,
    labelKey: "tier.platinum",
    text: "text-teal-400",
    bg: "bg-teal-400/10",
    border: "border-teal-400/30",
  },
  {
    key: "gold",
    minRating: 1100,
    labelKey: "tier.gold",
    text: "text-yellow-500",
    bg: "bg-yellow-500/10",
    border: "border-yellow-500/30",
  },
  {
    key: "silver",
    minRating: 950,
    labelKey: "tier.silver",
    text: "text-slate-300",
    bg: "bg-slate-300/10",
    border: "border-slate-300/30",
  },
  {
    key: "bronze",
    minRating: -Infinity,
    labelKey: "tier.bronze",
    text: "text-orange-400",
    bg: "bg-orange-400/10",
    border: "border-orange-400/30",
  },
];

/** rating으로 티어를 반환. rating이 없으면(null/undefined) 최하위(bronze). */
export function getTier(rating: number | null | undefined): Tier {
  const r = rating ?? -Infinity;
  return TIERS.find((t) => r >= t.minRating) ?? TIERS[TIERS.length - 1];
}

/**
 * 상위 백분위(%) 근사. 1위 → 가장 작은 값.
 * rank: 1부터, total: 전체 인원. 0~100 사이로 반환(반올림 소수 1자리).
 */
export function getTopPercentile(rank: number, total: number): number | null {
  if (!total || total <= 0 || rank <= 0) return null;
  const pct = (rank / total) * 100;
  return Math.max(0.1, Math.round(pct * 10) / 10);
}
