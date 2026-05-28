import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Sparkles, Trophy, Users, ScanLine, BarChart3, Calendar, Crown, Coins, ChevronRight, MoveHorizontal } from "lucide-react";
import { useI18n } from "@/i18n/language-context";
import { LanguageSelector } from "@/components/language-selector";
import { LoginModal } from "@/components/login-modal";

const BRAND = {
  name: "DuelNight",
};

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

      {/* ===== MOBILE: 스와이프 슬라이드 인트로 ===== */}
      <MobileIntro proPrice={proPrice} creditPrice={creditPrice} />

      {/* ===== DESKTOP: 기존 풀 레이아웃 ===== */}
      <div className="hidden md:block">
        {/* Hero */}
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
              <Link
                to="/login"
                className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
              >
                {t("intro.nowStartFree")}
              </Link>
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
              />
            </div>
          </div>
        </section>

        {/* CTA */}
        <section className="mx-auto w-full max-w-6xl px-4 py-20 text-center sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">{t("intro.bottomCtaTitle")}</h2>
          <p className="mt-3 text-muted-foreground">{t("intro.bottomCtaDesc")}</p>
          <div className="mt-6">
            <Link
              to="/login"
              className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              {t("intro.ctaFreeStart")}
            </Link>
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
    </div>
  );
}

/* ============================================================
 *  MOBILE 전용: 스와이프 슬라이드 인트로 + 하단 고정 CTA
 * ============================================================ */
