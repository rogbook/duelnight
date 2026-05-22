import { Bell, Check } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Button } from "@/components/ui/button";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export function NotificationBell() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data = [], refetch } = useQuery({
    queryKey: ["notifications", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(15);
      if (error) throw error;
      return (data ?? []) as Notification[];
    },
    refetchInterval: 60_000,
  });

  // Realtime
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`notif-${user.id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => refetch(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, refetch]);

  if (!user) return null;

  const unread = data.filter((n) => !n.read_at).length;

  const markAllRead = async () => {
    if (!user) return;
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", user.id)
      .is("read_at", null);
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="relative inline-flex h-8 w-8 items-center justify-center rounded-md border border-border hover:bg-accent"
          aria-label="알림"
        >
          <Bell className="h-4 w-4" />
          {unread > 0 && (
            <span className="absolute -right-1 -top-1 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
              {unread > 9 ? "9+" : unread}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 p-0">
        <div className="flex items-center justify-between border-b border-border px-3 py-2">
          <p className="text-sm font-semibold">알림</p>
          {unread > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={markAllRead}>
              <Check className="mr-1 h-3 w-3" />
              모두 읽음
            </Button>
          )}
        </div>
        <ul className="max-h-96 overflow-y-auto">
          {data.length === 0 ? (
            <li className="px-3 py-6 text-center text-xs text-muted-foreground">
              새 알림이 없어요
            </li>
          ) : (
            data.map((n) => {
              const Inner = (
                <div className={`px-3 py-2 text-sm ${n.read_at ? "opacity-60" : "bg-accent/30"}`}>
                  <p className="font-medium">{n.title}</p>
                  {n.body && <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>}
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {new Date(n.created_at).toLocaleString("ko-KR")}
                  </p>
                </div>
              );
              return (
                <li key={n.id} className="border-b border-border last:border-b-0">
                  {n.link ? (
                    <a
                      href={n.link}
                      className="block hover:bg-accent/50"
                      onClick={async () => {
                        if (!n.read_at) {
                          await supabase
                            .from("notifications")
                            .update({ read_at: new Date().toISOString() })
                            .eq("id", n.id);
                          qc.invalidateQueries({ queryKey: ["notifications"] });
                        }
                      }}
                    >
                      {Inner}
                    </a>
                  ) : (
                    Inner
                  )}
                </li>
              );
            })
          )}
        </ul>
        <div className="border-t border-border p-2 text-center">
          <Link
            to="/notifications"
            className="text-xs text-primary hover:underline"
          >
            전체 보기
          </Link>
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
