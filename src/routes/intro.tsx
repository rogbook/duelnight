import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { Sparkles, Trophy, Users, ScanLine, BarChart3, Calendar, Crown, Coins, ChevronRight, ChevronDown, Flame, Medal, Swords } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { useI18n } from "@/i18n/language-context";
import { LanguageSelector } from "@/components/language-selector";
import { LoginModal } from "@/components/login-modal";
import { supabase } from "@/integrations/supabase/client";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import type { Database } from "@/integrations/supabase/types";

type TcgGame = Database["public"]["Enums"]["tcg_game"];

const BRAND = {
  name: "DuelNight",
};

const GAME_THEME: Record<TcgGame, { label: string; from: string; to: string; accent: string }> = {
  optcg: { label: "ONE PIECE", from: "from-rose-600/80", to: "to-amber-500/70", accent: "text-amber-300" },
  ptcg:  { label: "Pokémon",   from: "from-yellow-500/80", to: "to-sky-500/70",  accent: "text-yellow-300" },
  dtcg:  { label: "Digimon",   from: "from-indigo-600/80", to: "to-fuchsia-500/70", accent: "text-fuchsia-300" },
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

interface LeaderRow {
  user_id: string;
  display_name: string | null;
  username: string | null;
  avatar_url: string | null;
  rating: number;
  total: number;
  wins: number;
  losses: number;
  win_rate: number;
}

export const Route = createFileRoute("/intro")({
  head: () => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("duelnight.i18n.locale") : "ko";
    const tagline = saved === "ja" 
      ? "ワンピース・ポケモン・デジモンTCGプレイヤーのためのオールインワンハブ" 
      : saved === "en" 
        ? "All-in-One Hub for One Piece, Pokémon, and Digimon TCG Players" 
        : "원피스·포켓몬·디지몬 TCG 플레이어를 위한 올인원 허브";
    const desc = saved === "ja"
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

  // 화폐 및 가격 동적 표시
  const proPrice = language === "en" ? "$4.99" : language === "ja" ? "¥500" : "₩4,900";
  const creditPrice = language === "en" ? "$0.99~" : language === "ja" ? "¥100~" : "₩1,000~";

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-border/50 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-3 sm:px-6">
          <Link to="/intro" className="flex items-center gap-2 font-bold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground">
              <Sparkles className="h-4 w-4" />
            </span>
            <span className="text-sm sm:text-base">{BRAND.name}</span>
            <span className="hidden sm:inline ml-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-500">
              {t("intro.testing")}
            </span>
          </Link>
          <div className="flex items-center gap-1.5 sm:gap-2">
            <LanguageSelector />
            <button
              type="button"
              onClick={() => setLoginOpen(true)}
              className="rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-accent sm:px-3 sm:text-sm"
            >
              {t("common.login")}
            </button>
            <button
              type="button"
              onClick={() => setLoginOpen(true)}
              className="hidden sm:inline-flex rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 sm:text-sm"
            >
              {t("intro.freeStart")}
            </button>
          </div>
        </div>
      </header>

      {/* ===== 신규 발매 스크롤 배너 (공통) ===== */}
      <ReleaseTicker />

      {/* ===== 게이밍 히어로 + 리더보드 상위 (공통) ===== */}
      <GamingHero onShowLogin={() => setLoginOpen(true)} />

      {/* ===== MOBILE: 스와이프 슬라이드 인트로 ===== */}
      <MobileIntro proPrice={proPrice} creditPrice={creditPrice} onShowLogin={() => setLoginOpen(true)} />

      {/* ===== DESKTOP: 기존 풀 레이아웃 ===== */}
      <div className="hidden md:block">
        {/* Hero (간략 버전 - 게이밍 히어로가 메인) */}
        <section className="mx-auto w-full max-w-6xl px-4 pt-16 pb-20 sm:px-6 sm:pt-24">
          <div className="mx-auto max-w-3xl text-center">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              {t("intro.gameIntegrated")}
            </span>
            <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight sm:text-5xl md:text-6xl">
              {t("intro.heroTitle1")}
              <br />
              <span className="bg-gradient-to-r from-primary to-amber-500 bg-clip-text text-transparent">
                {t("intro.heroTitle2")}
              </span>
            </h1>
            <p className="mt-5 text-base text-muted-foreground sm:text-lg">{t("intro.description")}</p>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setLoginOpen(true)}
                className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                {t("intro.nowStartFree")}
              </button>
              <a
                href="#pricing"
                className="rounded-lg border border-border px-5 py-2.5 text-sm font-semibold hover:bg-accent"
              >
                {t("intro.viewPricing")}
              </a>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {t("intro.testPhaseNotice")}
            </p>
          </div>
        </section>

        {/* Features */}
        <section className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Feature icon={<BarChart3 className="h-5 w-5" />} title={t("intro.featureTitle1")} desc={t("intro.featureDesc1")} />
            <Feature icon={<ScanLine className="h-5 w-5" />} title={t("intro.featureTitle2")} desc={t("intro.featureDesc2")} />
            <Feature icon={<Trophy className="h-5 w-5" />} title={t("intro.featureTitle3")} desc={t("intro.featureDesc3")} />
            <Feature icon={<Calendar className="h-5 w-5" />} title={t("intro.featureTitle4")} desc={t("intro.featureDesc4")} />
            <Feature icon={<Users className="h-5 w-5" />} title={t("intro.featureTitle5")} desc={t("intro.featureDesc5")} />
            <Feature icon={<Sparkles className="h-5 w-5" />} title={t("intro.featureTitle6")} desc={t("intro.featureDesc6")} />
          </div>
        </section>

        {/* Pricing */}
        <section id="pricing" className="border-t border-border bg-muted/20">
          <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
            <div className="mx-auto max-w-2xl text-center">
              <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("intro.pricingTitle")}</h2>
              <p className="mt-3 text-muted-foreground">{t("intro.pricingDesc")}</p>
              <p className="mt-1 text-xs text-amber-500">{t("intro.pricingTestNotice")}</p>
            </div>

            <div className="mt-10 grid gap-4 md:grid-cols-3">
              <PriceCard
                name={t("intro.priceFreeName")}
                price={language === "en" ? "$0" : language === "ja" ? "¥0" : "₩0"}
                period={t("intro.priceFreePeriod")}
                icon={<Sparkles className="h-5 w-5 text-muted-foreground" />}
                features={[
                  t("intro.priceFreeFeature1"), t("intro.priceFreeFeature2"), t("intro.priceFreeFeature3"),
                  t("intro.priceFreeFeature4"), t("intro.priceFreeFeature5"),
                ]}
                cta={t("intro.ctaFreeStart")}
                onCtaClick={() => setLoginOpen(true)}
              />
              <PriceCard
                name={t("intro.priceProName")}
                price={proPrice}
                period={t("intro.priceProPeriod")}
                highlight
                icon={<Crown className="h-5 w-5 text-amber-500" />}
                features={[
                  t("intro.priceProFeature1"), t("intro.priceProFeature2"), t("intro.priceProFeature3"),
                  t("intro.priceProFeature4"), t("intro.priceProFeature5"),
                ]}
                cta={t("intro.ctaProStart")}
                onCtaClick={() => setLoginOpen(true)}
              />
              <PriceCard
                name={t("intro.priceCreditName")}
                price={creditPrice}
                period={t("intro.priceCreditPeriod")}
                icon={<Coins className="h-5 w-5 text-emerald-500" />}
                features={[
                  t("intro.priceCreditFeature1"), t("intro.priceCreditFeature2"), t("intro.priceCreditFeature3"),
                  t("intro.priceCreditFeature4"), t("intro.priceCreditFeature5"),
                ]}
                cta={t("intro.ctaCreditCharge")}
                onCtaClick={() => setLoginOpen(true)}
              />
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto w-full max-w-6xl px-4 py-20 text-center sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("intro.bottomCtaTitle")}</h2>
          <p className="mt-3 text-muted-foreground">{t("intro.bottomCtaDesc")}</p>
          <div className="mt-6">
            <button
              type="button"
              onClick={() => setLoginOpen(true)}
              className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              {t("intro.ctaFreeStart")}
            </button>
          </div>
        </section>

        <footer className="border-t border-border">
          <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6">
            <div>{t("intro.footerCopyright").replace("{year}", String(new Date().getFullYear()))}</div>
            <div className="flex items-center gap-3">
              <Link to="/login" className="hover:underline">{t("common.login")}</Link>
              <a href="#pricing" className="hover:underline">{t("intro.footerPricing")}</a>
            </div>
          </div>
        </footer>
      </div>
      <LoginModal open={loginOpen} onOpenChange={setLoginOpen} />
    </div>
  );
}

