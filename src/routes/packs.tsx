import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PackageOpen, Sparkles, ImageOff, Library, Layers, RotateCw, LogIn } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { LoginModal } from "@/components/login-modal";
import { Button } from "@/components/ui/button";
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

type Card = Database["public"]["Tables"]["cards"]["Row"];

export const Route = createFileRoute("/packs")({
  head: () => {
    let locale = "ko";
    if (typeof window !== "undefined") {
      locale = localStorage.getItem("duelnight.i18n.locale") || "ko";
    }
    const titles: Record<string, string> = {
      ko: "팩 시뮬레이터 — DuelNight",
      en: "Pack Simulator — DuelNight",
      ja: "パックシミュレーター — DuelNight",
    };
    const descs: Record<string, string> = {
      ko: "OPTCG 부스터 팩 개봉 시뮬레이션.",
      en: "OPTCG booster pack opening simulation.",
      ja: "OPTCGブースターパック開封シミュレーション。",
    };
    return {
      meta: [
        { title: titles[locale] || titles.ko },
        { name: "description", content: descs[locale] || descs.ko },
      ],
    };
  },
  component: PacksPage,
});

const PACK_SIZE = 12;
const RARITY_ORDER = ["SEC", "SR", "R", "UC", "C", "L"];

function pickWeighted<T>(items: T[], weight: (t: T) => number): T {
  const total = items.reduce((s, i) => s + weight(i), 0);
  let r = Math.random() * total;
  for (const it of items) {
    r -= weight(it);
    if (r <= 0) return it;
  }
  return items[items.length - 1];
}

function rarityWeight(r: string | null | undefined): number {
  switch ((r ?? "").toUpperCase()) {
    case "SEC":
      return 1;
    case "SR":
      return 4;
    case "R":
      return 12;
    case "UC":
      return 30;
    case "C":
      return 50;
    case "L":
      return 0; // leaders not in packs
    default:
      return 20;
  }
}

function PacksPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const qc = useQueryClient();
  const [setCode, setSetCode] = useState<string>("");
  const [packs, setPacks] = useState<number>(1);
  const [results, setResults] = useState<Card[]>([]);
  const [newCodes, setNewCodes] = useState<Set<string>>(new Set());
  const [loginOpen, setLoginOpen] = useState(false);

  const packOptions = useMemo(
    () => [
      { label: t("packs.packLabel", { count: 1, cards: 12 }), packs: 1 },
      { label: t("packs.packLabel", { count: 5, cards: 60 }), packs: 5 },
      { label: t("packs.packLabel", { count: 10, cards: 120 }), packs: 10 },
      { label: t("packs.boxLabel"), packs: 24 },
    ],
    [t],
  );

  const { data: sets = [] } = useQuery({
    queryKey: ["pack-sets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cards")
        .select("set_code")
        .order("set_code", { ascending: false });
      if (error) throw error;
      const arr = Array.from(new Set((data ?? []).map((r) => r.set_code)));
      if (arr.length > 0 && !setCode) setSetCode(arr[0]);
      return arr;
    },
  });

  const { data: pool = [] } = useQuery({
    queryKey: ["pack-pool", setCode],
    enabled: !!setCode,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cards")
        .select("*")
        .eq("set_code", setCode)
        .neq("type", "leader");
      if (error) throw error;
      return (data ?? []) as Card[];
    },
  });

  const open = async () => {
    if (pool.length === 0) {
      toast.error(t("packs.noCardsError"));
      return;
    }
    const rares = pool.filter((c) => ["SR", "SEC"].includes((c.rarity ?? "").toUpperCase()));
    const commons = pool.filter((c) => !["SR", "SEC"].includes((c.rarity ?? "").toUpperCase()));
    const pulled: Card[] = [];
    for (let p = 0; p < packs; p++) {
      if (rares.length > 0) {
        pulled.push(pickWeighted(rares, (c) => rarityWeight(c.rarity)));
      }
      const restPool = commons.length > 0 ? commons : pool;
      const restCount = PACK_SIZE - (rares.length > 0 ? 1 : 0);
      for (let i = 0; i < restCount; i++) {
        pulled.push(pickWeighted(restPool, (c) => rarityWeight(c.rarity)));
      }
    }
    setResults(pulled);
    setNewCodes(new Set());

    if (!user) {
      toast.info(t("packs.loginRequiredToast"));
      return;
    }

    try {
      const codes = Array.from(new Set(pulled.map((c) => c.code)));
      const { data: current, error: selectError } = await supabase
        .from("user_collection")
        .select("card_code, quantity")
        .eq("user_id", user.id)
        .in("card_code", codes);

      if (selectError) throw selectError;

      const currentMap = new Map<string, number>();
      for (const r of current ?? []) {
        currentMap.set(r.card_code, r.quantity);
      }

      // 이번 개봉으로 처음 얻은(컬렉션에 없던) 카드 표시
      setNewCodes(new Set(codes.filter((code) => (currentMap.get(code) ?? 0) === 0)));

      const upsertData = codes.map((code) => {
        const pulledCount = pulled.filter((c) => c.code === code).length;
        const existingQty = currentMap.get(code) ?? 0;
        return {
          user_id: user.id,
          card_code: code,
          quantity: existingQty + pulledCount,
        };
      });

      const { error: upsertError } = await supabase
        .from("user_collection")
        .upsert(upsertData, { onConflict: "user_id,card_code" });

      if (upsertError) throw upsertError;

      qc.invalidateQueries({ queryKey: ["collection"] });
      toast.success(t("packs.savedToCollection"));
    } catch (err: any) {
      console.error("Failed to save pack results to collection:", err);
      toast.error(t("packs.saveError") + err.message);
    }
  };

  const tally = useMemo(() => {
    const m = new Map<string, { card: Card; count: number }>();
    for (const c of results) {
      const e = m.get(c.code);
      if (e) e.count += 1;
      else m.set(c.code, { card: c, count: 1 });
    }
    return Array.from(m.values()).sort((a, b) => {
      const ra = RARITY_ORDER.indexOf((a.card.rarity ?? "").toUpperCase());
      const rb = RARITY_ORDER.indexOf((b.card.rarity ?? "").toUpperCase());
      const na = ra === -1 ? 999 : ra;
      const nb = rb === -1 ? 999 : rb;
      if (na !== nb) return na - nb;
      return a.card.code.localeCompare(b.card.code);
    });
  }, [results]);

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <PageHeader title={t("packs.title")} description={t("packs.desc")} />

      <div className="mt-6 grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-[1fr_1fr_auto]">
        <Select value={setCode} onValueChange={setSetCode}>
          <SelectTrigger>
            <SelectValue placeholder={t("packs.selectSet")} />
          </SelectTrigger>
          <SelectContent>
            {sets.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(packs)} onValueChange={(v) => setPacks(Number(v))}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {packOptions.map((o) => (
              <SelectItem key={o.packs} value={String(o.packs)}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={open} className="gap-1">
          <Sparkles className="h-4 w-4" />
          {t("packs.openBtn")}
        </Button>
      </div>

      {results.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={PackageOpen}
            title={t("packs.emptyTitle")}
            description={t("packs.emptyDesc")}
          />
        </div>
      ) : (
        <>
          {/* ── 개봉 후 다음 행동 ── */}
          <div className="mt-6 flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold">{t("packs.nextTitle")}</p>
              <p className="text-xs text-muted-foreground">
                {user ? t("packs.savedNote", { count: tally.length }) : t("packs.loginToSaveNote")}
                {user && newCodes.size > 0 && (
                  <span className="ml-1 font-semibold text-primary">
                    · {t("packs.newCount", { count: newCodes.size })}
                  </span>
                )}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {user ? (
                <Button asChild variant="outline" className="gap-1">
                  <Link to="/collection">
                    <Library className="h-4 w-4" />
                    {t("packs.viewCollection")}
                  </Link>
                </Button>
              ) : (
                <Button variant="outline" className="gap-1" onClick={() => setLoginOpen(true)}>
                  <LogIn className="h-4 w-4" />
                  {t("packs.loginToSave")}
                </Button>
              )}
              <Button asChild variant="outline" className="gap-1">
                <Link to="/decks">
                  <Layers className="h-4 w-4" />
                  {t("packs.buildDeck")}
                </Link>
              </Button>
              <Button className="gap-1" onClick={open}>
                <RotateCw className="h-4 w-4" />
                {t("packs.openAgain")}
              </Button>
            </div>
          </div>

          <div className="mt-6">
            <p className="text-sm text-muted-foreground">
              {t("packs.summary", { total: results.length, count: tally.length })}
            </p>
          </div>

          <ul className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
            {tally.map(({ card, count }) => (
              <li
                key={card.code}
                className="overflow-hidden rounded-lg border border-border bg-card"
              >
                <div className="relative aspect-[5/7] w-full bg-muted">
                  {card.image_url ? (
                    <img
                      src={card.image_url}
                      alt={card.name}
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-muted-foreground">
                      <ImageOff className="h-6 w-6" />
                    </div>
                  )}
                  {card.rarity && (
                    <span className="absolute left-1 top-1 rounded bg-foreground/80 px-1.5 py-0.5 text-[10px] font-bold text-background">
                      {card.rarity}
                    </span>
                  )}
                  {count > 1 && (
                    <span className="absolute right-1 top-1 rounded bg-primary px-1.5 py-0.5 text-[10px] font-bold text-primary-foreground">
                      ×{count}
                    </span>
                  )}
                  {newCodes.has(card.code) && (
                    <span className="absolute bottom-1 left-1 rounded bg-emerald-500 px-1.5 py-0.5 text-[10px] font-bold text-white shadow">
                      {t("packs.newBadge")}
                    </span>
                  )}
                </div>
                <div className="p-2">
                  <p className="truncate text-[11px] text-muted-foreground">{card.code}</p>
                  <p className="truncate text-sm font-medium">{card.name}</p>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}

      <LoginModal open={loginOpen} onOpenChange={setLoginOpen} />
    </div>
  );
}
