/**
 * 시즌 성적표 — dak.gg 성적표 스타일의 게이미피케이션 카드.
 * 데이터 주입형(내부에서 fetch 하지 않음). 인트로(쇼케이스)·홈(나) 양쪽에서 재사용.
 *
 * 설계: docs/INTRO_HOME_REDESIGN.md §3, §6
 */
import { Link } from "@tanstack/react-router";
import { Swords, Flame, TrendingUp } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { computeStats, computeStreak, fmtPct, type Match } from "@/lib/match-stats";
import { getTier, getTopPercentile } from "@/lib/tier";
import { getSeasonLabel } from "@/lib/season";
import { useI18n, type TranslationKey } from "@/i18n/language-context";

export interface SeasonReportProps {
  game: string;
  matches: Match[];
  rating: number | null;
  displayName: string;
  username?: string | null;
  avatarUrl?: string | null;
  /** 백분위 계산용(선택). */
  rank?: number | null;
  total?: number | null;
  /** "나" 모드면 1인칭 카피 + /matches 링크 노출. */
  mode?: "me" | "showcase";
}

function Bar({ value }: { value: number }) {
  // value: 0..1
  const pct = Math.round(value * 100);
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
    </div>
  );
}

export function SeasonReport({
  game,
  matches,
  rating,
  displayName,
  username,
  avatarUrl,
  rank,
  total,
  mode = "me",
}: SeasonReportProps) {
  const { t } = useI18n();
  const stats = computeStats(matches);
  const streak = computeStreak(matches);
  const tier = getTier(rating);
  const pct = getTopPercentile(rank ?? 0, total ?? 0);

  const streakLabel =
    streak.current > 0
      ? t("seasonReport.winStreak", { n: streak.current })
      : streak.current < 0
        ? t("seasonReport.loseStreak", { n: Math.abs(streak.current) })
        : "—";

  const summary = [
    {
      label: t("seasonReport.overallWinRate"),
      value: fmtPct(stats.overall),
      hint: t("seasonReport.record", {
        wins: stats.overall.wins,
        losses: stats.overall.losses,
        total: stats.overall.total,
      }),
    },
    {
      label: t("seasonReport.currentStreak"),
      value: streakLabel,
      hint: t("seasonReport.bestStreak", { best: streak.best }),
      flame: streak.current > 0,
    },
    {
      label: t("seasonReport.firstWinRate"),
      value: fmtPct(stats.first),
      hint: t("seasonReport.games", { n: stats.first.total }),
    },
    {
      label: t("seasonReport.secondWinRate"),
      value: fmtPct(stats.second),
      hint: t("seasonReport.games", { n: stats.second.total }),
    },
  ];

  const topDecks = stats.byDeck.slice(0, 3);
  const topMatchups = stats.matchups.slice(0, 6);

  return (
    <section className="rounded-2xl border border-border bg-card p-5">
      {/* 헤더 */}
      <div className="flex items-center gap-3">
        <Avatar className="h-12 w-12">
          <AvatarImage src={avatarUrl ?? undefined} />
          <AvatarFallback>{(displayName ?? "?").slice(0, 1)}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <p className="truncate text-base font-semibold">{displayName}</p>
            {username && <span className="text-xs text-muted-foreground">@{username}</span>}
          </div>
          <p className="text-xs text-muted-foreground">
            {t(`matches.${game}` as TranslationKey)} · {getSeasonLabel()}
          </p>
        </div>
        <div className="text-right">
          <span
            className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold ${tier.border} ${tier.bg} ${tier.text}`}
          >
            {t(tier.labelKey as TranslationKey)}
          </span>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {rating != null ? `${rating} RP` : "—"}
            {pct != null && ` · ${t("seasonReport.topPercent", { pct })}`}
          </p>
        </div>
      </div>

      {/* 요약 스탯 */}
      <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        {summary.map((s) => (
          <div key={s.label} className="rounded-xl border border-border bg-background/40 p-3">
            <p className="text-[11px] text-muted-foreground">{s.label}</p>
            <p className="mt-1 flex items-center gap-1 text-xl font-bold tracking-tight">
              {s.flame && <Flame className="h-4 w-4 text-orange-500" />}
              {s.value}
            </p>
            <p className="mt-0.5 text-[10px] text-muted-foreground">{s.hint}</p>
          </div>
        ))}
      </div>

      {/* 모스트 덱 Top3 */}
      {topDecks.length > 0 && (
        <div className="mt-5">
          <h3 className="flex items-center gap-1.5 text-sm font-medium">
            <TrendingUp className="h-4 w-4 text-primary" />
            {t("seasonReport.mostDecks")}
          </h3>
          <div className="mt-2 grid gap-2 sm:grid-cols-3">
            {topDecks.map((d, i) => (
              <div key={d.deck} className="rounded-xl border border-border bg-background/40 p-3">
                <div className="flex items-center justify-between">
                  <p className="truncate text-sm font-medium">
                    <span className="text-muted-foreground">#{i + 1}</span> {d.deck}
                  </p>
                  <span className="shrink-0 text-sm font-bold">{fmtPct(d.stats)}</span>
                </div>
                <div className="mt-2">
                  <Bar value={d.stats.winRate} />
                </div>
                <p className="mt-1.5 text-[10px] text-muted-foreground">
                  {t("seasonReport.record", {
                    wins: d.stats.wins,
                    losses: d.stats.losses,
                    total: d.stats.total,
                  })}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 상대 메타(매치업) */}
      {topMatchups.length > 0 && (
        <div className="mt-5">
          <h3 className="flex items-center gap-1.5 text-sm font-medium">
            <Swords className="h-4 w-4 text-primary" />
            {t("seasonReport.opponentMeta")}
          </h3>
          <div className="mt-2 space-y-2">
            {topMatchups.map((m) => (
              <div
                key={`${m.deck}__${m.opponent}`}
                className="flex items-center gap-3 rounded-lg border border-border bg-background/40 px-3 py-2"
              >
                <p className="min-w-0 flex-1 truncate text-xs">
                  <span className="font-medium">{m.deck}</span>
                  <span className="mx-1 text-muted-foreground">vs</span>
                  <span className="font-medium">{m.opponent}</span>
                </p>
                <div className="hidden w-28 sm:block">
                  <Bar value={m.stats.winRate} />
                </div>
                <span className="w-10 shrink-0 text-right text-xs font-semibold">
                  {fmtPct(m.stats)}
                </span>
                <span className="w-12 shrink-0 text-right text-[10px] text-muted-foreground">
                  {t("seasonReport.games", { n: m.stats.total })}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {mode === "me" && (
        <Link
          to="/matches"
          className="mt-5 inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          {t("seasonReport.viewAllMatches")} →
        </Link>
      )}
    </section>
  );
}
