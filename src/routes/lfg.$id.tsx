import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  MapPin,
  Clock,
  User as UserIcon,
  Hash,
  Tag,
  Zap,
  MessageSquare,
  Check,
  X as XIcon,
  Send,
} from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { GAME_LABEL } from "@/lib/match-stats";
import { CATEGORY_LABEL } from "./lfg.index";
import type { Database } from "@/integrations/supabase/types";

type Post = Database["public"]["Tables"]["lfg_posts"]["Row"];
type Profile = { display_name: string | null; username: string | null };
type Participant = {
  id: string;
  user_id: string;
  status: "pending" | "accepted" | "rejected" | "cancelled";
  message: string | null;
  created_at: string;
  profile?: Profile | null;
};
type ChatMsg = {
  id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
};

const SITE = "https://duelnight.app";

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export const Route = createFileRoute("/lfg/$id")({
  loader: async ({ params }) => {
    const { data, error } = await supabase
      .from("lfg_posts")
      .select("*")
      .eq("id", params.id)
      .maybeSingle();
    if (error) throw error;
    if (!data) throw notFound();
    const { data: prof } = await supabase
      .from("profiles")
      .select("display_name, username")
      .eq("id", data.user_id)
      .maybeSingle();
    return { post: data as Post, profile: (prof ?? null) as Profile | null };
  },
  head: ({ loaderData }) => {
    const p = loaderData?.post;
    if (!p) return { meta: [{ title: "글을 찾을 수 없음 — DuelNight" }] };
    const title = `${p.title} — LFG · DuelNight`;
    const desc = (p.body ?? `${GAME_LABEL[p.game]} · ${p.location ?? "지역 미지정"}`)
      .replace(/\s+/g, " ")
      .slice(0, 150);
    const url = `${SITE}/lfg/${p.id}`;
    return {
      meta: [
        { title },
        { name: "description", content: desc },
        { property: "og:title", content: title },
        { property: "og:description", content: desc },
        { property: "og:type", content: "article" },
        { property: "og:url", content: url },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: LfgDetailPage,
  notFoundComponent: () => (
    <div className="mx-auto max-w-3xl px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">글을 찾을 수 없어요</h1>
      <Link to="/lfg" className="mt-4 inline-flex items-center gap-1 text-sm text-primary hover:underline">
        <ArrowLeft className="h-4 w-4" /> LFG 목록으로
      </Link>
    </div>
  ),
});

function LfgDetailPage() {
  const { post: initialPost, profile } = Route.useLoaderData();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [chatWith, setChatWith] = useState<{ userId: string; name: string } | null>(null);

  const { data: post = initialPost, refetch: refetchPost } = useQuery({
    queryKey: ["lfg-post", initialPost.id],
    queryFn: async () => {
      const { data } = await supabase.from("lfg_posts").select("*").eq("id", initialPost.id).maybeSingle();
      return (data ?? initialPost) as Post;
    },
    initialData: initialPost,
  });

  const isAuthor = user?.id === post.user_id;
  const closed = post.status === "closed";

  // Store info
  const { data: store } = useQuery({
    queryKey: ["lfg-post-store", post.store_id],
    enabled: !!post.store_id,
    queryFn: async () => {
      const { data } = await supabase
        .from("stores")
        .select("id, name, address, phone, url")
        .eq("id", post.store_id!)
        .maybeSingle();
      return data;
    },
  });

  // Participants (visible to author or to the participant themselves)
  const { data: participants = [], refetch: refetchParts } = useQuery({
    queryKey: ["lfg-participants", post.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lfg_participants")
        .select("*")
        .eq("post_id", post.id)
        .order("created_at");
      if (error) throw error;
      const rows = (data ?? []) as Omit<Participant, "profile">[];
      const ids = Array.from(new Set(rows.map((r) => r.user_id)));
      let map = new Map<string, Profile>();
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, display_name, username")
          .in("id", ids);
        map = new Map((profs ?? []).map((p) => [p.id, { display_name: p.display_name, username: p.username }]));
      }
      return rows.map((r) => ({ ...r, profile: map.get(r.user_id) ?? null })) as Participant[];
    },
  });

  const myParticipant = participants.find((p) => p.user_id === user?.id);
  const acceptedCount = participants.filter((p) => p.status === "accepted").length;

  const join = async (message?: string) => {
    if (!user) return;
    const { error } = await supabase.from("lfg_participants").insert({
      post_id: post.id,
      user_id: user.id,
      message: message?.trim() || null,
    });
    if (error) toast.error(error.message);
    else {
      toast.success("참여 신청 완료");
      refetchParts();
    }
  };

  const cancelJoin = async () => {
    if (!myParticipant) return;
    const { error } = await supabase.from("lfg_participants").delete().eq("id", myParticipant.id);
    if (error) toast.error(error.message);
    else refetchParts();
  };

  const updateParticipant = async (id: string, status: Participant["status"]) => {
    const { error } = await supabase.from("lfg_participants").update({ status }).eq("id", id);
    if (error) toast.error(error.message);
    else refetchParts();
  };

  const toggleClose = async () => {
    const next = closed ? "open" : "closed";
    const { error } = await supabase.from("lfg_posts").update({ status: next }).eq("id", post.id);
    if (error) toast.error(error.message);
    else {
      toast.success(next === "closed" ? "모집 완료로 변경" : "다시 모집 중");
      refetchPost();
      qc.invalidateQueries({ queryKey: ["lfg-posts"] });
    }
  };

  return (
    <div className="mx-auto w-full max-w-3xl px-6 py-8">
      <Link to="/lfg" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> LFG
      </Link>

      <div className="mt-4 rounded-lg border border-border bg-card p-6">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {GAME_LABEL[post.game]}
          </span>
          <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
            {CATEGORY_LABEL[post.category as keyof typeof CATEGORY_LABEL]}
          </span>
          {post.quick_match && (
            <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">
              <Zap className="h-2.5 w-2.5" /> 퀵 매칭
            </span>
          )}
          <span
            className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
              closed ? "bg-muted text-muted-foreground" : "bg-emerald-500/15 text-emerald-600"
            }`}
          >
            {closed ? "모집 완료" : "모집 중"}
          </span>
        </div>
        <h1 className="mt-2 text-2xl font-semibold">{post.title}</h1>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <UserIcon className="h-3.5 w-3.5" />
            {profile?.display_name || profile?.username || "익명"}
          </span>
          {(store || post.location) && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" />
              {store ? (
                <Link to="/stores/$id" params={{ id: store.id }} className="hover:underline">
                  {store.name}
                </Link>
              ) : (
                post.location
              )}
            </span>
          )}
          {post.meet_at && (
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3.5 w-3.5" />
              {formatDateTime(post.meet_at)}
            </span>
          )}
          {post.games_count != null && (
            <span className="inline-flex items-center gap-1">
              <Hash className="h-3.5 w-3.5" /> {post.games_count}판
            </span>
          )}
          {post.duration_minutes != null && (
            <span className="inline-flex items-center gap-1">
              <Tag className="h-3.5 w-3.5" /> {post.duration_minutes}분
            </span>
          )}
        </div>

        {post.body && (
          <p className="mt-5 whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
            {post.body}
          </p>
        )}

        {(post.contact || post.kakao_link) && (
          <div className="mt-5 space-y-2 rounded-md bg-muted/50 p-3 text-sm">
            {post.contact && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground">연락 방법</p>
                <p>{post.contact}</p>
              </div>
            )}
            {post.kakao_link && (
              <div>
                <p className="text-xs font-semibold text-muted-foreground">카카오톡 오픈채팅</p>
                <a
                  href={post.kakao_link}
                  target="_blank"
                  rel="noreferrer noopener"
                  className="break-all text-primary hover:underline"
                >
                  {post.kakao_link}
                </a>
              </div>
            )}
          </div>
        )}

        {/* Action bar */}
        <div className="mt-6 flex flex-wrap gap-2">
          {!user && (
            <Button asChild size="sm">
              <Link to="/login">로그인하고 참여</Link>
            </Button>
          )}
          {user && !isAuthor && !closed && (
            <>
              {!myParticipant ? (
                <JoinButton onJoin={join} quick={post.quick_match} />
              ) : myParticipant.status === "pending" ? (
                <Button size="sm" variant="outline" onClick={cancelJoin}>
                  신청 취소 (대기 중)
                </Button>
              ) : myParticipant.status === "accepted" ? (
                <span className="inline-flex items-center rounded-md bg-emerald-500/15 px-3 py-1.5 text-sm font-medium text-emerald-600">
                  참여 수락됨
                </span>
              ) : myParticipant.status === "rejected" ? (
                <span className="inline-flex items-center rounded-md bg-destructive/15 px-3 py-1.5 text-sm text-destructive">
                  거절됨
                </span>
              ) : null}

              {!post.quick_match && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    setChatWith({
                      userId: post.user_id,
                      name: profile?.display_name || profile?.username || "작성자",
                    })
                  }
                >
                  <MessageSquare className="mr-1 h-4 w-4" /> 작성자에게 채팅
                </Button>
              )}
            </>
          )}
          {isAuthor && (
            <Button size="sm" variant="outline" onClick={toggleClose}>
              {closed ? "다시 모집 시작" : "모집 마감"}
            </Button>
          )}
        </div>

        {acceptedCount > 0 && (
          <p className="mt-3 text-xs text-muted-foreground">
            현재 수락된 참여자 {acceptedCount}명
            {post.games_count ? ` · ${post.games_count}판 예정` : ""}
          </p>
        )}
      </div>

      {/* Author: participant management */}
      {isAuthor && (
        <section className="mt-6 rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">참여 신청 ({participants.length})</h2>
          {participants.length === 0 ? (
            <p className="text-sm text-muted-foreground">아직 신청자가 없어요.</p>
          ) : (
            <ul className="space-y-2">
              {participants.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border p-3">
                  <div className="min-w-0">
                    <div className="text-sm font-medium">
                      {p.profile?.display_name || p.profile?.username || "익명"}
                    </div>
                    {p.message && (
                      <div className="mt-1 text-xs text-muted-foreground">"{p.message}"</div>
                    )}
                    <div className="mt-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {p.status}
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {!post.quick_match && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          setChatWith({
                            userId: p.user_id,
                            name: p.profile?.display_name || p.profile?.username || "신청자",
                          })
                        }
                      >
                        <MessageSquare className="h-4 w-4" />
                      </Button>
                    )}
                    {p.status !== "accepted" && (
                      <Button size="sm" variant="outline" onClick={() => updateParticipant(p.id, "accepted")}>
                        <Check className="mr-1 h-4 w-4" /> 수락
                      </Button>
                    )}
                    {p.status !== "rejected" && (
                      <Button size="sm" variant="ghost" onClick={() => updateParticipant(p.id, "rejected")}>
                        <XIcon className="mr-1 h-4 w-4" /> 거절
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* Chat dialog */}
      {user && chatWith && (
        <ChatDialog
          open={!!chatWith}
          onOpenChange={(o) => !o && setChatWith(null)}
          postId={post.id}
          meId={user.id}
          otherId={chatWith.userId}
          otherName={chatWith.name}
        />
      )}
    </div>
  );
}

function JoinButton({ onJoin, quick }: { onJoin: (msg?: string) => void; quick: boolean }) {
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  if (quick) {
    return (
      <Button size="sm" onClick={() => onJoin()}>
        퀵 참여 신청
      </Button>
    );
  }
  return (
    <>
      <Button size="sm" onClick={() => setOpen(true)}>
        참여 신청
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>참여 신청 메시지 (선택)</DialogTitle>
          </DialogHeader>
          <Textarea
            value={msg}
            onChange={(e) => setMsg(e.target.value)}
            placeholder="간단히 자신을 소개해 보세요"
            rows={3}
            maxLength={300}
          />
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              취소
            </Button>
            <Button
              onClick={() => {
                onJoin(msg);
                setOpen(false);
                setMsg("");
              }}
            >
              신청
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function ChatDialog({
  open,
  onOpenChange,
  postId,
  meId,
  otherId,
  otherName,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  postId: string;
  meId: string;
  otherId: string;
  otherName: string;
}) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const { data: messages = [], refetch } = useQuery({
    queryKey: ["lfg-chat", postId, meId, otherId],
    enabled: open,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lfg_messages")
        .select("*")
        .eq("post_id", postId)
        .or(
          `and(sender_id.eq.${meId},recipient_id.eq.${otherId}),and(sender_id.eq.${otherId},recipient_id.eq.${meId})`,
        )
        .order("created_at");
      if (error) throw error;
      return (data ?? []) as ChatMsg[];
    },
    refetchInterval: open ? 4000 : false,
  });

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, open]);

  const send = async () => {
    if (!body.trim()) return;
    setSending(true);
    const { error } = await supabase.from("lfg_messages").insert({
      post_id: postId,
      sender_id: meId,
      recipient_id: otherId,
      body: body.trim(),
    });
    setSending(false);
    if (error) toast.error(error.message);
    else {
      setBody("");
      refetch();
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{otherName}님과의 채팅</DialogTitle>
        </DialogHeader>
        <div className="max-h-[50vh] min-h-[200px] space-y-2 overflow-y-auto rounded-md border border-border bg-muted/30 p-3">
          {messages.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">
              아직 메시지가 없어요. 먼저 인사를 건네 보세요.
            </p>
          ) : (
            messages.map((m) => {
              const mine = m.sender_id === meId;
              return (
                <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className={`max-w-[80%] rounded-lg px-3 py-2 text-sm ${
                      mine ? "bg-primary text-primary-foreground" : "bg-card border border-border"
                    }`}
                  >
                    <p className="whitespace-pre-wrap break-words">{m.body}</p>
                    <p className={`mt-1 text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                      {formatTime(m.created_at)}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={endRef} />
        </div>
        <div className="flex gap-2">
          <Input
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="메시지 입력"
            maxLength={500}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
          />
          <Button onClick={send} disabled={sending || !body.trim()} size="icon">
            <Send className="h-4 w-4" />
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
