import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PackageOpen, Minus, Plus, ImageOff, Search } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { useI18n } from "@/i18n/language-context";
import { useGames } from "@/hooks/use-games";

type Card = Database["public"]["Tables"]["cards"]["Row"];
type Game = string;

export const Route = createFileRoute("/collection")({
  head: () => {
    let locale = "ko";
    if (typeof window !== "undefined") {
      locale = localStorage.getItem("duelnight.i18n.locale") || "ko";
    }
    const titles: Record<string, string> = {
      ko: "내 컬렉션 — DuelNight",
      en: "My Collection — DuelNight",
      ja: "マイコレクション — DuelNight",
    };
    const descs: Record<string, string> = {
      ko: "보유 카드 등록과 세트별 진행률.",
      en: "Register cards owned and check collection progress by set.",
      ja: "所持カード登録とセット別の進行率。",
    };
    return {
      meta: [
        { title: titles[locale] || titles.ko },
        { name: "description", content: descs[locale] || descs.ko },
      ],
    };
  },
  component: CollectionPage,
});

function CollectionPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { t } = useI18n();
  const { games, labelOf } = useGames();
  const [q, setQ] = useState("");
  const [game, setGame] = useState<Game>("optcg");
  const [setCode, setSetCode] = useState<string>("all");

  const { data: cards = [] } = useQuery({
    queryKey: ["collection-cards", game],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cards")
        .select("*")
        .eq("game", game)
        .order("code", { ascending: true });
      if (error) throw error;
      return (data ?? []) as Card[];
    },
  });

  const { data: owned = new Map<string, number>() } = useQuery({
    queryKey: ["collection", user?.id],
    enabled: !!user,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("user_collection")
        .select("card_code, quantity")
        .eq("user_id", user!.id);
      if (error) throw error;
      const m = new Map<string, number>();
      for (const r of data ?? []) m.set(r.card_code, r.quantity);
      return m;
    },
  });

  const sets = useMemo(() => {
    const s = new Set<string>();
    for (const c of cards) s.add(c.set_code);
    return Array.from(s).sort((a, b) => b.localeCompare(a));
  }, [cards]);

  const scopedCards = useMemo(
    () => (setCode === "all" ? cards : cards.filter((c) => c.set_code === setCode)),
    [cards, setCode],
  );

  const setProgress = useMemo(() => {
    const map = new Map<string, { total: number; have: number }>();
    for (const c of cards) {
      const e = map.get(c.set_code) ?? { total: 0, have: 0 };
      e.total += 1;
      if ((owned.get(c.code) ?? 0) > 0) e.have += 1;
      map.set(c.set_code, e);
    }
    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [cards, owned]);

  const totalCards = scopedCards.length;
  const haveUnique = useMemo(
    () => scopedCards.filter((c) => (owned.get(c.code) ?? 0) > 0).length,
    [scopedCards, owned],
  );
  const haveTotal = useMemo(
    () =>
      scopedCards.reduce((s, c) => s + (owned.get(c.code) ?? 0), 0),
    [scopedCards, owned],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return scopedCards;
    return scopedCards.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        c.code.toLowerCase().includes(term),
    );
  }, [scopedCards, q]);

  const setQty = async (code: string, next: number) => {
    if (!user) {
      toast.error(t("collection.loginRequiredToast"));
      return;
    }
    const n = Math.max(0, next);
    if (n === 0) {
      const { error } = await supabase
        .from("user_collection")
        .delete()
        .eq("user_id", user.id)
        .eq("card_code", code);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase
        .from("user_collection")
        .upsert(
          { user_id: user.id, card_code: code, quantity: n },
          { onConflict: "user_id,card_code" },
        );
      if (error) return toast.error(error.message);
    }
    qc.invalidateQueries({ queryKey: ["collection"] });
  };

  if (!user) {
    return (
      <div className="mx-auto w-full max-w-6xl px-6 py-8">
        <PageHeader title={t("collection.title")} description={t("collection.desc")} />
        <div className="mt-6">
          <EmptyState
            icon={PackageOpen}
            title={t("collection.loginRequired")}
            description={t("collection.loginRequiredDesc")}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <PageHeader
        title={t("collection.title")}
        description={t("collection.descAuth")}
      >
        <Button asChild variant="outline" size="sm">
          <Link to="/packs">{t("collection.packSimulator")}</Link>
        </Button>
      </PageHeader>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1">
          {games.map((g) => (
            <button
              key={g.code}
              onClick={() => {
                setGame(g.code);
                setSetCode("all");
                setQ("");
              }}
              className={
                "rounded-md px-3 py-1.5 text-xs font-medium transition-colors " +
                (game === g.code
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              {labelOf(g.code)}
            </button>
          ))}
        </div>

        <Select value={setCode} onValueChange={setSetCode}>
          <SelectTrigger className="w-48">
            <SelectValue placeholder={t("collection.selectSet")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("collection.allSets")}</SelectItem>
            {sets.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3">
        <Stat label={t("collection.statOwnedTypes")} value={`${haveUnique} / ${totalCards}`} />
        <Stat label={t("collection.statTotalQty")} value={`${haveTotal}`} />
        <Stat
          label={t("collection.statProgress")}
          value={`${totalCards === 0 ? 0 : Math.round((haveUnique / totalCards) * 100)}%`}
        />
      </div>

      <section className="mt-6">
        <h2 className="text-sm font-semibold">{t("collection.progressBySet")}</h2>
        {setProgress.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">{t("collection.noCardData")}</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {setProgress.map(([set, p]) => (
              <li
                key={set}
                className="rounded-lg border border-border bg-card p-3"
              >
                <div className="flex items-center justify-between text-sm">
                  <button
                    onClick={() => setSetCode(set)}
                    className="font-medium hover:underline"
                  >
                    {set}
                  </button>
                  <span className="text-muted-foreground">
                    {p.have} / {p.total}
                  </span>
                </div>
                <Progress
                  className="mt-2 h-2"
                  value={p.total === 0 ? 0 : (p.have / p.total) * 100}
                />
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mt-8">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold">
            {t("collection.qtyByCard")}{" "}
            {setCode !== "all" && <span className="text-muted-foreground">· {setCode}</span>}
          </h2>
          <div className="relative w-64 max-w-full">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={t("collection.searchPlaceholder")}
              className="pl-9"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">{t("collection.noResults")}</p>
        ) : (
          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
            {filtered.map((c) => {
              const qty = owned.get(c.code) ?? 0;
              return (
                <li
                  key={c.id}
                  className={`rounded-lg border bg-card p-2 ${
                    qty > 0 ? "border-primary/60" : "border-border"
                  }`}
                >
                  <div className="relative aspect-[5/7] w-full overflow-hidden rounded bg-muted">
                    {c.image_url ? (
                      <img
                        src={c.image_url}
                        alt={c.name}
                        loading="lazy"
                        className={`h-full w-full object-cover ${qty === 0 ? "opacity-40 grayscale" : ""}`}
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-muted-foreground">
                        <ImageOff className="h-6 w-6" />
                      </div>
                    )}
                    {qty > 0 && (
                      <span className="absolute right-1 top-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                        ×{qty}
                      </span>
                    )}
                  </div>
                  <p className="mt-1 truncate text-[11px] text-muted-foreground">
                    {c.code}
                  </p>
                  <p className="truncate text-sm font-medium">{c.name}</p>
                  <div className="mt-2 flex items-center justify-between gap-1">
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-7 w-7"
                      disabled={qty === 0}
                      onClick={() => setQty(c.code, qty - 1)}
                      aria-label={t("collection.decreaseQty")}
                    >
                      <Minus className="h-3 w-3" />
                    </Button>
                    <span className="min-w-6 text-center text-sm tabular-nums">
                      {qty}
                    </span>
                    <Button
                      size="icon"
                      variant="outline"
                      className="h-7 w-7"
                      onClick={() => setQty(c.code, qty + 1)}
                      aria-label={t("collection.increaseQty")}
                    >
                      <Plus className="h-3 w-3" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-2 text-2xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}
