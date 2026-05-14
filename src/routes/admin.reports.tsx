import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Lock, LogIn, Flag, Check, X as XIcon, ExternalLink } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { checkIsAdmin } from "@/lib/admin.functions";

export const Route = createFileRoute("/admin/reports")({
  head: () => ({
    meta: [
      { title: "신고 검토 — TCG Hub 관리자" },
      { name: "description", content: "댓글 신고 검토 및 처리." },
    ],
  }),
  component: ReportsPage,
});

type ReportRow = {
  id: string;
  comment_id: string;
  reporter_id: string;
  reason: string;
  status: string;
  admin_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  created_at: string;
  comment?: {
    id: string;
    body: string;
    user_id: string;
    post_id: string;
    created_at: string;
  } | null;
  reporter?: { display_name: string | null; username: string | null } | null;
  author?: { display_name: string | null; username: string | null } | null;
};

const TABS = [
  { key: "pending", label: "대기" },
  { key: "reviewed", label: "처리완료" },
  { key: "dismissed", label: "기각" },
] as const;

function ReportsPage() {
  const { user, loading } = useAuth();
  const fnIsAdmin = useServerFn(checkIsAdmin);
  const qc = useQueryClient();
  const [tab, setTab] = useState<(typeof TABS)[number]["key"]>("pending");

  const { data: amAdmin, isLoading: checkingAdmin } = useQuery({
    queryKey: ["am-admin", user?.id],
    enabled: !!user,
    queryFn: () => fnIsAdmin().then((r) => r.isAdmin),
  });

  const { data: reports = [], isLoading } = useQuery({
    queryKey: ["admin-reports", tab],
    enabled: !!amAdmin,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("lfg_comment_reports")
        .select("*")
        .eq("status", tab)
        .order("created_at", { ascending: false });
      if (error) throw error;
      const rows = (data ?? []) as ReportRow[];
      if (rows.length === 0) return rows;

      const commentIds = Array.from(new Set(rows.map((r) => r.comment_id)));
      const { data: comments } = await supabase
        .from("lfg_comments")
        .select("id, body, user_id, post_id, created_at")
        .in("id", commentIds);
      const cmap = new Map((comments ?? []).map((c) => [c.id, c]));

      const userIds = Array.from(
        new Set([
          ...rows.map((r) => r.reporter_id),
          ...(comments ?? []).map((c) => c.user_id),
        ]),
      );
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, display_name, username")
        .in("id", userIds);
      const pmap = new Map(
        (profs ?? []).map((p) => [
          p.id,
          { display_name: p.display_name, username: p.username },
        ]),
      );

      return rows.map((r) => {
        const comment = cmap.get(r.comment_id) ?? null;
        return {
          ...r,
          comment,
          reporter: pmap.get(r.reporter_id) ?? null,
          author: comment ? pmap.get(comment.user_id) ?? null : null,
        };
      });
    },
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ["admin-reports"] });
  };

  // ---- Guards ----
  if (loading || checkingAdmin) {
    return <Wrap>권한을 확인하는 중…</Wrap>;
  }
  if (!user) {
    return (
      <Wrap>
        <Guard
          icon={LogIn}
          title="로그인이 필요합니다"
          action={
            <Button asChild>
              <Link to="/login">로그인</Link>
            </Button>
          }
        />
      </Wrap>
    );
  }
  if (!amAdmin) {
    return (
      <Wrap>
        <Guard
          icon={Lock}
          title="관리자 전용 페이지입니다"
          action={
            <Button asChild variant="outline">
              <Link to="/">대시보드로</Link>
            </Button>
          }
        />
      </Wrap>
    );
  }

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8">
      <PageHeader
        title="댓글 신고 검토"
        description="신고된 댓글을 검토하고 처리 상태를 갱신합니다."
      />

      <div className="mt-6 flex gap-1 rounded-lg border border-border bg-card p-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex-1 rounded-md px-3 py-1.5 text-sm transition-colors ${
              tab === t.key
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {isLoading ? (
          <p className="py-10 text-center text-sm text-muted-foreground">불러오는 중…</p>
        ) : reports.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            {tab === "pending" ? "대기 중인 신고가 없어요." : "표시할 항목이 없습니다."}
          </p>
        ) : (
          reports.map((r) => (
            <ReportCard key={r.id} report={r} onAction={refresh} />
          ))
        )}
      </div>
    </div>
  );
}

