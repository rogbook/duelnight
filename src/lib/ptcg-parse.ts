// PTCG 텍스트(effect/attribute) 파싱 유틸
// 약점/저항/후퇴 비용 등에서 색상(타입) 라벨을 정확히 추출한다.

import { COLORS_BY_GAME } from "./deck-colors";

const PTCG_COLOR_LABELS = COLORS_BY_GAME.ptcg.map((c) => c.label);
// 라벨 길이 내림차순(에스퍼/드래곤/격투/강철/노멀/전기 등 두 글자 우선)
const COLOR_ALT = [...PTCG_COLOR_LABELS].sort((a, b) => b.length - a.length).join("|");

// 콜론/공백/괄호 등을 허용하고, 라벨 직후 ×N, xN, -NN 같은 수치를 선택적으로 허용
const WEAK_RE = new RegExp(`약점[^\\S\\r\\n]*[:：]?[^\\S\\r\\n]*[\\(\\[]?\\s*(${COLOR_ALT})`, "g");
const RESIST_RE = new RegExp(`(?:저항력|저항)[^\\S\\r\\n]*[:：]?[^\\S\\r\\n]*[\\(\\[]?\\s*(${COLOR_ALT})`, "g");
const RETREAT_RE = new RegExp(`(?:후퇴(?:비용)?)[^\\S\\r\\n]*[:：]?[^\\S\\r\\n]*([●○\\d무]+)`, "g");

function extractMatches(re: RegExp, text: string): string[] {
  if (!text) return [];
  const out = new Set<string>();
  re.lastIndex = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    if (m[1]) out.add(m[1]);
  }
  return [...out];
}

export function getWeaknessColors(card: { effect?: string | null; attribute?: string | null }): string[] {
  const text = `${card.attribute ?? ""}\n${card.effect ?? ""}`;
  return extractMatches(WEAK_RE, text);
}

export function getResistanceColors(card: { effect?: string | null; attribute?: string | null }): string[] {
  const text = `${card.attribute ?? ""}\n${card.effect ?? ""}`;
  return extractMatches(RESIST_RE, text);
}

export function getRetreatCost(card: { effect?: string | null; attribute?: string | null }): number | null {
  const text = `${card.attribute ?? ""}\n${card.effect ?? ""}`;
  RETREAT_RE.lastIndex = 0;
  const m = RETREAT_RE.exec(text);
  if (!m) return null;
  const raw = m[1];
  // ●/무 기호 카운트 또는 숫자
  if (/^\d+$/.test(raw)) return parseInt(raw, 10);
  return [...raw].filter((ch) => ch === "●" || ch === "무" || ch === "○").length || null;
}

export function hasWeakness(card: { effect?: string | null; attribute?: string | null }, label: string): boolean {
  return getWeaknessColors(card).includes(label);
}

export function hasResistance(card: { effect?: string | null; attribute?: string | null }, label: string): boolean {
  return getResistanceColors(card).includes(label);
}
