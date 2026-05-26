import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export function useUniqueSets() {
  const [sets, setSets] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const refreshSets = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("cards")
        .select("set_code");
      if (error) throw error;
      
      const unique = Array.from(new Set(data?.map(c => c.set_code).filter(Boolean)))
        .sort((a, b) => a.localeCompare(b));
      setSets(unique);
    } catch (e) {
      console.error("[useUniqueSets] Error fetching unique sets:", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    refreshSets();
  }, []);

  return { sets, loading, refreshSets };
}
