import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UserPlus, Check, X, Trash2, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { OpponentSearch, type FoundUser } from "@/components/opponent-search";
import { toast } from "sonner";

type Row = {
  id: string;
  requester_id: string;
  addressee_id: string;
  status: "pending" | "accepted";
  created_at: string;
  other: { id: string; display_name: string | null; username: string | null; avatar_url: string | null } | null;
};

export const Route = createFileRoute("/friends")({
  head: () => ({
    meta: [
      { title: "친구 — 덱로그" },
      { name: "description", content: "친구 요청과 친구 목록을 관리하세요." },
    ],
  }),
  component: FriendsPage,
});

function FriendsPage() {
  const { user, loading } = useAuth();
  const qc = useQueryClient();
  const [picked, setPicked] = useState<FoundUser | null>(null);

  const { data: rows = [], refetch } = useQuery({
    queryKey: ["friendships", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("friendships")
        .select("id,requester_id,addressee_id,status,created_at")
        .order("created_at", { ascending: false });
      if (error) throw error;
      const otherIds = Array.from(
        new Set((data ?? []).map((r) => (r.requester_id === user!.id ? r.addressee_id : r.requester_id))),
      );
      let profiles: Record<string, { id: string; display_name: string | null; username: string | null; avatar_url: string | null }> = {};
      if (otherIds.length > 0) {
        const { data: ps } = await supabase
          .from("profiles")
          .select("id,display_name,username,avatar_url")
          .in("id", otherIds);
        for (const p of ps ?? []) profiles[p.id] = p;
      }
      return (data ?? []).map((r) => ({
        ...r,
        other: profiles[r.requester_id === user!.id ? r.addressee_id : r.requester_id] ?? null,
      })) as Row[];
    },
  });

  if (loading) return <div className="mx-auto max-w-4xl px-6 py-8 text-sm text-muted-foreground">불러오는 중...</div>;
  if (!user) {
    return (
      <div className="mx-auto max-w-4xl px-6 py-8">
        <PageHeader title="친구" description="로그인이 필요합니다" />
        <Link to="/login" className="mt-4 inline-flex rounded-md bg-foreground px-4 py-2 text-sm text-background">로그인</Link>
      </div>
    );
  }

  const friends = rows.filter((r) => r.status === "accepted");
  const incoming = rows.filter((r) => r.status === "pending" && r.addressee_id === user.id);
  const outgoing = rows.filter((r) => r.status === "pending" && r.requester_id === user.id);

  const sendRequest = async () => {
    if (!picked) return;
    const { error } = await supabase.from("friendships").insert({
      requester_id: user.id,
      addressee_id: picked.id,
      status: "pending",
    });
    if (error) return toast.error(error.message);
    toast.success("친구 요청을 보냈어요");
    setPicked(null);
    qc.invalidateQueries({ queryKey: ["friendships"] });
    refetch();
  };

  const accept = async (id: string) => {
    const { error } = await supabase.from("friendships").update({ status: "accepted" }).eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("수락됨");
    refetch();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("friendships").delete().eq("id", id);
    if (error) return toast.error(error.message);
    refetch();
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8">
      <PageHeader title="친구" description="친구를 추가하고 요청을 관리하세요" />

      <section className="mt-6 rounded-lg border border-border bg-card p-4">
        <h2 className="text-sm font-medium">친구 추가</h2>
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <div className="flex-1">
            <OpponentSearch selected={picked} onSelect={setPicked} onClear={() => setPicked(null)} />
          </div>
          <Button onClick={sendRequest} disabled={!picked || picked.friendship_status !== "none"}>
            <UserPlus className="mr-1 h-4 w-4" /> 요청 보내기
          </Button>
        </div>
        {picked && picked.friendship_status !== "none" && (
          <p className="mt-2 text-xs text-muted-foreground">이미 친구이거나 대기중인 요청이 있습니다.</p>
        )}
      </section>

      <Section title={`받은 요청 (${incoming.length})`}>
        {incoming.length === 0 ? (
          <Empty text="받은 요청이 없습니다" />
        ) : (
          incoming.map((r) => (
            <UserRow key={r.id} other={r.other}>
              <Button size="sm" onClick={() => accept(r.id)}><Check className="mr-1 h-3.5 w-3.5" />수락</Button>
              <Button size="sm" variant="ghost" onClick={() => remove(r.id)}><X className="h-3.5 w-3.5" /></Button>
            </UserRow>
          ))
        )}
      </Section>

      <Section title={`보낸 요청 (${outgoing.length})`}>
        {outgoing.length === 0 ? (
          <Empty text="보낸 요청이 없습니다" />
        ) : (
          outgoing.map((r) => (
            <UserRow key={r.id} other={r.other}>
              <span className="text-xs text-muted-foreground">대기중</span>
              <Button size="sm" variant="ghost" onClick={() => remove(r.id)}>취소</Button>
            </UserRow>
          ))
        )}
      </Section>

      <Section title={`친구 (${friends.length})`}>
        {friends.length === 0 ? (
          <EmptyState icon={Users} title="아직 친구가 없어요" description="위 검색에서 사용자를 찾아 요청을 보내세요." />
        ) : (
          friends.map((r) => (
            <UserRow key={r.id} other={r.other}>
              <Button size="sm" variant="ghost" onClick={() => remove(r.id)} className="text-destructive hover:text-destructive">
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </UserRow>
          ))
        )}
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-2 text-sm font-medium">{title}</h2>
      <div className="space-y-2">{children}</div>
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="rounded-md border border-dashed border-border px-4 py-6 text-center text-xs text-muted-foreground">{text}</p>;
}

function UserRow({ other, children }: { other: Row["other"]; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border bg-card px-3 py-2">
      <div className="flex items-center gap-2 min-w-0">
        <Avatar className="h-8 w-8">
          <AvatarImage src={other?.avatar_url ?? undefined} />
          <AvatarFallback>{(other?.display_name ?? other?.username ?? "?").slice(0, 1)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{other?.display_name ?? other?.username ?? "익명"}</p>
          {other?.username && <p className="truncate text-[11px] text-muted-foreground">@{other.username}</p>}
        </div>
      </div>
      <div className="flex items-center gap-2">{children}</div>
    </div>
  );
}
