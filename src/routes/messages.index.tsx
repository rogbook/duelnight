import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { MessageCircle, LogIn } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/i18n/language-context";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { displayImageSrc } from "@/lib/image-proxy";
import { useIsOnline } from "@/hooks/use-online-presence";
import {
  fetchConversations,
  fetchProfiles,
  otherUserId,
  isUnread,
  type DMConversation,
  type DMProfile,
} from "@/lib/dm";

export const Route = createFileRoute("/messages/")({
  head: () => ({
    meta: [
      { title: "메시지 — DuelNight" },
      { name: "description", content: "1:1 다이렉트 메시지." },
    ],
  }),
  component: MessagesInboxPage,
});

type TFunc = ReturnType<typeof useI18n>["t"];

function timeAgo(iso: string, t: TFunc): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return t("dm.now");
  if (m < 60) return t("dm.minAgo", { n: m });
  const h = Math.floor(m / 60);
  if (h < 24) return t("dm.hourAgo", { n: h });
  const d = Math.floor(h / 24);
  if (d < 7) return t("dm.dayAgo", { n: d });
  return new Date(iso).toLocaleDateString();
}

function Avatar({ profile, size = 44 }: { profile?: DMProfile; size?: number }) {
  const src = displayImageSrc(profile?.avatar_url);
  const initial = (profile?.display_name ?? profile?.username ?? "?").charAt(0).toUpperCase();
  return (
    <div
      className="relative shrink-0 overflow-hidden rounded-full bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground"
      style={{ width: size, height: size }}
    >
      {src ? (
        <img src={src} alt="" loading="lazy" className="h-full w-full object-cover" />
      ) : (
        initial
      )}
    </div>
  );
}

function OnlineDot({ userId }: { userId: string }) {
  const online = useIsOnline(userId);
  if (!online) return null;
  return <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card bg-green-500" />;
}

function MessagesInboxPage() {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();

  const { data: conversations = [] } = useQuery({
    queryKey: ["dm-conversations", user?.id],
    enabled: !!user,
    queryFn: fetchConversations,
  });

  const otherIds = useMemo(
    () => (user ? conversations.map((c) => otherUserId(c, user.id)) : []),
    [conversations, user],
  );

  const { data: profiles = {} } = useQuery({
    queryKey: ["dm-profiles", otherIds],
    enabled: otherIds.length > 0,
    queryFn: () => fetchProfiles(otherIds),
  });

  // 실시간: 대화/메시지 변경 시 목록 갱신
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`dm-inbox-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "conversations" }, () => {
        qc.invalidateQueries({ queryKey: ["dm-conversations"] });
      })
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, qc]);

  if (loading) {
    return <Shell t={t}><p className="text-sm text-muted-foreground">{t("common.loading", "불러오는 중…")}</p></Shell>;
  }

  if (!user) {
    return (
      <Shell t={t}>
        <EmptyState
          icon={LogIn}
          title={t("dm.loginRequired")}
          description={t("dm.loginRequiredDesc")}
        />
        <div className="mt-4 flex justify-center">
          <Button asChild>
            <Link to="/login">{t("dm.goLogin")}</Link>
          </Button>
        </div>
      </Shell>
    );
  }

  return (
    <Shell t={t}>
      {conversations.length === 0 ? (
        <EmptyState
          icon={MessageCircle}
          title={t("dm.emptyTitle")}
          description={t("dm.emptyDesc")}
        />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border bg-card">
          {conversations.map((c: DMConversation) => {
            const oid = otherUserId(c, user.id);
            const p = profiles[oid];
            const unread = isUnread(c, user.id);
            const mine = c.last_sender_id === user.id;
            return (
              <li key={c.id}>
                <Link
                  to="/messages/$id"
                  params={{ id: c.id }}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40"
                >
                  <div className="relative">
                    <Avatar profile={p} />
                    <OnlineDot userId={oid} />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`truncate text-sm ${unread ? "font-bold" : "font-medium"}`}>
                        {p?.display_name ?? p?.username ?? t("dm.unknownUser")}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">
                        {timeAgo(c.last_message_at, t)}
                      </span>
                    </div>
                    <p className={`truncate text-xs ${unread ? "text-foreground" : "text-muted-foreground"}`}>
                      {mine && <span className="text-muted-foreground">{t("dm.youPrefix")} </span>}
                      {c.last_message ?? t("dm.noMessages")}
                    </p>
                  </div>
                  {unread && <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-primary" />}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </Shell>
  );
}

function Shell({ t, children }: { t: TFunc; children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-6 sm:px-6">
      <PageHeader title={t("dm.title")} description={t("dm.desc")} />
      <div className="mt-6">{children}</div>
    </div>
  );
}
