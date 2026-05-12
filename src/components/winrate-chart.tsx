import { useMemo } from "react";
import {
  Line,
  LineChart,
  CartesianGrid,
  XAxis,
  YAxis,
  ResponsiveContainer,
} from "recharts";
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

const dayKey = (iso: string) => new Date(iso).toISOString().slice(0, 10);

interface Series {
  key: string;
  label: string;
  color: string;
}

export function WinRateChart({ rows }: { rows: Match[] }) {
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
    ];

    // Sort ascending by date
    const sorted = [...rows].sort(
      (a, b) => new Date(a.played_at).getTime() - new Date(b.played_at).getTime(),
    );

    // Group by day (cumulative across all days within the filtered range)
    const days = new Map<string, Match[]>();
    for (const m of sorted) {
      const k = dayKey(m.played_at);
      if (!days.has(k)) days.set(k, []);
      days.get(k)!.push(m);
    }

    // Running tallies per series
    const tallies = new Map<string, { w: number; d: number }>();
    for (const s of series) tallies.set(s.key, { w: 0, d: 0 });

    const data: Array<Record<string, number | string>> = [];
    for (const [day, matches] of [...days.entries()].sort()) {
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
      }
      const point: Record<string, number | string> = { date: day };
      for (const s of series) {
        const t = tallies.get(s.key)!;
        point[s.key] = t.d === 0 ? 0 : Math.round((t.w / t.d) * 1000) / 10;
      }
      data.push(point);
    }

    const config: ChartConfig = Object.fromEntries(
      series.map((s) => [s.key, { label: s.label, color: s.color }]),
    );

    return { data, config, series };
  }, [rows]);

  if (data.length === 0) {
    return (
      <p className="px-4 py-12 text-center text-xs text-muted-foreground">
        선택한 기간에 데이터가 없습니다
      </p>
    );
  }

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
            tickFormatter={(v: string) => v.slice(5)}
          />
          <YAxis
            domain={[0, 100]}
            tickLine={false}
            axisLine={false}
            tick={{ fontSize: 11 }}
            tickFormatter={(v: number) => `${v}%`}
            width={36}
          />
          <ChartTooltip
            content={<ChartTooltipContent formatter={(v) => `${v}%`} />}
          />
          <ChartLegend content={<ChartLegendContent />} />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              name={s.label}
              stroke={s.color}
              strokeWidth={2}
              dot={false}
              isAnimationActive={false}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </ChartContainer>
  );
}
