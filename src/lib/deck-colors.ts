import type { Database } from "@/integrations/supabase/types";

export type Game = Database["public"]["Enums"]["tcg_game"];

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

// Games that support a "리더" concept
export const HAS_LEADER: Record<Game, boolean> = {
  optcg: true,
  ptcg: false,
  dtcg: false,
};

// Games requiring at least 2 colors selected
export const REQUIRES_MULTI_COLOR: Record<Game, boolean> = {
  optcg: true,
  ptcg: false,
  dtcg: true,
};

export function colorLabel(game: Game, id: string): string {
  return COLORS_BY_GAME[game].find((c) => c.id === id)?.label ?? id;
}

export function colorHex(game: Game, id: string): string {
  return COLORS_BY_GAME[game].find((c) => c.id === id)?.hex ?? "#9ca3af";
}
