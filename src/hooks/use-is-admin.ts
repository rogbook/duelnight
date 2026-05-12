import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

/**
 * 현재 로그인한 사용자가 admin 역할을 갖는지 여부.
 * 비로그인 / 권한 없음 → false. RLS는 본인 역할만 조회 허용.
 */
export function useIsAdmin() {
  const { user, loading } = useAuth();
  const q = useQuery({
    queryKey: ["is-admin", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user!.id)
        .eq("role", "admin")
        .maybeSingle();
      return !!data;
    },
  });
  return {
    isAdmin: !!q.data,
    isLoading: loading || (!!user && q.isLoading),
  };
}
