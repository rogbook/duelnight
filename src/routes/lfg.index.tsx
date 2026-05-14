import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Users, Plus, Trash2, MapPin, Clock, X, Zap, Tag, Hash } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
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
type Category = "friendly" | "tier" | "tournament_practice";
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
  store_id: string | null;
  category: Category;
  games_count: number | null;
  duration_minutes: number | null;
  quick_match: boolean;
  kakao_link: string | null;
  profiles?: { display_name: string | null; username: string | null } | null;
  store?: { id: string; name: string; address: string | null } | null;
};

export const CATEGORY_LABEL: Record<Category, string> = {
  friendly: "친선",
  tier: "티어",
  tournament_practice: "대회연습",
};

export const Route = createFileRoute("/lfg/")({
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
  const [category, setCategory] = useState<Category | "all">("all");
  const [status, setStatus] = useState<"open" | "closed" | "all">("open");
  const [showForm, setShowForm] = useState(false);

  const { data: posts = [], refetch } = useQuery({
    queryKey: ["lfg-posts", game, category, status],
    queryFn: async () => {
      let q = supabase
        .from("lfg_posts")
        .select("*")
        .order("created_at", { ascending: false });
      if (game !== "all") q = q.eq("game", game);
      if (category !== "all") q = q.eq("category", category);
      if (status !== "all") q = q.eq("status", status);
      const { data, error } = await q;
      if (error) throw error;
      const rows = (data ?? []) as Omit<Post, "profiles" | "store">[];
      const userIds = Array.from(new Set(rows.map((r) => r.user_id)));
      const storeIds = Array.from(
        new Set(rows.map((r) => r.store_id).filter((x): x is string => !!x)),
      );
      const [profsRes, storesRes] = await Promise.all([
        userIds.length
          ? supabase.from("profiles").select("id, display_name, username").in("id", userIds)
          : Promise.resolve({ data: [] as { id: string; display_name: string | null; username: string | null }[] }),
        storeIds.length
          ? supabase.from("stores").select("id, name, address").in("id", storeIds)
          : Promise.resolve({ data: [] as { id: string; name: string; address: string | null }[] }),
      ]);
      const profMap = new Map((profsRes.data ?? []).map((p) => [p.id, p]));
      const storeMap = new Map((storesRes.data ?? []).map((s) => [s.id, s]));
      return rows.map((r) => ({
        ...r,
        profiles: profMap.get(r.user_id) ?? null,
        store: r.store_id ? storeMap.get(r.store_id) ?? null : null,
      })) as Post[];
    },
  });

  const { quickMatches, regularPosts } = useMemo(() => {
    const qm: Post[] = [];
    const rp: Post[] = [];
    for (const p of posts) {
      if (p.quick_match && p.status === "open") qm.push(p);
      else rp.push(p);
    }
    return { quickMatches: qm, regularPosts: rp };
  }, [posts]);

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8">
      <PageHeader
        title="같이 칠 사람 (LFG)"
        description="오프라인 매칭 모집·참여·1:1 채팅"
      >
        {user ? (
          <Button size="sm" onClick={() => setShowForm((v) => !v)}>
            {showForm ? (
              <>
                <X className="mr-1 h-4 w-4" /> 닫기
              </>
            ) : (
              <>
                <Plus className="mr-1 h-4 w-4" /> 모집 글 작성
              </>
            )}
          </Button>
        ) : (
          <Button asChild size="sm">
            <Link to="/login">로그인하고 작성</Link>
          </Button>
        )}
      </PageHeader>

      {/* Filters */}
      <div className="mt-4 flex flex-wrap gap-2">
        <Select value={game} onValueChange={(v) => setGame(v as Game | "all")}>
          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 게임</SelectItem>
            <SelectItem value="optcg">원피스</SelectItem>
            <SelectItem value="ptcg">포켓몬</SelectItem>
            <SelectItem value="dtcg">디지몬</SelectItem>
          </SelectContent>
        </Select>
        <Select value={category} onValueChange={(v) => setCategory(v as Category | "all")}>
          <SelectTrigger className="w-[140px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체 카테고리</SelectItem>
            <SelectItem value="friendly">친선</SelectItem>
            <SelectItem value="tier">티어</SelectItem>
            <SelectItem value="tournament_practice">대회연습</SelectItem>
          </SelectContent>
        </Select>
        <Select value={status} onValueChange={(v) => setStatus(v as "open" | "closed" | "all")}>
          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="open">모집 중</SelectItem>
            <SelectItem value="closed">모집 완료</SelectItem>
            <SelectItem value="all">전체 상태</SelectItem>
          </SelectContent>
        </Select>
      </div>

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

      {quickMatches.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-500">
            <Zap className="h-3.5 w-3.5" /> 퀵 매칭
          </h2>
          <ul className="space-y-2">
            {quickMatches.map((p) => (
              <PostCard key={p.id} p={p} onDelete={refetch} userId={user?.id} highlight />
            ))}
          </ul>
        </section>
      )}

      {regularPosts.length === 0 && quickMatches.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={Users}
            title="모집 중인 글이 없어요"
            description="첫 LFG 글을 등록해 보세요."
          />
        </div>
      ) : (
        <ul className="mt-6 space-y-3">
          {regularPosts.map((p) => (
            <PostCard key={p.id} p={p} onDelete={refetch} userId={user?.id} />
          ))}
        </ul>
      )}
    </div>
  );
}

