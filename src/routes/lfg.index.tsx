import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Users, Plus, Trash2, MapPin, Clock, X, Zap, Tag, Hash, ChevronDown } from "lucide-react";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { useI18n } from "@/i18n/language-context";
import { useGames } from "@/hooks/use-games";

type Game = string;
type Category = "friendly" | "tier" | "tournament_practice";
type Post = {
  id: string;
  user_id: string;
  game: Game;
  title: string;
  location: string | null;
  meet_at: string | null;
  body: string | null;
  status: string;
  created_at: string;
  store_id: string | null;
  category: Category;
  games_count: number | null;
  duration_minutes: number | null;
  quick_match: boolean;
  profiles?: { display_name: string | null; username: string | null } | null;
  store?: { id: string; name: string; address: string | null } | null;
};

type MenuOption<T extends string> = { value: T; label: string };

function MenuSelect<T extends string>({
  value,
  options,
  onChange,
  placeholder,
  className,
}: {
  value: T;
  options: MenuOption<T>[];
  onChange: (value: T) => void;
  placeholder?: string;
  className?: string;
}) {
  const selected = options.find((option) => option.value === value);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="outline" className={`justify-between font-normal ${className ?? ""}`}>
          <span className="truncate">{selected?.label ?? placeholder ?? "…"}</span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[var(--radix-dropdown-menu-trigger-width)]">
        {options.map((option) => (
          <DropdownMenuItem
            key={option.value}
            onSelect={() => onChange(option.value)}
            className={option.value === value ? "font-medium" : undefined}
          >
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export const Route = createFileRoute("/lfg/")({
  head: () => {
    let locale = "ko";
    if (typeof window !== "undefined") {
      locale = localStorage.getItem("duelnight.i18n.locale") || "ko";
    }
    const titles: Record<string, string> = {
      ko: "같이 칠 사람 — DuelNight",
      en: "Looking for Group — DuelNight",
      ja: "対戦相手募集 — DuelNight",
    };
    const descs: Record<string, string> = {
      ko: "지역·시간·게임을 적고 같이 플레이할 상대를 찾아보세요.",
      en: "Post your region, time, and game to find someone to play with.",
      ja: "地域・時間・ゲームを記入して一緒にプレイする相手を探しましょう。",
    };
    return {
      meta: [
        { title: titles[locale] || titles.ko },
        { name: "description", content: descs[locale] || descs.ko },
      ],
    };
  },
  component: LfgPage,
});

function LfgPage() {
  const { user } = useAuth();
  const { t } = useI18n();
  const { games, labelOf } = useGames();

  const GAME_OPTIONS: MenuOption<Game>[] = games.map((g) => ({ value: g.code, label: labelOf(g.code) }));
  const CATEGORY_OPTIONS: MenuOption<Category>[] = [
    { value: "friendly", label: t("lfg.categoryFriendly") },
    { value: "tier", label: t("lfg.categoryTier") },
    { value: "tournament_practice", label: t("lfg.categoryTournamentPractice") },
  ];
  const FILTER_GAME_OPTIONS: MenuOption<Game | "all">[] = [
    { value: "all", label: t("lfg.allGames") },
    ...GAME_OPTIONS,
  ];
  const FILTER_CATEGORY_OPTIONS: MenuOption<Category | "all">[] = [
    { value: "all", label: t("lfg.allCategories") },
    ...CATEGORY_OPTIONS,
  ];
  const STATUS_OPTIONS: MenuOption<"open" | "closed" | "all">[] = [
    { value: "open", label: t("lfg.statusOpen") },
    { value: "closed", label: t("lfg.statusClosed") },
    { value: "all", label: t("lfg.allStatuses") },
  ];

  const [game, setGame] = useState<Game | "all">("all");
  const [category, setCategory] = useState<Category | "all">("all");
  const [status, setStatus] = useState<"open" | "closed" | "all">("open");
  const [showForm, setShowForm] = useState(false);

  const { data: posts = [], refetch } = useQuery({
    queryKey: ["lfg-posts", game, category, status],
    queryFn: async () => {
      let q = supabase
        .from("lfg_posts")
        .select("id, user_id, game, title, location, meet_at, body, status, category, store_id, updated_at, games_count, duration_minutes, quick_match, created_at")
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
        title={t("lfg.title")}
        description={t("lfg.desc")}
      >
        {user ? (
          <Button size="sm" onClick={() => setShowForm((v) => !v)}>
            {showForm ? (
              <><X className="mr-1 h-4 w-4" /> {t("lfg.closeBtn")}</>
            ) : (
              <><Plus className="mr-1 h-4 w-4" /> {t("lfg.writeBtn")}</>
            )}
          </Button>
        ) : (
          <Button asChild size="sm">
            <Link to="/login">{t("lfg.loginWrite")}</Link>
          </Button>
        )}
      </PageHeader>

      <div className="mt-4 flex flex-wrap gap-2">
        <MenuSelect value={game} options={FILTER_GAME_OPTIONS} onChange={setGame} className="w-[120px]" />
        <MenuSelect value={category} options={FILTER_CATEGORY_OPTIONS} onChange={setCategory} className="w-[140px]" />
        <MenuSelect value={status} options={STATUS_OPTIONS} onChange={setStatus} className="w-[120px]" />
      </div>

      {user && showForm && (
        <InlineLfgForm
          onCreated={() => {
            refetch();
            setShowForm(false);
          }}
          onCancel={() => setShowForm(false)}
          gameOptions={GAME_OPTIONS}
          categoryOptions={CATEGORY_OPTIONS}
        />
      )}
      {!user && (
        <div className="mt-6 rounded-lg border border-dashed border-border bg-card/50 p-4 text-center text-sm text-muted-foreground">
          {t("lfg.loginRequiredNote").split("로그인").length > 1 ? (
            <>
              {t("lfg.loginRequiredNote").split("로그인")[0]}
              <Link to="/login" className="font-medium text-primary underline">{t("common.login")}</Link>
              {t("lfg.loginRequiredNote").split("로그인")[1]}
            </>
          ) : (
            <>{t("lfg.loginRequiredNote")} <Link to="/login" className="font-medium text-primary underline">{t("common.login")}</Link></>
          )}
        </div>
      )}

      {quickMatches.length > 0 && (
        <section className="mt-6">
          <h2 className="mb-2 inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-amber-500">
            <Zap className="h-3.5 w-3.5" /> {t("lfg.quickMatchSection")}
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
            title={t("lfg.emptyTitle")}
            description={t("lfg.emptyDesc")}
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
  const { t } = useI18n();
  const { labelOf } = useGames();
  const closed = p.status === "closed";
  const categoryLabels: Record<Category, string> = {
    friendly: t("lfg.categoryFriendly"),
    tier: t("lfg.categoryTier"),
    tournament_practice: t("lfg.categoryTournamentPractice"),
  };
  return (
    <li
      className={`relative rounded-lg border bg-card p-4 transition hover:border-primary/40 ${
        highlight ? "border-amber-500/50 bg-amber-500/5" : "border-border"
      } ${closed ? "opacity-70" : ""}`}
    >
      <Link to="/lfg/$id" params={{ id: p.id }} className="absolute inset-0 rounded-lg" aria-label={`${p.title}`} />
      <div className="pointer-events-none relative z-10 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
              {labelOf(p.game)}
            </span>
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
              {categoryLabels[p.category]}
            </span>
            {p.quick_match && (
              <span className="inline-flex items-center gap-0.5 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-medium text-amber-600">
                <Zap className="h-2.5 w-2.5" /> {t("lfg.quickLabel")}
              </span>
            )}
            <span
              className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${
                closed
                  ? "bg-muted text-muted-foreground"
                  : "bg-emerald-500/15 text-emerald-600"
              }`}
            >
              {closed ? t("lfg.statusClosed") : t("lfg.statusOpen")}
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
                {new Intl.DateTimeFormat("ko-KR", {
                  timeZone: "Asia/Seoul",
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(p.meet_at))}
              </span>
            )}
            {p.games_count != null && (
              <span className="inline-flex items-center gap-1">
                <Hash className="h-3 w-3" />
                {t("lfg.gamesCount", { count: p.games_count })}
              </span>
            )}
            {p.duration_minutes != null && (
              <span className="inline-flex items-center gap-1">
                <Tag className="h-3 w-3" />
                {t("lfg.durationMinutes", { minutes: p.duration_minutes })}
              </span>
            )}
            <span>by {p.profiles?.display_name || p.profiles?.username || t("lfg.anonymous")}</span>
          </div>
          {p.body && (
            <p className="mt-2 line-clamp-2 whitespace-pre-wrap text-sm text-foreground/90">
              {p.body}
            </p>
          )}
        </div>
        {userId === p.user_id && (
          <button
            onClick={async (e) => {
              e.preventDefault();
              e.stopPropagation();
              if (!confirm(t("lfg.deleteConfirm"))) return;
              const { error } = await supabase.from("lfg_posts").delete().eq("id", p.id);
              if (error) toast.error(error.message);
              else {
                toast.success(t("lfg.deleteSuccess"));
                onDelete();
              }
            }}
            className="pointer-events-auto text-muted-foreground hover:text-destructive"
            aria-label={t("lfg.deleteAriaLabel")}
          >
            <Trash2 className="h-4 w-4" />
          </button>
        )}
      </div>
    </li>
  );
}

function InlineLfgForm({
  onCreated,
  onCancel,
  gameOptions,
  categoryOptions,
}: {
  onCreated: () => void;
  onCancel: () => void;
  gameOptions: MenuOption<Game>[];
  categoryOptions: MenuOption<Category>[];
}) {
  const { user } = useAuth();
  const { t } = useI18n();
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
      toast.error(t("lfg.titleRequired"));
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
    toast.success(t("lfg.addSuccess"));
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
        <h2 className="text-sm font-semibold">{t("lfg.newPost")}</h2>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <Label>{t("lfg.fieldGame")}</Label>
          <MenuSelect value={form.game} options={gameOptions} onChange={(v) => setForm({ ...form, game: v, store_id: "" })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>{t("lfg.fieldCategory")}</Label>
          <MenuSelect value={form.category} options={categoryOptions} onChange={(v) => setForm({ ...form, category: v })} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>{t("lfg.fieldDateTime")}</Label>
          <Input
            type="datetime-local"
            value={form.meet_at}
            onChange={(e) => setForm({ ...form, meet_at: e.target.value })}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>{t("lfg.fieldTitle")}</Label>
        <Input
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
          placeholder={t("lfg.placeholderTitle")}
          maxLength={120}
          required
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>{t("lfg.fieldStore")}</Label>
        <Input
          placeholder={t("lfg.searchStorePlaceholder")}
          value={storeQuery}
          onChange={(e) => setStoreQuery(e.target.value)}
        />
        <MenuSelect
          value={form.store_id || "none"}
          options={[
            { value: "none", label: t("lfg.noStoreOption") },
            ...stores.map((s) => ({
              value: s.id,
              label: `${s.name}${s.address ? ` · ${s.address}` : ""}`,
            })),
          ]}
          onChange={(v) => setForm({ ...form, store_id: v === "none" ? "" : v })}
          placeholder={t("lfg.storeSelectPlaceholder")}
        />
        {!form.store_id && (
          <Input
            value={form.location}
            onChange={(e) => setForm({ ...form, location: e.target.value })}
            placeholder={t("lfg.locationPlaceholder")}
            maxLength={120}
          />
        )}
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>{t("lfg.fieldGamesCount")}</Label>
          <Input
            type="number"
            min={1}
            max={50}
            value={form.games_count}
            onChange={(e) => setForm({ ...form, games_count: e.target.value })}
            placeholder="e.g. 5"
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>{t("lfg.fieldDuration")}</Label>
          <Input
            type="number"
            min={10}
            max={600}
            value={form.duration_minutes}
            onChange={(e) => setForm({ ...form, duration_minutes: e.target.value })}
            placeholder="e.g. 120"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <Label>{t("lfg.fieldContact")}</Label>
          <Input
            value={form.contact}
            onChange={(e) => setForm({ ...form, contact: e.target.value })}
            placeholder={t("lfg.placeholderContact")}
            maxLength={120}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label>{t("lfg.fieldKakaoLink")}</Label>
          <Input
            value={form.kakao_link}
            onChange={(e) => setForm({ ...form, kakao_link: e.target.value })}
            placeholder="https://open.kakao.com/..."
            maxLength={300}
          />
        </div>
      </div>

      <div className="flex flex-col gap-1.5">
        <Label>{t("lfg.fieldDesc")}</Label>
        <Textarea
          value={form.body}
          onChange={(e) => setForm({ ...form, body: e.target.value })}
          placeholder={t("lfg.placeholderDesc")}
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
          <div className="font-medium">{t("lfg.quickMatchLabel")}</div>
          <div className="text-xs text-muted-foreground">{t("lfg.quickMatchNote")}</div>
        </div>
      </label>

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={handleCancel} disabled={submitting}>
          {t("common.cancel")}
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? t("lfg.submitting") : t("common.save")}
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{t("lfg.confirmCancelTitle")}</DialogTitle>
            <DialogDescription>{t("lfg.confirmCancelDesc")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>
              {t("lfg.keepWriting")}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setConfirmOpen(false);
                onCancel();
                toast(t("lfg.cancelledToast"));
              }}
            >
              {t("lfg.confirmCancelBtn")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </form>
  );
}
