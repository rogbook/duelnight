import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Layers, Trash2, Search, X } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { DeckDialog } from "@/components/decks/deck-dialog";
import { GAME_LABEL } from "@/lib/match-stats";
import { colorHex, colorLabel, type Game } from "@/lib/deck-colors";
import type { Tables } from "@/integrations/supabase/types";

type Deck = Tables<"decks">;

export const Route = createFileRoute("/decks")({
  head: () => ({
    meta: [
      { title: "덱 빌더 — TCG Hub" },
      { name: "description", content: "덱 레시피 저장 및 관리." },
    ],
  }),
  component: DecksPage,
});

function DecksPage() {
  const { user, loading } = useAuth();
  const qc = useQueryClient();
  const [game, setGame] = useState<Game | "all">("all");

  const { data: decks = [] } = useQuery({
    queryKey: ["decks", user?.id, game],
    enabled: !!user,
    queryFn: async () => {
      let q = supabase
        .from("decks")
        .select("*")
        .eq("user_id", user!.id)
        .order("updated_at", { ascending: false });
      if (game !== "all") q = q.eq("game", game);
      const { data, error } = await q;
      if (error) throw error;
      return data as Deck[];
    },
  });

  const counts = useMemo(() => {
    const m = new Map<string, number>();
    for (const d of decks) m.set(d.game, (m.get(d.game) ?? 0) + 1);
    return m;
  }, [decks]);

  const onDelete = async (id: string) => {
    if (!confirm("이 덱을 삭제할까요? 연결된 전적은 유지됩니다.")) return;
    const { error } = await supabase.from("decks").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("삭제됨");
      qc.invalidateQueries({ queryKey: ["decks"] });
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-8 text-sm text-muted-foreground">
        불러오는 중...
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-8">
        <PageHeader title="덱 빌더" description="로그인 후 이용 가능" />
        <div className="mt-6 rounded-lg border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">로그인이 필요합니다</p>
          <Link
            to="/login"
            className="mt-4 inline-flex items-center justify-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
          >
            로그인하러 가기
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <PageHeader title="덱 빌더" description="내 덱을 저장하고 전적과 연결하세요">
        <div className="flex flex-wrap items-center gap-4">
          <DeckGameTabs value={game} onChange={setGame} counts={counts} />
          <DeckDialog
            mode="create"
            onSaved={() => qc.invalidateQueries({ queryKey: ["decks"] })}
            trigger={
              <Button size="sm">
                <Layers className="mr-1.5 h-4 w-4" /> 덱 추가
              </Button>
            }
          />
        </div>
      </PageHeader>

      {decks.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={Layers}
            title="저장된 덱이 없어요"
            description="우측 상단 '덱 추가'로 첫 덱을 등록해 보세요."
          />
        </div>
      ) : (
        <ul className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-3">
          {decks.map((d) => (
            <li
              key={d.id}
              className="rounded-lg border border-border bg-card p-4 transition-colors hover:border-primary/20"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <Link
                    to="/decks/$id"
                    params={{ id: d.id }}
                    className="block truncate text-sm font-bold hover:text-primary hover:underline"
                  >
                    {d.name}
                  </Link>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    {GAME_LABEL[d.game]}
                    {d.leader ? ` · ${d.leader}` : ""}
                  </p>
                  {d.colors && d.colors.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {d.colors.map((c) => (
                        <ColorChip key={c} game={d.game as Game} colorId={c} />
                      ))}
                    </div>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Link
                    to="/decks/$id"
                    params={{ id: d.id }}
                    title="덱 레시피"
                    className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                  >
                    <Layers className="h-4 w-4" />
                  </Link>
                  <DeckDialog
                    mode="edit"
                    deck={d}
                    onSaved={() => qc.invalidateQueries({ queryKey: ["decks"] })}
                  />
                  <button
                    onClick={() => onDelete(d.id)}
                    className="rounded p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
              {d.notes && (
                <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">
                  {d.notes}
                </p>
              )}
              <div className="mt-4 flex items-center justify-between text-[10px] text-muted-foreground border-t border-border/40 pt-3">
                <span>{d.is_public ? "공개" : "비공개"}</span>
                <span>{new Date(d.updated_at).toLocaleDateString("ko-KR")}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ColorChip({ game, colorId }: { game: Game; colorId: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
      <span
        className="h-2 w-2 rounded-full ring-1 ring-border"
        style={{ backgroundColor: colorHex(game, colorId) }}
      />
      {colorLabel(game, colorId)}
    </span>
  );
}

function DeckGameTabs({
  value,
  onChange,
  counts,
}: {
  value: Game | "all";
  onChange: (v: Game | "all") => void;
  counts: Map<string, number>;
}) {
  const items: { id: Game | "all"; label: string }[] = [
    { id: "all", label: "전체" },
    { id: "optcg", label: "원피스" },
    { id: "ptcg", label: "포켓몬" },
    { id: "dtcg", label: "디지몬" },
  ];
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1">
      {items.map((g) => (
        <button
          key={g.id}
          onClick={() => onChange(g.id)}
          className={
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors " +
            (value === g.id
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground")
          }
        >
          {g.label}
          {g.id !== "all" && counts.get(g.id) ? (
            <span className="ml-1 text-[10px] opacity-70">
              {counts.get(g.id)}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