function PostCard({
  p,
  onDelete,
  userId,
  highlight,
}: {
  p: Post;
  onDelete: () => void;
  userId?: string;
  highlight?: boolean;
}) {
  const closed = p.status === "closed";
  return (
    <li
      className={`rounded-lg border bg-card p-4 transition hover:border-primary/40 ${
        highlight ? "border-amber-500/50 bg-amber-500/5" : "border-border"
      } ${closed ? "opacity-70" : ""}`}
    >
      <div className="flex items-start justify-between gap-3">
        <Link to="/lfg/$id" params={{ id: p.id }} className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {GAME_LABEL[p.game]}
            </span>
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              {CATEGORY_LABEL[p.category]}
            </span>
            {p.quick_match && (
              <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">
                <Zap className="h-2.5 w-2.5" /> 퀵
              </span>
            )}
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                closed
                  ? "bg-muted text-muted-foreground"
                  : "bg-emerald-500/15 text-emerald-600"
              }`}
            >
              {closed ? "모집 완료" : "모집 중"}
            </span>
            <h3 className="truncate text-sm font-semibold hover:underline">{p.title}</h3>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
            {p.store ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {p.store.name}
              </span>
            ) : p.location ? (
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3 w-3" />
                {p.location}
              </span>
            ) : null}
            {p.meet_at && (
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" />
                {new Date(p.meet_at).toLocaleString("ko-KR")}
              </span>
            )}
            {p.games_count != null && (
              <span className="inline-flex items-center gap-1">
                <Hash className="h-3 w-3" />
                {p.games_count}판
              </span>
            )}
            {p.duration_minutes != null && (
              <span className="inline-flex items-center gap-1">
                <Tag className="h-3 w-3" />
                {p.duration_minutes}분
              </span>
            )}
            <span>by {p.profiles?.display_name || p.profiles?.username || "익명"}</span>
          </div>
          {p.body && (
            <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-sm text-foreground/90">
              {p.body}
            </p>
          )}
        </Link>
        {userId === p.user_id && (
          <button
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!confirm("이 글을 삭제할까요?")) return;
              const { error } = await supabase.from("lfg_posts").delete().eq("id", p.id);
              if (error) toast.error(error.message);
              else {
                toast.success("삭제됨");
                onDelete();
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
  );
}

function InlineLfgForm({ onCreated, onCancel }: { onCreated: () => void; onCancel: () => void }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [submitting, setSubmitting] = useState(false);
  const empty = {
    game: "optcg" as Game,
    category: "friendly" as Category,
    title: "",
    store_id: "" as string,
    location: "",
    meet_at: "",
    games_count: "" as string,
    duration_minutes: "" as string,
    contact: "",
    kakao_link: "",
    body: "",
    quick_match: false,
  };
  const [form, setForm] = useState(empty);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [storeQuery, setStoreQuery] = useState("");

  const { data: stores = [] } = useQuery({
    queryKey: ["lfg-stores", form.game, storeQuery],
    queryFn: async () => {
      let q = supabase.from("stores").select("id, name, address, region, games").limit(50);
      if (storeQuery.trim()) {
        q = q.or(`name.ilike.%${storeQuery}%,address.ilike.%${storeQuery}%`);
      }
      const { data, error } = await q.order("name");
      if (error) throw error;
      return (data ?? []).filter((s) =>
        Array.isArray(s.games) ? s.games.includes(form.game) : true,
      );
    },
  });

  const isDirty =
    form.title.trim() !== "" ||
    form.location.trim() !== "" ||
    form.store_id !== "" ||
    form.meet_at !== "" ||
    form.contact.trim() !== "" ||
    form.kakao_link.trim() !== "" ||
    form.body.trim() !== "" ||
    form.games_count !== "" ||
    form.duration_minutes !== "" ||
    form.quick_match ||
    form.game !== "optcg" ||
    form.category !== "friendly";

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
      category: form.category,
      title: form.title.trim(),
      store_id: form.store_id || null,
      location: form.location.trim() || null,
      meet_at: form.meet_at ? new Date(form.meet_at).toISOString() : null,
      games_count: form.games_count ? Number(form.games_count) : null,
      duration_minutes: form.duration_minutes ? Number(form.duration_minutes) : null,
      contact: form.contact.trim() || null,
      kakao_link: form.kakao_link.trim() || null,
      body: form.body.trim() || null,
      quick_match: form.quick_match,
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

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label>게임</Label>
          <Select value={form.game} onValueChange={(v) => setForm({ ...form, game: v as Game, store_id: "" })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="optcg">원피스</SelectItem>
              <SelectItem value="ptcg">포켓몬</SelectItem>
              <SelectItem value="dtcg">디지몬</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>카테고리</Label>
          <Select value={form.category} onValueChange={(v) => setForm({ ...form, category: v as Category })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="friendly">친선</SelectItem>
              <SelectItem value="tier">티어</SelectItem>
              <SelectItem value="tournament_practice">대회연습</SelectItem>
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

      {/* Store picker */}
      <div className="flex flex-col gap-1.5">
        <Label>매장 (등록된 매장 선택)</Label>
        <Input
          placeholder="매장명 또는 주소 검색"
          value={storeQuery}
          onChange={(e) => setStoreQuery(e.target.value)}
        />
        <Select value={form.store_id || "none"} onValueChange={(v) => setForm({ ...form, store_id: v === "none" ? "" : v })}>
          <SelectTrigger><SelectValue placeholder="매장 선택 (선택사항)" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="none">선택 안 함 (직접 입력)</SelectItem>
            {stores.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.name} {s.address ? `· ${s.address}` : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {!form.store_id && (
          <Input
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            placeholder="지역 또는 매장명 직접 입력"
            maxLength={120}
          />
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>예상 경기 수</Label>
          <Input
            type="number"
            min={1}
            max={50}
            value={form.games_count}
            onChange={(e) => setForm({ ...form, games_count: e.target.value })}
            placeholder="예: 5"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>가능 시간 (분)</Label>
          <Input
            type="number"
            min={10}
            max={600}
            value={form.duration_minutes}
            onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}
            placeholder="예: 120"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>연락처 메모 (선택)</Label>
          <Input
            value={form.contact}
            onChange={(e) => setForm({ ...form, contact: e.target.value })}
            placeholder="기타 연락 방법"
            maxLength={120}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>카카오톡 오픈채팅 링크 (선택)</Label>
          <Input
            value={form.kakao_link}
            onChange={(e) => setForm({ ...form, kakao_link: e.target.value })}
            placeholder="https://open.kakao.com/..."
            maxLength={300}
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

      <label className="flex items-center gap-2 rounded-md border border-dashed border-border p-3 text-sm">
        <Checkbox
          checked={form.quick_match}
          onCheckedChange={(v) => setForm({ ...form, quick_match: !!v })}
        />
        <div>
          <div className="font-medium">퀵 매칭으로 등록</div>
          <div className="text-xs text-muted-foreground">
            상단에 노출되며 별도 채팅 없이 바로 참여 신청만 가능해요.
          </div>
        </div>
      </label>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={handleCancel} disabled={submitting}>
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
            <DialogDescription>작성 중인 내용이 모두 사라집니다.</DialogDescription>
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
