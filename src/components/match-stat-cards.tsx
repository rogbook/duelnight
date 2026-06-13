/**
 * Mobile card components for the Matches statistics page.
 * Used in src/routes/matches.tsx when useIsMobile() === true.
 * Desktop uses the original table/list components unchanged.
 */

import { useState } from "react";
import { Eye, Pencil, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/i18n/language-context";
import {
  fmtPct,
  fmtPctVal,
  type Match,
  type RatePack,
  type DeckStat,
  type MatchupStat,
  type EventStat,
  type OpponentFreq,
  type MatchStats,
  type StreakInfo,
} from "@/lib/match-stats";
import { OpponentDetailDialog } from "@/components/opponent-detail-dialog";
import type { Database } from "@/integrations/supabase/types";

type Game = string;

// ── Internal helpers ───────────────────────────────────────────────────────────

function ResultBadge({ r }: { r: "win" | "loss" | "draw" }) {
  const { t } = useI18n();
  const map = {
    win: "bg-game-win/10 text-game-win dark:text-game-win",
    loss: "bg-game-loss/10 text-game-loss dark:text-game-loss",
    draw: "bg-game-bg text-game-text-dim",
  } as const;
  const label = { win: t("matches.win"), loss: t("matches.lose"), draw: t("matches.draw") }[r];
  return (
    <span className={`inline-flex items-center rounded px-2 py-0.5 text-xs font-medium ${map[r]}`}>
      {label}
    </span>
  );
}

function HScrollSection({
  title,
  desc,
  children,
  className,
}: {
  title: string;
  desc?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("mt-5", className)}>
      <div className="mb-2">
        <h3 className="text-sm font-medium">{title}</h3>
        {desc && <p className="mt-0.5 text-[11px] text-game-text-dim">{desc}</p>}
      </div>
      <div className="-mx-6 overflow-x-auto scroll-smooth snap-x pb-3">
        <div className="flex gap-3 px-6">{children}</div>
      </div>
    </section>
  );
}

// ── 1. 승률 요약 — 수평 스크롤 ────────────────────────────────────────────────

function SummaryCard({
  label,
  value,
  sub,
  valueClass,
}: {
  label: string;
  value: string;
  sub: string;
  valueClass?: string;
}) {
  return (
    <div className="w-44 shrink-0 snap-start rounded-2xl border border-game-line bg-game-card p-4">
      <p className="text-[11px] text-game-text-dim">{label}</p>
      <p
        className={cn("mt-2 text-2xl font-semibold tracking-tight", valueClass ?? "text-game-text")}
      >
        {value}
      </p>
      <p className="mt-1 text-[11px] text-game-text-dim">{sub}</p>
    </div>
  );
}

function packSub(pack: RatePack, tWin: string, tLose: string, tDraw: string, tPlay: string) {
  return (
    `${pack.wins}${tWin} ${pack.losses}${tLose}` +
    (pack.draws ? ` ${pack.draws}${tDraw}` : "") +
    ` · ${pack.total}${tPlay}`
  );
}

export function MobileStatScroll({ stats, streak }: { stats: MatchStats; streak: StreakInfo }) {
  const { t } = useI18n();
  const W = t("matches.win");
  const L = t("matches.lose");
  const D = t("matches.draw");
  const P = t("matches.playCount");

  const cur = streak.current;
  const curLabel =
    cur === 0
      ? "—"
      : cur > 0
        ? `${cur}${t("matches.winsStreak")} 🔥`
        : `${-cur}${t("matches.lossesStreak")}`;
  const curClass =
    cur > 0
      ? "text-game-win dark:text-game-win"
      : cur < 0
        ? "text-game-loss dark:text-game-loss"
        : undefined;

  return (
    <section className="mt-5">
      <div className="-mx-6 overflow-x-auto scroll-smooth snap-x pb-3">
        <div className="flex gap-3 px-6">
          <SummaryCard
            label={t("matches.overallWinRate")}
            value={fmtPct(stats.overall)}
            sub={packSub(stats.overall, W, L, D, P)}
          />
          <SummaryCard
            label={t("matches.firstWinRate")}
            value={fmtPct(stats.first)}
            sub={packSub(stats.first, W, L, D, P)}
          />
          <SummaryCard
            label={t("matches.secondWinRate")}
            value={fmtPct(stats.second)}
            sub={packSub(stats.second, W, L, D, P)}
          />
          <SummaryCard
            label={t("matches.currentStreak")}
            value={curLabel}
            valueClass={curClass}
            sub={`${t("matches.bestStreak")} ${streak.best}${t("matches.winsStreak")} · ${t("matches.worstStreak")} ${streak.worst}${t("matches.lossesStreak")}`}
          />
          <SummaryCard
            label={t("matches.decksUsed")}
            value={String(stats.byDeck.length)}
            sub={t("matches.matchupCount").replace("{count}", String(stats.matchups.length))}
          />
        </div>
      </div>
    </section>
  );
}

