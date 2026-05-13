import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PackageOpen, Sparkles, ImageOff } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
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

type Card = Database["public"]["Tables"]["cards"]["Row"];

export const Route = createFileRoute("/packs")({
  head: () => ({
    meta: [
      { title: "팩 시뮬레이터 — TCG Hub" },
      { name: "description", content: "OPTCG 부스터 팩 개봉 시뮬레이션." },
    ],
  }),
  component: PacksPage,
});

// 팩 1개당 12장. 보통 1 SR/SEC, 2 R, 나머지 C/UC. 데이터 부족 시 풀에서 균등.
const PACK_SIZE = 12;
const PACK_OPTIONS = [
  { label: "1팩 (12장)", packs: 1 },
  { label: "5팩 (60장)", packs: 5 },
  { label: "10팩 (120장)", packs: 10 },
  { label: "1박스 (24팩)", packs: 24 },
];

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
  const [setCode, setSetCode] = useState<string>("");
  const [packs, setPacks] = useState<number>(1);
  const [results, setResults] = useState<Card[]>([]);

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

  const open = () => {
    if (pool.length === 0) {
      toast.error("이 세트에는 개봉 가능한 카드가 없어요");
      return;
    }
    const rares = pool.filter((c) =>
      ["SR", "SEC"].includes((c.rarity ?? "").toUpperCase()),
    );
    const commons = pool.filter(
      (c) => !["SR", "SEC"].includes((c.rarity ?? "").toUpperCase()),
    );
    const pulled: Card[] = [];
    for (let p = 0; p < packs; p++) {
      // 1팩 = SR/SEC 보장 1장 + 나머지 가중치 추첨
      if (rares.length > 0) {
        // SEC는 SR보다 훨씬 희귀
        pulled.push(pickWeighted(rares, (c) => rarityWeight(c.rarity)));
      }
      const restPool = commons.length > 0 ? commons : pool;
      const restCount = PACK_SIZE - (rares.length > 0 ? 1 : 0);
      for (let i = 0; i < restCount; i++) {
        pulled.push(pickWeighted(restPool, (c) => rarityWeight(c.rarity)));
      }
    }
    setResults(pulled);
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
      <PageHeader
        title="팩 시뮬레이터"
        description="세트와 수량을 골라 부스터 개봉을 시뮬레이션하세요"
      />

      <div className="mt-6 grid gap-3 rounded-lg border border-border bg-card p-4 sm:grid-cols-[1fr_1fr_auto]">
        <Select value={setCode} onValueChange={setSetCode}>
          <SelectTrigger>
            <SelectValue placeholder="세트 선택" />
          </SelectTrigger>
          <SelectContent>
            {sets.map((s) => (
              <SelectItem key={s} value={s}>
                {s}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={String(packs)}
          onValueChange={(v) => setPacks(Number(v))}
        >
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {PACK_OPTIONS.map((o) => (
              <SelectItem key={o.packs} value={String(o.packs)}>
                {o.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button onClick={open} className="gap-1">
          <Sparkles className="h-4 w-4" />
          개봉하기
        </Button>
      </div>

      {results.length === 0 ? (
        <div className="mt-8">
          <EmptyState
            icon={PackageOpen}
            title="아직 개봉 결과가 없어요"
            description="세트와 팩 수량을 선택한 뒤 ‘개봉하기’를 눌러 보세요."
          />
        </div>
      ) : (
        <>
          <div className="mt-6">
            <p className="text-sm text-muted-foreground">
              총{" "}
              <span className="font-semibold text-foreground">
                {results.length}
              </span>
              장 · 종류{" "}
              <span className="font-semibold text-foreground">
                {tally.length}
              </span>
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
                </div>
                <div className="p-2">
                  <p className="truncate text-[11px] text-muted-foreground">
                    {card.code}
                  </p>
                  <p className="truncate text-sm font-medium">{card.name}</p>
                </div>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
