import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Send, MoreVertical, Ban, Flag, ShieldOff, LogIn } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useI18n } from "@/i18n/language-context";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { displayImageSrc } from "@/lib/image-proxy";
import { useIsOnline } from "@/hooks/use-online-presence";
import {
  fetchConversation,
  fetchMessages,
  fetchProfiles,
  sendMessage,
  markRead,
  blockUser,
  unblockUser,
  isBlocked,
  reportUser,
  otherUserId,
  theirReadAt,
  type DMMessage,
  type DMProfile,
} from "@/lib/dm";

export const Route = createFileRoute("/messages/$id")({
  component: ThreadPage,
});

function ThreadPage() {
  const { id } = Route.useParams();
  const { user, loading } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const { data: conversation } = useQuery({
    queryKey: ["dm-conversation", id],
    enabled: !!user,
    queryFn: () => fetchConversation(id),
  });

  const otherId = useMemo(
    () => (conversation && user ? otherUserId(conversation, user.id) : null),
    [conversation, user],
  );

  const { data: profiles = {} } = useQuery({
    queryKey: ["dm-profiles", otherId ? [otherId] : []],
    enabled: !!otherId,
    queryFn: () => fetchProfiles(otherId ? [otherId] : []),
  });
  const other: DMProfile | undefined = otherId ? profiles[otherId] : undefined;

  const { data: messages = [] } = useQuery({
    queryKey: ["dm-messages", id],
    enabled: !!user,
    queryFn: () => fetchMessages(id),
  });

  const { data: blocked = false, refetch: refetchBlocked } = useQuery({
    queryKey: ["dm-blocked", otherId],
    enabled: !!otherId,
    queryFn: () => (otherId ? isBlocked(otherId) : Promise.resolve(false)),
  });

  // 진입/메시지 변경 시 읽음 처리 + 스크롤
  useEffect(() => {
    if (!user) return;
    markRead(id).then(() => qc.invalidateQueries({ queryKey: ["dm-conversations"] }));
  }, [id, user, messages.length, qc]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // 실시간: 새 메시지 / 읽음(상대) 갱신
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`dm-thread-${id}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${id}` },
        () => qc.invalidateQueries({ queryKey: ["dm-messages", id] }),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "conversations", filter: `id=eq.${id}` },
        () => qc.invalidateQueries({ queryKey: ["dm-conversation", id] }),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [id, user, qc]);

  // 온라인(접속 중) 표시: 전역 presence
  const online = useIsOnline(otherId);

  const send = async () => {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    try {
      await sendMessage(id, body);
      setDraft("");
      qc.invalidateQueries({ queryKey: ["dm-messages", id] });
      qc.invalidateQueries({ queryKey: ["dm-conversations"] });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setSending(false);
    }
  };

  const onBlock = async () => {
    if (!otherId) return;
    if (!confirm(t("dm.blockConfirm"))) return;
    try {
      await blockUser(otherId);
      toast.success(t("dm.blocked"));
      refetchBlocked();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  const onUnblock = async () => {
    if (!otherId) return;
    await unblockUser(otherId);
    toast.success(t("dm.unblocked"));
    refetchBlocked();
  };

  const onReport = async () => {
    if (!otherId) return;
    const reason = window.prompt(t("dm.reportPrompt"));
    if (reason === null) return;
    try {
      await reportUser(otherId, id, reason.trim());
      toast.success(t("dm.reported"));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };

  if (loading) {
    return <div className="mx-auto max-w-2xl px-4 py-6 text-sm text-muted-foreground">{t("common.loading", "불러오는 중…")}</div>;
  }
  if (!user) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 text-center">
        <LogIn className="mx-auto h-8 w-8 text-muted-foreground" />
        <p className="mt-3 text-sm text-muted-foreground">{t("dm.loginRequiredDesc")}</p>
        <Button asChild className="mt-4"><Link to="/login">{t("dm.goLogin")}</Link></Button>
      </div>
    );
  }

  // 상대 읽음 시각(내 마지막 메시지 읽었는지 판정)
  const theirRead = conversation ? new Date(theirReadAt(conversation, user.id)).getTime() : 0;
  const lastMine = [...messages].reverse().find((m) => m.sender_id === user.id);

  const otherName = other?.display_name ?? other?.username ?? t("dm.unknownUser");
  const avatarSrc = displayImageSrc(other?.avatar_url);

  return (
    <div className="mx-auto flex h-[calc(100dvh-3.5rem)] w-full max-w-2xl flex-col px-0 sm:px-4">
      {/* 헤더 */}
      <div className="sticky top-0 z-10 flex items-center gap-3 border-b border-border bg-background/90 px-3 py-2 backdrop-blur">
        <Link to="/messages" className="rounded-lg p-2 text-muted-foreground hover:bg-accent hover:text-foreground">
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <div className="relative">
          <div className="h-9 w-9 overflow-hidden rounded-full bg-muted flex items-center justify-center text-sm font-bold text-muted-foreground">
            {avatarSrc ? <img src={avatarSrc} alt="" className="h-full w-full object-cover" /> : otherName.charAt(0).toUpperCase()}
          </div>
          {online && (
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-background bg-green-500" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold">{otherName}</p>
          <p className="text-[11px] text-muted-foreground">{online ? t("dm.online") : t("dm.offline")}</p>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon"><MoreVertical className="h-4 w-4" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {blocked ? (
              <DropdownMenuItem onClick={onUnblock}>
                <ShieldOff className="mr-2 h-4 w-4" /> {t("dm.unblock")}
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem onClick={onBlock} className="text-destructive focus:text-destructive">
                <Ban className="mr-2 h-4 w-4" /> {t("dm.block")}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={onReport}>
              <Flag className="mr-2 h-4 w-4" /> {t("dm.report")}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* 메시지 목록 */}
      <div className="flex-1 space-y-2 overflow-y-auto px-3 py-4">
        {messages.length === 0 ? (
          <p className="py-10 text-center text-xs text-muted-foreground">{t("dm.startConversation")}</p>
        ) : (
          messages.map((m: DMMessage) => {
            const mine = m.sender_id === user.id;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[78%] rounded-2xl px-3 py-2 text-sm ${
                  mine ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted text-foreground"
                }`}>
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={`mt-0.5 text-right text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        {/* 읽음 표시 (내 마지막 메시지를 상대가 읽음) */}
        {lastMine && theirRead >= new Date(lastMine.created_at).getTime() && (
          <p className="pr-1 text-right text-[10px] text-muted-foreground">{t("dm.read")}</p>
        )}
        <div ref={endRef} />
      </div>

      {/* 입력 */}
      {blocked ? (
        <div className="border-t border-border bg-muted/40 px-4 py-3 text-center text-xs text-muted-foreground">
          {t("dm.blockedNotice")}{" "}
          <button onClick={onUnblock} className="font-semibold text-primary underline">{t("dm.unblock")}</button>
        </div>
      ) : (
        <div className="flex items-end gap-2 border-t border-border bg-background px-3 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            placeholder={t("dm.inputPlaceholder")}
            rows={1}
            maxLength={4000}
            className="max-h-32 min-h-[40px] flex-1 resize-none rounded-2xl border border-border bg-card px-3 py-2 text-sm outline-none focus:border-primary"
          />
          <Button onClick={send} disabled={sending || !draft.trim()} size="icon" className="h-10 w-10 shrink-0 rounded-full">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}