function MobileIntro({ proPrice, creditPrice }: { proPrice: string; creditPrice: string }) {
  const { t, language } = useI18n();
  const scrollerRef = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [reduced, setReduced] = useState(false);
  const [hintVisible, setHintVisible] = useState(false);
  const hintDismissedRef = useRef(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduced(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // 스와이프 힌트: 첫 방문 시에만 표시
  useEffect(() => {
    if (typeof window === "undefined") return;
    const seen = localStorage.getItem("duelnight.intro.hint");
    if (!seen) setHintVisible(true);
  }, []);

  // 힌트 4.5초 후 자동 사라짐
  useEffect(() => {
    if (!hintVisible) return;
    const timer = window.setTimeout(() => {
      hintDismissedRef.current = true;
      setHintVisible(false);
      if (typeof window !== "undefined") localStorage.setItem("duelnight.intro.hint", "1");
    }, 4500);
    return () => clearTimeout(timer);
  }, [hintVisible]);

  const slides: Array<{ key: string; kicker?: string; node: React.ReactNode }> = [
    {
      key: "hero",
      kicker: t("intro.gameIntegrated"),
      node: (
        <SlideShell>
          <div className="relative" style={{ contain: "paint" }}>
            {!reduced && (
              <>
                <div className="pointer-events-none absolute -top-12 left-1/2 h-32 w-32 -translate-x-1/2 rounded-full bg-primary/20 blur-2xl transform-gpu" />
                <div className="pointer-events-none absolute -bottom-12 right-0 h-24 w-24 rounded-full bg-amber-500/10 blur-2xl transform-gpu" />
              </>
            )}

            <span className="relative inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-background/90 px-2.5 py-1 text-[10px] font-medium tracking-wide text-muted-foreground">
              <Sparkles className="h-3 w-3 text-primary" />
              {t("intro.gameIntegrated")}
            </span>

            <h1 className="relative mt-4 text-[2rem] font-bold leading-[1.1] tracking-[-0.03em]">
              {t("intro.heroTitle1")}
              <br />
              <span className="bg-gradient-to-br from-primary via-primary to-amber-500 bg-clip-text text-transparent">
                {t("intro.heroTitle2")}
              </span>
            </h1>

            <p className="relative mt-4 text-[13.5px] leading-relaxed text-muted-foreground">
              {t("intro.description")}
            </p>

            <div className="relative mt-5 flex items-center gap-2 text-[10.5px] text-amber-500/90">
              <span className={"h-1.5 w-1.5 rounded-full bg-amber-500 " + (reduced ? "" : "animate-pulse")} />
              {t("intro.testPhaseNotice")}
            </div>
          </div>
        </SlideShell>
      ),
    },
    {
      key: "f1",
      kicker: t("intro.featureTitle1"),
      node: <FeatureSlide num="01" icon={<BarChart3 className="h-6 w-6" />} title={t("intro.featureTitle1")} desc={t("intro.featureDesc1")} tint="sky" />,
    },
    {
      key: "f2",
      kicker: t("intro.featureTitle2"),
      node: <FeatureSlide num="02" icon={<ScanLine className="h-6 w-6" />} title={t("intro.featureTitle2")} desc={t("intro.featureDesc2")} tint="emerald" />,
    },
    {
      key: "f3",
      kicker: t("intro.featureTitle3"),
      node: <FeatureSlide num="03" icon={<Trophy className="h-6 w-6" />} title={t("intro.featureTitle3")} desc={t("intro.featureDesc3")} tint="amber" />,
    },
    {
      key: "f4",
      kicker: t("intro.featureTitle4"),
      node: <FeatureSlide num="04" icon={<Calendar className="h-6 w-6" />} title={t("intro.featureTitle4")} desc={t("intro.featureDesc4")} tint="violet" />,
    },
    {
      key: "f5",
      kicker: t("intro.featureTitle5"),
      node: <FeatureSlide num="05" icon={<Users className="h-6 w-6" />} title={t("intro.featureTitle5")} desc={t("intro.featureDesc5")} tint="pink" />,
    },
    {
      key: "pricing",
      kicker: t("intro.pricingTitle"),
      node: (
        <SlideShell>
          <div className="relative" style={{ contain: "paint" }}>
            {!reduced && (
              <div className="pointer-events-none absolute -top-10 right-0 h-28 w-28 rounded-full bg-primary/15 blur-2xl transform-gpu" />
            )}
            <span className="inline-flex rounded-full border border-border/60 bg-background/80 px-2 py-0.5 text-[9px] font-medium uppercase tracking-[0.16em] text-muted-foreground">
              Pricing
            </span>
            <h2 className="mt-3 text-[1.5rem] font-bold leading-tight tracking-[-0.02em]">{t("intro.pricingTitle")}</h2>
            <p className="mt-1.5 text-[12px] leading-relaxed text-muted-foreground">{t("intro.pricingDesc")}</p>
            <p className="mt-1 text-[10px] text-amber-500/90">{t("intro.pricingTestNotice")}</p>

            <div className="mt-4 space-y-2">
              <MiniPlan
                reduced={reduced}
                icon={<Sparkles className="h-3.5 w-3.5 text-muted-foreground" />}
                name={t("intro.priceFreeName")}
                price={language === "en" ? "$0" : language === "ja" ? "¥0" : "₩0"}
                period={t("intro.priceFreePeriod")}
                bullets={[t("intro.priceFreeFeature1"), t("intro.priceFreeFeature4")]}
              />
              <MiniPlan
                reduced={reduced}
                icon={<Crown className="h-3.5 w-3.5 text-amber-500" />}
                name={t("intro.priceProName")}
                price={proPrice}
                period={t("intro.priceProPeriod")}
                bullets={[t("intro.priceProFeature2"), t("intro.priceProFeature3")]}
                highlight
              />
              <MiniPlan
                reduced={reduced}
                icon={<Coins className="h-3.5 w-3.5 text-emerald-500" />}
                name={t("intro.priceCreditName")}
                price={creditPrice}
                period={t("intro.priceCreditPeriod")}
                bullets={[t("intro.priceCreditFeature1")]}
              />
            </div>
          </div>
        </SlideShell>
      ),
    },
    {
      key: "cta",
      kicker: t("intro.bottomCtaTitle"),
      node: (
        <SlideShell>
          <div className="relative flex flex-col items-center text-center" style={{ contain: "paint" }}>
            {!reduced && (
              <div className="pointer-events-none absolute inset-x-0 -top-4 mx-auto h-28 w-28 rounded-full bg-gradient-to-br from-primary/30 to-amber-500/20 blur-2xl transform-gpu" />
            )}
            <span className="relative grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-primary to-amber-500 text-primary-foreground shadow-lg shadow-primary/30 ring-1 ring-white/10">
              <Sparkles className="h-6 w-6" />
            </span>
            <h2 className="relative mt-4 text-[1.5rem] font-bold leading-tight tracking-[-0.02em]">
              {t("intro.bottomCtaTitle")}
            </h2>
            <p className="relative mt-2 text-[13px] leading-relaxed text-muted-foreground">{t("intro.bottomCtaDesc")}</p>
            <Link
              to="/login"
              className="relative mt-5 inline-flex w-full items-center justify-center gap-1.5 rounded-2xl bg-gradient-to-br from-primary to-primary/90 px-5 py-3 text-[13px] font-semibold text-primary-foreground shadow-lg shadow-primary/25 transition hover:shadow-primary/40"
            >
              {t("intro.ctaFreeStart")}
              <ChevronRight className="h-4 w-4" />
            </Link>
            <Link to="/login" className="relative mt-2.5 text-[11px] text-muted-foreground transition hover:text-foreground">
              {t("common.login")} →
            </Link>
          </div>
        </SlideShell>
      ),
    },
  ];

  const pausedUntilRef = useRef<number>(0);

  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const dismissHint = () => {
      if (hintDismissedRef.current) return;
      hintDismissedRef.current = true;
      setHintVisible(false);
      if (typeof window !== "undefined") localStorage.setItem("duelnight.intro.hint", "1");
    };
    const onScroll = () => {
      dismissHint();
      const w = el.clientWidth;
      if (w === 0) return;
      const i = Math.round(el.scrollLeft / w);
      setIndex(Math.max(0, Math.min(slides.length - 1, i)));
    };
    const pause = () => {
      dismissHint();
      pausedUntilRef.current = Date.now() + 6000;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    el.addEventListener("pointerdown", pause, { passive: true });
    el.addEventListener("touchstart", pause, { passive: true });
    return () => {
      el.removeEventListener("scroll", onScroll);
      el.removeEventListener("pointerdown", pause);
      el.removeEventListener("touchstart", pause);
    };
  }, [slides.length]);

  // 자동 슬라이드 (4.5초 간격, 사용자 인터랙션 시 일시 정지, 모션 감소 설정 존중)
  useEffect(() => {
    if (reduced) return;

    const timer = window.setInterval(() => {
      if (Date.now() < pausedUntilRef.current) return;
      const el = scrollerRef.current;
      if (!el) return;
      if (document.hidden) return;
      const w = el.clientWidth;
      if (w === 0) return;
      const current = Math.round(el.scrollLeft / w);
      const next = (current + 1) % slides.length;
      el.scrollTo({ left: next * w, behavior: "smooth" });
    }, 4500);

    return () => window.clearInterval(timer);
  }, [slides.length, reduced]);

  const goTo = (i: number) => {
    pausedUntilRef.current = Date.now() + 6000;
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: reduced ? "auto" : "smooth" });
  };

  const progress = ((index + 1) / slides.length) * 100;

  return (
    <div className="md:hidden">
      {/* 상단 진행 바 + 카운터 */}
      <div className="sticky top-14 z-20 border-b border-border/40 bg-background/95 px-5 py-2.5">
        <div className="flex items-center justify-between text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
          <span
            key={`kicker-${index}`}
            className={reduced ? "truncate text-foreground/80" : "truncate text-foreground/80 animate-fade-in"}
          >
            {slides[index]?.kicker}
          </span>
          <span className="tabular-nums">
            <span className="text-foreground">{String(index + 1).padStart(2, "0")}</span>
            <span className="mx-1 opacity-40">/</span>
            <span>{String(slides.length).padStart(2, "0")}</span>
          </span>
        </div>
        <div className="mt-2 h-[2px] w-full overflow-hidden rounded-full bg-muted">
          <div
            className={
              "h-full rounded-full bg-gradient-to-r from-primary to-amber-500 " +
              (reduced ? "" : "transition-[width] duration-700 ease-out")
            }
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="relative pb-10">
        <div
          ref={scrollerRef}
          className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          style={{ scrollSnapType: "x mandatory" }}
        >
          {slides.map((s, i) => (
            <section
              key={s.key}
              className={
                "min-w-full shrink-0 snap-center px-4 py-4 " +
                (reduced ? "" : "transition-all duration-500 ease-out")
              }
              style={{
                opacity: i === index ? 1 : 0.35,
                transform: i === index ? "scale(1)" : "scale(0.96)",
              }}
            >
              {s.node}
            </section>
          ))}
        </div>

        {index === 0 && hintVisible && (
          <div className="absolute inset-x-0 bottom-9 z-10 flex justify-center pointer-events-none">
            <div className={"inline-flex items-center gap-1.5 rounded-full border border-border/70 bg-background/95 px-3 py-1.5 shadow-sm " + (reduced ? "" : "animate-pulse")}>
              <MoveHorizontal className="h-3.5 w-3.5 text-muted-foreground" />
              <span className="text-[11px] text-muted-foreground">
                {language === "en" ? "Swipe to explore" : language === "ja" ? "スワイプして見る" : "좌우로 넘기세요"}
              </span>
            </div>
          </div>
        )}

        <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
          {slides.map((s, i) => (
            <button
              key={s.key}
              type="button"
              aria-label={`슬라이드 ${i + 1}`}
              onClick={() => goTo(i)}
              className={
                "h-1 rounded-full " +
                (reduced ? "" : "transition-all duration-300 ") +
                (i === index ? "w-5 bg-foreground" : "w-1 bg-foreground/25")
              }
            />
          ))}
        </div>
      </div>

      {/* 하단 고정 CTA */}
      <div className="sticky bottom-0 z-30 border-t border-border/60 bg-background/95 px-4 py-3">
        <div className="flex items-center gap-2">
          <Link
            to="/login"
            className={
              "inline-flex flex-1 items-center justify-center gap-1 rounded-2xl bg-gradient-to-br from-primary to-primary/90 px-4 py-3 text-sm font-semibold text-primary-foreground shadow-lg shadow-primary/20 " +
              (reduced ? "" : "transition active:scale-[0.98]")
            }
          >
            {t("intro.nowStartFree")}
            <ChevronRight className="h-4 w-4" />
          </Link>
          <Link
            to="/login"
            className={
              "inline-flex items-center justify-center rounded-2xl border border-border/70 bg-background px-4 py-3 text-sm font-medium hover:bg-accent " +
              (reduced ? "" : "transition")
            }
          >
            {t("common.login")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function SlideShell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-sm py-2">{children}</div>;
}

const TINTS: Record<string, { glow: string; ring: string; iconBg: string; iconText: string }> = {
  sky:     { glow: "from-sky-500/20",     ring: "ring-sky-500/20",     iconBg: "bg-sky-500/10",     iconText: "text-sky-500" },
  emerald: { glow: "from-emerald-500/20", ring: "ring-emerald-500/20", iconBg: "bg-emerald-500/10", iconText: "text-emerald-500" },
  amber:   { glow: "from-amber-500/20",   ring: "ring-amber-500/20",   iconBg: "bg-amber-500/10",   iconText: "text-amber-500" },
  violet:  { glow: "from-violet-500/20",  ring: "ring-violet-500/20",  iconBg: "bg-violet-500/10",  iconText: "text-violet-500" },
  pink:    { glow: "from-pink-500/20",    ring: "ring-pink-500/20",    iconBg: "bg-pink-500/10",    iconText: "text-pink-500" },
};

function FeatureSlide({
  num, icon, title, desc, tint,
}: {
  num: string; icon: React.ReactNode; title: string; desc: string; tint: keyof typeof TINTS;
}) {
  const c = TINTS[tint];
  return (
    <SlideShell>
      <div className={`relative overflow-hidden rounded-3xl border border-border/60 bg-card/80 p-5 ring-1 ${c.ring}`} style={{ contain: "paint" }}>
        <div className={`pointer-events-none absolute -top-12 -right-6 h-28 w-28 rounded-full bg-gradient-to-br ${c.glow} to-transparent blur-2xl transform-gpu`} />

        <div className="relative flex items-start justify-between">
          <div className={`grid h-11 w-11 place-items-center rounded-xl ${c.iconBg} ${c.iconText} ring-1 ${c.ring}`}>
            {icon}
          </div>
          <span className="font-mono text-[10px] font-medium tracking-[0.15em] text-muted-foreground/70">
            {num}
          </span>
        </div>

        <h2 className="relative mt-5 text-[1.375rem] font-bold leading-[1.2] tracking-[-0.02em]">
          {title}
        </h2>
        <p className="relative mt-2 text-[12.5px] leading-relaxed text-muted-foreground">
          {desc}
        </p>

        <div className="relative mt-4 h-px w-10 bg-gradient-to-r from-foreground/40 to-transparent" />
      </div>
    </SlideShell>
  );
}

function MiniPlan({
  icon, name, price, period, bullets, highlight, reduced,
}: {
  icon: React.ReactNode; name: string; price: string; period: string;
  bullets: string[]; highlight?: boolean; reduced?: boolean;
}) {
  return (
    <div
      className={
        "relative overflow-hidden rounded-2xl border p-3.5 " +
        (reduced ? "" : "transition ") +
        (highlight
          ? "border-primary/60 bg-gradient-to-br from-primary/[0.08] to-transparent ring-1 ring-primary/20"
          : "border-border/60 bg-card/80")
      }
    >
      {highlight && (
        <span className="absolute right-3 top-3 rounded-full bg-primary px-2 py-0.5 text-[9px] font-semibold uppercase tracking-wider text-primary-foreground">
          Best
        </span>
      )}
      <div className="flex items-center justify-between pr-12">
        <div className="flex items-center gap-1.5">
          {icon}
          <span className="text-[13px] font-semibold">{name}</span>
        </div>
        <div className="flex items-baseline gap-0.5">
          <span className="text-[15px] font-bold tabular-nums">{price}</span>
          <span className="text-[10px] text-muted-foreground">{period}</span>
        </div>
      </div>
      <ul className="mt-2 space-y-1 text-[11.5px] text-muted-foreground">
        {bullets.map((b) => (
          <li key={b} className="flex gap-1.5">
            <span className={"mt-1.5 inline-block h-0.5 w-2 shrink-0 rounded-full " + (highlight ? "bg-primary" : "bg-foreground/30")} />
            <span className="leading-snug">{b}</span>
          </li>
        ))}
      </ul>
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
  name, price, period, features, cta, highlight, icon,
}: {
  name: string; price: string; period: string; features: string[]; cta: string;
  highlight?: boolean; icon: React.ReactNode;
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
      <Link
        to="/login"
        className={
          "mt-6 inline-flex w-full items-center justify-center rounded-lg px-4 py-2 text-sm font-semibold " +
          (highlight
            ? "bg-primary text-primary-foreground hover:opacity-90"
            : "border border-border hover:bg-accent")
        }
      >
        {cta}
      </Link>
    </div>
  );
}
