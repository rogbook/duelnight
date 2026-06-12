import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Home,
  Trophy,
  Library,
  Layers,
  MoreHorizontal,
  Calendar,
  PackageOpen,
  Sparkles,
  ListOrdered,
  MapPin,
  Users,
  UserPlus,
  Megaphone,
  ShoppingCart,
  User,
  Shield,
  Upload,
  MessageCircle,
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

const primaryTabs: NavItem[] = [
  { labelKey: "nav.dashboard", url: "/", icon: Home },
  { labelKey: "nav.matches", url: "/matches", icon: Trophy },
  { labelKey: "nav.cards", url: "/cards", icon: Library },
  { labelKey: "nav.decks", url: "/decks", icon: Layers },
];

const moreItems: NavItem[] = [
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
  { labelKey: "nav.profile", url: "/profile", icon: User },
];

const adminMoreItems: NavItem[] = [
  { labelKey: "nav.adminConsole", url: "/admin", icon: Shield },
  { labelKey: "nav.adminCardsUpload", url: "/admin/cards", icon: Upload },
];

function useActiveUrl(items: NavItem[]) {
  const currentPath = useRouterState({
    select: (s) => s.location.pathname,
  });
  return items
    .filter((it) =>
      it.url === "/"
        ? currentPath === "/"
        : currentPath === it.url || currentPath.startsWith(it.url + "/"),
    )
    .sort((a, b) => b.url.length - a.url.length)[0]?.url;
}

export function BottomTabBar() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const [moreOpen, setMoreOpen] = useState(false);
  const unreadDm = useUnreadDmCount();

  const filteredMoreItems = moreItems.filter((item) => !(item.url === "/store" && !user));
  const allItems = [...primaryTabs, ...filteredMoreItems, ...(isAdmin ? adminMoreItems : [])];
  const activeUrl = useActiveUrl(allItems);
  const isMoreActive = [...filteredMoreItems, ...(isAdmin ? adminMoreItems : [])].some(
    (it) => it.url === activeUrl,
  );

  return (
    <>
      <nav
        className="fixed bottom-0 left-0 right-0 z-40 border-t border-border bg-background/95 backdrop-blur-sm"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <div className="flex h-14 items-stretch">
          {primaryTabs.map((tab) => {
            const active = tab.url === activeUrl;
            return (
              <Link
                key={tab.url}
                to={tab.url}
                className="flex flex-1 flex-col items-center justify-center gap-0.5"
              >
                <tab.icon
                  className={`h-5 w-5 transition-all duration-200 ease-out ${
                    active ? "scale-105 text-primary" : "scale-100 text-muted-foreground hover:text-foreground"
                  }`}
                />
                <span
                  className={`text-[10px] transition-all duration-200 ease-out ${
                    active ? "font-semibold text-primary" : "text-muted-foreground"
                  }`}
                >
                  {t(tab.labelKey)}
                </span>
              </Link>
            );
          })}
          <button
            onClick={() => setMoreOpen(true)}
            className="relative flex flex-1 flex-col items-center justify-center gap-0.5"
          >
            <MoreHorizontal
              className={`h-5 w-5 transition-all duration-200 ease-out ${
                isMoreActive ? "scale-105 text-primary" : "scale-100 text-muted-foreground hover:text-foreground"
              }`}
            />
            {unreadDm > 0 && (
              <span className="absolute right-[calc(50%-1rem)] top-1.5 h-2 w-2 rounded-full bg-primary" />
            )}
            <span
              className={`text-[10px] transition-all duration-200 ease-out ${
                isMoreActive ? "font-semibold text-primary" : "text-muted-foreground"
              }`}
            >
              {t("nav.more")}
            </span>
          </button>
        </div>
      </nav>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="max-h-[75vh] rounded-t-2xl px-4 pb-6">
          <SheetHeader className="pb-4 pt-2">
            <SheetTitle className="text-left text-sm font-semibold">{t("nav.more")}</SheetTitle>
          </SheetHeader>
          <div className="grid grid-cols-4 gap-2">
            {filteredMoreItems.map((item) => {
              const active = item.url === activeUrl;
              return (
                <Link
                  key={item.url}
                  to={item.url}
                  onClick={() => setMoreOpen(false)}
                  className={`relative flex flex-col items-center gap-1.5 rounded-xl p-3 text-[11px] transition-colors ${
                    active
                      ? "bg-accent font-medium text-foreground"
                      : "text-muted-foreground hover:bg-accent/50"
                  }`}
                >
                  <span className="relative">
                    <item.icon className="h-5 w-5" />
                    {item.url === "/messages" && unreadDm > 0 && (
                      <span className="absolute -right-1.5 -top-1.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
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
                    className={`flex flex-col items-center gap-1.5 rounded-xl p-3 text-[11px] transition-colors ${
                      active
                        ? "bg-accent font-medium text-foreground"
                        : "text-muted-foreground hover:bg-accent/50"
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
