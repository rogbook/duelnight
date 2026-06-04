/**
 * 시즌 정의 — 달력 정렬 2개월 시즌.
 *
 * 시즌 경계: 1-2월 / 3-4월 / 5-6월 / 7-8월 / 9-10월 / 11-12월
 * (docs/INTRO_HOME_REDESIGN.md §1)
 *
 * 인트로/홈/리더보드가 동일한 시즌 기준을 공유하도록 단일 소스로 사용한다.
 */

/** 현재(또는 주어진 시점) 시즌의 시작 시각. */
export function getSeasonStart(now: Date = new Date()): Date {
  const m = now.getUTCMonth(); // 0..11
  const startMonth = m - (m % 2); // 0,2,4,6,8,10
  return new Date(Date.UTC(now.getUTCFullYear(), startMonth, 1));
}

/** 다음 시즌 시작 시각(= 현재 시즌 종료). */
export function getSeasonEnd(now: Date = new Date()): Date {
  const start = getSeasonStart(now);
  return new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 2, 1));
}

/** DB 쿼리(played_at >= ...)용 ISO 문자열. */
export function getSeasonStartISO(now: Date = new Date()): string {
  return getSeasonStart(now).toISOString();
}

/** 시즌 라벨. 예: 2026년 3-4월 → "2026 S2". (S1~S6) */
export function getSeasonLabel(now: Date = new Date()): string {
  const start = getSeasonStart(now);
  const half = Math.floor(start.getUTCMonth() / 2) + 1; // 1..6
  return `${start.getUTCFullYear()} S${half}`;
}

/** 시즌 종료까지 남은 일수(올림). */
export function getDaysLeftInSeason(now: Date = new Date()): number {
  const end = getSeasonEnd(now).getTime();
  return Math.max(0, Math.ceil((end - now.getTime()) / (24 * 60 * 60 * 1000)));
}
