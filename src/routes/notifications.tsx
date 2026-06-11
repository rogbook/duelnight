import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, Trash2, Check } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useI18n } from "@/i18n/language-context";

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
  head: () => {
    let locale = "ko";
    if (typeof window !== "undefined") {
      locale = localStorage.getItem("duelnight.i18n.locale") || "ko";
    }
    const titles: Record<string, string> = {
      ko: "알림 — DuelNight",
      en: "Notifications — DuelNight",
      ja: "通知 — DuelNight",
    };
    return {
      meta: [{ title: titles[locale] || titles.ko }],
    };
  },
  component: NotificationsPage,
});

function NotificationsPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { t, language } = useI18n();

  const dateLocale = language === "ja" ? "ja-JP" : language === "en" ? "en-US" : "ko-KR";

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
        <PageHeader
          title={t("notifications.title")}
          description={t("notifications.loginRequired")}
        />
        <Link to="/login" className="mt-4 inline-block text-sm text-primary hover:underline">
          {t("notifications.goToLogin")}
        </Link>
      </div>
    );
  }

  const markAllRead = async () => {
    await supabase
      .from("notifications")
      .update({ read_at: new Date().toISOString() })
      .is("read_at", null);
    qc.invalidateQueries({ queryKey: ["notifications"] });
    qc.invalidateQueries({ queryKey: ["notifications-all"] });
    toast.success(t("notifications.markAllReadSuccess"));
  };

  const remove = async (id: string) => {
    await supabase.from("notifications").delete().eq("id", id);
    qc.invalidateQueries({ queryKey: ["notifications-all"] });
    qc.invalidateQueries({ queryKey: ["notifications"] });
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <PageHeader title={t("notifications.title")} description={t("notifications.desc")}>
        <Button size="sm" variant="outline" onClick={markAllRead}>
          <Check className="mr-1 h-4 w-4" /> {t("notifications.markAllReadBtn")}
        </Button>
      </PageHeader>

      {data.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={Bell}
            title={t("notifications.emptyTitle")}
            description={t("notifications.emptyDesc")}
          />
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-border rounded-lg border border-border bg-card">
          {data.map((n) => (
            <li
              key={n.id}
              className={`flex items-start gap-3 p-4 ${n.read_at ? "" : "bg-accent/20"}`}
            >
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
                  {new Date(n.created_at).toLocaleString(dateLocale)}
                </p>
              </div>
              <button
                onClick={() => remove(n.id)}
                className="text-muted-foreground hover:text-destructive"
                aria-label={t("notifications.deleteBtn")}
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
