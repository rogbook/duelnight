import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Lock, Search, Pencil, Trash2, Save, Loader2, ImageOff } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import type { Database } from "@/integrations/supabase/types";
import { normalizeImageUrl } from "@/components/cards/card-uploader";

type CardRow = Database["public"]["Tables"]["cards"]["Row"];
type Game = Database["public"]["Enums"]["tcg_game"];
type CardType = Database["public"]["Enums"]["card_type"];

const GAME_LABEL: Record<Game, string> = { optcg: "원피스", ptcg: "포켓몬", dtcg: "디지몬" };
const TYPE_LABEL: Record<CardType, string> = {
  leader: "리더", character: "캐릭터", event: "이벤트", stage: "스테이지", don: "DON!!",
};
const TYPES: CardType[] = ["leader", "character", "event", "stage", "don"];
const GAMES: Game[] = ["optcg", "ptcg", "dtcg"];

const PAGE_SIZE = 30;

export const Route = createFileRoute("/admin/cards/manage")({
  head: () => ({
    meta: [
      { title: "카드 관리 — 관리자 — 덱로그" },
      { name: "description", content: "등록된 카드를 검색·편집·삭제합니다." },
    ],
  }),
  component: ManageCardsPage,
});

function ManageCardsPage() {
  const { user, loading } = useAuth();
  const { isAdmin, isLoading } = useIsAdmin();

  if (loading || isLoading) {
    return (
      <div className="mx-auto w-full max-w-6xl px-6 py-8">
        <PageHeader title="카드 관리" description="권한 확인 중…" />
      </div>
    );
  }
  if (!user || !isAdmin) {
    return (
      <div className="mx-auto w-full max-w-6xl px-6 py-8">
        <PageHeader title="카드 관리" description="관리자 전용" />
        <Card className="mt-6">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-muted-foreground" />
              <CardTitle>접근 권한이 없습니다</CardTitle>
            </div>
            <CardDescription>관리자만 사용할 수 있어요.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline">
              <Link to="/cards">카드 DB 둘러보기</Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <ManageInner />;
}

function ManageInner() {
  const [rows, setRows] = useState<CardRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState("");
  const [game, setGame] = useState<"all" | Game>("all");
  const [type, setType] = useState<"all" | CardType>("all");
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [editing, setEditing] = useState<CardRow | null>(null);
  const [deletingCode, setDeletingCode] = useState<string | null>(null);

  const fetchRows = async () => {
    setLoading(true);
    try {
      let query = supabase
        .from("cards")
        .select("*", { count: "exact" })
        .eq("status", "approved")
        .order("set_code", { ascending: true })
        .order("code", { ascending: true })
        .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

      if (game !== "all") query = query.eq("game", game);
      if (type !== "all") query = query.eq("type", type);
      if (q.trim()) {
        const term = `%${q.trim()}%`;
        query = query.or(`code.ilike.${term},name.ilike.${term},set_code.ilike.${term}`);
      }

      const { data, error, count } = await query;
      if (error) throw error;
      setRows(data ?? []);
      setTotal(count ?? 0);
    } catch (err) {
      toast.error("카드 불러오기 실패: " + (err as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [page, game, type]);

  const onSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setPage(0);
    fetchRows();
  };

  const handleDelete = async (code: string) => {
    try {
      const { error } = await supabase.from("cards").delete().eq("code", code);
      if (error) throw error;
      toast.success(`카드 삭제 완료: ${code}`);
      setDeletingCode(null);
      fetchRows();
    } catch (err) {
      toast.error("삭제 실패: " + (err as Error).message);
    }
  };

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8 space-y-6">
      <PageHeader
        title="카드 관리 (관리자)"
        description="등록된 카드를 검색해 정보를 수정하거나 삭제할 수 있습니다."
      >
        <Button asChild variant="outline" size="sm">
          <Link to="/admin/cards">+ 카드 등록</Link>
        </Button>
      </PageHeader>

      <Card>
        <CardContent className="pt-6">
          <form onSubmit={onSearch} className="flex flex-wrap items-end gap-2">
            <div className="flex-1 min-w-[200px]">
              <Label className="text-xs">검색 (코드·이름·세트)</Label>
              <div className="relative mt-1">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                  placeholder="OP01-001, 루피, OP01…"
                  className="pl-8"
                />
              </div>
            </div>
            <div>
              <Label className="text-xs">게임</Label>
              <Select value={game} onValueChange={(v) => { setGame(v as "all" | Game); setPage(0); }}>
                <SelectTrigger className="mt-1 w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  {GAMES.map((g) => (
                    <SelectItem key={g} value={g}>{GAME_LABEL[g]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">종류</Label>
              <Select value={type} onValueChange={(v) => { setType(v as "all" | CardType); setPage(0); }}>
                <SelectTrigger className="mt-1 w-[140px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">전체</SelectItem>
                  {TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "검색"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <div className="text-xs text-muted-foreground">
        총 {total.toLocaleString()}건 · {page + 1} / {pageCount} 페이지
      </div>

      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map((c) => (
          <div key={c.code} className="flex gap-3 rounded-lg border border-border bg-card p-3">
            <div className="flex h-20 w-14 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
              {(() => { const u = normalizeImageUrl(c.image_url); return u ? (
                <img src={u} alt={c.name} className="h-full w-full object-cover" />
              ) : (
                <ImageOff className="h-5 w-5 text-muted-foreground" />
              ); })()}
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
              <div className="flex items-center gap-1.5">
                <span className="truncate text-sm font-medium">{c.name}</span>
              </div>
              <div className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
                <span>{c.code}</span>
                <span>·</span>
                <span>{GAME_LABEL[c.game as Game] ?? c.game}</span>
                <span>·</span>
                <span>{TYPE_LABEL[c.type as CardType] ?? c.type}</span>
                {c.rarity && <Badge variant="outline" className="ml-1 h-4 px-1 text-[10px]">{c.rarity}</Badge>}
              </div>
              <div className="mt-auto flex justify-end gap-1 pt-2">
                <Button size="sm" variant="outline" onClick={() => setEditing(c)}>
                  <Pencil className="h-3.5 w-3.5 mr-1" />편집
                </Button>
                <Button size="sm" variant="ghost" className="text-destructive" onClick={() => setDeletingCode(c.code)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          </div>
        ))}
        {!loading && rows.length === 0 && (
          <div className="col-span-full rounded-lg border border-dashed border-border p-8 text-center text-sm text-muted-foreground">
            조건에 맞는 카드가 없습니다.
          </div>
        )}
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-2 pt-2">
          <Button variant="outline" size="sm" disabled={page === 0 || loading} onClick={() => setPage((p) => Math.max(0, p - 1))}>이전</Button>
          <span className="text-xs text-muted-foreground">{page + 1} / {pageCount}</span>
          <Button variant="outline" size="sm" disabled={page + 1 >= pageCount || loading} onClick={() => setPage((p) => p + 1)}>다음</Button>
        </div>
      )}

      {editing && (
        <EditCardDialog
          card={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); fetchRows(); }}
        />
      )}

      <AlertDialog open={!!deletingCode} onOpenChange={(o) => { if (!o) setDeletingCode(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>카드를 삭제할까요?</AlertDialogTitle>
            <AlertDialogDescription>
              {deletingCode} 카드를 영구 삭제합니다. 이 작업은 되돌릴 수 없습니다.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deletingCode && handleDelete(deletingCode)}
            >
              삭제
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function EditCardDialog({
  card, onClose, onSaved,
}: { card: CardRow; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: card.name,
    game: card.game as Game,
    type: card.type as CardType,
    set_code: card.set_code,
    colors: (card.colors ?? []).join(", "),
    cost: card.cost?.toString() ?? "",
    power: card.power?.toString() ?? "",
    counter: card.counter?.toString() ?? "",
    attribute: card.attribute ?? "",
    rarity: card.rarity ?? "",
    effect: card.effect ?? "",
    image_url: card.image_url ?? "",
  });
  const [saving, setSaving] = useState(false);

  const onSave = async () => {
    if (!form.name.trim() || !form.set_code.trim()) {
      toast.error("이름과 세트는 필수입니다");
      return;
    }
    setSaving(true);
    try {
      const num = (v: string) => {
        const n = Number(v);
        return v.trim() === "" || !Number.isFinite(n) ? null : n;
      };
      const colors = form.colors.split(/[,|;/]/).map((s) => s.trim()).filter(Boolean);
      const { error } = await supabase
        .from("cards")
        .update({
          name: form.name.trim(),
          game: form.game,
          type: form.type,
          set_code: form.set_code.trim(),
          colors,
          cost: num(form.cost),
          power: num(form.power),
          counter: num(form.counter),
          attribute: form.attribute.trim() || null,
          rarity: form.rarity.trim() || null,
          effect: form.effect.trim() || null,
          image_url: normalizeImageUrl(form.image_url.trim()) || null,
        })
        .eq("code", card.code);
      if (error) throw error;
      toast.success("카드 수정 완료");
      onSaved();
    } catch (err) {
      toast.error("저장 실패: " + (err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>카드 편집 · {card.code}</DialogTitle>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-3 py-2 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <Label className="text-xs">이름 *</Label>
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">게임</Label>
            <Select value={form.game} onValueChange={(v) => setForm({ ...form, game: v as Game })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {GAMES.map((g) => <SelectItem key={g} value={g}>{GAME_LABEL[g]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">종류</Label>
            <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as CardType })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {TYPES.map((t) => <SelectItem key={t} value={t}>{TYPE_LABEL[t]}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">세트 *</Label>
            <Input value={form.set_code} onChange={(e) => setForm({ ...form, set_code: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">색상 (쉼표 구분)</Label>
            <Input value={form.colors} onChange={(e) => setForm({ ...form, colors: e.target.value })} placeholder="red, blue" />
          </div>
          <div>
            <Label className="text-xs">비용</Label>
            <Input type="number" value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">파워</Label>
            <Input type="number" value={form.power} onChange={(e) => setForm({ ...form, power: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">카운터</Label>
            <Input type="number" value={form.counter} onChange={(e) => setForm({ ...form, counter: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">속성</Label>
            <Input value={form.attribute} onChange={(e) => setForm({ ...form, attribute: e.target.value })} />
          </div>
          <div>
            <Label className="text-xs">레어도</Label>
            <Input value={form.rarity} onChange={(e) => setForm({ ...form, rarity: e.target.value })} />
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">이미지 URL (구글 드라이브 공유 링크 자동 변환)</Label>
            <Input
              value={form.image_url}
              onChange={(e) => setForm({ ...form, image_url: e.target.value })}
              onBlur={(e) => setForm({ ...form, image_url: normalizeImageUrl(e.target.value) ?? "" })}
              placeholder="https://... 또는 https://drive.google.com/file/d/.../view"
            />
            {form.image_url && (
              <img src={normalizeImageUrl(form.image_url) ?? form.image_url} alt="" className="mt-2 h-32 rounded border border-border object-contain" />
            )}
          </div>
          <div className="sm:col-span-2">
            <Label className="text-xs">효과</Label>
            <Textarea
              value={form.effect}
              onChange={(e) => setForm({ ...form, effect: e.target.value })}
              rows={4}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>취소</Button>
          <Button onClick={onSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
            저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
