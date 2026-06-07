import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { CalendarDays, Plus, Trash2, MapPin, ExternalLink, Star } from "lucide-react";
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
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { useGames } from "@/hooks/use-games";
import type { Database } from "@/integrations/supabase/types";
import { useI18n } from "@/i18n/language-context";

type Game = string;
type EventKind = Database["public"]["Enums"]["event_kind"];
type Event = Database["public"]["Tables"]["events"]["Row"];

export const Route = createFileRoute("/calendar")({
  head: () => {
    let locale = "ko";
    if (typeof window !== "undefined") {
      locale = localStorage.getItem("duelnight.i18n.locale") || "ko";
    }
    const titles: Record<string, string> = {
      ko: "대회·발매 캘린더 — DuelNight",
      en: "Event Calendar — DuelNight",
      ja: "大会・発売カレンダー — DuelNight",
    };
    const descs: Record<string, string> = {
      ko: "지역·게임별 TCG 대회, 상품 발매, 매칭 일정.",
      en: "TCG tournaments, product releases, and match schedules by region and game.",
      ja: "地域・ゲーム別TCG大会、商品発売、マッチング日程。",
    };
    return {
      meta: [
        { title: titles[locale] || titles.ko },
        { name: "description", content: descs[locale] || descs.ko },
      ],
    };
  },
  component: CalendarPage,
});

