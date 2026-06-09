import { Link, useRouterState } from "@tanstack/react-router";
import {
  LayoutDashboard,
  Calendar,
  Library,
  Layers,
  PackageOpen,
  Sparkles,
  Swords,
  Trophy,
  MapPin,
  Users,
  UserPlus,
  User,
  Megaphone,
  ListOrdered,
  Shield,
  Upload,
  ShoppingCart,
  Gamepad,
  MessageCircle,
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useUnreadDmCount } from "@/hooks/use-unread-dm";
import { useI18n, TranslationKey } from "@/i18n/language-context";

interface SidebarItem {
  titleKey: TranslationKey;
  url: string;
  icon: React.ComponentType<any>;
}

const mainItems: SidebarItem[] = [
  { titleKey: "nav.dashboard", url: "/", icon: LayoutDashboard },
  { titleKey: "nav.calendar", url: "/calendar", icon: Calendar },
];

const cardItems: SidebarItem[] = [
  { titleKey: "nav.cards", url: "/cards", icon: Library },
  { titleKey: "nav.decks", url: "/decks", icon: Layers },
  { titleKey: "nav.collection", url: "/collection", icon: PackageOpen },
  { titleKey: "nav.packs", url: "/packs", icon: Sparkles },
];

const playItems: SidebarItem[] = [
  { titleKey: "nav.matches", url: "/matches", icon: Swords },
  { titleKey: "nav.simulator", url: "/simulator", icon: Gamepad },
  { titleKey: "nav.leaderboard", url: "/leaderboard", icon: Trophy },
  { titleKey: "nav.tier", url: "/tier", icon: ListOrdered },
];

const communityItems: SidebarItem[] = [
  { titleKey: "nav.store", url: "/stores", icon: MapPin },
  { titleKey: "nav.lfg", url: "/lfg", icon: Users },
  { titleKey: "nav.messages", url: "/messages", icon: MessageCircle },
  { titleKey: "nav.friends", url: "/friends", icon: UserPlus },
  { titleKey: "nav.announcements", url: "/announcements", icon: Megaphone },
];

const accountItems: SidebarItem[] = [
  { titleKey: "nav.shop", url: "/store", icon: ShoppingCart },
  { titleKey: "nav.profile", url: "/profile", icon: User },
];

const adminItems: SidebarItem[] = [
  { titleKey: "nav.adminConsole", url: "/admin", icon: Shield },
  { titleKey: "nav.adminCardsUpload", url: "/admin/cards", icon: Upload },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const { t } = useI18n();
  const collapsed = state === "collapsed";
  const currentPath = useRouterState({
    select: (router) => router.location.pathname,
  });
  const { isAdmin } = useIsAdmin();
  const { user } = useAuth();
  const unreadDm = useUnreadDmCount();

  const filteredAccountItems = accountItems.filter((item) => {
    if (item.url === "/store" && !user) return false;
    return true;
  });

  // 모든 메뉴 중 currentPath와 가장 길게 일치하는 url을 활성으로 처리
  const allItems = [
    ...mainItems,
    ...cardItems,
    ...playItems,
    ...communityItems,
    ...filteredAccountItems,
    ...(isAdmin ? adminItems : []),
  ];
  const activeUrl = allItems
    .filter((it) =>
      it.url === "/"
        ? currentPath === "/"
        : currentPath === it.url || currentPath.startsWith(it.url + "/"),
    )
    .sort((a, b) => b.url.length - a.url.length)[0]?.url;

  // 그룹 라벨(메인/카드/…) 없이 간격으로만 구분 → 어드민/SaaS 느낌 제거, 개인 앱 톤
  const renderGroup = (_labelKey: TranslationKey, items: SidebarItem[]) => (
    <SidebarGroup className="py-1">
      <SidebarGroupContent>
        <SidebarMenu className="gap-1">
          {items.map((item) => {
            const badge = item.url === "/messages" ? unreadDm : 0;
            return (
              <SidebarMenuItem key={item.url}>
                <SidebarMenuButton
                  asChild
                  isActive={item.url === activeUrl}
                  className="rounded-xl py-5 data-[active=true]:bg-primary data-[active=true]:font-semibold data-[active=true]:text-primary-foreground data-[active=true]:hover:bg-primary data-[active=true]:hover:text-primary-foreground"
                >
                  <Link to={item.url} className="flex items-center gap-2.5">
                    <span className="relative">
                      <item.icon className="h-[18px] w-[18px]" />
                      {badge > 0 && collapsed && (
                        <span className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-rose-500 ring-2 ring-sidebar" />
                      )}
                    </span>
                    {!collapsed && <span className="flex-1">{t(item.titleKey)}</span>}
                    {!collapsed && badge > 0 && (
                      <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-bold text-white">
                        {badge > 99 ? "99+" : badge}
                      </span>
                    )}
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            );
          })}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b">
        <Link to="/" className="flex items-center gap-2 px-2 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-sm font-black text-white shadow-sm">
            D
          </div>
          {!collapsed && (
            <span className="flex items-center gap-1.5 text-sm font-semibold tracking-tight">
              DuelNight
              {isAdmin && (
                <span className="rounded bg-primary px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-primary-foreground">
                  Admin
                </span>
              )}
            </span>
          )}
        </Link>
      </SidebarHeader>
      <SidebarContent>
        {renderGroup("nav.mainGroup", mainItems)}
        {renderGroup("nav.cardsGroup", cardItems)}
        {renderGroup("nav.playGroup", playItems)}
        {renderGroup("nav.communityGroup", communityItems)}
        {renderGroup("nav.accountGroup", filteredAccountItems)}
        {isAdmin && renderGroup("nav.adminGroup", adminItems)}
      </SidebarContent>
    </Sidebar>
  );
}
