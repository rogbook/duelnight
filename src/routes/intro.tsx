import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/use-auth";
import { useState, useEffect } from "react";
import {
  Sparkles,
  Trophy,
  Users,
  ScanLine,
  BarChart3,
  Calendar,
  Crown,
  Coins,
  ChevronRight,
  Flame,
  Check,
  Swords,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useI18n } from "@/i18n/language-context";
import { LanguageSelector } from "@/components/language-selector";
import { LoginModal } from "@/components/login-modal";
import { supabase } from "@/integrations/supabase/client";
import { GameRankingList } from "@/components/leaderboard/game-ranking-list";
import { SeasonReportTeaser } from "@/components/season-report/season-report-teaser";
import type { Database } from "@/integrations/supabase/types";

const BRAND = {
  name: "DuelNight",
};

type TcgGame = string;

const GAME_THEME: Record<TcgGame, { label: string; from: string; to: string; accent: string }> = {
  optcg: {
    label: "ONE PIECE",
    from: "from-rose-600/80",
    to: "to-amber-500/70",
    accent: "text-amber-300",
  },
  ptcg: {
    label: "Pokémon",
    from: "from-yellow-500/80",
    to: "to-sky-500/70",
    accent: "text-yellow-300",
  },
  dtcg: {
    label: "Digimon",
    from: "from-indigo-600/80",
    to: "to-fuchsia-500/70",
    accent: "text-fuchsia-300",
  },
};

interface ReleaseRow {
  id: string;
  game: TcgGame;
  title: string;
  starts_at: string;
  early_release_at: string | null;
  product_url: string | null;
  banner_url: string | null;
}

export const Route = createFileRoute("/intro")({
  head: () => {
    const saved =
      typeof window !== "undefined" ? localStorage.getItem("duelnight.i18n.locale") : "ko";
    const tagline =
      saved === "ja"
        ? "ワンピース・ポケモン・デジモンTCGプレイヤーのためのオールインワンハブ"
        : saved === "en"
          ? "All-in-One Hub for One Piece, Pokémon, and Digimon TCG Players"
          : "원피스·포켓몬·디지몬 TCG 플레이어를 위한 올인원 허브";
    const desc =
      saved === "ja"
        ? "戦績記録、AIカードOCR、デッキビルダー、大会・発売日程、店舗LFGまで。TCGのワークフローを1箇所で完結。"
        : saved === "en"
          ? "Match records, AI card OCR, deck builder, tournament/release schedule, and store LFG. Your TCG workflow completed in one place."
          : "전적 기록, AI 카드 OCR, 덱 빌더, 대회·발매 일정, 매장 LFG까지. 한 곳에서 끝내는 TCG 워크플로우.";
    return {
      meta: [
        { title: `${BRAND.name} — ${tagline}` },
        { name: "description", content: desc },
        { property: "og:title", content: `${BRAND.name} — ${tagline}` },
        { property: "og:description", content: desc },
        { property: "og:type", content: "website" },
      ],
    };
  },
  component: IntroPage,
});

