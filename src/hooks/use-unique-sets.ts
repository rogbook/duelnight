import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * card_sets 테이블에서 세트 목록을 불러옵니다.
 * game 필터를 지정하면 해당 게임에 속한 세트만 반환합니다.
 */
export function useUniqueSets(game?: string | null) {
  const [sets, setSets] = useState<string[]>([]);
  const [rows, setRows] = useState<{ name: string; game: string }[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshSets = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("card_sets")
        .select("name, game")
        .order("name", { ascending: true });
      if (game) query = query.eq("game", game);
      const { data, error } = await query;
      if (error) throw error;
      setRows((data ?? []).map((r) => ({ name: r.name, game: r.game as string })));
      setSets((data ?? []).map((r) => r.name));
    } catch (e) {
      console.error("[useUniqueSets] Error fetching sets:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshSets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game]);

  return { sets, rows, loading, refreshSets };
}
