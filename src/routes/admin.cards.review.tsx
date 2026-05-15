import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Lock, Check, X, RefreshCw, History } from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin/cards/review")({
  head: () => ({
    meta: [
      { title: "카드 검수 큐 — 관리자 — 덱로그" },
      { name: "description", content: "사용자가 제출한 카드를 검토·승인하고, 변경 이력을 확인합니다." },
    ],
  }),
  component: ReviewPage,
});

type PendingCard = {
  code: string; name: string; set_code: string; game: string; type: string;
  image_url: string | null; submitted_by: string | null; created_at: string;
  rarity: string | null; colors: string[];
};

type AuditRow = {
  id: string; card_code: string; action: string; actor_id: string | null;
  created_at: string; note: string | null;
  before_data: Record<string, unknown> | null;
  after_data: Record<string, unknown> | null;
};

function ReviewPage() {
  const { user, loading } = useAuth();
  const { isAdmin, isLoading } = useIsAdmin();

  if (loading || isLoading) {
    return <div className="mx-auto max-w-6xl px-6 py-8"><PageHeader title="카드 검수 큐" description="권한 확인 중…" /></div>;
  }
  if (!user || !isAdmin) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-8">
        <PageHeader title="카드 검수 큐" description="관리자 전용" />
        <Card className="mt-6">
          <CardHeader>
            <div className="flex items-center gap-2"><Lock className="h-5 w-5" /><CardTitle>접근 권한이 없습니다</CardTitle></div>
            <CardDescription>관리자만 사용할 수 있어요.</CardDescription>
          </CardHeader>
          <CardContent><Button asChild variant="outline"><Link to="/cards">카드 DB 둘러보기</Link></Button></CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-6 py-8 space-y-6">
      <PageHeader
        title="카드 검수 큐 (관리자)"
        description="사용자가 제출한 카드를 검토하고 승인/반려합니다. 모든 변경은 감사 로그에 기록됩니다."
      />
      <Tabs defaultValue="queue">
        <TabsList>
          <TabsTrigger value="queue">검수 대기</TabsTrigger>
          <TabsTrigger value="logs"><History className="h-4 w-4 mr-1" />감사 로그</TabsTrigger>
        </TabsList>
        <TabsContent value="queue"><PendingQueue /></TabsContent>
        <TabsContent value="logs"><AuditLogs /></TabsContent>
      </Tabs>
    </div>
  );
}

