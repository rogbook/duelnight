import { useState } from "react";
import { useGames } from "@/hooks/use-games";
import { useI18n } from "@/i18n/language-context";

export function GameFilter() {
  const { games, labelOf } = useGames();
  const { language } = useI18n();
  const [active, setActive] = useState<string>("all");
  const allLabel = language === "en" ? "All" : language === "ja" ? "全体" : "전체";
  const items = [{ id: "all", label: allLabel }, ...games.map((g) => ({ id: g.code, label: labelOf(g.code) }))];
  return (
    <div className="inline-flex items-center gap-1 rounded-lg border border-border bg-card p-1">
      {items.map((g) => (
        <button
          key={g.id}
          onClick={() => setActive(g.id)}
          className={
            "rounded-md px-3 py-1.5 text-xs font-medium transition-colors " +
            (active === g.id
              ? "bg-foreground text-background"
              : "text-muted-foreground hover:text-foreground")
          }
        >
          {g.label}
        </button>
      ))}
    </div>
  );
}
