import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, MessageSquare, Send } from "lucide-react";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";

const searchSchema = z.object({
  post: z.string().optional(),
  with: z.string().optional(),
});

export const Route = createFileRoute("/messages")({
  validateSearch: (s) => searchSchema.parse(s),
  head: () => ({
    meta: [
      { title: "메시지함 — TCG Hub" },
      { name: "description", content: "오프라인 매칭 게시글에서 주고받은 1:1 메시지를 한눈에 확인하세요." },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: MessagesPage,
});

type Msg = {
  id: string;
  post_id: string;
  sender_id: string;
  recipient_id: string;
  body: string;
  created_at: string;
  read_at: string | null;
};

type Conversation = {
  postId: string;
  otherId: string;
  lastBody: string;
  lastAt: string;
  unread: number;
  postTitle?: string | null;
  otherName?: string | null;
};

function MessagesPage() {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();

  const { data: conversations = [], refetch } = useQuery({
    queryKey: ["lfg-conversations", user?.id],
    enabled: !!user,
    queryFn: async () => {
      if (!user) return [];
      const { data, error } = await supabase
        .from("lfg_messages")
        .select("*")
        .or(`sender_id.eq.${user.id},recipient_id.eq.${user.id}`)
        .order("created_at", { ascending: false })
        .limit(500);
      if (error) throw error;
      const msgs = (data ?? []) as Msg[];

      const map = new Map<string, Conversation>();
      for (const m of msgs) {
        const otherId = m.sender_id === user.id ? m.recipient_id : m.sender_id;
        const key = `${m.post_id}::${otherId}`;
        const existing = map.get(key);
        const isUnread = !m.read_at && m.recipient_id === user.id;
        if (!existing) {
          map.set(key, {
            postId: m.post_id,
            otherId,
            lastBody: m.body,
            lastAt: m.created_at,
            unread: isUnread ? 1 : 0,
          });
        } else if (isUnread) {
          existing.unread += 1;
        }
      }
      const list = Array.from(map.values());

      // Hydrate post titles and profile names
      const postIds = Array.from(new Set(list.map((c) => c.postId)));
      const otherIds = Array.from(new Set(list.map((c) => c.otherId)));
      const [{ data: posts }, { data: profs }] = await Promise.all([
        postIds.length
          ? supabase.from("lfg_posts").select("id, title").in("id", postIds)
          : Promise.resolve({ data: [] as { id: string; title: string }[] }),
        otherIds.length
          ? supabase.from("profiles").select("id, display_name, username").in("id", otherIds)
          : Promise.resolve({ data: [] as { id: string; display_name: string | null; username: string | null }[] }),
      ]);
      const pmap = new Map((posts ?? []).map((p) => [p.id, p.title]));
      const umap = new Map(
        (profs ?? []).map((p) => [p.id, p.display_name || p.username || "익명"]),
      );
      return list.map((c) => ({
        ...c,
        postTitle: pmap.get(c.postId) ?? null,
        otherName: umap.get(c.otherId) ?? null,
      }));
    },
    refetchInterval: 30_000,
  });

  // Realtime - any new message refetches list
  useEffect(() => {
    if (!user) return;
    const ch = supabase
      .channel(`messages-list-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "lfg_messages" }, () => refetch())
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [user, refetch]);

  const active = useMemo(() => {
    if (!search.post || !search.with) return null;
    return { postId: search.post, otherId: search.with };
  }, [search]);

  if (loading) return null;
  if (!user) {
    return (
      <div className="mx-auto max-w-3xl px-6 py-16 text-center">
        <h1 className="text-xl font-semibold">메시지함</h1>
        <p className="mt-2 text-sm text-muted-foreground">메시지를 보려면 로그인하세요.</p>
        <Button asChild className="mt-4" size="sm">
          <Link to="/login">로그인</Link>
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <h1 className="text-xl font-semibold">메시지함</h1>
      <p className="mt-1 text-xs text-muted-foreground">오프라인 매칭에서 주고받은 1:1 대화입니다.</p>

      <div className="mt-4 grid gap-4 md:grid-cols-[280px_1fr]">
        {/* List */}
        <aside className={`rounded-lg border border-border bg-card ${active ? "hidden md:block" : ""}`}>
          {conversations.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">
              아직 주고받은 메시지가 없어요.
            </p>
          ) : (
            <ul className="divide-y divide-border">
              {conversations.map((c) => {
                const isActive =
                  active?.postId === c.postId && active?.otherId === c.otherId;
                return (
                  <li key={`${c.postId}-${c.otherId}`}>
                    <button
                      onClick={() =>
                        navigate({
                          to: "/messages",
                          search: { post: c.postId, with: c.otherId },
                        })
                      }
                      className={`w-full px-3 py-3 text-left transition-colors hover:bg-accent/50 ${
                        isActive ? "bg-accent/60" : ""
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <p className="truncate text-sm font-medium">{c.otherName || "익명"}</p>
                        {c.unread > 0 && (
                          <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-semibold text-primary-foreground">
                            {c.unread > 9 ? "9+" : c.unread}
                          </span>
                        )}
                      </div>
                      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
                        {c.postTitle || "(삭제된 게시글)"}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">{c.lastBody}</p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {new Date(c.lastAt).toLocaleString("ko-KR")}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </aside>

        {/* Conversation */}
        <section className={`rounded-lg border border-border bg-card ${active ? "" : "hidden md:flex md:items-center md:justify-center md:py-16"}`}>
          {active ? (
            <ConversationView
              meId={user.id}
              postId={active.postId}
              otherId={active.otherId}
              onBack={() => navigate({ to: "/messages", search: {} })}
              onSent={refetch}
            />
          ) : (
            <p className="text-sm text-muted-foreground">왼쪽에서 대화를 선택하세요.</p>
          )}
        </section>
      </div>
    </div>
  );
}

function ConversationView({
  meId,
  postId,
  otherId,
  onBack,
  onSent,
}: {
  meId: string;
  postId: string;
  otherId: string;
  onBack: () => void;
  onSent: () => void;
}) {
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const { data: post } = useQuery({
    queryKey: ["lfg-conv-post", postId],
    queryFn: async () => {
      const { data } = await supabase
        .from("lfg_posts")
        .select("id, title, status")
        .eq("id", postId)
        .maybeSingle();
      return data;
    },
  });

  const { data: other } = useQuery({
    queryKey: ["lfg-conv-other", otherId],
    queryFn: async () => {
      const { data } = await supabase
        .from("profiles")
        .select("id, display_name, username")
        .eq("id", otherId)
        .maybeSingle();
      return data;
    },
  });

  const { data: messages = [], refetch } = useQuery({
    queryKey: ["lfg-conv", postId, meId, otherId],
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
      return (data ?? []) as Msg[];
    },
  });

  // Mark unread incoming as read
  useEffect(() => {
    const unread = messages.filter((m) => m.recipient_id === meId && !m.read_at);
    if (unread.length === 0) return;
    supabase
      .from("lfg_messages")
      .update({ read_at: new Date().toISOString() })
      .in(
        "id",
        unread.map((m) => m.id),
      )
      .then(() => onSent());
  }, [messages, meId, onSent]);

  // Realtime
  useEffect(() => {
    const ch = supabase
      .channel(`conv-${postId}-${meId}-${otherId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "lfg_messages", filter: `post_id=eq.${postId}` },
        () => refetch(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, [postId, meId, otherId, refetch]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

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
      onSent();
    }
  };

  const otherName = other?.display_name || other?.username || "익명";

  return (
    <div className="flex h-[70vh] w-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-3 py-2">
        <Button variant="ghost" size="sm" className="md:hidden" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{otherName}</p>
          {post && (
            <Link
              to="/lfg/$id"
              params={{ id: postId }}
              className="block truncate text-[11px] text-muted-foreground hover:underline"
            >
              {post.title}
            </Link>
          )}
        </div>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto bg-muted/20 p-3">
        {messages.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">
            아직 메시지가 없어요. 먼저 인사를 건네 보세요.
          </p>
        ) : (
          messages.map((m) => {
            const mine = m.sender_id === meId;
            return (
              <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[75%] rounded-lg px-3 py-2 text-sm ${
                    mine ? "bg-primary text-primary-foreground" : "border border-border bg-card"
                  }`}
                >
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <p className={`mt-1 text-[10px] ${mine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                    {new Date(m.created_at).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      <div className="flex gap-2 border-t border-border p-2">
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
    </div>
  );
}

export { MessageSquare };
