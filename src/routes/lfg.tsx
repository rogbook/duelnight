import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Users, Plus, Trash2, MapPin, Clock, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { GAME_LABEL } from "@/lib/match-stats";
import type { Database } from "@/integrations/supabase/types";

type Game = Database["public"]["Enums"]["tcg_game"];
type Post = {
  id: string;
  user_id: string;
  game: Game;
  title: string;
  location: string | null;
  meet_at: string | null;
  contact: string | null;
  body: string | null;
  status: string;
  created_at: string;
  profiles?: { display_name: string | null; username: string | null } | null;
};

export const Route = createFileRoute("/lfg")({
  head: () => ({
    meta: [
      { title: "같이 칠 사람 — TCG Hub" },
      {
        name: "description",
        content: "지역·시간·게임을 적고 같이 플레이할 상대를 찾아보세요.",
      },
    ],
  }),
  component: LfgPage,
});

function LfgPage() {
  const { user } = useAuth();
  const [game, setGame] = useState<Game | "all">("all");
  const [showForm, setShowForm] = useState(false);

  const { data: posts = [], refetch } = useQuery({
    queryKey: ["lfg-posts", game],
    queryFn: async () => {
      let q = supabase
        .from("lfg_posts")
        .select("*")
        .order("created_at", { ascending: false });
      if (game !== "all") q = q.eq("game", game);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as Omit<Post, "profiles">[];
      const ids = Array.from(new Set(rows.map((r) => r.user_id)));
      let profMap = new Map<string, { display_name: string | null; username: string | null }>();
      if (ids.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, display_name, username")
          .in("id", ids);
        profMap = new Map(
          (profs ?? []).map((p) => [
            p.id,
            { display_name: p.display_name, username: p.username },
          ]),
        );
      }
      return rows.map((r) => ({
        ...r,
        profiles: profMap.get(r.user_id) ?? null,
      })) as Post[];
    },
  });

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8">
      <PageHeader
        title="같이 칠 사람 (LFG)"
        description="지역과 시간을 적고 같이 플레이할 상대를 찾아보세요"
      >
        <Select value={game} onValueChange={(v) => setGame(v as Game | "all")}>
          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            <SelectItem value="optcg">원피스</SelectItem>
            <SelectItem value="ptcg">포켓몬</SelectItem>
            <SelectItem value="dtcg">디지몬</SelectItem>
          </SelectContent>
        </Select>
        {user ? (
          <Button size="sm" onClick={() => setShowForm((v) => !v)}>
            {showForm ? (
              <>
                <X className="mr-1 h-4 w-4" />
                작성 닫기
              </>
            ) : (
              <>
                <Plus className="mr-1 h-4 w-4" />
                모집 글 작성
              </>
            )}
          </Button>
        ) : (
          <Button asChild size="sm">
            <Link to="/login">로그인하고 작성</Link>
          </Button>
        )}
      </PageHeader>

      {user && showForm && (
        <InlineLfgForm
          onCreated={() => {
            refetch();
            setShowForm(false);
          }}
          onCancel={() => setShowForm(false)}
        />
      )}
      {!user && (
        <div className="mt-6 rounded-lg border border-dashed border-border bg-card/50 p-4 text-center text-sm text-muted-foreground">
          글을 작성하려면{" "}
          <Link to="/login" className="font-medium text-primary underline">
            로그인
          </Link>
          이 필요해요.
        </div>
      )}

      {posts.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={Users}
            title="모집 중인 글이 없어요"
            description="첫 LFG 글을 등록해 보세요."
          />
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {posts.map((p) => (
            <li
              key={p.id}
              className="rounded-lg border border-border bg-card p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      {GAME_LABEL[p.game]}
                    </span>
                    <h3 className="truncate text-sm font-semibold">{p.title}</h3>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                    {p.location && (
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {p.location}
                      </span>
                    )}
                    {p.meet_at && (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="h-3 w-3" />
                        {new Date(p.meet_at).toLocaleString("ko-KR")}
                      </span>
                    )}
                    <span>
                      by{" "}
                      {p.profiles?.display_name ||
                        p.profiles?.username ||
                        "익명"}
                    </span>
                  </div>
                  {p.body && (
                    <p className="mt-2 whitespace-pre-wrap text-sm text-foreground/90">
                      {p.body}
                    </p>
                  )}
                  {p.contact && (
                    <p className="mt-2 text-xs text-muted-foreground">
                      연락: <span className="text-foreground">{p.contact}</span>
                    </p>
                  )}
                </div>
                {user?.id === p.user_id && (
                  <button
                    onClick={async () => {
                      if (!confirm("이 글을 삭제할까요?")) return;
                      const { error } = await supabase
                        .from("lfg_posts")
                        .delete()
                        .eq("id", p.id);
                      if (error) toast.error(error.message);
                      else {
                        toast.success("삭제됨");
                        refetch();
                      }
                    }}
                    className="text-muted-foreground hover:text-destructive"
                    aria-label="삭제"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function InlineLfgForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const empty = {
    game: "optcg" as Game,
    title: "",
    location: "",
    meet_at: "",
    contact: "",
    body: "",
  };
  const [form, setForm] = useState(empty);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const isDirty =
    form.title.trim() !== "" ||
    form.location.trim() !== "" ||
    form.meet_at !== "" ||
    form.contact.trim() !== "" ||
    form.body.trim() !== "" ||
    form.game !== "optcg";

  const handleCancel = () => {
    if (isDirty) setConfirmOpen(true);
    else onCancel();
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!form.title.trim()) {
      toast.error("제목을 입력해 주세요");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("lfg_posts").insert({
      user_id: user.id,
      game: form.game,
      title: form.title.trim(),
      location: form.location.trim() || null,
      meet_at: form.meet_at ? new Date(form.meet_at).toISOString() : null,
      contact: form.contact.trim() || null,
      body: form.body.trim() || null,
    });
    setSubmitting(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("등록됨");
    setForm(empty);
    qc.invalidateQueries({ queryKey: ["lfg-posts"] });
    onCreated();
  };

  return (
    <form
      onSubmit={submit}
      className="mt-6 space-y-3 rounded-lg border border-border bg-card p-4"
    >
      <div className="flex items-center gap-2">
        <Plus className="h-4 w-4 text-primary" />
        <h2 className="text-sm font-semibold">새 모집 글 작성</h2>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>게임</Label>
          <Select
            value={form.game}
            onValueChange={(v) => setForm({ ...form, game: v as Game })}
          >
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="optcg">원피스</SelectItem>
              <SelectItem value="ptcg">포켓몬</SelectItem>
              <SelectItem value="dtcg">디지몬</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>일시</Label>
          <Input
            type="datetime-local"
            value={form.meet_at}
            onChange={(e) => setForm({ ...form, meet_at: e.target.value })}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>제목</Label>
        <Input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder="예: 강남 친선 같이 치실 분"
          maxLength={120}
          required
        />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>장소</Label>
          <Input
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            placeholder="지역 또는 매장명"
            maxLength={120}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>연락 방법</Label>
          <Input
            value={form.contact}
            onChange={(e) => setForm({ ...form, contact: e.target.value })}
            placeholder="디스코드 / 카톡 오픈채팅 등"
            maxLength={120}
          />
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        <Label>설명</Label>
        <Textarea
          value={form.body}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
          placeholder="포맷, 인원, 환영 사항 등"
          rows={3}
          maxLength={1000}
        />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button
          type="button"
          variant="ghost"
          onClick={handleCancel}
          disabled={submitting}
        >
          취소
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "등록 중…" : "등록"}
        </Button>
      </div>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>정말 취소할까요?</DialogTitle>
            <DialogDescription>
              작성 중인 내용이 모두 사라집니다.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              계속 작성
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmOpen(false);
                onCancel();
                toast("입력 내용을 취소했어요");
              }}
            >
              취소하기
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
