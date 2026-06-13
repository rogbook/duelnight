import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { IconRail } from "@/components/game/IconRail";
import { BottomTab } from "@/components/game/BottomTab";
import { BackButton } from "@/components/back-button";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { Toaster } from "@/components/ui/sonner";
import { NotificationBell } from "@/components/notification-bell";
import { EnvBanner } from "@/components/env-banner";
import { supabase } from "@/integrations/supabase/client";
import { useCallback, useState, useEffect } from "react";
import { LanguageProvider, useI18n } from "@/i18n/language-context";
import { LanguageSelector } from "@/components/language-selector";
import { ThemeProvider } from "@/hooks/use-theme";
import { OnlinePresenceProvider } from "@/hooks/use-online-presence";
import { ThemeToggle } from "@/components/theme-toggle";

// 하이드레이션 전에 테마 클래스를 적용해 깜빡임(FOUC) 방지
const THEME_INIT = `(function(){try{var t=localStorage.getItem('duelnight.theme')||'system';var d=t==='dark'||(t==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

function AuthHeaderButton() {
  const { user, loading } = useAuth();
  const { t } = useI18n();
  // 세션 복원 전에는 아무것도 렌더링하지 않아 "로그인 풀림" 플래시를 방지
  if (loading) {
    return <div className="h-6 w-16" aria-hidden />;
  }
  if (user) {
    return (
      <div className="flex items-center gap-1.5 sm:gap-2">
        <span className="hidden max-w-[200px] truncate text-xs text-muted-foreground md:inline">
          {user.email}
        </span>
        <button
          onClick={() => supabase.auth.signOut()}
          className="rounded-md border border-border px-2.5 py-1 text-[11px] hover:bg-accent sm:px-3 sm:py-1.5 sm:text-xs"
        >
          {t("common.logout")}
        </button>
      </div>
    );
  }
  return (
    <Link
      to="/login"
      className="rounded-md bg-foreground px-2.5 py-1 text-[11px] font-medium text-background hover:opacity-90 sm:px-3 sm:py-1.5 sm:text-xs"
    >
      {t("common.login")}
    </Link>
  );
}

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => {
    let locale = "ko";
    if (typeof window !== "undefined") {
      locale = localStorage.getItem("duelnight.i18n.locale") || "ko";
    }
    const descs: Record<string, string> = {
      ko: "DuelNight — 원피스·포켓몬·디지몬 TCG 전적·승률·덱·일정·매장을 한 곳에서.",
      en: "DuelNight — One Piece, Pokémon, and Digimon TCG match records, win rates, decks, schedules, and stores in one place.",
      ja: "DuelNight — ワンピース・ポケモン・デジモンTCGの戦績、勝率、デッキ、スケジュール、店舗を1箇所で。",
    };
    const desc = descs[locale] || descs.ko;
    return {
      meta: [
        { charSet: "utf-8" },
        { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
        { name: "theme-color", content: "#0b0b0c" },
        { name: "apple-mobile-web-app-capable", content: "yes" },
        { name: "apple-mobile-web-app-title", content: "DuelNight" },
        { title: "DuelNight" },
        { name: "description", content: desc },
        { name: "author", content: "DuelNight" },
        { property: "og:title", content: "DuelNight" },
        { property: "og:description", content: desc },
        { property: "og:type", content: "website" },
        { name: "twitter:card", content: "summary" },
        { name: "twitter:site", content: "@decklog" },
        { name: "twitter:title", content: "DuelNight" },
        { name: "twitter:description", content: desc },
        {
          property: "og:image",
          content:
            "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/857ef3a9-8c7c-4842-9944-a368d5ef04d9/id-preview-dadce6dc--91f6cdde-f492-45b3-be3f-4b2dc70d4752.lovable.app-1778568615627.png",
        },
        {
          name: "twitter:image",
          content:
            "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/857ef3a9-8c7c-4842-9944-a368d5ef04d9/id-preview-dadce6dc--91f6cdde-f492-45b3-be3f-4b2dc70d4752.lovable.app-1778568615627.png",
        },
      ],
      links: [
        {
          rel: "stylesheet",
          href: appCss,
        },
        // 친근한 본문 폰트(Pretendard). CSS @import 대신 head link로 로드해
        // Tailwind/lightningcss 빌드 파이프라인과 분리(빌드 안정).
        {
          rel: "stylesheet",
          href: "https://cdn.jsdelivr.net/gh/orioncactus/pretendard/dist/web/variable/pretendardvariable.min.css",
        },
        {
          rel: "manifest",
          href: "/manifest.webmanifest",
        },
        { rel: "icon", type: "image/png", href: "/favicon.png" },
        { rel: "apple-touch-icon", href: "/icon-192.png" },
      ],
    };
  },
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  // THEME_INIT 인라인 스크립트가 하이드레이션 전에 html.classList에 'dark'를
  // 토글하기 때문에 SSR HTML과 클라이언트 트리가 항상 어긋난다.
  // React 19는 이 불일치를 만나면 전체 트리를 클라이언트 재렌더로 폴백시키며,
  // 그 사이에 onClick 핸들러가 잠시 붙지 않아 "버튼이 안 눌린다"는 증상이 난다.
  // 기본값을 dark로 고정하고 suppressHydrationWarning으로 인라인 스크립트의
  // class 조정과의 미스매치를 명시적으로 허용한다.
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body suppressHydrationWarning>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isBare = pathname === "/intro" || pathname === "/login";

  // SSR 하이드레이션 불일치 에러를 방어하기 위해 mounted 상태 관리
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // 1024px 이하 해상도(모바일 및 태블릿) 감지
  const [isMobileOrTablet, setIsMobileOrTablet] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const media = window.matchMedia("(max-width: 1024px)");
    const listener = (e: MediaQueryListEvent | MediaQueryList) => {
      setIsMobileOrTablet(e.matches);
    };
    listener(media);
    media.addEventListener("change", listener);
    return () => media.removeEventListener("change", listener);
  }, []);

  const renderMobileOrTablet = mounted && isMobileOrTablet;

  const handleAuthChange = useCallback(() => {
    router.invalidate();
    queryClient.invalidateQueries();
  }, [queryClient, router]);

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider onAuthChange={handleAuthChange}>
        <ThemeProvider>
          <LanguageProvider>
            <OnlinePresenceProvider>
              {isBare ? (
                <>
                  <EnvBanner />
                  <main className="min-h-screen bg-game-bg text-game-text">
                    <Outlet />
                  </main>
                  <Toaster />
                </>
              ) : renderMobileOrTablet ? (
                <div className="flex min-h-screen w-full flex-col bg-game-bg text-game-text">
                  <EnvBanner />
                  <header
                    className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-game-line bg-game-bg-deep/80 px-4 backdrop-blur text-game-text"
                    style={{ paddingTop: "env(safe-area-inset-top)" }}
                  >
                    <BackButton />
                    <div className="flex-1" />
                    <ThemeToggle />
                    <LanguageSelector />
                    <NotificationBell />
                    <AuthHeaderButton />
                  </header>
                  <main
                    className="flex-1 bg-game-bg"
                    style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 3.5rem)" }}
                  >
                    <Outlet />
                  </main>
                  <BottomTab />
                  <Toaster />
                </div>
              ) : (
                <div className="flex min-h-screen w-full bg-game-bg text-game-text">
                  <IconRail />
                  <div className="flex flex-1 flex-col overflow-x-hidden min-h-screen">
                    <EnvBanner />
                    <header
                      className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-game-line bg-game-bg-deep/80 px-2 backdrop-blur sm:h-14 sm:gap-3 sm:px-4 text-game-text"
                      style={{ paddingTop: "env(safe-area-inset-top)" }}
                    >
                      <BackButton />
                      <div className="flex-1" />
                      <ThemeToggle />
                      <LanguageSelector />
                      <NotificationBell />
                      <AuthHeaderButton />
                    </header>
                    <main className="flex-1 bg-game-bg overflow-y-auto">
                      <Outlet />
                    </main>
                  </div>
                  <Toaster />
                </div>
              )}
            </OnlinePresenceProvider>
          </LanguageProvider>
        </ThemeProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
