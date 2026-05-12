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
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type Card = Database["public"]["Tables"]["cards"]["Row"];

export const Route = createFileRoute("/collection")({
  head: () => ({
    meta: [
      { title: "내 컬렉션 — TCG Hub" },
      { name: "description", content: "보유 카드 등록과 세트별 진행률." },
    ],
  }),
  component: CollectionPage,
});

function CollectionPage() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [q, setQ] = useState("");

  const { data: cards = [] } = useQuery({
    queryKey: ["collection-cards"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cards")
        .select("*")
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

  const totalCards = cards.length;
  const haveUnique = useMemo(
    () => cards.filter((c) => (owned.get(c.code) ?? 0) > 0).length,
    [cards, owned],
  );
  const haveTotal = useMemo(
    () =>
      Array.from(owned.values()).reduce((s, n) => s + n, 0),
    [owned],
  );

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    if (!term) return cards;
    return cards.filter(
      (c) =>
        c.name.toLowerCase().includes(term) ||
        c.code.toLowerCase().includes(term),
    );
  }, [cards, q]);

  const setQty = async (code: string, next: number) => {
    if (!user) {
      toast.error("로그인이 필요합니다");
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
        <PageHeader title="내 컬렉션" description="보유 카드와 진행률을 관리하세요" />
        <div className="mt-6">
          <EmptyState
            icon={PackageOpen}
            title="로그인이 필요합니다"
            description="로그인하면 보유 카드를 등록하고 세트별 수집 진행률을 확인할 수 있어요."
          />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <PageHeader
        title="내 컬렉션"
        description="보유 카드와 세트별 진행률을 관리하세요"
      >
        <Button asChild variant="outline" size="sm">
          <Link to="/packs">팩 시뮬레이터</Link>
        </Button>
      </PageHeader>

      <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-3">
        <Stat label="보유 종류" value={`${haveUnique} / ${totalCards}`} />
        <Stat label="총 보유 매수" value={`${haveTotal}`} />
        <Stat
          label="전체 진행률"
          value={`${totalCards === 0 ? 0 : Math.round((haveUnique / totalCards) * 100)}%`}
        />
      </div>

      <section className="mt-6">
        <h2 className="text-sm font-semibold">세트별 진행률</h2>
        {setProgress.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">카드 데이터가 없습니다.</p>
        ) : (
          <ul className="mt-3 space-y-2">
            {setProgress.map(([set, p]) => (
              <li
                key={set}
                className="rounded-lg border border-border bg-card p-3"
              >
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium">{set}</span>
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
          <h2 className="text-sm font-semibold">카드별 수량</h2>
          <div className="relative w-64 max-w-full">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="카드명/번호 검색"
              className="pl-9"
            />
          </div>
        </div>

        {filtered.length === 0 ? (
          <p className="mt-3 text-sm text-muted-foreground">결과가 없습니다.</p>
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
                      aria-label="수량 감소"
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
                      aria-label="수량 증가"
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
