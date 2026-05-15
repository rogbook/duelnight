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
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { Toaster } from "@/components/ui/sonner";
import { NotificationBell } from "@/components/notification-bell";
import { supabase } from "@/integrations/supabase/client";

function AuthHeaderButton() {
  const { user } = useAuth();
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
          로그아웃
        </button>
      </div>
    );
  }
  return (
    <Link
      to="/login"
      className="rounded-md bg-foreground px-2.5 py-1 text-[11px] font-medium text-background hover:opacity-90 sm:px-3 sm:py-1.5 sm:text-xs"
    >
      로그인
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
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#0b0b0c" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "덱로그" },
      { title: "덱로그" },
      { name: "description", content: "덱로그 — 원피스·포켓몬·디지몬 TCG 전적·승률·덱·일정·매장을 한 곳에서." },
      { name: "author", content: "덱로그" },
      { property: "og:title", content: "덱로그" },
      { property: "og:description", content: "덱로그 — 원피스·포켓몬·디지몬 TCG 전적·승률·덱·일정·매장을 한 곳에서." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:site", content: "@decklog" },
      { name: "twitter:title", content: "덱로그" },
      { name: "twitter:description", content: "덱로그 — 원피스·포켓몬·디지몬 TCG 전적·승률·덱·일정·매장을 한 곳에서." },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/857ef3a9-8c7c-4842-9944-a368d5ef04d9/id-preview-dadce6dc--91f6cdde-f492-45b3-be3f-4b2dc70d4752.lovable.app-1778568615627.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/857ef3a9-8c7c-4842-9944-a368d5ef04d9/id-preview-dadce6dc--91f6cdde-f492-45b3-be3f-4b2dc70d4752.lovable.app-1778568615627.png" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      {
        rel: "manifest",
        href: "/manifest.webmanifest",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isBare = pathname === "/intro" || pathname === "/login";

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        {isBare ? (
          <>
            <main className="min-h-screen bg-background">
              <Outlet />
            </main>
            <Toaster />
          </>
        ) : (
          <SidebarProvider>
            <div className="flex min-h-screen w-full bg-background">
              <AppSidebar />
              <div className="flex flex-1 flex-col">
                <header
                  className="sticky top-0 z-30 flex h-12 items-center gap-2 border-b border-border bg-background/80 px-2 backdrop-blur sm:h-14 sm:gap-3 sm:px-4"
                  style={{ paddingTop: "env(safe-area-inset-top)" }}
                >
                  <SidebarTrigger />
                  <div className="flex-1" />
                  <NotificationBell />
                  <AuthHeaderButton />
                </header>
                <main className="flex-1">
                  <Outlet />
                </main>
              </div>
            </div>
            <Toaster />
          </SidebarProvider>
        )}
      </AuthProvider>
    </QueryClientProvider>
  );
}
