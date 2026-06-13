import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  ChevronLeft,
  ChevronRight,
  Home,
  Calendar,
  Library,
  Layers,
  PackageOpen,
  Sparkles,
  Swords,
  Gamepad,
  Trophy,
  ListOrdered,
  MapPin,
  Users,
  MessageCircle,
  UserPlus,
  Megaphone,
  ShoppingCart,
  User,
  Shield,
  Upload,
} from "lucide-react";
import { useI18n, TranslationKey } from "@/i18n/language-context";
import { useAuth } from "@/hooks/use-auth";
import { useIsAdmin } from "@/hooks/use-is-admin";
import { useUnreadDmCount } from "@/hooks/use-unread-dm";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

interface RailItem {
  titleKey: TranslationKey;
  url: string;
  icon: React.ComponentType<{ className?: string }>;
  descKey?: string;
}

const mainItems: RailItem[] = [
  { titleKey: "nav.dashboard", url: "/", icon: Home, descKey: "dashboard.desc" },
  {
    titleKey: "nav.calendar",
    url: "/calendar",
    icon: Calendar,
    descKey: "dashboard.shortcutCalendarDesc",
  },
];

const cardItems: RailItem[] = [
  { titleKey: "nav.cards", url: "/cards", icon: Library, descKey: "dashboard.shortcutCardsDesc" },
  { titleKey: "nav.decks", url: "/decks", icon: Layers, descKey: "dashboard.shortcutDecksDesc" },
  {
    titleKey: "nav.collection",
    url: "/collection",
    icon: PackageOpen,
    descKey: "dashboard.shortcutCollectionDesc",
  },
  { titleKey: "nav.packs", url: "/packs", icon: Sparkles },
];

const playItems: RailItem[] = [
  {
    titleKey: "nav.matches",
    url: "/matches",
    icon: Swords,
    descKey: "dashboard.shortcutMatchesDesc",
  },
  { titleKey: "nav.simulator", url: "/simulator", icon: Gamepad },
  {
    titleKey: "nav.leaderboard",
    url: "/leaderboard",
    icon: Trophy,
    descKey: "dashboard.shortcutLeaderboardDesc",
  },
  { titleKey: "nav.tier", url: "/tier", icon: ListOrdered },
];

const communityItems: RailItem[] = [
  { titleKey: "nav.store", url: "/stores", icon: MapPin, descKey: "dashboard.shortcutStoreDesc" },
  { titleKey: "nav.lfg", url: "/lfg", icon: Users, descKey: "dashboard.shortcutLfgDesc" },
  { titleKey: "nav.messages", url: "/messages", icon: MessageCircle },
  { titleKey: "nav.friends", url: "/friends", icon: UserPlus },
  { titleKey: "nav.announcements", url: "/announcements", icon: Megaphone },
];

const accountItems: RailItem[] = [
  { titleKey: "nav.shop", url: "/store", icon: ShoppingCart },
  { titleKey: "nav.profile", url: "/profile", icon: User },
];

const adminItems: RailItem[] = [
  { titleKey: "nav.adminConsole", url: "/admin", icon: Shield },
  { titleKey: "nav.adminCardsUpload", url: "/admin/cards", icon: Upload },
];