function IntroPage() {
  const { t, language } = useI18n();
  const [loginOpen, setLoginOpen] = useState(false);
  const { user } = useAuth();
  const navigate = useNavigate();
  // 로그인 상태면 "솔루션 들어가기" → 대시보드, 비로그인이면 로그인 모달
  const enter = () => {
    if (user) navigate({ to: "/" });
    else setLoginOpen(true);
  };
  const enterLabel =
    language === "en"
      ? "Enter Dashboard"
      : language === "ja"
        ? "ダッシュボードへ"
        : "솔루션 들어가기";

  const proPrice = language === "en" ? "$4.99" : language === "ja" ? "¥500" : "₩4,900";
  const creditPrice = language === "en" ? "$0.99~" : language === "ja" ? "¥100~" : "₩1,000~";
  const rankingLabel =
    language === "en" ? "View Rankings" : language === "ja" ? "ランキングを見る" : "랭킹 보기";

  const features = [
    {
      icon: BarChart3,
      title: t("intro.featureTitle1"),
      desc: t("intro.featureDesc1"),
      color: "text-amber-300",
      glow: "bg-amber-500/15",
    },
    {
      icon: ScanLine,
      title: t("intro.featureTitle2"),
      desc: t("intro.featureDesc2"),
      color: "text-sky-300",
      glow: "bg-sky-500/15",
    },
    {
      icon: Trophy,
      title: t("intro.featureTitle3"),
      desc: t("intro.featureDesc3"),
      color: "text-fuchsia-300",
      glow: "bg-fuchsia-500/15",
    },
    {
      icon: Calendar,
      title: t("intro.featureTitle4"),
      desc: t("intro.featureDesc4"),
      color: "text-emerald-300",
      glow: "bg-emerald-500/15",
    },
    {
      icon: Users,
      title: t("intro.featureTitle5"),
      desc: t("intro.featureDesc5"),
      color: "text-rose-300",
      glow: "bg-rose-500/15",
    },
    {
      icon: Sparkles,
      title: t("intro.featureTitle6"),
      desc: t("intro.featureDesc6"),
      color: "text-violet-300",
      glow: "bg-violet-500/15",
    },
  ];

  return (
    <div className="dark relative min-h-screen overflow-x-hidden bg-background text-foreground">
      {/* 앰비언트 글로우 (게임 컬러) */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute -left-32 -top-32 h-[28rem] w-[28rem] rounded-full bg-rose-600/20 blur-[120px]" />
        <div className="absolute -right-24 top-10 h-[26rem] w-[26rem] rounded-full bg-indigo-600/20 blur-[120px]" />
        <div className="absolute left-1/2 top-[34rem] h-[22rem] w-[22rem] -translate-x-1/2 rounded-full bg-fuchsia-600/10 blur-[120px]" />
      </div>

      <div className="relative">
        {/* Top bar */}
        <header className="sticky top-0 z-30 border-b border-white/5 bg-background/70 backdrop-blur-xl">
          <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-3 sm:px-6">
            <Link to="/intro" className="flex items-center gap-2 font-bold tracking-tight">
              <span className="grid h-7 w-7 place-items-center rounded-md bg-gradient-to-br from-rose-500 to-amber-500 text-white shadow-lg shadow-rose-500/30">
                <Swords className="h-4 w-4" />
              </span>
              <span className="text-sm sm:text-base">{BRAND.name}</span>
              <span className="hidden sm:inline ml-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-400">
                {t("intro.testing")}
              </span>
            </Link>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <LanguageSelector />
              {user ? (
                <button
                  type="button"
                  onClick={() => navigate({ to: "/" })}
                  className="inline-flex rounded-md bg-gradient-to-r from-rose-500 to-amber-500 px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-rose-500/20 hover:opacity-90 sm:text-sm"
                >
                  {enterLabel}
                </button>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={enter}
                    className="rounded-md border border-white/10 px-2.5 py-1.5 text-xs text-foreground/80 hover:bg-white/5 sm:px-3 sm:text-sm"
                  >
                    {t("common.login")}
                  </button>
                  <button
                    type="button"
                    onClick={enter}
                    className="inline-flex rounded-md bg-gradient-to-r from-rose-500 to-amber-500 px-3 py-1.5 text-xs font-semibold text-white shadow-lg shadow-rose-500/20 hover:opacity-90 sm:text-sm"
                  >
                    {t("intro.freeStart")}
                  </button>
                </>
              )}
            </div>
          </div>
        </header>

        {/* 신규 발매 스크롤 배너 */}
        <ReleaseTicker />

        {/* HERO */}
        <section className="mx-auto w-full max-w-5xl px-4 pt-16 pb-14 text-center sm:px-6 sm:pt-24">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-foreground/70 backdrop-blur">
            <Sparkles className="h-3.5 w-3.5 text-amber-400" />
            {t("intro.gameIntegrated")}
          </span>
          <h1 className="mt-6 text-4xl font-extrabold leading-[1.1] tracking-tight sm:text-6xl">
            {t("intro.heroTitle1")}
            <br />
            <span className="bg-gradient-to-r from-rose-400 via-amber-300 to-fuchsia-400 bg-clip-text text-transparent">
              {t("intro.heroTitle2")}
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-sm leading-relaxed text-foreground/60 sm:text-lg">
            {t("intro.description")}
          </p>

          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <button
              type="button"
              onClick={enter}
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 px-6 py-3.5 text-sm font-semibold text-white shadow-xl shadow-rose-500/25 transition-transform hover:scale-[1.02] sm:w-auto"
            >
              {user ? enterLabel : t("intro.nowStartFree")}
              <ChevronRight className="h-4 w-4" />
            </button>
            <a
              href="#ranking"
              className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-6 py-3.5 text-sm font-semibold text-foreground/90 backdrop-blur hover:bg-white/10 sm:w-auto"
            >
              <Trophy className="h-4 w-4 text-amber-400" />
              {rankingLabel}
            </a>
          </div>

          {/* 게임 칩 */}
          <div className="mt-9 flex flex-wrap items-center justify-center gap-2.5">
            {(Object.keys(GAME_THEME) as TcgGame[]).map((g) => (
              <span
                key={g}
                className={`rounded-full bg-gradient-to-r ${GAME_THEME[g].from} ${GAME_THEME[g].to} px-3.5 py-1.5 text-xs font-bold text-white shadow-lg`}
              >
                {GAME_THEME[g].label}
              </span>
            ))}
          </div>

          <p className="mt-6 text-xs text-foreground/40">{t("intro.testPhaseNotice")}</p>
        </section>

        {/* 게임별 랭킹 */}
        <section id="ranking" className="scroll-mt-20 pb-16 pt-2">
          <GameRankingList />
        </section>

        {/* 1위 성적표 티저 */}
        <div className="pb-20">
          <SeasonReportTeaser onSignup={enter} />
        </div>

        {/* FEATURES */}
        <section className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6">
          <div className="mb-8 text-center">
            <h2 className="text-2xl font-bold tracking-tight sm:text-3xl">
              {t("intro.gameIntegrated")}
            </h2>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((f) => (
              <FeatureTile
                key={f.title}
                icon={f.icon}
                title={f.title}
                desc={f.desc}
                color={f.color}
                glow={f.glow}
              />
            ))}
          </div>
        </section>

        {/* PRICING */}
        <section id="pricing" className="scroll-mt-20 border-t border-white/5 bg-white/[0.02]">
          <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
                {t("intro.pricingTitle")}
              </h2>
              <p className="mt-3 text-foreground/60">{t("intro.pricingDesc")}</p>
              <p className="mt-1 text-xs text-amber-400">{t("intro.pricingTestNotice")}</p>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              <PriceCard
                name={t("intro.priceFreeName")}
                price={language === "en" ? "$0" : language === "ja" ? "¥0" : "₩0"}
                period={t("intro.priceFreePeriod")}
                icon={<Sparkles className="h-5 w-5 text-foreground/50" />}
                features={[
                  t("intro.priceFreeFeature1"),
                  t("intro.priceFreeFeature2"),
                  t("intro.priceFreeFeature3"),
                  t("intro.priceFreeFeature4"),
                  t("intro.priceFreeFeature5"),
                ]}
                cta={t("intro.ctaFreeStart")}
                onCtaClick={enter}
              />
              <PriceCard
                name={t("intro.priceProName")}
                price={proPrice}
                period={t("intro.priceProPeriod")}
                highlight
                icon={<Crown className="h-5 w-5 text-amber-400" />}
                features={[
                  t("intro.priceProFeature1"),
                  t("intro.priceProFeature2"),
                  t("intro.priceProFeature3"),
                  t("intro.priceProFeature4"),
                  t("intro.priceProFeature5"),
                ]}
                cta={t("intro.ctaProStart")}
                onCtaClick={enter}
              />
              <PriceCard
                name={t("intro.priceCreditName")}
                price={creditPrice}
                period={t("intro.priceCreditPeriod")}
                icon={<Coins className="h-5 w-5 text-emerald-400" />}
                features={[
                  t("intro.priceCreditFeature1"),
                  t("intro.priceCreditFeature2"),
                  t("intro.priceCreditFeature3"),
                  t("intro.priceCreditFeature4"),
                  t("intro.priceCreditFeature5"),
                ]}
                cta={t("intro.ctaCreditCharge")}
                onCtaClick={enter}
              />
            </div>
          </div>
        </section>

        {/* BOTTOM CTA */}
        <section className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-rose-600/20 via-fuchsia-600/10 to-indigo-600/20 px-6 py-14 text-center">
            <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-amber-500/20 blur-3xl" />
            <h2 className="relative text-3xl font-bold tracking-tight sm:text-4xl">
              {t("intro.bottomCtaTitle")}
            </h2>
            <p className="relative mt-3 text-foreground/60">{t("intro.bottomCtaDesc")}</p>
            <button
              type="button"
              onClick={enter}
              className="relative mt-7 inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-rose-500 to-amber-500 px-7 py-3.5 text-sm font-semibold text-white shadow-xl shadow-rose-500/25 transition-transform hover:scale-[1.02]"
            >
              {user ? enterLabel : t("intro.ctaFreeStart")}
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </section>

        <footer className="border-t border-white/5">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-foreground/40 sm:flex-row sm:px-6">
            <div>
              {t("intro.footerCopyright").replace("{year}", String(new Date().getFullYear()))}
            </div>
            <div className="flex items-center gap-3">
              <Link to="/login" className="hover:text-foreground/70">
                {t("common.login")}
              </Link>
              <a href="#pricing" className="hover:text-foreground/70">
                {t("intro.footerPricing")}
              </a>
            </div>
          </div>
        </footer>
      </div>

      <LoginModal open={loginOpen} onOpenChange={setLoginOpen} />
    </div>
  );
}

