import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Home,
  Library,
  Swords,
  Layers,
  User,
  MoreHorizontal,
  Calendar,
  PackageOpen,
  Sparkles,
  Trophy,
  ListOrdered,
  MapPin,
  Users,
  MessageCircle,
  UserPlus,
  Megaphone,
  ShoppingCart,
  Shield,
  Upload,
  Gamepad,
} from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useI18n, TranslationKey } from "@/i18n/language-context";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useUnreadDmCount } from "@/hooks/use-unread-dm";

interface NavItem {
  labelKey: TranslationKey;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
}

const leftTabs: NavItem[] = [
  { labelKey: "nav.dashboard", url: "/", icon: Home },
  { labelKey: "nav.cards", url: "/cards", icon: Library },
];

const rightTabs: NavItem[] = [
  { labelKey: "nav.decks", url: "/decks", icon: Layers },
];

const moreItems: NavItem[] = [
  { labelKey: "nav.profile", url: "/profile", icon: User },
  { labelKey: "nav.simulator", url: "/simulator", icon: Gamepad },
  { labelKey: "nav.calendar", url: "/calendar", icon: Calendar },
  { labelKey: "nav.collection", url: "/collection", icon: PackageOpen },
  { labelKey: "nav.packs", url: "/packs", icon: Sparkles },
  { labelKey: "nav.leaderboard", url: "/leaderboard", icon: Trophy },
  { labelKey: "nav.tier", url: "/tier", icon: ListOrdered },
  { labelKey: "nav.store", url: "/stores", icon: MapPin },
  { labelKey: "nav.lfg", url: "/lfg", icon: Users },
  { labelKey: "nav.messages", url: "/messages", icon: MessageCircle },
  { labelKey: "nav.friends", url: "/friends", icon: UserPlus },
  { labelKey: "nav.announcements", url: "/announcements", icon: Megaphone },
  { labelKey: "nav.shop", url: "/store", icon: ShoppingCart },
];

const adminMoreItems: NavItem[] = [
  { labelKey: "nav.adminConsole", url: "/admin", icon: Shield },
  { labelKey: "nav.adminCardsUpload", url: "/admin/cards", icon: Upload },
];