export function IconRail() {
  const { t } = useI18n();
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const unreadDm = useUnreadDmCount();

  const [expanded, setExpanded] = useState<boolean>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("duelnight.iconrail.expanded");
      return saved !== null ? saved === "true" : true;
    }
    return true;
  });

  const toggleExpand = () => {
    setExpanded((prev) => {
      const next = !prev;
      localStorage.setItem("duelnight.iconrail.expanded", String(next));
      return next;
    });
  };

  const currentPath = useRouterState({
    select: (s) => s.location.pathname,
  });

  const filteredAccountItems = accountItems.filter((item) => !(item.url === "/store" && !user));

  const allGroups = [
    { label: "main", items: mainItems },
    { label: "cards", items: cardItems },
    { label: "play", items: playItems },
    { label: "community", items: communityItems },
    { label: "account", items: filteredAccountItems },
    ...(isAdmin ? [{ label: "admin", items: adminItems }] : []),
  ];

  // 모든 메뉴 중 currentPath와 가장 길게 일치하는 url을 활성으로 처리
  const flatItems = allGroups.flatMap((g) => g.items);
  const activeUrl = flatItems
    .filter((it) =>
      it.url === "/"
        ? currentPath === "/"
        : currentPath === it.url || currentPath.startsWith(it.url + "/"),
    )
    .sort((a, b) => b.url.length - a.url.length)[0]?.url;

  const renderItem = (item: RailItem) => {
    const active = item.url === activeUrl;
    const badge = item.url === "/messages" ? unreadDm : 0;

    const content = (
      <Link
        to={item.url}
        className={`flex items-center gap-3 rounded-xl px-2.5 py-2 transition-all duration-200 relative ${
          active
            ? "bg-[#185fa5]/25 font-bold text-game-blue border border-game-blue/20"
            : "text-game-text-dim hover:bg-game-line/30 hover:text-game-text"
        }`}
      >
        <span className="relative flex items-center justify-center">
          <item.icon
            className={`h-[18px] w-[18px] transition-all duration-200 ${active ? "scale-105" : ""}`}
          />
          {badge > 0 && !expanded && (
            <span className="absolute -right-1.5 -top-1.5 h-2 w-2 rounded-full bg-rose-500 ring-1 ring-game-bg-deep" />
          )}
        </span>
        {expanded && <span className="flex-1 truncate text-xs">{t(item.titleKey)}</span>}
        {expanded && badge > 0 && (
          <span className="ml-auto inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-rose-500 px-1 text-[9px] font-bold text-white">
            {badge > 99 ? "99+" : badge}
          </span>
        )}
      </Link>
    );

    if (expanded) {
      return <div key={item.url}>{content}</div>;
    }

    // 축소 상태일 때는 툴팁 표시
    const tooltipText = t(item.titleKey);
    const descText = item.descKey ? t(item.descKey as TranslationKey) : "";

    return (
      <Tooltip key={item.url} delayDuration={150}>
        <TooltipTrigger asChild>
          <div>{content}</div>
        </TooltipTrigger>
        <TooltipContent
          side="right"
          className="bg-game-card border border-game-line text-game-text p-2"
        >
          <div className="font-semibold text-xs">{tooltipText}</div>
          {descText && (
            <div className="text-[10px] text-game-text-dim mt-0.5 max-w-[150px]">{descText}</div>
          )}
        </TooltipContent>
      </Tooltip>
    );
  };

  return (
    <TooltipProvider>
      <aside
        className={`hidden lg:flex flex-col h-screen bg-game-bg-deep border-r border-game-line shrink-0 transition-all duration-300 ease-in-out relative ${
          expanded ? "w-[160px]" : "w-[54px]"
        }`}
      >
        {/* 상단 로고 */}
        <div className="flex h-12 items-center px-3 border-b border-game-line flex-shrink-0">
          <Link to="/" className="flex items-center gap-2">
            <img
              src="/favicon.png"
              alt="DuelNight"
              className="h-6 w-6 rounded-lg border border-game-line-accent"
            />
            {expanded && (
              <span className="text-xs font-bold tracking-wider text-game-text uppercase">
                DuelNight
              </span>
            )}
          </Link>
        </div>

        {/* 세로 스크롤 메뉴 영역 */}
        <div className="flex-1 overflow-y-auto scrollbar-none py-2 px-1.5 space-y-3">
          {allGroups.map((group) => (
            <div key={group.label} className="space-y-0.5">
              {group.items.map(renderItem)}
              {/* 구분 실선 (축소 상태일 때도 칩으로 표시) */}
              <div className="h-[1px] bg-game-line/60 mx-1 my-1" />
            </div>
          ))}
        </div>

        {/* 하단 펼침 토글 버튼 */}
        <div className="p-2 border-t border-game-line flex-shrink-0">
          <button
            onClick={toggleExpand}
            className="flex items-center justify-center w-full py-1.5 rounded-lg text-game-icon-idle hover:text-game-text hover:bg-game-line/30 transition-colors duration-150 active:scale-95"
            aria-label={expanded ? "Collapse Sidebar" : "Expand Sidebar"}
          >
            {expanded ? <ChevronLeft className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
          </button>
        </div>
      </aside>
    </TooltipProvider>
  );
}
