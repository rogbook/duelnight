import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  loading: boolean;
}

const Ctx = createContext<AuthCtx>({ user: null, session: null, loading: true });

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  // 한 번이라도 세션이 잡힌 뒤에는 getSession()의 stale null이 덮어쓰지 못하도록 가드
  const hasSessionRef = useRef(false);

  useEffect(() => {
    // 1) 리스너 먼저 등록 (INITIAL_SESSION 포함 모든 이벤트 수신)
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      if (s) hasSessionRef.current = true;
      setSession(s);
      setLoading(false);
    });

    // 2) 그 다음 getSession()으로 초기 세션 동기화
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) {
        hasSessionRef.current = true;
        setSession(data.session);
      } else if (!hasSessionRef.current) {
        // 아직 세션이 한번도 없을 때만 null로 세팅 (로그인 직후 race로 덮어쓰기 방지)
        setSession(null);
      }
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  return (
    <Ctx.Provider value={{ session, user: session?.user ?? null, loading }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
