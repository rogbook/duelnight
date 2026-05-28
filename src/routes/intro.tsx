import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Sparkles, Trophy, Users, ScanLine, BarChart3, Calendar, Crown, Coins, ChevronRight } from "lucide-react";
import { useI18n } from "@/i18n/language-context";
import { LanguageSelector } from "@/components/language-selector";

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
            <Link
              to="/login"
              className="rounded-md border border-border px-2.5 py-1.5 text-xs hover:bg-accent sm:px-3 sm:text-sm"
            >
              {t("common.login")}
            </Link>
            <Link
              to="/login"
              className="hidden sm:inline-flex rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 sm:text-sm"
            >
              {t("intro.freeStart")}
            </Link>
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

  const slides: Array<{ key: string; node: React.ReactNode }> = [
    {
      key: "hero",
      node: (
        <SlideShell>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-[11px] text-muted-foreground">
            <Sparkles className="h-3 w-3" />
            {t("intro.gameIntegrated")}
          </span>
          <h1 className="mt-5 text-3xl font-bold leading-tight tracking-tight">
            {t("intro.heroTitle1")}
            <br />
            <span className="bg-gradient-to-r from-primary to-amber-500 bg-clip-text text-transparent">
              {t("intro.heroTitle2")}
            </span>
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">{t("intro.description")}</p>
          <p className="mt-4 text-[11px] text-amber-500">{t("intro.testPhaseNotice")}</p>
        </SlideShell>
      ),
    },
    {
      key: "f1",
      node: (
        <FeatureSlide
          icon={<BarChart3 className="h-6 w-6" />}
          title={t("intro.featureTitle1")}
          desc={t("intro.featureDesc1")}
          accent="from-sky-500/20 to-transparent"
        />
      ),
    },
    {
      key: "f2",
      node: (
        <FeatureSlide
          icon={<ScanLine className="h-6 w-6" />}
          title={t("intro.featureTitle2")}
          desc={t("intro.featureDesc2")}
          accent="from-emerald-500/20 to-transparent"
        />
      ),
    },
    {
      key: "f3",
      node: (
        <FeatureSlide
          icon={<Trophy className="h-6 w-6" />}
          title={t("intro.featureTitle3")}
          desc={t("intro.featureDesc3")}
          accent="from-amber-500/20 to-transparent"
        />
      ),
    },
    {
      key: "f4",
      node: (
        <FeatureSlide
          icon={<Calendar className="h-6 w-6" />}
          title={t("intro.featureTitle4")}
          desc={t("intro.featureDesc4")}
          accent="from-violet-500/20 to-transparent"
        />
      ),
    },
    {
      key: "f5",
      node: (
        <FeatureSlide
          icon={<Users className="h-6 w-6" />}
          title={t("intro.featureTitle5")}
          desc={t("intro.featureDesc5")}
          accent="from-pink-500/20 to-transparent"
        />
      ),
    },
    {
      key: "pricing",
      node: (
        <SlideShell>
          <h2 className="text-2xl font-bold tracking-tight">{t("intro.pricingTitle")}</h2>
          <p className="mt-2 text-sm text-muted-foreground">{t("intro.pricingDesc")}</p>
          <p className="mt-1 text-[11px] text-amber-500">{t("intro.pricingTestNotice")}</p>

          <div className="mt-5 space-y-3">
            <MiniPlan
              icon={<Sparkles className="h-4 w-4 text-muted-foreground" />}
              name={t("intro.priceFreeName")}
              price={language === "en" ? "$0" : language === "ja" ? "¥0" : "₩0"}
              period={t("intro.priceFreePeriod")}
              bullets={[t("intro.priceFreeFeature1"), t("intro.priceFreeFeature4"), t("intro.priceFreeFeature5")]}
            />
            <MiniPlan
              icon={<Crown className="h-4 w-4 text-amber-500" />}
              name={t("intro.priceProName")}
              price={proPrice}
              period={t("intro.priceProPeriod")}
              bullets={[t("intro.priceProFeature2"), t("intro.priceProFeature3"), t("intro.priceProFeature4")]}
              highlight
            />
            <MiniPlan
              icon={<Coins className="h-4 w-4 text-emerald-500" />}
              name={t("intro.priceCreditName")}
              price={creditPrice}
              period={t("intro.priceCreditPeriod")}
              bullets={[t("intro.priceCreditFeature1"), t("intro.priceCreditFeature3")]}
            />
          </div>
        </SlideShell>
      ),
    },
    {
      key: "cta",
      node: (
        <SlideShell>
          <div className="flex flex-col items-center text-center">
            <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-primary to-amber-500 text-primary-foreground">
              <Sparkles className="h-7 w-7" />
            </span>
            <h2 className="mt-4 text-2xl font-bold tracking-tight">{t("intro.bottomCtaTitle")}</h2>
            <p className="mt-2 text-sm text-muted-foreground">{t("intro.bottomCtaDesc")}</p>
            <Link
              to="/login"
              className="mt-6 inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              {t("intro.ctaFreeStart")}
              <ChevronRight className="h-4 w-4" />
            </Link>
            <Link
              to="/login"
              className="mt-3 text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              {t("common.login")}
            </Link>
          </div>
        </SlideShell>
      ),
    },
  ];

  // 스크롤 위치로 현재 인덱스 추적
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const onScroll = () => {
      const w = el.clientWidth;
      if (w === 0) return;
      const i = Math.round(el.scrollLeft / w);
      setIndex(Math.max(0, Math.min(slides.length - 1, i)));
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [slides.length]);

  const goTo = (i: number) => {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" });
  };

  return (
    <div className="md:hidden">
      {/* 슬라이더 영역 — 헤더(56px)와 하단 CTA(약 76px) 제외 */}
      <div className="relative">
        <div
          ref={scrollerRef}
          className="flex snap-x snap-mandatory overflow-x-auto scroll-smooth [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          style={{ scrollSnapType: "x mandatory" }}
        >
          {slides.map((s) => (
            <section
              key={s.key}
              className="min-w-full shrink-0 snap-center px-5"
              style={{ minHeight: "calc(100vh - 56px - 76px)" }}
            >
              <div className="flex h-full items-center">
                <div className="w-full">{s.node}</div>
              </div>
            </section>
          ))}
        </div>

        {/* 인디케이터 */}
        <div className="absolute inset-x-0 bottom-2 flex justify-center gap-1.5">
          {slides.map((s, i) => (
            <button
              key={s.key}
              type="button"
              aria-label={`슬라이드 ${i + 1}`}
              onClick={() => goTo(i)}
              className={
                "h-1.5 rounded-full transition-all " +
                (i === index ? "w-6 bg-primary" : "w-1.5 bg-muted-foreground/40")
              }
            />
          ))}
        </div>
      </div>

      {/* 하단 고정 CTA — 모바일에서 항상 노출 */}
      <div className="sticky bottom-0 z-30 border-t border-border bg-background/95 px-4 py-3 backdrop-blur">
        <div className="flex items-center gap-2">
          <Link
            to="/login"
            className="inline-flex flex-1 items-center justify-center rounded-xl bg-primary px-4 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            {t("intro.nowStartFree")}
          </Link>
          <Link
            to="/login"
            className="inline-flex items-center justify-center rounded-xl border border-border px-4 py-3 text-sm font-medium hover:bg-accent"
          >
            {t("common.login")}
          </Link>
        </div>
      </div>
    </div>
  );
}