function PendingQueue() {
  const [items, setItems] = useState<PendingCard[]>([]);
  const [busy, setBusy] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = async () => {
    setBusy(true);
    const { data, error } = await supabase
      .from("cards")
      .select("code,name,set_code,game,type,image_url,submitted_by,created_at,rarity,colors")
      .eq("status", "pending")
      .order("created_at", { ascending: true })
      .limit(200);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setItems((data ?? []) as PendingCard[]);
  };

  useEffect(() => { load(); }, []);

  const review = async (code: string, approve: boolean) => {
    const note = notes[code]?.trim() || null;
    const { error } = await supabase.rpc("review_card", { _code: code, _approve: approve, _note: note ?? undefined });
    if (error) { toast.error(error.message); return; }
    toast.success(approve ? `${code} 승인됨` : `${code} 반려됨`);
    setItems(prev => prev.filter(p => p.code !== code));
  };

  if (busy && items.length === 0) {
    return <Card><CardContent className="py-8 text-center text-muted-foreground">불러오는 중…</CardContent></Card>;
  }

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <div>
          <CardTitle className="text-base">대기 중 {items.length}건</CardTitle>
          <CardDescription>승인된 카드는 즉시 공개됩니다. 반려는 카드를 숨기지만 데이터는 보존돼요.</CardDescription>
        </div>
        <Button variant="outline" size="sm" onClick={load} disabled={busy}>
          <RefreshCw className={`h-4 w-4 mr-1 ${busy ? "animate-spin" : ""}`} />새로고침
        </Button>
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 && <p className="text-sm text-muted-foreground py-6 text-center">대기 중인 카드가 없습니다.</p>}
        {items.map(it => (
          <div key={it.code} className="flex gap-3 rounded-md border p-3">
            {it.image_url
              ? <img src={it.image_url} alt="" className="h-28 w-20 rounded object-cover bg-muted" />
              : <div className="h-28 w-20 rounded bg-muted" />}
            <div className="flex-1 min-w-0 space-y-1.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-mono text-xs">{it.code}</span>
                <span className="font-medium truncate">{it.name}</span>
                <Badge variant="outline">{it.game}</Badge>
                <Badge variant="secondary">{it.type}</Badge>
                {it.rarity && <Badge>{it.rarity}</Badge>}
                <span className="text-xs text-muted-foreground ml-auto">
                  {new Date(it.created_at).toLocaleString("ko-KR")}
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                세트 {it.set_code} · 색상 {it.colors?.join(", ") || "-"} · 제출자 {it.submitted_by?.slice(0, 8) ?? "-"}
              </div>
              <div className="flex gap-2 pt-1">
                <Input
                  value={notes[it.code] ?? ""}
                  onChange={e => setNotes(n => ({ ...n, [it.code]: e.target.value }))}
                  placeholder="검수 메모 (선택)"
                  className="h-8 text-xs"
                />
                <Button size="sm" onClick={() => review(it.code, true)}>
                  <Check className="h-4 w-4 mr-1" />승인
                </Button>
                <Button size="sm" variant="outline" onClick={() => review(it.code, false)}>
                  <X className="h-4 w-4 mr-1" />반려
                </Button>
              </div>
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function AuditLogs() {
  const [logs, setLogs] = useState<AuditRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<string>("all");

  const load = async () => {
    setBusy(true);
    let req = supabase.from("card_audit_logs")
      .select("id,card_code,action,actor_id,created_at,note,before_data,after_data")
      .order("created_at", { ascending: false })
      .limit(200);
    if (filter !== "all") req = req.eq("action", filter);
    if (q.trim()) req = req.ilike("card_code", `%${q.trim()}%`);
    const { data, error } = await req;
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setLogs((data ?? []) as AuditRow[]);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter]);

  const actionColor = (a: string) =>
    a === "approved" ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400" :
    a === "rejected" ? "bg-destructive/15 text-destructive" :
    a === "deleted" ? "bg-orange-500/15 text-orange-700 dark:text-orange-400" :
    a === "created" ? "bg-blue-500/15 text-blue-700 dark:text-blue-400" :
    "bg-muted text-muted-foreground";

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-3 flex-wrap">
        <div>
          <CardTitle className="text-base">감사 로그 ({logs.length}건)</CardTitle>
          <CardDescription>최근 200건. 카드 코드/액션으로 필터링.</CardDescription>
        </div>
        <div className="flex gap-2">
          <Input value={q} onChange={e => setQ(e.target.value)} placeholder="카드 코드 검색"
                 className="h-8 w-40" onKeyDown={e => e.key === "Enter" && load()} />
          <select value={filter} onChange={e => setFilter(e.target.value)}
                  className="h-8 rounded-md border bg-background px-2 text-sm">
            <option value="all">전체</option>
            <option value="created">생성</option>
            <option value="updated">수정</option>
            <option value="approved">승인</option>
            <option value="rejected">반려</option>
            <option value="deleted">삭제</option>
          </select>
          <Button size="sm" variant="outline" onClick={load} disabled={busy}>
            <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="border-b bg-muted/30">
              <tr className="text-left">
                <th className="px-3 py-2">시각</th>
                <th className="px-3 py-2">액션</th>
                <th className="px-3 py-2">카드 코드</th>
                <th className="px-3 py-2">담당</th>
                <th className="px-3 py-2">메모/변경 요약</th>
              </tr>
            </thead>
            <tbody>
              {logs.map(l => (
                <tr key={l.id} className="border-b border-border/40">
                  <td className="px-3 py-1.5 whitespace-nowrap">{new Date(l.created_at).toLocaleString("ko-KR")}</td>
                  <td className="px-3 py-1.5">
                    <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${actionColor(l.action)}`}>{l.action}</span>
                  </td>
                  <td className="px-3 py-1.5 font-mono">{l.card_code}</td>
                  <td className="px-3 py-1.5 font-mono text-muted-foreground">{l.actor_id?.slice(0, 8) ?? "-"}</td>
                  <td className="px-3 py-1.5 text-muted-foreground"><DiffSummary log={l} /></td>
                </tr>
              ))}
              {logs.length === 0 && (
                <tr><td colSpan={5} className="text-center py-6 text-muted-foreground">로그가 없습니다.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

function DiffSummary({ log }: { log: AuditRow }) {
  if (log.note) return <span>“{log.note}”</span>;
  if (log.action === "created") return <span>새 카드: {(log.after_data?.name as string) ?? ""}</span>;
  if (log.action === "deleted") return <span>삭제됨: {(log.before_data?.name as string) ?? ""}</span>;
  const before = log.before_data ?? {};
  const after = log.after_data ?? {};
  const changes: string[] = [];
  const keys = ["name", "status", "rarity", "image_url", "set_code", "type", "cost", "power"];
  for (const k of keys) {
    if (JSON.stringify(before[k]) !== JSON.stringify(after[k])) {
      changes.push(`${k}: ${String(before[k] ?? "∅")} → ${String(after[k] ?? "∅")}`);
    }
  }
  if (changes.length === 0) return <span>변경 없음</span>;
  return <span>{changes.slice(0, 3).join(" · ")}{changes.length > 3 ? ` +${changes.length - 3}` : ""}</span>;
}