/* ============================================================
 *  MOBILE 전용 인트로
 * ============================================================ */
function MobileIntro({ onShowLogin }: { proPrice: string; creditPrice: string; onShowLogin: () => void }) {
  const { t } = useI18n();
  const [expanded, setExpanded] = useState<number | null>(null);

  const features = [
    { icon: <BarChart3 className="h-4.5 w-4.5" />, title: t("intro.featureTitle1"), desc: t("intro.featureDesc1") },
    { icon: <ScanLine className="h-4.5 w-4.5" />,  title: t("intro.featureTitle2"), desc: t("intro.featureDesc2") },
    { icon: <Trophy className="h-4.5 w-4.5" />,    title: t("intro.featureTitle3"), desc: t("intro.featureDesc3") },
    { icon: <Calendar className="h-4.5 w-4.5" />,  title: t("intro.featureTitle4"), desc: t("intro.featureDesc4") },
    { icon: <Users className="h-4.5 w-4.5" />,     title: t("intro.featureTitle5"), desc: t("intro.featureDesc5") },
    { icon: <Sparkles className="h-4.5 w-4.5" />,  title: t("intro.featureTitle6"), desc: t("intro.featureDesc6") },
  ];

  return (
    <div className="md:hidden flex flex-col">
      {/* ── Hero ── */}
      <section className="px-5 pt-12 pb-8 text-center">
        {/* 상단 얇은 그라데이션 강조선 */}
        <div className="pointer-events-none absolute top-14 inset-x-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />

        {/* 게임 배지 */}
        <div className="flex items-center justify-center gap-1.5 mb-6">
          {["ONE PIECE", "Pokémon", "Digimon"].map((g) => (
            <span
              key={g}
              className="rounded-full border border-border bg-muted/40 px-2.5 py-0.5 text-[10px] text-muted-foreground"
            >
              {g}
            </span>
          ))}
        </div>

        {/* 헤드라인 */}
        <h1 className="text-[1.875rem] font-bold leading-[1.15] tracking-[-0.02em]">
          {t("intro.heroTitle1")}
          <br />
          <span className="bg-gradient-to-r from-primary to-amber-500 bg-clip-text text-transparent">
            {t("intro.heroTitle2")}
          </span>
        </h1>

        <p className="mx-auto mt-3 max-w-[16rem] text-[13px] leading-relaxed text-muted-foreground">
          {t("intro.description")}
        </p>

        {/* CTA */}
        <button
          type="button"
          onClick={onShowLogin}
          className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3.5 text-[14px] font-semibold text-primary-foreground active:opacity-80 transition-opacity"
        >
          {t("intro.nowStartFree")}
          <ChevronRight className="h-4 w-4" />
        </button>

        <button
          type="button"
          onClick={onShowLogin}
          className="mt-3 text-[12px] text-muted-foreground active:text-foreground transition-colors"
        >
          {t("common.login")} →
        </button>
      </section>

      {/* ── 구분선 ── */}
      <div className="mx-5 h-px bg-border" />

      {/* ── 기능 아코디언 ── */}
      <section className="px-4 pt-6 pb-10">
        <div className="divide-y divide-border rounded-xl border border-border overflow-hidden">
          {features.map((f, i) => {
            const isOpen = expanded === i;
            return (
              <button
                key={f.title}
                type="button"
                onClick={() => setExpanded(isOpen ? null : i)}
                className="w-full bg-card text-left active:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3 px-4 py-3.5">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/8 text-primary">
                    {f.icon}
                  </span>
                  <span className="flex-1 text-[13.5px] font-medium">
                    {f.title}
                  </span>
                  <ChevronDown
                    className={`h-4 w-4 text-muted-foreground/50 transition-transform duration-200 ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </div>
                {isOpen && (
                  <p className="px-4 pb-4 text-[12.5px] leading-relaxed text-muted-foreground border-t border-border/50 pt-3">
                    {f.desc}
                  </p>
                )}
              </button>
            );
          })}
        </div>

        <p className="mt-6 text-center text-[11px] text-muted-foreground/50">
          {t("intro.testPhaseNotice")}
        </p>
      </section>
    </div>
  );
}


function Feature({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/10 text-primary">{icon}</div>
      <h3 className="mt-3 text-base font-semibold">{title}</h3>
      <p className="mt-1 text-sm text-muted-foreground">{desc}</p>
    </div>
  );
}

function PriceCard({
  name, price, period, features, cta, highlight, icon, onCtaClick,
}: {
  name: string; price: string; period: string; features: string[]; cta: string;
  highlight?: boolean; icon: React.ReactNode; onCtaClick?: () => void;
}) {
  const { t } = useI18n();
  return (
    <div
      className={
        "relative rounded-2xl border bg-card p-6 " +
        (highlight ? "border-primary shadow-lg shadow-primary/10" : "border-border")
      }
    >
      {highlight && (
        <span className="absolute -top-2.5 left-6 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
          {t("intro.priceProHighlight")}
        </span>
      )}
      <div className="flex items-center gap-2">
        {icon}
        <h3 className="text-lg font-semibold">{name}</h3>
      </div>
      <div className="mt-3 flex items-baseline gap-1">
        <span className="text-3xl font-bold tracking-tight">{price}</span>
        <span className="text-xs text-muted-foreground">{period}</span>
      </div>
      <ul className="mt-5 space-y-2 text-sm">
        {features.map((f) => (
          <li key={f} className="flex gap-2">
            <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onCtaClick}
        className={
          "mt-6 inline-flex w-full items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold " +
          (highlight
            ? "bg-primary text-primary-foreground hover:opacity-90"
            : "border border-border hover:bg-accent")
        }
      >
        {cta}
      </button>
    </div>
  );
}
