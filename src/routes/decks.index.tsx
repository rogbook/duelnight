import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { Layers, Trash2 } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { PageHeader } from "@/components/page-header";
import { EmptyState } from "@/components/empty-state";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { DeckDialog } from "@/components/decks/deck-dialog";
import { colorHex, colorLabel, type Game } from "@/lib/deck-colors";
import type { Tables } from "@/integrations/supabase/types";
import { useI18n, type TranslationKey } from "@/i18n/language-context";
import { useGames } from "@/hooks/use-games";

type Deck = Tables<"decks">;

export const Route = createFileRoute("/decks/")({
  head: () => {
    let locale = "ko";
    if (typeof window !== "undefined") {
      locale = localStorage.getItem("duelnight.i18n.locale") || "ko";
    }
    const titles: Record<string, string> = {
      ko: "덱 빌더 — DuelNight",
      en: "Deck Builder — DuelNight",
      ja: "デッキビルダー — DuelNight",
    };
    const descs: Record<string, string> = {
      ko: "덱 레시피 저장 및 관리.",
      en: "Save and manage deck recipes.",
      ja: "デッキレシピの保存と管理。",
    };
    return {
      meta: [
        { title: titles[locale] || titles.ko },
        { name: "description", content: descs[locale] || descs.ko },
      ],
    };
  },
  component: DecksPage,
});

function DecksPage() {
  const { user, loading } = useAuth();
  const qc = useQueryClient();
  const [game, setGame] = useState<Game | "all">("all");
  const { t, language } = useI18n();
  const { labelOf } = useGames();

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
    if (!confirm(t("decks.deleteConfirm"))) return;
    const { error } = await supabase.from("decks").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success(t("decks.deletedToast"));
      qc.invalidateQueries({ queryKey: ["decks"] });
    }
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-8 text-sm text-muted-foreground">
        {t("decks.loading")}
      </div>
    );
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-6xl px-6 py-8">
        <PageHeader title={t("decks.title")} description={t("decks.loginRequired")} />
        <div className="mt-6 rounded-lg border border-dashed border-border bg-muted/30 px-6 py-16 text-center">
          <p className="text-sm text-muted-foreground">{t("decks.loginRequired")}</p>
          <Link
            to="/login"
            className="mt-4 inline-flex items-center justify-center rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background hover:opacity-90"
          >
            {t("decks.goToLogin")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-6 py-8">
      <PageHeader title={t("decks.title")} description={t("decks.desc")}>
        <div className="flex flex-wrap items-center gap-4">
          <DeckGameTabs value={game} onChange={setGame} counts={counts} />
          <DeckDialog
            mode="create"
            onSaved={() => qc.invalidateQueries({ queryKey: ["decks"] })}
            trigger={
              <Button size="sm">
                <Layers className="mr-1.5 h-4 w-4" /> {t("decks.addDeck")}
              </Button>
            }
          />
        </div>
      </PageHeader>

      {decks.length === 0 ? (
        <div className="mt-6">
          <EmptyState
            icon={Layers}
            title={t("decks.emptyTitle")}
            description={t("decks.emptyDesc")}
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
                    {labelOf(d.game)}
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
                    title={t("decks.recipeTooltip")}
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
                <p className="mt-3 line-clamp-2 text-xs text-muted-foreground">{d.notes}</p>
              )}
              <div className="mt-4 flex items-center justify-between text-[10px] text-muted-foreground border-t border-border/40 pt-3">
                <span>{d.is_public ? t("decks.public") : t("decks.private")}</span>
                <span>
                  {new Date(d.updated_at).toLocaleDateString(
                    language === "ko" ? "ko-KR" : language === "ja" ? "ja-JP" : "en-US",
                  )}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function ColorChip({ game, colorId }: { game: Game; colorId: string }) {
  const { language } = useI18n();
  return (
    <span className="inline-flex items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">
      <span
        className="h-2 w-2 rounded-full ring-1 ring-border"
        style={{ backgroundColor: colorHex(game, colorId) }}
      />
      {colorLabel(game, colorId, language)}
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
  const { t } = useI18n();
  const { games, labelOf } = useGames();
  const items: { id: Game | "all"; label: string }[] = [
    { id: "all", label: t("decks.all") },
    ...games.map((g) => ({ id: g.code as Game | "all", label: labelOf(g.code) })),
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
            <span className="ml-1 text-[10px] opacity-70">{counts.get(g.id)}</span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
