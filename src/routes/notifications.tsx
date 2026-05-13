import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, Trash2, Check } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

type Notification = {
  id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  read_at: string | null;
  created_at: string;
};

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [{ title: "알림 — TCG Hub" }],
  }),
  component: NotificationsPage,
});

function NotificationsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();

  const { data = [] } = useQuery({
    queryKey: ["notifications-all", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(200);
      if (error) throw error;
      return (data ?? []) as Notification[];
    },
  });

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-3xl px-6 py-8">
        <PageHeader title="알림" description="로그인이 필요합니다" />
        <Link to="/login" className="mt-4 inline-block text-sm text-primary hover:underline">
          로그인하러 가기 →
        </Link>
      </div>
    );
  }

  const markAllRead = async () => {
    await supabase.from("notifications").update({ read_at: new Date().toISOString() }).is("read_at", null);
    qc.invalidateQueries({ queryKey: ["notifications"] });
    qc.invalidateQueries({ queryKey: ["notifications-all"] });
    toast.success("모두 읽음 처리했어요");
  };

  const remove = async (id: string) => {
    await supabase.from("notifications").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["notifications-all"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <PageHeader title="알림" description="새 일정·즐겨찾기 변경 등 알림 모음">
        <Button size="sm" variant="outline" onClick={markAllRead}>
          <Check className="mr-1 h-4 w-4" /> 모두 읽음
        </Button>
      </PageHeader>

      {data.length === 0 ? (
        <div className="mt-6">
          <EmptyState icon={Bell} title="알림이 없어요" description="새 일정이 등록되면 여기에 표시됩니다." />
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-border rounded-lg border border-border bg-card">
          {data.map((n) => (
            <li key={n.id} className={`flex items-start gap-3 p-4 ${n.read_at ? "" : "bg-accent/20"}`}>
              <div className="min-w-0 flex-1">
                {n.link ? (
                  <a href={n.link} className="text-sm font-medium hover:underline">
                    {n.title}
                  </a>
                ) : (
                  <p className="text-sm font-medium">{n.title}</p>
                )}
                {n.body && <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>}
                <p className="mt-1 text-[10px] text-muted-foreground">
                  {new Date(n.created_at).toLocaleString("ko-KR")}
                </p>
              </div>
              <button
                onClick={() => remove(n.id)}
                className="text-muted-foreground hover:text-destructive"
                aria-label="삭제"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
