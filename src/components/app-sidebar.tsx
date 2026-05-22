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

const mainItems = [
  { title: "대시보드", url: "/", icon: LayoutDashboard },
  { title: "캘린더", url: "/calendar", icon: Calendar },
];

const cardItems = [
  { title: "카드 DB", url: "/cards", icon: Library },
  { title: "덱 빌더", url: "/decks", icon: Layers },
  { title: "내 컬렉션", url: "/collection", icon: PackageOpen },
  { title: "팩 시뮬레이터", url: "/packs", icon: Sparkles },
];

const playItems = [
  { title: "전적 기록", url: "/matches", icon: Swords },
  { title: "리더보드", url: "/leaderboard", icon: Trophy },
  { title: "티어 메이킹", url: "/tier", icon: ListOrdered },
];

const communityItems = [
  { title: "매장 찾기", url: "/stores", icon: MapPin },
  { title: "오프라인 매칭", url: "/lfg", icon: Users },
  { title: "친구", url: "/friends", icon: UserPlus },
  { title: "공지사항", url: "/announcements", icon: Megaphone },
];

const accountItems = [
  { title: "상점", url: "/store", icon: ShoppingCart },
  { title: "프로필", url: "/profile", icon: User },
];

const adminItems = [
  { title: "관리자 콘솔", url: "/admin", icon: Shield },
  { title: "카드 등록", url: "/admin/cards", icon: Upload },
];

export function AppSidebar() {
  const { state } = useSidebar();
  const collapsed = state === "collapsed";
  const currentPath = useRouterState({
    select: (router) => router.location.pathname,
  });
  const { isAdmin } = useIsAdmin();
  const { user } = useAuth();

  const filteredAccountItems = accountItems.filter(item => {
    if (item.url === "/store" && !user) return false;
    return true;
  });

  // 모든 메뉴 중 currentPath와 가장 길게 일치하는 url을 활성으로 처리
  const allItems = [
    ...mainItems, ...cardItems, ...playItems, ...communityItems,
    ...filteredAccountItems, ...(isAdmin ? adminItems : []),
  ];
  const activeUrl = allItems
    .filter((it) =>
      it.url === "/"
        ? currentPath === "/"
        : currentPath === it.url || currentPath.startsWith(it.url + "/"),
    )
    .sort((a, b) => b.url.length - a.url.length)[0]?.url;

  const renderGroup = (
    label: string,
    items: typeof mainItems,
  ) => (
    <SidebarGroup>
      {!collapsed && <SidebarGroupLabel>{label}</SidebarGroupLabel>}
      <SidebarGroupContent>
        <SidebarMenu>
          {items.map((item) => (
            <SidebarMenuItem key={item.url}>
              <SidebarMenuButton asChild isActive={item.url === activeUrl}>
                <Link to={item.url} className="flex items-center gap-2">
                  <item.icon className="h-4 w-4" />
                  {!collapsed && <span>{item.title}</span>}
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
            T
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
        {renderGroup("메인", mainItems)}
        {renderGroup("카드", cardItems)}
        {renderGroup("플레이", playItems)}
        {renderGroup("커뮤니티", communityItems)}
        {renderGroup("계정", filteredAccountItems)}
        {isAdmin && renderGroup("관리", adminItems)}
      </SidebarContent>
    </Sidebar>
  );
}