function CalendarPage() {
  const { user } = useAuth();
  const { t, language } = useI18n();
  const { games, labelOf } = useGames();
  const [game, setGame] = useState<Game | "all">("all");
  const [kind, setKind] = useState<EventKind | "all">("all");
  const [scope, setScope] = useState<"upcoming" | "past">("upcoming");

  const dateLocale = language === "ko" ? "ko-KR" : language === "ja" ? "ja-JP" : "en-US";

  const KIND_LABEL: Record<EventKind | "all", string> = {
    all: t("calendar.kindAll"),
    tournament: t("calendar.kindTournament"),
    release: t("calendar.kindRelease"),
    match: t("calendar.kindMatch"),
  };

  const { data: profile } = useQuery({
    queryKey: ["profile-primary-game", user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data } = await supabase
        .from("profiles")
        .select("primary_game")
        .eq("id", user.id)
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });
  const primaryGame = profile?.primary_game ?? null;

  const { data: events = [], refetch } = useQuery({
    queryKey: ["events", game, kind, scope],
    queryFn: async () => {
      const nowIso = new Date().toISOString();
      let q = supabase.from("events").select("*");
      if (game !== "all") q = q.eq("game", game);
      if (kind !== "all") q = q.eq("kind", kind);
      if (scope === "upcoming") {
        q = q.gte("starts_at", nowIso).order("starts_at", { ascending: true });
      } else {
        q = q.lt("starts_at", nowIso).order("starts_at", { ascending: false });
      }
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []) as Event[];
    },
  });

  const { data: favIds = new Set<string>() } = useQuery({
    queryKey: ["event-favorites", user?.id],
    queryFn: async () => {
      if (!user) return new Set<string>();
      const { data } = await supabase
        .from("event_favorites")
        .select("event_id")
        .eq("user_id", user.id);
      return new Set((data ?? []).map((r) => r.event_id));
    },
    enabled: !!user,
  });

  const sortedEvents = useMemo(() => {
    if (!primaryGame) return events;
    return [...events].sort((a, b) => {
      const aP = a.game === primaryGame ? 0 : 1;
      const bP = b.game === primaryGame ? 0 : 1;
      if (aP !== bP) return aP - bP;
      return new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime();
    });
  }, [events, primaryGame]);

  const grouped = useMemo(() => {
    const map = new Map<string, Event[]>();
    for (const ev of sortedEvents) {
      const key = new Date(ev.starts_at).toLocaleDateString(dateLocale, {
        year: "numeric",
        month: "long",
        day: "numeric",
        weekday: "short",
      });
      const arr = map.get(key) ?? [];
      arr.push(ev);
      map.set(key, arr);
    }
    return [...map.entries()];
  }, [sortedEvents, dateLocale]);

  const toggleFav = async (eventId: string, isFav: boolean) => {
    if (!user) {
      toast.error(t("calendar.loginRequiredToast"));
      return;
    }
    if (isFav) {
      await supabase
        .from("event_favorites")
        .delete()
        .eq("user_id", user.id)
        .eq("event_id", eventId);
    } else {
      await supabase
        .from("event_favorites")
        .insert({ user_id: user.id, event_id: eventId });
    }
    refetch();
    void supabase
      .from("event_favorites")
      .select("event_id")
      .eq("user_id", user.id);
  };

  return (
    <div className="mx-auto w-full max-w-4xl px-6 py-8">
      <PageHeader title={t("calendar.title")} description={t("calendar.desc")}>
        <Select value={game} onValueChange={(v) => setGame(v as Game | "all")}>
          <SelectTrigger className="w-[120px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("matches.all")}</SelectItem>
            {games.map((g) => (
              <SelectItem key={g.code} value={g.code}>{labelOf(g.code)}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={scope} onValueChange={(v) => setScope(v as "upcoming" | "past")}>
          <SelectTrigger className="w-[110px]"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="upcoming">{t("calendar.upcoming")}</SelectItem>
            <SelectItem value="past">{t("calendar.past")}</SelectItem>
          </SelectContent>
        </Select>
        {user ? (
          <NewEventDialog onCreated={() => refetch()} />
        ) : (
          <Button asChild size="sm">
            <Link to="/login">{t("calendar.loginRequiredBtn")}</Link>
          </Button>
        )}
      </PageHeader>

      <Tabs value={kind} onValueChange={(v) => setKind(v as EventKind | "all")} className="mt-4">
        <TabsList>
          <TabsTrigger value="all">{KIND_LABEL.all}</TabsTrigger>
          <TabsTrigger value="tournament">{KIND_LABEL.tournament}</TabsTrigger>
          <TabsTrigger value="release">{KIND_LABEL.release}</TabsTrigger>
          <TabsTrigger value="match">{KIND_LABEL.match}</TabsTrigger>
        </TabsList>
      </Tabs>

      {primaryGame && (
        <p className="mt-3 text-xs text-muted-foreground">
          {t("calendar.myPrimaryGame")}{" "}
          <span className="font-medium text-foreground">{labelOf(primaryGame)}</span>{" "}
          {t("calendar.primaryPriorityDesc")}
        </p>
      )}

      {events.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={CalendarDays}
            title={t("calendar.emptyTitle")}
            description={t("calendar.emptyDesc")}
          />
        </div>
      ) : (
        <div className="mt-6 space-y-6">
          {grouped.map(([date, items]) => (
            <section key={date}>
              <h2 className="text-xs font-medium text-muted-foreground">{date}</h2>
              <ul className="mt-2 space-y-2">
                {items.map((ev) => {
                  const isFav = favIds.has(ev.id);
                  const isPrimary = primaryGame && ev.game === primaryGame;
                  return (
                    <li
                      key={ev.id}
                      className={`rounded-lg border bg-card p-4 ${isPrimary ? "border-primary/40" : "border-border"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                              {labelOf(ev.game)}
                            </span>
                            <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-secondary-foreground">
                              {KIND_LABEL[ev.kind]}
                            </span>
                            <Link
                              to="/events/$id"
                              params={{ id: ev.id }}
                              className="truncate text-sm font-semibold hover:underline"
                            >
                              {ev.title}
                            </Link>
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
                            <span>
                              {new Date(ev.starts_at).toLocaleTimeString(dateLocale, {
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </span>
                            {ev.early_release_at && (
                              <span className="rounded bg-amber-500/10 px-1.5 py-0.5 text-amber-600 dark:text-amber-400">
                                {t("calendar.earlyRelease")}{" "}
                                {new Date(ev.early_release_at).toLocaleDateString(dateLocale)}
                              </span>
                            )}
                            {ev.location && (
                              <span className="inline-flex items-center gap-1">
                                <MapPin className="h-3 w-3" />
                                {ev.location}
                              </span>
                            )}
                            {(ev.product_url || ev.url) && (
                              <a
                                href={ev.product_url ?? ev.url ?? "#"}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-foreground hover:underline"
                                onClick={(e) => e.stopPropagation()}
                              >
                                <ExternalLink className="h-3 w-3" />
                                {ev.kind === "release" ? t("calendar.official") : t("calendar.detail")}
                              </a>
                            )}
                          </div>
                          {ev.notes && (
                            <p className="mt-2 whitespace-pre-wrap text-xs text-foreground/80">
                              {ev.notes}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          {user && (
                            <button
                              onClick={() => toggleFav(ev.id, isFav)}
                              className={isFav ? "text-amber-500" : "text-muted-foreground hover:text-amber-500"}
                              title={isFav ? t("calendar.removeFav") : t("calendar.addFav")}
                            >
                              <Star className="h-4 w-4" fill={isFav ? "currentColor" : "none"} />
                            </button>
                          )}
                          {user?.id === ev.user_id && (
                            <button
                              onClick={async () => {
                                if (!confirm(t("calendar.confirmDelete"))) return;
                                const { error } = await supabase
                                  .from("events")
                                  .delete()
                                  .eq("id", ev.id);
                                if (error) toast.error(error.message);
                                else {
                                  toast.success(t("calendar.deleteSuccess"));
                                  refetch();
                                }
                              }}
                              className="text-muted-foreground hover:text-destructive"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </div>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

function NewEventDialog({ onCreated }: { onCreated: () => void }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    kind: "tournament" as EventKind,
    game: "optcg" as Game,
    title: "",
    starts_at: "",
    ends_at: "",
    early_release_at: "",
    has_early: false,
    location: "",
    url: "",
    product_url: "",
    notes: "",
  });

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!form.title.trim() || !form.starts_at) {
      toast.error(t("calendar.toastRequiredFields"));
      return;
    }
    const { error } = await supabase.from("events").insert({
      user_id: user.id,
      kind: form.kind,
      game: form.game,
      title: form.title.trim(),
      starts_at: new Date(form.starts_at).toISOString(),
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      early_release_at:
        form.kind === "release" && form.has_early && form.early_release_at
          ? new Date(form.early_release_at).toISOString()
          : null,
      location: form.location.trim() || null,
      url: form.url.trim() || null,
      product_url: form.kind === "release" ? form.product_url.trim() || null : null,
      notes: form.notes.trim() || null,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(t("calendar.addSuccess"));
    setOpen(false);
    setForm({
      kind: "tournament",
      game: "optcg",
      title: "",
      starts_at: "",
      ends_at: "",
      early_release_at: "",
      has_early: false,
      location: "",
      url: "",
      product_url: "",
      notes: "",
    });
    qc.invalidateQueries({ queryKey: ["events"] });
    onCreated();
  };

  const isRelease = form.kind === "release";
  const isMatch = form.kind === "match";

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="mr-1 h-4 w-4" />
          {t("calendar.addEvent")}
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader><DialogTitle>{t("calendar.addEvent")}</DialogTitle></DialogHeader>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>{t("calendar.fieldKind")}</Label>
              <Select
                value={form.kind}
                onValueChange={(v) => setForm({ ...form, kind: v as EventKind })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="tournament">{t("calendar.kindTournament")}</SelectItem>
                  <SelectItem value="release">{t("calendar.kindRelease")}</SelectItem>
                  <SelectItem value="match">{t("calendar.kindMatch")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("calendar.fieldGame")}</Label>
              <Select
                value={form.game}
                onValueChange={(v) => setForm({ ...form, game: v as Game })}
              >
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="optcg">{t("matches.optcg")}</SelectItem>
                  <SelectItem value="ptcg">{t("matches.ptcg")}</SelectItem>
                  <SelectItem value="dtcg">{t("matches.dtcg")}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>{isRelease ? t("calendar.fieldNameProduct") : t("calendar.fieldNameTitle")}</Label>
            <Input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>{isRelease ? t("calendar.fieldDateRelease") : t("calendar.fieldDateStart")}</Label>
              <Input
                type="datetime-local"
                value={form.starts_at}
                onChange={(e) => setForm({ ...form, starts_at: e.target.value })}
                required
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>{t("calendar.fieldDateEnd")}</Label>
              <Input
                type="datetime-local"
                value={form.ends_at}
                onChange={(e) => setForm({ ...form, ends_at: e.target.value })}
              />
            </div>
          </div>
          {isRelease && (
            <>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.has_early}
                  onChange={(e) => setForm({ ...form, has_early: e.target.checked })}
                />
                {t("calendar.hasEarlyRelease")}
              </label>
              {form.has_early && (
                <div className="flex flex-col gap-1.5">
                  <Label>{t("calendar.fieldDateEarly")}</Label>
                  <Input
                    type="datetime-local"
                    value={form.early_release_at}
                    onChange={(e) => setForm({ ...form, early_release_at: e.target.value })}
                  />
                </div>
              )}
              <div className="flex flex-col gap-1.5">
                <Label>{t("calendar.officialUrl")}</Label>
                <Input
                  type="url"
                  value={form.product_url}
                  onChange={(e) => setForm({ ...form, product_url: e.target.value })}
                  placeholder="https://"
                />
              </div>
            </>
          )}
          {!isRelease && (
            <div className="flex flex-col gap-1.5">
              <Label>{isMatch ? t("calendar.fieldLocationShop") : t("calendar.fieldLocation")}</Label>
              <Input
                value={form.location}
                onChange={(e) => setForm({ ...form, location: e.target.value })}
              />
            </div>
          )}
          {!isRelease && (
            <div className="flex flex-col gap-1.5">
              <Label>{t("calendar.detailUrl")}</Label>
              <Input
                type="url"
                value={form.url}
                onChange={(e) => setForm({ ...form, url: e.target.value })}
                placeholder="https://"
              />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label>{t("calendar.fieldNotes")}</Label>
            <Textarea
              rows={3}
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              placeholder={isMatch ? t("calendar.placeholderNotesMatch") : t("calendar.placeholderNotesNormal")}
            />
          </div>
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit">{t("calendar.btnRegister")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
