import type { Database } from "@/integrations/supabase/types";

export type Game = string;

export type ColorOption = {
  id: string;
  label: string;
  // CSS color used for the chip dot
  hex: string;
};

export const COLORS_BY_GAME: Record<Game, ColorOption[]> = {
  optcg: [
    { id: "red", label: "적", hex: "#dc2626" },
    { id: "blue", label: "청", hex: "#2563eb" },
    { id: "yellow", label: "황", hex: "#eab308" },
    { id: "green", label: "녹", hex: "#16a34a" },
    { id: "black", label: "흑", hex: "#1f2937" },
    { id: "purple", label: "자", hex: "#7c3aed" },
  ],
  ptcg: [
    { id: "fire", label: "불", hex: "#ef4444" },
    { id: "water", label: "물", hex: "#3b82f6" },
    { id: "grass", label: "풀", hex: "#22c55e" },
    { id: "lightning", label: "전기", hex: "#facc15" },
    { id: "psychic", label: "초", hex: "#a855f7" },
    { id: "fighting", label: "격투", hex: "#b45309" },
    { id: "darkness", label: "악", hex: "#1f2937" },
    { id: "metal", label: "강철", hex: "#94a3b8" },
    { id: "esper", label: "에스퍼", hex: "#c084fc" },
    { id: "dragon", label: "드래곤", hex: "#0ea5e9" },
    { id: "normal", label: "노멀", hex: "#d1d5db" },
  ],
  dtcg: [
    { id: "red", label: "적", hex: "#dc2626" },
    { id: "blue", label: "청", hex: "#2563eb" },
    { id: "yellow", label: "황", hex: "#eab308" },
    { id: "green", label: "녹", hex: "#16a34a" },
    { id: "black", label: "흑", hex: "#1f2937" },
    { id: "purple", label: "자", hex: "#7c3aed" },
    { id: "white", label: "백", hex: "#f3f4f6" },
  ],
};

// 등록되지 않은 게임용 기본 색상 팔레트
export const DEFAULT_COLORS: ColorOption[] = [
  { id: "red", label: "적", hex: "#dc2626" },
  { id: "blue", label: "청", hex: "#2563eb" },
  { id: "yellow", label: "황", hex: "#eab308" },
  { id: "green", label: "녹", hex: "#16a34a" },
  { id: "black", label: "흑", hex: "#1f2937" },
  { id: "purple", label: "자", hex: "#7c3aed" },
  { id: "white", label: "백", hex: "#f3f4f6" },
];

export function colorsOf(game: Game): ColorOption[] {
  return COLORS_BY_GAME[game] ?? DEFAULT_COLORS;
}

const COLOR_TRANSLATIONS: Record<string, Record<string, string>> = {
  red: { ko: "적", en: "Red", ja: "赤" },
  blue: { ko: "청", en: "Blue", ja: "青" },
  yellow: { ko: "황", en: "Yellow", ja: "黄" },
  green: { ko: "녹", en: "Green", ja: "緑" },
  black: { ko: "흑", en: "Black", ja: "黒" },
  purple: { ko: "자", en: "Purple", ja: "紫" },
  white: { ko: "백", en: "White", ja: "白" },
  fire: { ko: "불", en: "Fire", ja: "炎" },
  water: { ko: "물", en: "Water", ja: "水" },
  grass: { ko: "풀", en: "Grass", ja: "草" },
  lightning: { ko: "전기", en: "Lightning", ja: "雷" },
  psychic: { ko: "초", en: "Psychic", ja: "超" },
  fighting: { ko: "격투", en: "Fighting", ja: "闘" },
  darkness: { ko: "악", en: "Darkness", ja: "悪" },
  metal: { ko: "강철", en: "Metal", ja: "鋼" },
  esper: { ko: "에스퍼", en: "Psychic (Esper)", ja: "エスパー" },
  dragon: { ko: "드래곤", en: "Dragon", ja: "ドラゴン" },
  normal: { ko: "노멀", en: "Normal", ja: "ノーマル" },
};

// Games that support a "리더" concept (등록 외 게임은 false)
export const HAS_LEADER: Record<Game, boolean> = {
  optcg: true,
  ptcg: false,
  dtcg: false,
};

// Games requiring at least 2 colors selected (등록 외 게임은 false)
export const REQUIRES_MULTI_COLOR: Record<Game, boolean> = {
  optcg: false,
  ptcg: false,
  dtcg: false,
};

export function hasLeader(game: Game): boolean {
  return HAS_LEADER[game] ?? false;
}

export function requiresMultiColor(game: Game): boolean {
  return REQUIRES_MULTI_COLOR[game] ?? false;
}

export function colorLabel(game: Game, id: string, lang: string = "ko"): string {
  const trans = COLOR_TRANSLATIONS[id];
  if (trans) {
    return trans[lang] || trans["ko"] || id;
  }
  return colorsOf(game).find((c) => c.id === id)?.label ?? id;
}

export function colorHex(game: Game, id: string): string {
  return colorsOf(game).find((c) => c.id === id)?.hex ?? "#9ca3af";
}
