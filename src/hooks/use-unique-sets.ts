import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * card_sets 테이블에서 세트 목록을 불러옵니다.
 * (과거에는 cards.set_code distinct로 추출했으나, 빈 세트도 관리하기 위해
 *  독립 테이블로 분리됨. DUMMY 카드 더 이상 필요 없음.)
 */
export function useUniqueSets() {
  const [sets, setSets] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshSets = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("card_sets")
        .select("name")
        .order("name", { ascending: true });
      if (error) throw error;
      setSets((data ?? []).map((r) => r.name));
    } catch (e) {
      console.error("[useUniqueSets] Error fetching sets:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshSets();
  }, []);

  return { sets, loading, refreshSets };
}
