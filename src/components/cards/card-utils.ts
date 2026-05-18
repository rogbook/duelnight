import type { Database } from "@/integrations/supabase/types";

type Game = Database["public"]["Enums"]["tcg_game"];
type CardType = Database["public"]["Enums"]["card_type"];

export type CardRow = {
  code: string;
  set_code: string;
  game: Game;
  name: string;
  type: CardType;
  colors: string[];
  cost: number | null;
  power: number | null;
  counter: number | null;
  attribute: string | null;
  rarity: string | null;
  effect: string | null;
  image_url: string | null;
  traits: string[];
};

/** 한글 색상 → 영문 코드 (덱빌더와 동일 키마) */
const COLOR_KO_TO_EN: Record<string, string> = {
  "적": "red", "빨강": "red", "빨간색": "red", "red": "red",
  "녹": "green", "초록": "green", "녹색": "green", "green": "green",
  "청": "blue", "파랑": "blue", "파란색": "blue", "blue": "blue",
  "자": "purple", "보라": "purple", "보라색": "purple", "purple": "purple",
  "흑": "black", "검정": "black", "검은색": "black", "black": "black",
  "황": "yellow", "노랑": "yellow", "노란색": "yellow", "yellow": "yellow",
};

export const VALID_COLORS = new Set(["red", "green", "blue", "purple", "black", "yellow"]);
export const VALID_RARITIES = new Set([
  "L", "C", "UC", "R", "SR", "SEC", "P", "SP", "TR", "AA",
]);
const CODE_RE = /^[A-Z0-9]{2,8}-[A-Z0-9]{2,5}$/;

export function normalizeColor(raw: string): string {
  const k = raw.trim().toLowerCase();
  return COLOR_KO_TO_EN[k] || COLOR_KO_TO_EN[raw.trim()] || k;
}

/** 행을 안전하게 자동 보정 (코드 대문자/공백 제거, 색상 한글→영문, 레어도 대문자) */
export function autoFixRow(r: CardRow): CardRow {
  const code = (r.code || "").trim().toUpperCase().replace(/\s+/g, "");
  const set_code = (r.set_code || "").trim().toUpperCase().replace(/\s+/g, "");
  const colors = (r.colors || []).map(normalizeColor).filter(Boolean);
  const rarity = r.rarity ? r.rarity.trim().toUpperCase() : r.rarity;
  return {
    ...r,
    code,
    set_code,
    colors: Array.from(new Set(colors)),
    rarity,
    name: (r.name || "").trim(),
    attribute: r.attribute?.trim() || null,
    effect: r.effect?.trim() || null,
  };
}

export type RowIssue = { field: string; message: string; level: "error" | "warn" };

export function validateRow(r: CardRow): RowIssue[] {
  const issues: RowIssue[] = [];
  if (!r.code) issues.push({ field: "code", message: "코드 필수", level: "error" });
  else if (!CODE_RE.test(r.code))
    issues.push({ field: "code", message: "코드 형식이 올바르지 않습니다 (예: OP01-001)", level: "warn" });
  if (!r.set_code) issues.push({ field: "set_code", message: "세트 필수", level: "error" });
  if (!r.name) issues.push({ field: "name", message: "이름 필수", level: "error" });
  for (const c of r.colors) {
    if (!VALID_COLORS.has(c))
      issues.push({ field: "colors", message: `미정의 색상: ${c}`, level: "warn" });
  }
  if (r.rarity && !VALID_RARITIES.has(r.rarity))
    issues.push({ field: "rarity", message: `미정의 레어도: ${r.rarity}`, level: "warn" });
  for (const k of ["cost", "power", "counter"] as const) {
    const v = r[k];
    if (v != null && (Number.isNaN(v) || v < 0))
      issues.push({ field: k, message: `${k} 음수/숫자 아님`, level: "error" });
  }
  return issues;
}

/** 입력 행 배열에서 중복 코드를 찾아 반환 (자기 행 인덱스 그룹) */
export function findInternalDuplicates(rows: CardRow[]): Map<string, number[]> {
  const map = new Map<string, number[]>();
  rows.forEach((r, i) => {
    const c = r.code?.trim().toUpperCase();
    if (!c) return;
    const arr = map.get(c) ?? [];
    arr.push(i);
    map.set(c, arr);
  });
  for (const [k, v] of map) if (v.length < 2) map.delete(k);
  return map;
}

/** 실패 행만 CSV로 다운로드 */
export function downloadRowsAsCsv(filename: string, rows: CardRow[]) {
  const headers = [
    "code", "set_code", "game", "name", "type", "colors",
    "cost", "power", "counter", "attribute", "rarity", "effect", "image_url",
  ] as const;
  const esc = (v: unknown) => {
    const s = v == null ? "" : Array.isArray(v) ? v.join("|") : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.join(",")];
  for (const r of rows) lines.push(headers.map((h) => esc((r as Record<string, unknown>)[h])).join(","));
  const blob = new Blob(["\uFEFF" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const DRAFT_KEY = "tcghub.cards.upload.draft.v1";
export function saveDraft(rows: CardRow[]) {
  try {
    if (rows.length === 0) localStorage.removeItem(DRAFT_KEY);
    else localStorage.setItem(DRAFT_KEY, JSON.stringify({ rows, savedAt: Date.now() }));
  } catch { /* ignore quota */ }
}
export function loadDraft(): { rows: CardRow[]; savedAt: number } | null {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed?.rows?.length) return null;
    return parsed;
  } catch { return null; }
}
export function clearDraft() { try { localStorage.removeItem(DRAFT_KEY); } catch { /* noop */ } }