function ReportCard({
  report,
  onAction,
}: {
  report: ReportRow;
  onAction: () => void;
}) {
  const [note, setNote] = useState(report.admin_note ?? "");
  const [busy, setBusy] = useState(false);

  const reporterName =
    report.reporter?.display_name || report.reporter?.username || "익명";
  const authorName =
    report.author?.display_name || report.author?.username || "알 수 없음";

  const update = async (status: "reviewed" | "dismissed") => {
    setBusy(true);
    const { error } = await supabase
      .from("lfg_comment_reports")
      .update({
        status,
        admin_note: note.trim() || null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", report.id);
    setBusy(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(status === "reviewed" ? "처리 완료로 변경됐어요." : "기각으로 변경됐어요.");
    onAction();
  };

  const deleteComment = async () => {
    if (!report.comment) return;
    if (!confirm("이 댓글을 삭제할까요? 되돌릴 수 없습니다.")) return;
    setBusy(true);
    const { error } = await supabase
      .from("lfg_comments")
      .delete()
      .eq("id", report.comment.id);
    if (error) {
      setBusy(false);
      toast.error(error.message);
      return;
    }
    // 삭제 후 자동으로 처리완료 처리
    await supabase
      .from("lfg_comment_reports")
      .update({
        status: "reviewed",
        admin_note: (note.trim() ? note.trim() + " / " : "") + "댓글 삭제됨",
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", report.id);
    setBusy(false);
    toast.success("댓글을 삭제하고 신고를 처리완료로 변경했어요.");
    onAction();
  };

  return (
    <article className="rounded-lg border border-border bg-card p-4">
      <header className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
        <div className="flex items-center gap-2">
          <Flag className="h-3.5 w-3.5 text-destructive" />
          <span>
            <span className="font-medium text-foreground">{reporterName}</span> 님이 신고
          </span>
          <span>·</span>
          <span>{new Date(report.created_at).toLocaleString("ko-KR")}</span>
        </div>
        {report.comment && (
          <Link
            to="/lfg/$id"
            params={{ id: report.comment.post_id }}
            className="inline-flex items-center gap-1 text-primary hover:underline"
          >
            게시글 보기 <ExternalLink className="h-3 w-3" />
          </Link>
        )}
      </header>

      <div className="mt-3 rounded-md border border-dashed border-border bg-muted/30 p-3">
        <p className="text-[11px] text-muted-foreground">신고 사유</p>
        <p className="mt-1 whitespace-pre-wrap text-sm">{report.reason}</p>
      </div>

      <div className="mt-3 rounded-md border border-border p-3">
        <p className="text-[11px] text-muted-foreground">
          신고된 댓글 — 작성자: <span className="font-medium text-foreground">{authorName}</span>
        </p>
        {report.comment ? (
          <p className="mt-1 whitespace-pre-wrap text-sm">{report.comment.body}</p>
        ) : (
          <p className="mt-1 text-sm italic text-muted-foreground">
            (댓글이 이미 삭제되었습니다)
          </p>
        )}
      </div>

      {report.status === "pending" ? (
        <div className="mt-3 space-y-2">
          <Textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="관리자 메모 (선택)"
            rows={2}
            maxLength={500}
          />
          <div className="flex flex-wrap justify-end gap-2">
            {report.comment && (
              <Button
                variant="destructive"
                size="sm"
                onClick={deleteComment}
                disabled={busy}
              >
                댓글 삭제 후 처리
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={() => update("dismissed")}
              disabled={busy}
              className="gap-1"
            >
              <XIcon className="h-4 w-4" /> 기각
            </Button>
            <Button
              size="sm"
              onClick={() => update("reviewed")}
              disabled={busy}
              className="gap-1"
            >
              <Check className="h-4 w-4" /> 처리완료
            </Button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 rounded-md bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <span>
            상태:{" "}
            <span className="font-semibold text-foreground">
              {report.status === "reviewed" ? "처리완료" : "기각"}
            </span>
            {report.reviewed_at &&
              ` · ${new Date(report.reviewed_at).toLocaleString("ko-KR")}`}
          </span>
          {report.admin_note && (
            <span className="truncate">메모: {report.admin_note}</span>
          )}
        </div>
      )}
    </article>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8">
      <PageHeader
        title="댓글 신고 검토"
        description="신고된 댓글을 검토하고 처리 상태를 갱신합니다."
      />
      <div className="mt-6">{children}</div>
    </div>
  );
}

function Guard({
  icon: Icon,
  title,
  action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-lg border-2 border-dashed border-border bg-card px-6 py-12 text-center">
      <div className="flex h-12 w-12 items-center justify-center rounded-full bg-muted">
        <Icon className="h-6 w-6 text-muted-foreground" />
      </div>
      <h2 className="text-base font-semibold">{title}</h2>
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}