function SlideShell({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-md py-8">{children}</div>;
}

function FeatureSlide({
  icon, title, desc, accent,
}: {
  icon: React.ReactNode; title: string; desc: string; accent: string;
}) {
  return (
    <SlideShell>
      <div className={`rounded-3xl border border-border bg-gradient-to-b ${accent} p-6`}>
        <div className="grid h-12 w-12 place-items-center rounded-2xl bg-primary/10 text-primary">
          {icon}
        </div>
        <h2 className="mt-5 text-2xl font-bold tracking-tight">{title}</h2>
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{desc}</p>
      </div>
    </SlideShell>
  );
}

function MiniPlan({
  icon, name, price, period, bullets, highlight,
}: {
  icon: React.ReactNode; name: string; price: string; period: string;
  bullets: string[]; highlight?: boolean;
}) {
  return (
    <div
      className={
        "rounded-2xl border bg-card p-4 " +
        (highlight ? "border-primary shadow-sm shadow-primary/10" : "border-border")
      }
    >
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm font-semibold">{name}</span>
        </div>
        <div className="flex items-baseline gap-1">
          <span className="text-base font-bold">{price}</span>
          <span className="text-[10px] text-muted-foreground">{period}</span>
        </div>
      </div>
      <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
        {bullets.map((b) => (
          <li key={b} className="flex gap-1.5">
            <span className="mt-1 inline-block h-1 w-1 shrink-0 rounded-full bg-primary" />
            <span>{b}</span>
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
