/**
 * 요금제 / 크레딧 / 무료 한도 상수
 *
 * 가격이나 한도를 조정할 때 이 파일만 수정하면 됩니다.
 * 서버측(SQL 함수)의 한도와 일치시켜 주세요 — check_free_quota() 참조.
 */

export type PlanId = "free" | "pro";

export interface PricingPlan {
  id: PlanId;
  name: string;
  priceKRW: number;
  period: "month" | null;
  highlight?: boolean;
  features: string[];
  cta: string;
}

export const PLANS: PricingPlan[] = [
  {
    id: "free",
    name: "Free",
    priceKRW: 0,
    period: null,
    features: [
      "카드 DB·덱 빌더 무제한",
      "매치 기록 최근 50개",
      "AI 카드 OCR 일 5회",
      "AI 코치 분석 월 3회",
      "LFG·리더보드 사용",
    ],
    cta: "무료로 시작",
  },
  {
    id: "pro",
    name: "Pro",
    priceKRW: 4900,
    period: "month",
    highlight: true,
    features: [
      "Free의 모든 기능",
      "AI OCR · 코치 무제한",
      "덱 / 매치 기록 무제한 보존",
      "광고 제거 (정식 오픈 시)",
      "고급 통계 대시보드",
      "우선 신규 게임 지원",
    ],
    cta: "Pro 시작하기",
  },
];

/**
 * 크레딧 충전 패키지 (단발성 결제)
 */
export interface CreditPack {
  id: string;
  credits: number;
  priceKRW: number;
  bonus?: string;
}

export const CREDIT_PACKS: CreditPack[] = [
  { id: "c100", credits: 100, priceKRW: 1000 },
  { id: "c550", credits: 550, priceKRW: 5000, bonus: "+10%" },
  { id: "c1200", credits: 1200, priceKRW: 10000, bonus: "+20%" },
];

/**
 * 기능별 크레딧 단가
 */
export const FEATURE_COST = {
  ocr: 5,
  coach: 10,
} as const;

/**
 * 무료 한도 (서버 check_free_quota() 함수와 동기화)
 */
export const FREE_QUOTA = {
  ocr: { limit: 5, window: "day" as const, label: "일 5회" },
  coach: { limit: 3, window: "month" as const, label: "월 3회" },
};

export const formatKRW = (amount: number) =>
  new Intl.NumberFormat("ko-KR", {
    style: "currency",
    currency: "KRW",
    maximumFractionDigits: 0,
  }).format(amount);
