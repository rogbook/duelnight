import { createFileRoute, Link } from "@tanstack/react-router";
import { Sparkles, Trophy, Users, ScanLine, BarChart3, Calendar, Crown, Coins } from "lucide-react";

const BRAND = {
  name: "덱로그",
  tagline: "원피스·포켓몬·디지몬 TCG 플레이어를 위한 올인원 허브",
  description:
    "전적 기록, AI 카드 OCR, 덱 빌더, 대회·발매 일정, 매장 LFG까지. 한 곳에서 끝내는 TCG 워크플로우.",
};

export const Route = createFileRoute("/intro")({
  head: () => ({
    meta: [
      { title: `${BRAND.name} — ${BRAND.tagline}` },
      { name: "description", content: BRAND.description },
      { property: "og:title", content: `${BRAND.name} — ${BRAND.tagline}` },
      { property: "og:description", content: BRAND.description },
      { property: "og:type", content: "website" },
    ],
  }),
  component: IntroPage,
});

function IntroPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Top bar */}
      <header className="sticky top-0 z-30 border-b border-border/50 bg-background/80 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center justify-between px-4 sm:px-6">
          <Link to="/intro" className="flex items-center gap-2 font-bold tracking-tight">
            <span className="grid h-7 w-7 place-items-center rounded-md bg-primary text-primary-foreground">
              <Sparkles className="h-4 w-4" />
            </span>
            <span>{BRAND.name}</span>
            <span className="ml-1 rounded-full border border-amber-400/40 bg-amber-400/10 px-2 py-0.5 text-[10px] font-medium text-amber-500">
              테스트 중
            </span>
          </Link>
          <div className="flex items-center gap-2">
            <Link
              to="/login"
              className="rounded-md border border-border px-3 py-1.5 text-xs hover:bg-accent sm:text-sm"
            >
              로그인
            </Link>
            <Link
              to="/login"
              className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 sm:text-sm"
            >
              무료로 시작
            </Link>
          </div>
        </div>
      </header>

      {/* Hero */}
      <section className="mx-auto w-full max-w-6xl px-4 pt-16 pb-20 sm:px-6 sm:pt-24">
        <div className="mx-auto max-w-3xl text-center">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 py-1 text-xs text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            OPTCG · PTCG · DTCG 통합
          </span>
          <h1 className="mt-5 text-4xl font-bold leading-tight tracking-tight sm:text-5xl md:text-6xl">
            기록하고, 분석하고,
            <br />
            <span className="bg-gradient-to-r from-primary to-amber-500 bg-clip-text text-transparent">
              이기는 덱을 찾아내세요
            </span>
          </h1>
          <p className="mt-5 text-base text-muted-foreground sm:text-lg">{BRAND.description}</p>
          <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/login"
              className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90"
            >
              지금 시작하기 — 무료
            </Link>
            <a
              href="#pricing"
              className="rounded-lg border border-border px-5 py-2.5 text-sm font-semibold hover:bg-accent"
            >
              요금 보기
            </a>
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            현재는 테스트 단계입니다. 정식 오픈 시 결제·구독이 활성화됩니다.
          </p>
        </div>
      </section>

      {/* Features */}
      <section className="mx-auto w-full max-w-6xl px-4 pb-20 sm:px-6">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Feature
            icon={<BarChart3 className="h-5 w-5" />}
            title="전적·승률 분석"
            desc="덱별·상대별 승률, 선후공·이벤트 필터, 레이팅(ELO) 자동 계산."
          />
          <Feature
            icon={<ScanLine className="h-5 w-5" />}
            title="AI 카드 OCR"
            desc="카드 사진 한 장으로 코드·스탯·효과를 자동 채워넣는 Gemini Vision."
          />
          <Feature
            icon={<Trophy className="h-5 w-5" />}
            title="덱 빌더 & 티어리스트"
            desc="레시피 검증·색 제한·매수 제한, 게임별 티어리스트 공유."
          />
          <Feature
            icon={<Calendar className="h-5 w-5" />}
            title="발매·대회 일정"
            desc="발매·대회·매장 이벤트를 한눈에. 즐겨찾기·알림·캘린더(.ics) 내보내기."
          />
          <Feature
            icon={<Users className="h-5 w-5" />}
            title="LFG · 친구"
            desc="매장 단위 매칭 모집·DM, 친구 관리와 매치 기록 자동 동기화."
          />
          <Feature
            icon={<Sparkles className="h-5 w-5" />}
            title="AI 코치"
            desc="내 매치 데이터를 기반으로 한 약점·매치업 코칭 (월 3회 무료)."
          />
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="border-t border-border bg-muted/20">
        <div className="mx-auto w-full max-w-6xl px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">단순한 요금</h2>
            <p className="mt-3 text-muted-foreground">
              핵심 기능은 평생 무료. AI 기능만 사용량/구독으로 충전.
            </p>
            <p className="mt-1 text-xs text-amber-500">테스트 단계 — 결제는 정식 오픈 후 활성화</p>
          </div>

          <div className="mt-10 grid gap-4 md:grid-cols-3">
            <PriceCard
              name="Free"
              price="₩0"
              period="평생 무료"
              icon={<Sparkles className="h-5 w-5 text-muted-foreground" />}
              features={[
                "전적 기록·승률 분석 무제한",
                "덱 빌더·티어리스트",
                "발매·대회 일정 / LFG",
                "AI 카드 OCR — 5회/일",
                "AI 코치 — 3회/월",
              ]}
              cta="무료로 시작"
            />
            <PriceCard
              name="Pro"
              price="₩4,900"
              period="/ 월"
              highlight
              icon={<Crown className="h-5 w-5 text-amber-500" />}
              features={[
                "Free의 모든 기능",
                "AI 카드 OCR 무제한",
                "AI 코치 무제한",
                "덱 공개 일정 우선 노출",
                "광고 제거 (정식 오픈 시)",
              ]}
              cta="Pro 시작하기"
            />
            <PriceCard
              name="크레딧 충전"
              price="₩1,000~"
              period="필요할 때만"
              icon={<Coins className="h-5 w-5 text-emerald-500" />}
              features={[
                "구독 없이 사용량만 결제",
                "OCR 5크레딧 / 코치 10크레딧",
                "₩1,000 = 100크레딧",
                "잔액 영구 보관",
                "Free 한도 초과 시 자동 차감",
              ]}
              cta="크레딧 충전"
            />
          </div>
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto w-full max-w-6xl px-4 py-20 text-center sm:px-6">
        <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
          오늘 매치부터 기록해보세요
        </h2>
        <p className="mt-3 text-muted-foreground">계정 1분이면 끝. 카드 정보는 커뮤니티가 함께 채웁니다.</p>
        <div className="mt-6">
          <Link
            to="/login"
            className="inline-flex items-center justify-center rounded-lg bg-primary px-6 py-3 text-sm font-semibold text-primary-foreground hover:opacity-90"
          >
            무료로 시작하기
          </Link>
        </div>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-3 px-4 py-6 text-xs text-muted-foreground sm:flex-row sm:px-6">
          <div>© {new Date().getFullYear()} {BRAND.name}. 테스트 운영 중.</div>
          <div className="flex items-center gap-3">
            <Link to="/login" className="hover:underline">로그인</Link>
            <a href="#pricing" className="hover:underline">요금</a>
          </div>
        </div>
      </footer>
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
  return (
    <div
      className={
        "relative rounded-2xl border bg-card p-6 " +
        (highlight ? "border-primary shadow-lg shadow-primary/10" : "border-border")
      }
    >
      {highlight && (
        <span className="absolute -top-2.5 left-6 rounded-full bg-primary px-2.5 py-0.5 text-[10px] font-semibold text-primary-foreground">
          추천
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
