import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowRight,
  Check,
  Library,
  Layers,
  ScanLine,
  Sparkles,
  Trophy,
  Users,
  Zap,
  ShieldCheck,
  Rocket,
  Sparkle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TestModeBadge } from "@/components/test-mode-badge";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import {
  BRAND_NAME,
  BRAND_TAGLINE,
  BRAND_DESCRIPTION,
  SITE_URL,
  IS_BETA,
} from "@/lib/brand";
import { PLANS, formatKRW } from "@/lib/pricing";

export const Route = createFileRoute("/intro")({
  head: () => ({
    meta: [
      { title: `${BRAND_NAME} — TCG 통합 관리 플랫폼` },
      { name: "description", content: BRAND_DESCRIPTION },
      { property: "og:title", content: `${BRAND_NAME} — ${BRAND_TAGLINE}` },
      { property: "og:description", content: BRAND_DESCRIPTION },
      { property: "og:url", content: `${SITE_URL}/intro` },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: `${SITE_URL}/intro` }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: BRAND_NAME,
          url: SITE_URL,
          description: BRAND_DESCRIPTION,
        }),
      },
    ],
  }),
  component: IntroPage,
});

const FEATURES = [
  {
    icon: Library,
    title: "통합 카드 DB",
    desc: "원피스·포켓몬·디지몬 카드를 한 곳에서 검색, 비교, 즐겨찾기.",
  },
  {
    icon: Layers,
    title: "스마트 덱 빌더",
    desc: "색깔·코스트 자동 분석으로 균형 잡힌 덱을 빠르게 구성.",
  },
  {
    icon: ScanLine,
    title: "AI 카드 인식",
    desc: "카드 사진 한 장으로 코드·능력치·효과를 자동 등록.",
  },
  {
    icon: Sparkles,
    title: "AI 매치 코치",
    desc: "전적 데이터를 분석해 메타 추천과 약점을 짚어줍니다.",
  },
  {
    icon: Users,
    title: "오프라인 매칭 (LFG)",
    desc: "근처에서 함께 플레이할 사람을 찾고 약속을 잡으세요.",
  },
  {
    icon: Trophy,
    title: "리더보드 & 랭킹",
    desc: "Elo 기반 시즌 랭킹으로 자신의 실력을 추적합니다.",
  },
] as const;

const ROADMAP = [
  {
    phase: "Phase 1",
    label: "베타 (현재)",
    desc: "전 기능 무료, 결제는 테스트 모드. 사용자 피드백 수집 중.",
    icon: Rocket,
    active: true,
  },
  {
    phase: "Phase 2",
    label: "정식 오픈",
    desc: "Pro 멤버십·크레딧 결제 활성화. 모바일 PWA 최적화.",
    icon: Sparkle,
    active: false,
  },
  {
    phase: "Phase 3",
    label: "확장",
    desc: "유희왕·매직더개더링 추가. 대회 운영 도구·매장 연동.",
    icon: Zap,
    active: false,
  },
] as const;

const FAQS = [
  {
    q: "지금 가입하면 비용이 청구되나요?",
    a: "아니요. 현재는 베타 기간으로 모든 기능이 무료이며, 결제 화면도 시뮬레이션으로 동작해 실제 금액이 빠져나가지 않습니다.",
  },
  {
    q: "정식 오픈은 언제인가요?",
    a: "베타 피드백을 반영해 안정화가 완료되는 시점에 오픈 예정입니다. 가입한 사용자께는 메일로 사전 안내드립니다.",
  },
  {
    q: "AI 기능을 더 쓰고 싶으면 어떻게 하나요?",
    a: "정식 오픈 시 두 가지 방법이 제공됩니다. 월 정액 Pro 멤버십(무제한)과, 사용한 만큼만 차감하는 크레딧 충전 중에서 선택하실 수 있습니다.",
  },
  {
    q: "환불이 가능한가요?",
    a: "결제 후 7일 이내, 충전한 크레딧을 사용하지 않은 경우 전액 환불됩니다. Pro 구독은 다음 결제일부터 자동 해지되며 잔여 기간은 그대로 사용 가능합니다.",
  },
  {
    q: "지원 게임이 더 늘어나나요?",
    a: "네. 베타 기간 사용자 투표를 거쳐 우선순위가 높은 게임부터 순차적으로 추가됩니다.",
  },
] as const;

function IntroPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* 상단 네비 */}
      <header className="sticky top-0 z-40 border-b border-border/60 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-3">
          <Link to="/intro" className="flex items-center gap-2">
            <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground">
              <Layers className="size-4" />
            </div>
            <span className="text-lg font-bold tracking-tight">{BRAND_NAME}</span>
            <TestModeBadge className="ml-1" />
          </Link>
          <nav className="hidden items-center gap-6 text-sm text-muted-foreground md:flex">
            <a href="#features" className="hover:text-foreground">
              기능
            </a>
            <a href="#pricing" className="hover:text-foreground">
              요금제
            </a>
            <a href="#roadmap" className="hover:text-foreground">
              로드맵
            </a>
            <a href="#faq" className="hover:text-foreground">
              FAQ
            </a>
          </nav>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" asChild>
              <Link to="/login">로그인</Link>
            </Button>
            <Button size="sm" asChild>
              <Link to="/login">무료 시작 →</Link>
            </Button>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="relative overflow-hidden border-b border-border/60">
        <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-primary/15 via-background to-background" />
        <div className="mx-auto w-full max-w-6xl px-6 py-20 md:py-28">
          {IS_BETA && (
            <Badge variant="secondary" className="mb-5 inline-flex gap-1.5">
              <Sparkle className="size-3" /> Beta · 모든 기능 무료
            </Badge>
          )}
          <h1 className="max-w-3xl text-4xl font-bold leading-tight tracking-tight md:text-6xl">
            {BRAND_TAGLINE}
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-muted-foreground md:text-xl">
            {BRAND_DESCRIPTION}
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Button size="lg" asChild>
              <Link to="/login">
                무료로 시작하기 <ArrowRight className="ml-1 size-4" />
              </Link>
            </Button>
            <Button size="lg" variant="outline" asChild>
              <a href="#features">기능 둘러보기</a>
            </Button>
          </div>

          {/* 지원 게임 */}
          <div className="mt-12 flex flex-wrap items-center gap-6 text-sm text-muted-foreground">
            <span className="text-xs uppercase tracking-wider">지원 게임</span>
            <div className="flex flex-wrap gap-2">
              {["원피스 카드게임", "포켓몬 카드", "디지몬 카드"].map((g) => (
                <Badge key={g} variant="outline" className="px-3 py-1 text-sm">
                  {g}
                </Badge>
              ))}
              <Badge variant="outline" className="px-3 py-1 text-sm opacity-60">
                + 곧 추가
              </Badge>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="mx-auto w-full max-w-6xl px-6 py-20">
        <div className="mb-12 text-center">
          <Badge variant="secondary" className="mb-3">
            기능
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            TCG 플레이어에게 필요한 모든 것
          </h2>
          <p className="mt-3 text-muted-foreground">
            덱 빌딩부터 매치 분석까지 — 한 곳에서 끝냅니다.
          </p>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <Card key={f.title} className="transition hover:border-primary/50">
              <CardHeader>
                <div className="grid size-10 place-items-center rounded-lg bg-primary/10 text-primary">
                  <f.icon className="size-5" />
                </div>
                <CardTitle className="mt-4 text-lg">{f.title}</CardTitle>
                <CardDescription>{f.desc}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      {/* Pricing */}
      <section
        id="pricing"
        className="border-y border-border/60 bg-muted/20 py-20"
      >
        <div className="mx-auto w-full max-w-6xl px-6">
          <div className="mb-10 text-center">
            <Badge variant="secondary" className="mb-3">
              요금제
            </Badge>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              부담 없이, 쓴 만큼만
            </h2>
            <p className="mt-3 text-muted-foreground">
              무료로 핵심 기능 모두 사용. AI 기능은 정액제 또는 크레딧으로 선택.
            </p>
          </div>

          {IS_BETA && <TestModeBadge variant="banner" className="mx-auto mb-8 max-w-2xl" />}

          <div className="grid gap-5 md:grid-cols-2">
            {PLANS.map((plan) => (
              <Card
                key={plan.id}
                className={
                  plan.highlight
                    ? "relative border-primary shadow-lg shadow-primary/10"
                    : "relative"
                }
              >
                {plan.highlight && (
                  <Badge className="absolute -top-3 left-6">추천</Badge>
                )}
                <CardHeader>
                  <CardTitle className="text-xl">{plan.name}</CardTitle>
                  <div className="mt-3 flex items-baseline gap-1">
                    <span className="text-4xl font-bold">
                      {plan.priceKRW === 0 ? "무료" : formatKRW(plan.priceKRW)}
                    </span>
                    {plan.period && (
                      <span className="text-sm text-muted-foreground">/월</span>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2 text-sm">
                    {plan.features.map((f) => (
                      <li key={f} className="flex items-start gap-2">
                        <Check className="mt-0.5 size-4 shrink-0 text-primary" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    className="w-full"
                    variant={plan.highlight ? "default" : "outline"}
                    asChild
                  >
                    <Link to="/pricing">{plan.cta}</Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>

          <p className="mt-6 text-center text-xs text-muted-foreground">
            크레딧 충전(100C ₩1,000부터)으로 단발성 사용도 가능합니다 ·{" "}
            <Link to="/pricing" className="underline hover:text-foreground">
              자세히
            </Link>
          </p>
        </div>
      </section>

      {/* Roadmap */}
      <section id="roadmap" className="mx-auto w-full max-w-6xl px-6 py-20">
        <div className="mb-12 text-center">
          <Badge variant="secondary" className="mb-3">
            로드맵
          </Badge>
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            앞으로 달려갈 길
          </h2>
        </div>

        <div className="grid gap-4 md:grid-cols-3">
          {ROADMAP.map((r) => (
            <Card
              key={r.phase}
              className={
                r.active
                  ? "border-primary/60 bg-primary/5"
                  : "border-dashed opacity-80"
              }
            >
              <CardHeader>
                <div className="flex items-center gap-2">
                  <r.icon className="size-5 text-primary" />
                  <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                    {r.phase}
                  </span>
                </div>
                <CardTitle className="mt-2 text-lg">{r.label}</CardTitle>
                <CardDescription>{r.desc}</CardDescription>
              </CardHeader>
            </Card>
          ))}
        </div>
      </section>

      {/* FAQ */}
      <section
        id="faq"
        className="border-y border-border/60 bg-muted/20 py-20"
      >
        <div className="mx-auto w-full max-w-3xl px-6">
          <div className="mb-10 text-center">
            <Badge variant="secondary" className="mb-3">
              FAQ
            </Badge>
            <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
              자주 묻는 질문
            </h2>
          </div>

          <Accordion type="single" collapsible className="w-full">
            {FAQS.map((faq, i) => (
              <AccordionItem key={faq.q} value={`item-${i}`}>
                <AccordionTrigger className="text-left">{faq.q}</AccordionTrigger>
                <AccordionContent className="text-muted-foreground">
                  {faq.a}
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </div>
      </section>

      {/* Final CTA */}
      <section className="mx-auto w-full max-w-6xl px-6 py-20">
        <div className="rounded-2xl border border-border bg-gradient-to-br from-primary/15 via-background to-background p-10 text-center md:p-16">
          <ShieldCheck className="mx-auto mb-4 size-10 text-primary" />
          <h2 className="text-3xl font-bold tracking-tight md:text-4xl">
            지금 베타에 참여하세요
          </h2>
          <p className="mx-auto mt-3 max-w-xl text-muted-foreground">
            모든 기능을 무료로 체험할 수 있는 마지막 기회입니다. 정식 오픈 후에도
            베타 사용자에게는 특별 혜택이 제공됩니다.
          </p>
          <Button size="lg" className="mt-8" asChild>
            <Link to="/login">
              무료로 시작하기 <ArrowRight className="ml-1 size-4" />
            </Link>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-border/60 py-10 text-sm text-muted-foreground">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-6 md:flex-row">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-foreground">{BRAND_NAME}</span>
            <span>· © {new Date().getFullYear()}</span>
            <TestModeBadge />
          </div>
          <div className="flex gap-4">
            <Link to="/intro" className="hover:text-foreground">
              소개
            </Link>
            <Link to="/pricing" className="hover:text-foreground">
              요금제
            </Link>
            <Link to="/login" className="hover:text-foreground">
              시작하기
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
