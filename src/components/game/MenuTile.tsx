import { Link } from "@tanstack/react-router";
import { LucideIcon, ArrowUpRight } from "lucide-react";

export type ChipColor = "purple" | "teal" | "coral" | "pink";

const colorStyles: Record<ChipColor, { bg: string; fg: string }> = {
  purple: { bg: "bg-[#26215c]", fg: "text-[#afa9ec]" },
  teal: { bg: "bg-[#04342c]", fg: "text-[#5dcaa5]" },
  coral: { bg: "bg-[#4a1b0c]", fg: "text-[#f0997b]" },
  pink: { bg: "bg-[#4b1528]", fg: "text-[#ed93b1]" },
};

interface MenuTileProps {
  title: string;
  desc?: string; // 백업용 보조 설명
  liveValue?: string | number | null; // 살아있는 숫자
  to: string;
  icon: LucideIcon;
  colorKey: ChipColor;
}

export function MenuTile({ title, desc, liveValue, to, icon: Icon, colorKey }: MenuTileProps) {
  const color = colorStyles[colorKey];

  return (
    <Link
      to={to}
      className="group flex items-center gap-3 bg-game-card border border-game-line rounded-2xl p-3.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-game-line-accent hover:shadow-md"
    >
      {/* 아이콘 칩 (36~40px, 지정된 배경/전경색 적용) */}
      <div
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition-transform duration-200 group-hover:scale-105 ${color.bg} ${color.fg}`}
      >
        <Icon className="h-5 w-5" />
      </div>

      <div className="min-w-0 flex-1">
        <span className="text-[12px] font-semibold text-game-text-mid block leading-none">
          {title}
        </span>
        <span className="text-[11px] text-game-text-dim truncate block mt-1 leading-none font-medium">
          {liveValue !== undefined && liveValue !== null && liveValue !== ""
            ? liveValue
            : desc || ""}
        </span>
      </div>

      <ArrowUpRight className="h-4 w-4 shrink-0 text-game-icon-idle opacity-0 transition-opacity duration-200 group-hover:opacity-100" />
    </Link>
  );
}