function FeatureTile({
  icon: Icon,
  title,
  desc,
  color,
  glow,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
  color: string;
  glow: string;
}) {
  return (
    <div className="group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-5 transition-colors hover:border-white/20 hover:bg-white/[0.05]">
      <div
        className={`pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full ${glow} blur-2xl`}
      />
      <div className={`relative grid h-10 w-10 place-items-center rounded-xl bg-white/5 ${color}`}>
        <Icon className="h-5 w-5" />
      </div>
      <h3 className="relative mt-4 text-base font-semibold">{title}</h3>
      <p className="relative mt-1.5 text-sm leading-relaxed text-foreground/55">{desc}</p>
    </div>
  );
}

function PriceCard({
  name,
  price,
  period,
  features,
  cta,
  highlight,
  icon,
  onCtaClick,
}: {
  name: string;
  price: string;
  period: string;
  features: string[];
  cta: string;
  highlight?: boolean;
  icon: React.ReactNode;
  onCtaClick?: () => void;
}) {
  const { t } = useI18n();
  return (
    <div
      className={
        "relative rounded-2xl border p-6 backdrop-blur " +
        (highlight
          ? "border-rose-500/40 bg-gradient-to-b from-rose-500/10 to-transparent shadow-xl shadow-rose-500/10"
          : "border-white/10 bg-white/[0.03]")
      }
    >
      {highlight && (
        <span className="absolute -top-2.5 left-6 rounded-full bg-gradient-to-r from-rose-500 to-amber-500 px-2.5 py-0.5 text-[10px] font-semibold text-white">
          {t("intro.priceProHighlight")}
        </span>
      )}
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-lg font-semibold">{name}</h3>
      </div>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="text-3xl font-bold tracking-tight">{price}</span>
        <span className="text-xs text-foreground/50">{period}</span>
      </div>
      <ul className="mt-5 space-y-2.5 text-sm">
        {features.map((f) => (
          <li key={f} className="flex gap-2">
            <Check className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" />
            <span className="text-foreground/80">{f}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onCtaClick}
        className={
          "mt-6 inline-flex w-full items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold " +
          (highlight
            ? "bg-gradient-to-r from-rose-500 to-amber-500 text-white shadow-lg shadow-rose-500/20 hover:opacity-90"
            : "border border-white/15 text-foreground/90 hover:bg-white/5")
        }
      >
        {cta}
      </button>
    </div>
  );
}

/* ============================================================
 *  신규 발매 슬라이드 배너 (풀폭 대형 캐러셀)
 * ============================================================ */
function ReleaseTicker() {
  const { language } = useI18n();
  const [idx, setIdx] = useState(0);
  const { data: releases = [] } = useQuery({
    queryKey: ["intro-releases"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id, game, title, starts_at, early_release_at, product_url, banner_url")
        .eq("kind", "release")
        .gte("starts_at", new Date(Date.now() - 7 * 86400000).toISOString())
        .order("starts_at", { ascending: true })
        .limit(12);
      if (error) throw error;
      return (data ?? []) as ReleaseRow[];
    },
    staleTime: 5 * 60_000,
  });

  // 자동 슬라이드
  useEffect(() => {
    if (releases.length <= 1) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % releases.length), 5000);
    return () => clearInterval(id);
  }, [releases.length]);

  if (releases.length === 0) return null;

  const dateLocale = language === "ko" ? "ko-KR" : language === "ja" ? "ja-JP" : "en-US";
  const releaseLabel = language === "ja" ? "発売" : language === "en" ? "Release" : "발매";
  const headerLabel =
    language === "ja"
      ? "新規発売スケジュール"
      : language === "en"
        ? "New Release Schedule"
        : "신규 발매 일정";
  const detailLabel =
    language === "ja" ? "詳細を見る" : language === "en" ? "View details" : "자세히 보기";
  const current = Math.min(idx, releases.length - 1);

  return (
    <section className="relative w-full border-b border-white/5">
      <div className="relative h-[260px] w-full overflow-hidden sm:h-[360px] lg:h-[420px]">
        {releases.map((r, i) => {
          const theme = GAME_THEME[r.game] ?? GAME_THEME.optcg;
          const d = new Date(r.early_release_at ?? r.starts_at);
          const dateStr = d.toLocaleDateString(dateLocale, {
            year: "numeric",
            month: "2-digit",
            day: "2-digit",
          });
          return (
            <div
              key={r.id}
              className={
                "absolute inset-0 transition-opacity duration-700 ease-in-out " +
                (i === current ? "opacity-100" : "pointer-events-none opacity-0")
              }
              aria-hidden={i !== current}
            >
              {/* 배경 */}
              <div className={`absolute inset-0 bg-gradient-to-br ${theme.from} ${theme.to}`} />
              {r.banner_url && (
                <img
                  src={r.banner_url}
                  alt=""
                  className="absolute inset-0 h-full w-full object-cover"
                  loading={i === 0 ? "eager" : "lazy"}
                />
              )}
              <div className="absolute inset-0 bg-gradient-to-r from-black/85 via-black/55 to-black/20" />

              {/* 내용 */}
              <div className="relative mx-auto flex h-full max-w-6xl flex-col justify-center px-5 sm:px-8">
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-black/70 px-2.5 py-1 text-[11px] font-bold tracking-wider text-white">
                    {theme.label}
                  </span>
                  <span className={`text-xs font-semibold ${theme.accent}`}>{releaseLabel}</span>
                </div>
                <p className="mt-3 text-sm font-medium text-white/80">{dateStr}</p>
                <h2 className="mt-1 max-w-3xl text-2xl font-extrabold leading-tight text-white line-clamp-2 sm:text-4xl lg:text-5xl">
                  {r.title}
                </h2>
                {r.product_url && (
                  <a
                    href={r.product_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-5 inline-flex w-fit items-center gap-1.5 rounded-lg bg-white/15 px-4 py-2 text-xs font-semibold text-white backdrop-blur transition-colors hover:bg-white/25 sm:text-sm"
                  >
                    {detailLabel}
                    <ChevronRight className="h-4 w-4" />
                  </a>
                )}
              </div>
            </div>
          );
        })}

        {/* 상단 라벨 */}
        <div className="pointer-events-none absolute left-5 top-4 z-10 flex items-center gap-2 sm:left-8">
          <Flame className="h-4 w-4 text-orange-400" />
          <span className="text-xs font-semibold uppercase tracking-wider text-white/80">
            {headerLabel}
          </span>
        </div>

        {/* 인디케이터 */}
        {releases.length > 1 && (
          <div className="absolute bottom-5 left-1/2 z-10 flex -translate-x-1/2 gap-2">
            {releases.map((r, i) => (
              <button
                key={r.id}
                type="button"
                aria-label={`slide ${i + 1}`}
                onClick={() => setIdx(i)}
                className={
                  "h-1.5 rounded-full transition-all " +
                  (i === current ? "w-6 bg-white" : "w-1.5 bg-white/40 hover:bg-white/70")
                }
              />
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
