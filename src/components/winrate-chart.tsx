import { useMemo } from "react";
import { Line, LineChart, CartesianGrid, XAxis, YAxis, ResponsiveContainer } from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  ChartLegend,
  ChartLegendContent,
  type ChartConfig,
} from "@/components/ui/chart";
import type { Match } from "@/lib/match-stats";

const PALETTE = [
  "hsl(var(--chart-1, 220 70% 50%))",
  "hsl(var(--chart-2, 160 60% 45%))",
  "hsl(var(--chart-3, 30 80% 55%))",
  "hsl(var(--chart-4, 280 65% 60%))",
];
const ROLLING_COLOR = "hsl(var(--chart-5, 0 0% 50%))";

export type ChartUnit = "day" | "week" | "month";
const ROLLING_WINDOW = 7;

interface Series {
  key: string;
  label: string;
  color: string;
  dashed?: boolean;
}

const startOfWeek = (d: Date) => {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  const day = (x.getDay() + 6) % 7; // Mon=0
  x.setDate(x.getDate() - day);
  return x;
};

const bucketKey = (iso: string, unit: ChartUnit): string => {
  const d = new Date(iso);
  if (unit === "day") return d.toISOString().slice(0, 10);
  if (unit === "week") return startOfWeek(d).toISOString().slice(0, 10);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
};

export function WinRateChart({ rows, unit = "day" }: { rows: Match[]; unit?: ChartUnit }) {
  const { data, config, series } = useMemo(() => {
    if (rows.length === 0) {
      return {
        data: [] as Array<Record<string, number | string>>,
        config: {} as ChartConfig,
        series: [] as Series[],
      };
    }

    // Top 3 decks by total matches
    const deckCount = new Map<string, number>();
    for (const m of rows) deckCount.set(m.my_deck, (deckCount.get(m.my_deck) ?? 0) + 1);
    const topDecks = [...deckCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3)
      .map(([d]) => d);

    const series: Series[] = [
      { key: "overall", label: "전체", color: PALETTE[0] },
      ...topDecks.map((d, i) => ({
        key: `deck:${d}`,
        label: d,
        color: PALETTE[i + 1],
      })),
      { key: "rolling", label: `최근 ${ROLLING_WINDOW}판`, color: ROLLING_COLOR, dashed: true },
    ];

    const sorted = [...rows].sort(
      (a, b) => new Date(a.played_at).getTime() - new Date(b.played_at).getTime(),
    );

    // Group by chosen unit
    const buckets = new Map<string, Match[]>();
    for (const m of sorted) {
      const k = bucketKey(m.played_at, unit);
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k)!.push(m);
    }

    // Cumulative tallies for overall + per-deck lines
    const tallies = new Map<string, { w: number; d: number }>();
    for (const s of series) tallies.set(s.key, { w: 0, d: 0 });

    // Rolling window over all decided matches
    const window: number[] = []; // 1 = win, 0 = loss

    const data: Array<Record<string, number | string>> = [];
    for (const [bucket, matches] of [...buckets.entries()].sort()) {
      for (const m of matches) {
        if (m.result === "draw") continue;
        const isWin = m.result === "win";
        const overall = tallies.get("overall")!;
        if (isWin) overall.w++;
        overall.d++;
        const dk = `deck:${m.my_deck}`;
        if (tallies.has(dk)) {
          const t = tallies.get(dk)!;
          if (isWin) t.w++;
          t.d++;
        }
        window.push(isWin ? 1 : 0);
        if (window.length > ROLLING_WINDOW) window.shift();
      }
      const point: Record<string, number | string> = { date: bucket };
      for (const s of series) {
        if (s.key === "rolling") {
          point.rolling =
            window.length === 0
              ? 0
              : Math.round((window.reduce((a, b) => a + b, 0) / window.length) * 1000) / 10;
        } else {
          const t = tallies.get(s.key)!;
          point[s.key] = t.d === 0 ? 0 : Math.round((t.w / t.d) * 1000) / 10;
        }
      }
      data.push(point);
    }

    const config: ChartConfig = Object.fromEntries(
      series.map((s) => [s.key, { label: s.label, color: s.color }]),
    );

    return { data, config, series };
  }, [rows, unit]);

  if (data.length === 0) {
    return (
      <p className="px-4 py-12 text-center text-xs text-muted-foreground">
        선택한 기간에 데이터가 없습니다
      </p>
    );
  }

  const formatTick = (v: string) => {
    if (unit === "month") return v;
    return v.slice(5);
  };

  return (
    <ChartContainer config={config} className="h-64 w-full px-2 pb-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ left: 4, right: 12, top: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} className="stroke-border" />
          <XAxis
            dataKey="date"
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11 }}
            tickFormatter={formatTick}
          />
          <YAxis
            domain={[0, 100]}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11 }}
            tickFormatter={(v: number) => `${v}%`}
            width={36}
          />
          <ChartTooltip content={<ChartTooltipContent formatter={(v) => `${v}%`} />} />
          <ChartLegend content={<ChartLegendContent />} />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={s.dashed ? 1.5 : 2}
              strokeDasharray={s.dashed ? "4 3" : undefined}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
