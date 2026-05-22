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
} from "lucide-react";

import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
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
  { titleKey: "nav.leaderboard", url: "/leaderboard", icon: Trophy },
  { titleKey: "nav.tier", url: "/tier", icon: ListOrdered },
];

const communityItems: SidebarItem[] = [
  { titleKey: "nav.store", url: "/stores", icon: MapPin },
  { titleKey: "nav.lfg", url: "/lfg", icon: Users },
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

  const renderGroup = (labelKey: TranslationKey, items: SidebarItem[]) => (
    <SidebarGroup>
      {!collapsed && <SidebarGroupLabel>{t(labelKey)}</SidebarGroupLabel>}
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.url}>
              <SidebarMenuButton asChild isActive={item.url === activeUrl}>
                <Link to={item.url} className="flex items-center gap-2">
                  <item.icon className="h-4 w-4" />
                  {!collapsed && <span>{t(item.titleKey)}</span>}
                </Link>
              </SidebarMenuButton>
            </SidebarMenuItem>
          ))}
        </SidebarMenu>
      </SidebarGroupContent>
    </SidebarGroup>
  );

  return (
    <Sidebar collapsible="icon">
      <SidebarHeader className="border-b">
        <Link to="/" className="flex items-center gap-2 px-2 py-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-md bg-foreground text-background text-xs font-bold">
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