export function BottomTab() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const [moreOpen, setMoreOpen] = useState(false);
  const unreadDm = useUnreadDmCount();

  const currentPath = useRouterState({
    select: (s) => s.location.pathname,
  });

  const filteredMoreItems = moreItems.filter((item) => !(item.url === "/store" && !user));
  const allItems = [
    ...leftTabs,
    { labelKey: "nav.matches" as const, url: "/matches", icon: Swords },
    ...rightTabs,
    ...filteredMoreItems,
    ...(isAdmin ? adminMoreItems : []),
  ];

  const activeUrl = allItems
    .filter((it) =>
      it.url === "/"
        ? currentPath === "/"
        : currentPath === it.url || currentPath.startsWith(it.url + "/"),
    )
    .sort((a, b) => b.url.length - a.url.length)[0]?.url;

  const isMoreActive = [
    ...filteredMoreItems,
    ...(isAdmin ? adminMoreItems : []),
  ].some((it) => it.url === activeUrl);

  const isMatchesActive = activeUrl === "/matches";

  const renderTabItem = (tab: NavItem) => {
    const active = tab.url === activeUrl;
    return (
      <Link
        key={tab.url}
        to={tab.url}
        className="flex flex-1 flex-col items-center justify-center gap-0.5 active:scale-95 transition-transform duration-150"
      >
        <tab.icon
          className={`h-5 w-5 transition-all duration-200 ${
            active ? "text-game-blue scale-105" : "text-game-icon-idle"
          }`}
        />
        <span
          className={`text-[10px] transition-all duration-200 ${
            active ? "font-semibold text-game-blue" : "text-game-icon-idle"
          }`}
        >
          {t(tab.labelKey)}
        </span>
      </Link>
    );
  };

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-game-line bg-game-bg-deep/95 backdrop-blur-sm"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex h-14 items-stretch relative">
          {/* 왼쪽 2개 탭 (홈, 카드) */}
          {leftTabs.map(renderTabItem)}

          {/* 중앙 대전 탭 (플로팅 버튼 스타일) */}
          <div className="flex-1 flex flex-col items-center justify-end relative">
            <Link
              to="/matches"
              className={`absolute -top-[16px] left-1/2 -translate-x-1/2 flex h-11 w-11 items-center justify-center rounded-full bg-game-blue-deep hover:bg-game-blue text-white shadow-lg border border-game-line-accent transition-all duration-200 active:scale-90 ${
                isMatchesActive ? "ring-2 ring-game-blue ring-offset-2 ring-offset-game-bg-deep" : ""
              }`}
            >
              <Swords className="h-5 w-5" />
            </Link>
            <span
              className={`text-[10px] pb-1 font-medium transition-all duration-200 ${
                isMatchesActive ? "text-game-blue font-semibold scale-105" : "text-game-icon-idle"
              }`}
            >
              {t("nav.matches")}
            </span>
          </div>

          {/* 오른쪽 덱 탭 */}
          {rightTabs.map(renderTabItem)}

          {/* 5번째 프로필/더보기 탭 */}
          <button
            onClick={() => setMoreOpen(true)}
            className="relative flex flex-1 flex-col items-center justify-center gap-0.5 active:scale-95 transition-transform duration-150"
          >
            <MoreHorizontal
              className={`h-5 w-5 transition-all duration-200 ${
                isMoreActive ? "text-game-blue scale-105" : "text-game-icon-idle"
              }`}
            />
            {unreadDm > 0 && (
              <span className="absolute right-[calc(50%-1.1rem)] top-2 h-2 w-2 rounded-full bg-rose-500 ring-1 ring-game-bg-deep" />
            )}
            <span
              className={`text-[10px] transition-all duration-200 ${
                isMoreActive ? "font-semibold text-game-blue" : "text-game-icon-idle"
              }`}
            >
              {t("nav.more")}
            </span>
          </button>
        </div>
      </nav>

      {/* 전체 메뉴 Sheet 팝업 */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="max-h-[75vh] rounded-t-2xl px-4 pb-6 border-t border-game-line bg-game-card text-game-text">
          <SheetHeader className="pb-4 pt-2 border-b border-game-line">
            <SheetTitle className="text-left text-sm font-semibold text-game-text">
              {t("nav.more")}
            </SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-4 gap-2 mt-4 overflow-y-auto max-h-[50vh] scrollbar-none">
            {filteredMoreItems.map((item) => {
              const active = item.url === activeUrl;
              return (
                <Link
                  key={item.url}
                  to={item.url}
                  onClick={() => setMoreOpen(false)}
                  className={`relative flex flex-col items-center gap-1.5 rounded-xl p-3 text-[11px] transition-colors duration-150 ${
                    active
                      ? "bg-[#185fa5]/25 font-bold text-game-blue border border-game-blue/30"
                      : "text-game-text-dim hover:bg-game-line/30 hover:text-game-text"
                  }`}
                >
                  <span className="relative">
                    <item.icon className="h-5 w-5" />
                    {item.url === "/messages" && unreadDm > 0 && (
                      <span className="absolute -right-2 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
                        {unreadDm > 99 ? "99+" : unreadDm}
                      </span>
                    )}
                  </span>
                  <span className="text-center leading-tight">{t(item.labelKey)}</span>
                </Link>
              );
            })}
            {isAdmin &&
              adminMoreItems.map((item) => {
                const active = item.url === activeUrl;
                return (
                  <Link
                    key={item.url}
                    to={item.url}
                    onClick={() => setMoreOpen(false)}
                    className={`flex flex-col items-center gap-1.5 rounded-xl p-3 text-[11px] transition-colors duration-150 ${
                      active
                        ? "bg-[#185fa5]/25 font-bold text-game-blue border border-game-blue/30"
                        : "text-game-text-dim hover:bg-game-line/30 hover:text-game-text"
                    }`}
                  >
                    <item.icon className="h-5 w-5" />
                    <span className="text-center leading-tight">{t(item.labelKey)}</span>
                  </Link>
                );
              })}
          </div>
        </SheetContent>
      </Sheet>
    </>
  );
}
