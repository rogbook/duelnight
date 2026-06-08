/**
 * 전역 온라인 표시. 로그인 사용자는 단일 presence 채널("online-users")에 참여해
 * 자신을 track하고, 현재 접속 중인 사용자 id 집합을 컨텍스트로 제공한다.
 * 어디서든 useIsOnline(userId)로 온라인 여부를 읽는다.
 */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

const OnlineContext = createContext<Set<string>>(new Set());

export function OnlinePresenceProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [online, setOnline] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!user) {
      setOnline(new Set());
      return;
    }
    const ch = supabase.channel("online-users", { config: { presence: { key: user.id } } });
    ch.on("presence", { event: "sync" }, () => {
      setOnline(new Set(Object.keys(ch.presenceState())));
    });
    ch.subscribe((status: string) => {
      if (status === "SUBSCRIBED") ch.track({ online_at: new Date().toISOString() });
    });
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user]);

  return <OnlineContext.Provider value={online}>{children}</OnlineContext.Provider>;
}

export function useIsOnline(userId?: string | null): boolean {
  const set = useContext(OnlineContext);
  return !!userId && set.has(userId);
}
