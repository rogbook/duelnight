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
import { useI18n } from "@/i18n/language-context";

type Announcement = Database["public"]["Tables"]["announcements"]["Row"];

export const Route = createFileRoute("/announcements/")({
  head: () => {
    let locale = "ko";
    if (typeof window !== "undefined") {
      locale = localStorage.getItem("duelnight.i18n.locale") || "ko";
    }
    const titles: Record<string, string> = {
      ko: "공지사항 — DuelNight",
      en: "Announcements — DuelNight",
      ja: "お知らせ — DuelNight",
    };
    const descs: Record<string, string> = {
      ko: "DuelNight 공식 공지사항과 메타 정보.",
      en: "DuelNight official announcements and meta updates.",
      ja: "DuelNight公式のお知らせとメタ情報。",
    };
    return {
      meta: [
        { title: titles[locale] || titles.ko },
        { name: "description", content: descs[locale] || descs.ko },
      ],
    };
  },
  component: AnnouncementsPage,
});

function AnnouncementsPage() {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const qc = useQueryClient();
  const { t } = useI18n();
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
    if (!confirm(t("announcements.confirmDelete"))) return;
    const { error } = await supabase.from("announcements").delete().eq("id", id);
    if (error) return toast.error(error.message);
    toast.success(t("announcements.deleteSuccess"));
    qc.invalidateQueries({ queryKey: ["announcements"] });
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8">
      <PageHeader title={t("announcements.title")} description={t("announcements.desc")}>
        {isAdmin && (
          <Button size="sm" onClick={() => setEditing("new")}>
            <Plus className="mr-1 h-4 w-4" /> {t("announcements.newAnnouncement")}
          </Button>
        )}
      </PageHeader>

      {items.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={Megaphone}
            title={t("announcements.emptyTitle")}
            description={
              isAdmin
                ? t("announcements.emptyDescAdmin")
                : t("announcements.emptyDescUser")
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
                    <Eye className="inline h-3 w-3" /> {t("announcements.viewCount", { count: a.view_count })}
                  </p>
                </div>
                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                  <Link
                    to="/announcements/$id"
                    params={{ id: a.id }}
                    aria-label={t("announcements.ariaSharePage")}
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
                        aria-label={t("common.edit")}
                      >
                        <Pencil className="h-4 w-4" />
                      </Button>
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-8 w-8"
                        onClick={() => remove(a.id)}
                        aria-label={t("common.delete")}
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
          {t("announcements.adminOnlyNote")}
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
  const { t } = useI18n();

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
                {new Date(item.created_at).toLocaleString()} · {t("announcements.viewCount", { count: item.view_count })}
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
  const { t } = useI18n();
  const [title, setTitle] = useState(item?.title ?? "");
  const [body, setBody] = useState(item?.body ?? "");
  const [pinned, setPinned] = useState(item?.pinned ?? false);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!title.trim() || !body.trim()) {
      return toast.error(t("announcements.toastTitleBodyRequired"));
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
    toast.success(t("announcements.saveSuccess"));
    onSaved();
    onClose();
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{item ? t("announcements.editTitle") : t("announcements.newTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label htmlFor="ann-title">{t("announcements.fieldTitle")}</Label>
            <Input
              id="ann-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t("announcements.placeholderTitle")}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ann-body">{t("announcements.fieldBody")}</Label>
            <Textarea
              id="ann-body"
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={t("announcements.placeholderBody")}
              className="min-h-40"
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch id="ann-pinned" checked={pinned} onCheckedChange={setPinned} />
            <Label htmlFor="ann-pinned">{t("announcements.fieldPinned")}</Label>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? t("announcements.saving") : t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
