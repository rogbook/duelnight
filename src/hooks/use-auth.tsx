import { createContext, useContext, useEffect, useState } from "react";
import type { AuthChangeEvent, Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface AuthCtx {
  user: User | null;
  session: Session | null;
  loading: boolean;
}

const Ctx = createContext<AuthCtx>({ user: null, session: null, loading: true });

export function AuthProvider({
  children,
  onAuthChange,
}: {
  children: React.ReactNode;
  onAuthChange?: (event: AuthChangeEvent, session: Session | null) => void;
}) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    let initialSessionLoaded = false;

    const { data: sub } = supabase.auth.onAuthStateChange((event, s) => {
      if (!alive) return;

      // INITIAL_SESSION can fire before persisted storage is fully restored during HMR.
      // Let getSession() own the first paint so the app doesn't briefly treat users as logged out.
      if (event === "INITIAL_SESSION" && !initialSessionLoaded) return;

      setSession(s);
      setLoading(false);

      if (event !== "INITIAL_SESSION" && onAuthChange) {
        window.setTimeout(() => {
          if (alive) onAuthChange(event, s);
        }, 0);
      }
    });

    supabase.auth.getSession().then(({ data, error }) => {
      if (!alive) return;
      initialSessionLoaded = true;
      setSession(error ? null : data.session);
      setLoading(false);
    });

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, [onAuthChange]);

  return (
    <Ctx.Provider value={{ session, user: session?.user ?? null, loading }}>
      {children}
    </Ctx.Provider>
  );
}

export const useAuth = () => useContext(Ctx);
