/**
 * 동적 게임 목록 — games 테이블에서 불러와 모든 탭의 게임 드롭다운에 공통 사용.
 * games 테이블에 추가된 게임이 자동으로 전 탭에 노출된다.
 * (불러오기 전/실패 시 기본 3종 fallback)
 */
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useI18n } from "@/i18n/language-context";

export interface GameOption {
  code: string;
  label_ko: string;
  label_en: string;
  label_ja: string;
  sort_order: number;
  is_builtin: boolean;
}

const FALLBACK_GAMES: GameOption[] = [
  { code: "optcg", label_ko: "원피스", label_en: "One Piece", label_ja: "ワンピース", sort_order: 10, is_builtin: true },
  { code: "ptcg", label_ko: "포켓몬", label_en: "Pokemon", label_ja: "ポケモン", sort_order: 20, is_builtin: true },
  { code: "dtcg", label_ko: "디지몬", label_en: "Digimon", label_ja: "デジモン", sort_order: 30, is_builtin: true },
];

export function gameLabelFrom(games: GameOption[], code: string, language: string): string {
  const g = games.find((x) => x.code === code);
  if (!g) return code;
  return language === "en" ? g.label_en : language === "ja" ? g.label_ja : g.label_ko;
}

export function useGames() {
  const { language } = useI18n();
  const { data } = useQuery({
    queryKey: ["games"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("games")
        .select("code, label_ko, label_en, label_ja, sort_order, is_builtin")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return (data ?? []) as GameOption[];
    },
    staleTime: 5 * 60_000,
  });

  const games = data && data.length > 0 ? data : FALLBACK_GAMES;
  const codes = games.map((g) => g.code);
  const labelOf = (code: string) => gameLabelFrom(games, code, language);

  return { games, codes, labelOf };
}