// ── 2. 선후공 비율 카드 ────────────────────────────────────────────────────────

export function MobileTurnRatioCard({ stats }: { stats: MatchStats }) {
  const { t } = useI18n();
  const total = stats.first.total + stats.second.total;
  if (total === 0) return null;

  const firstPct = Math.round((stats.first.total / total) * 100);
  const secondPct = 100 - firstPct;

  return (
    <section className="mt-4">
      <div className="rounded-2xl border border-game-line bg-game-card p-4">
        <h3 className="mb-3 text-sm font-medium">{t("matches.turn")}</h3>

        {/* Ratio bar */}
        <div className="mb-4 flex items-center gap-2 text-xs">
          <span className="w-9 shrink-0 text-right text-game-text-dim">{t("matches.first")}</span>
          <div className="relative flex h-7 flex-1 overflow-hidden rounded-full bg-game-bg text-[10px] font-medium">
            <div
              className="flex h-full items-center justify-center bg-game-blue-deep text-white"
              style={{ width: `${firstPct}%` }}
            >
              {firstPct >= 18 ? `${firstPct}%` : ""}
            </div>
            <div className="flex h-full flex-1 items-center justify-center text-game-text-dim">
              {secondPct >= 18 ? `${secondPct}%` : ""}
            </div>
          </div>
          <span className="w-9 shrink-0 text-game-text-dim">{t("matches.second")}</span>
        </div>

        {/* Win-rate boxes */}
        <div className="grid grid-cols-2 gap-2">
          {[
            { label: t("matches.firstWinRate"), pack: stats.first },
            { label: t("matches.secondWinRate"), pack: stats.second },
          ].map(({ label, pack }) => (
            <div key={label} className="rounded-xl bg-game-bg/50 p-3 text-center">
              <p className="text-[10px] text-game-text-dim">{label}</p>
              <p className="mt-0.5 text-xl font-semibold">{fmtPct(pack)}</p>
              <p className="text-[10px] text-game-text-dim">
                {pack.wins}
                {t("matches.win")} {pack.losses}
                {t("matches.lose")} · {pack.total}
                {t("matches.playCount")}
              </p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ── 3. 덱별 성적 — 수평 스크롤 ────────────────────────────────────────────────

export function MobileDeckCards({ rows }: { rows: DeckStat[] }) {
  const { t } = useI18n();
  if (rows.length === 0) {
    return (
      <section className="mt-5">
        <h3 className="mb-1 text-sm font-medium">{t("matches.byDeck")}</h3>
        <p className="text-xs text-game-text-dim">{t("matches.noData")}</p>
      </section>
    );
  }
  return (
    <HScrollSection title={t("matches.byDeck")} desc={t("matches.byDeckDesc")}>
      {rows.map((r) => (
        <div
          key={r.deck}
          className="w-52 shrink-0 snap-start rounded-2xl border border-game-line bg-game-card p-4"
        >
          <p className="truncate text-sm font-medium">{r.deck}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{fmtPct(r.stats)}</p>
          <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-game-bg">
            <div
              className="h-full rounded-full bg-game-blue-deep/60 transition-[width]"
              style={{ width: `${Math.round((r.stats.winRate ?? 0) * 100)}%` }}
            />
          </div>
          <p className="mt-1.5 text-[11px] text-game-text-dim">
            {r.stats.wins}-{r.stats.losses}
            {r.stats.draws ? `-${r.stats.draws}` : ""} · {r.stats.total}
            {t("matches.playCount")}
          </p>
          <div className="mt-2 space-y-0.5 text-[11px] text-game-text-dim">
            <p>
              {t("matches.first")} {fmtPct(r.first)} ({r.first.total}
              {t("matches.playCount")})
            </p>
            <p>
              {t("matches.second")} {fmtPct(r.second)} ({r.second.total}
              {t("matches.playCount")})
            </p>
            <p className="text-[10px]">
              {t("matches.wilsonLow")} {fmtPctVal(r.stats.wilsonLow)}
            </p>
          </div>
        </div>
      ))}
    </HScrollSection>
  );
}

// ── 4. 매치업 — 수평 스크롤 ───────────────────────────────────────────────────

export function MobileMatchupCards({ rows }: { rows: MatchupStat[] }) {
  const { t } = useI18n();
  if (rows.length === 0) {
    return (
      <section className="mt-5">
        <h3 className="mb-1 text-sm font-medium">{t("matches.matchups")}</h3>
        <p className="text-xs text-game-text-dim">{t("matches.matchupRequired")}</p>
      </section>
    );
  }
  return (
    <HScrollSection title={t("matches.matchups")} desc={t("matches.matchupsDesc")}>
      {rows.slice(0, 12).map((r) => (
        <div
          key={`${r.deck}-${r.opponent}`}
          className="w-52 shrink-0 snap-start rounded-2xl border border-game-line bg-game-card p-4"
        >
          <p className="truncate text-xs text-game-text-dim">{r.deck}</p>
          <p className="text-[10px] text-game-text-dim">vs</p>
          <p className="truncate text-sm font-medium">{r.opponent}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{fmtPct(r.stats)}</p>
          <p className="mt-1 text-[11px] text-game-text-dim">
            {r.stats.wins}-{r.stats.losses}
            {r.stats.draws ? `-${r.stats.draws}` : ""} · {r.stats.total}
            {t("matches.playCount")}
          </p>
          <div className="mt-2 space-y-0.5 text-[11px] text-game-text-dim">
            <p>
              {t("matches.first")} {fmtPct(r.first)} ({r.first.total})
            </p>
            <p>
              {t("matches.second")} {fmtPct(r.second)} ({r.second.total})
            </p>
            <p className="text-[10px]">
              {t("matches.wilsonLow")} {fmtPctVal(r.stats.wilsonLow)}
            </p>
          </div>
        </div>
      ))}
    </HScrollSection>
  );
}

// ── 5. 이벤트별 — 수평 스크롤 ─────────────────────────────────────────────────

export function MobileEventCards({ rows }: { rows: EventStat[] }) {
  const { t } = useI18n();
  if (rows.length === 0) return null;

  const eventLabel = (ev: string) =>
    t(`matches.event${ev.charAt(0).toUpperCase() + ev.slice(1)}` as Parameters<typeof t>[0]);

  return (
    <HScrollSection title={t("matches.byEvent")}>
      {rows.map((r) => (
        <div
          key={r.event}
          className="w-44 shrink-0 snap-start rounded-2xl border border-game-line bg-game-card p-4"
        >
          <p className="text-[11px] text-game-text-dim">{eventLabel(r.event)}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight">{fmtPct(r.stats)}</p>
          <p className="mt-1 text-[11px] text-game-text-dim">
            {r.stats.wins}-{r.stats.losses}
            {r.stats.draws ? `-${r.stats.draws}` : ""} · {r.stats.total}
            {t("matches.playCount")}
          </p>
        </div>
      ))}
    </HScrollSection>
  );
}

// ── 6. 상대 메타 — 수직 카드 리스트 ───────────────────────────────────────────

export function MobileOpponentCards({
  rows,
  allRows,
  game,
}: {
  rows: OpponentFreq[];
  allRows: Match[];
  game: Game | "all";
}) {
  const { t } = useI18n();
  const [selected, setSelected] = useState<{ name: string; userId?: string | null } | null>(null);

  const matchesFor = (oppName: string) =>
    allRows.filter((m) => (m.opp_leader || m.opp_deck || "") === oppName);

  const userIdFor = (oppName: string): string | null =>
    allRows.find((m) => (m.opp_leader || m.opp_deck || "") === oppName && m.opponent_user_id)
      ?.opponent_user_id ?? null;

  const dialogGame: Game =
    game !== "all" ? game : selected ? (matchesFor(selected.name)[0]?.game ?? "optcg") : "optcg";

  if (rows.length === 0) return null;

  return (
    <section className="mt-5">
      <div className="mb-2">
        <h3 className="text-sm font-medium">{t("matches.oppMeta")}</h3>
        <p className="mt-0.5 text-[11px] text-game-text-dim">{t("matches.oppMetaDesc")}</p>
      </div>
      <div className="space-y-2">
        {rows.map((r) => (
          <button
            key={r.opponent}
            type="button"
            onClick={() => setSelected({ name: r.opponent, userId: userIdFor(r.opponent) })}
            className="w-full rounded-2xl border border-game-line bg-game-card p-4 text-left transition active:bg-game-bg/30"
          >
            <div className="flex items-start justify-between gap-2">
              <span className="truncate text-sm font-medium">{r.opponent}</span>
              <span className="shrink-0 text-sm font-semibold">{fmtPct(r.stats)}</span>
            </div>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-game-bg">
              <div
                className="h-full rounded-full bg-game-blue-deep/60"
                style={{ width: `${Math.round(r.share * 100)}%` }}
              />
            </div>
            <p className="mt-1.5 text-[11px] text-game-text-dim">
              {r.count}
              {t("matches.times")} · {fmtPctVal(r.share)}
            </p>
          </button>
        ))}
      </div>
      <OpponentDetailDialog
        open={!!selected}
        onOpenChange={(o) => !o && setSelected(null)}
        opponent={selected}
        game={dialogGame}
        myMatches={
          selected
            ? matchesFor(selected.name).map((m) => ({
                id: m.id,
                played_at: m.played_at,
                game: m.game,
                my_deck: m.my_deck,
                opp_leader: m.opp_leader,
                opp_deck: m.opp_deck,
                result: m.result as "win" | "loss" | "draw",
                went_first: m.went_first,
                points_delta: m.points_delta,
                opponent_user_id: m.opponent_user_id,
              }))
            : []
        }
      />
    </section>
  );
}

// ── 7. 최근 전적 — 수직 카드 리스트 (table 대체) ──────────────────────────────

export function MobileRecentCards({
  rows,
  oppNick,
  onOpponentClick,
  onView,
  onEdit,
  onDelete,
}: {
  rows: Match[];
  oppNick?: (m: Match) => string | null;
  onOpponentClick?: (m: Match) => void;
  onView: (m: Match) => void;
  onEdit: (m: Match) => void;
  onDelete: (id: string) => void;
}) {
  const { t, language } = useI18n();
  const localeStr = language === "ko" ? "ko-KR" : language === "ja" ? "ja-JP" : "en-US";

  const gameLabel = (g: string) => t(`matches.${g}` as Parameters<typeof t>[0]);

  if (rows.length === 0) return null;

  return (
    <div className="mt-3 space-y-2">
      {rows.map((m) => (
        <div
          key={m.id}
          onClick={() => onView(m)}
          className="cursor-pointer rounded-2xl border border-game-line bg-game-card p-4 transition active:bg-game-bg/30"
        >
          {/* Header row: date · game and result badge */}
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-[11px] text-game-text-dim">
              <span>{new Date(m.played_at).toLocaleDateString(localeStr)}</span>
              <span>·</span>
              <span>{gameLabel(m.game)}</span>
            </div>
            <ResultBadge r={m.result as "win" | "loss" | "draw"} />
          </div>

          {/* My deck */}
          <p className="mt-1.5 truncate text-sm font-medium">{m.my_deck}</p>

          {/* Opponent / turn / ELO */}
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-game-text-dim">
            {(() => {
              const nick = oppNick?.(m) ?? null;
              const deck = m.opp_leader || m.opp_deck;
              if (!nick && !deck) return null;
              return (
                <span className="flex items-center gap-1">
                  <span>vs</span>
                  {nick && (
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpponentClick?.(m);
                      }}
                      className="font-medium text-game-text hover:underline"
                    >
                      {nick}
                    </button>
                  )}
                  {deck && <span>{nick ? `· ${deck}` : deck}</span>}
                </span>
              );
            })()}
            <span>{m.went_first ? t("matches.first") : t("matches.second")}</span>
            {m.points_delta != null && (
              <span
                className={cn(
                  "font-medium",
                  m.points_delta > 0
                    ? "text-game-win dark:text-game-win"
                    : m.points_delta < 0
                      ? "text-game-loss dark:text-game-loss"
                      : "",
                )}
              >
                {m.points_delta > 0 ? "+" : ""}
                {m.points_delta}
              </span>
            )}
          </div>

          {/* Actions */}
          <div
            className="mt-3 flex items-center justify-end gap-4"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => onView(m)}
              className="text-game-text-dim transition hover:text-game-text"
              aria-label={t("matches.viewDetail")}
            >
              <Eye className="h-4 w-4" />
            </button>
            <button
              onClick={() => onEdit(m)}
              className="text-game-text-dim transition hover:text-game-text"
              aria-label={t("common.edit")}
            >
              <Pencil className="h-4 w-4" />
            </button>
            <button
              onClick={() => onDelete(m.id)}
              className="text-game-text-dim transition hover:text-destructive"
              aria-label={t("common.delete")}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
