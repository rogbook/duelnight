import { useState } from "react";

const GAMES = [
  { id: "optcg", label: "원피스" },
  { id: "ptcg", label: "포켓몬" },
  { id: "dtcg", label: "디지몬" },
] as const;

export function GameFilter() {
  const [active, setActive] = useState<string>("all");
  const items = [{ id: "all", label: "전체" }, ...GAMES];
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
