/**
 * 안 읽은 DM 대화 수. 받은편지함 쿼리(dm-conversations)를 공유하고
 * conversations 실시간 변경 시 자동 갱신한다. 사이드바/탭 배지에 사용.
 */
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { fetchConversations, isUnread } from "@/lib/dm";

export function useUnreadDmCount(): number {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data: conversations = [] } = useQuery({
    queryKey: ["dm-conversations", user?.id],
    enabled: !!user,
    queryFn: fetchConversations,
  });

  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`dm-unread-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        qc.invalidateQueries({ queryKey: ["dm-conversations"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, qc]);

  if (!user) return 0;
  return conversations.filter((c) => isUnread(c, user.id)).length;
}
