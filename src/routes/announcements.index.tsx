import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Megaphone, Pin, Plus, Eye, Trash2, Pencil, ExternalLink } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type Announcement = Database["public"]["Tables"]["announcements"]["Row"];

export const Route = createFileRoute("/announcements/")({
  head: () => ({
    meta: [
      { title: "공지사항 — DuelNight" },
      { name: "description", content: "DuelNight 공식 공지사항과 메타 정보." },
    ],
  }),
  component: AnnouncementsPage,
});

function AnnouncementsPage() {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const qc = useQueryClient();
  const [editing, setEditing] = useState<Announcement | "new" | null>(null);
  const [reading, setReading] = useState<Announcement | null>(null);

  const { data: items = [] } = useQuery({
    queryKey: ["announcements"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("announcements")
        .select("*")
        .order("pinned", { ascending: false })
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data ?? []) as Announcement[];
    },
  });

  const openRead = async (a: Announcement) => {
    setReading(a);
    await supabase.rpc("increment_announcement_views", { _id: a.id });
    qc.invalidateQueries({ queryKey: ["announcements"] });
  };

  const remove = async (id: string) => {
    if (!confirm("이 공지를 삭제할까요?")) return;
    const { error } = await supabase.from("announcements").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success("삭제했어요");
    qc.invalidateQueries({ queryKey: ["announcements"] });
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8">
      <PageHeader title="공지사항" description="DuelNight 공식 소식과 메타 정보">
        {isAdmin && (
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="mr-1 h-4 w-4" /> 새 공지
          </Button>
        )}
      </PageHeader>

      {items.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={Megaphone}
            title="공지사항이 없어요"
            description={
              isAdmin
                ? "‘새 공지’ 버튼으로 첫 공지를 작성하세요."
                : "관리자가 공지를 등록하면 이곳에 표시됩니다."
            }
          />
        </div>
      ) : (
        <ul className="mt-6 divide-y divide-border rounded-lg border border-border bg-card">
          {items.map((a) => (
            <li key={a.id}>
              <button
                onClick={() => openRead(a)}
                className="flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-muted/50"
              >
                {a.pinned && (
                  <Pin className="h-4 w-4 shrink-0 fill-primary text-primary" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{a.title}</p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(a.created_at).toLocaleDateString()} ·{" "}
                    <Eye className="inline h-3 w-3" /> {a.view_count}
                  </p>
                </div>
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <Link
                    to="/announcements/$id"
                    params={{ id: a.id }}
                    aria-label="공유 페이지 열기"
                    className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Link>
                  {isAdmin && (
                    <>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => setEditing(a)}
                        aria-label="수정"
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => remove(a.id)}
                        aria-label="삭제"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </>
                  )}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}

      {!isAdmin && user && (
        <p className="mt-4 text-xs text-muted-foreground">
          관리자 권한이 있는 계정만 공지를 작성할 수 있습니다.
        </p>
      )}

      <ReadDialog item={reading} onClose={() => setReading(null)} />
      {editing && (
        <EditDialog
          item={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={() => qc.invalidateQueries({ queryKey: ["announcements"] })}
          authorId={user?.id ?? ""}
        />
      )}
    </div>
  );
}

function ReadDialog({
  item,
  onClose,
}: {
  item: Announcement | null;
  onClose: () => void;
}) {
  return (
    <Dialog open={!!item} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        {item && (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                {item.pinned && <Pin className="h-4 w-4 fill-primary text-primary" />}
                {item.title}
              </DialogTitle>
              <p className="text-xs text-muted-foreground">
                {new Date(item.created_at).toLocaleString()} · 조회 {item.view_count}
              </p>
            </DialogHeader>
            <div className="whitespace-pre-wrap text-sm leading-relaxed">
              {item.body}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({
  item,
  onClose,
  onSaved,
  authorId,
}: {
  item: Announcement | null;
  onClose: () => void;
  onSaved: () => void;
  authorId: string;
}) {
  const [title, setTitle] = useState(item?.title ?? "");
  const [body, setBody] = useState(item?.body ?? "");
  const [pinned, setPinned] = useState(item?.pinned ?? false);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!title.trim() || !body.trim()) {
      return toast.error("제목과 본문을 입력하세요");
    }
    setSaving(true);
    if (item) {
      const { error } = await supabase
        .from("announcements")
        .update({ title: title.trim(), body: body.trim(), pinned })
        .eq("id", item.id);
      setSaving(false);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("announcements").insert({
        title: title.trim(),
        body: body.trim(),
        pinned,
        author_id: authorId,
      });
      setSaving(false);
      if (error) return toast.error(error.message);
    }
    toast.success("저장했어요");
    onSaved();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{item ? "공지 수정" : "새 공지"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="ann-title">제목</Label>
            <Input
              id="ann-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="공지 제목"
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ann-body">본문</Label>
            <Textarea
              id="ann-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder="공지 본문"
              className="min-h-40"
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch id="ann-pinned" checked={pinned} onCheckedChange={setPinned} />
            <Label htmlFor="ann-pinned">상단 고정</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            취소
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? "저장 중…" : "저장"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
