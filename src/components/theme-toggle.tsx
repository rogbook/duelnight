import { useTheme, type Theme } from "@/hooks/use-theme";
import { useI18n } from "@/i18n/language-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Sun, Moon, Monitor, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const ICON: Record<Theme, typeof Sun> = { light: Sun, dark: Moon, system: Monitor };

function labels(lang: string): Record<Theme, string> {
  if (lang === "en") return { light: "Light", dark: "Dark", system: "System" };
  if (lang === "ja") return { light: "ライト", dark: "ダーク", system: "システム" };
  return { light: "라이트", dark: "다크", system: "시스템" };
}

const ORDER: Theme[] = ["light", "dark", "system"];

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const { language } = useI18n();
  const L = labels(language);
  const CurrentIcon = ICON[theme];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-foreground transition-all duration-200 hover:border-white/20 hover:bg-white/10 focus:outline-none sm:gap-2 sm:px-3 sm:py-1.5",
            "backdrop-blur-md shadow-[0_4px_30px_rgba(0,0,0,0.1)]",
          )}
          aria-label="Toggle theme"
        >
          <CurrentIcon className="h-3.5 w-3.5" />
          <ChevronDown className="h-3 w-3 text-muted-foreground opacity-60 transition-transform duration-200 data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-36 border border-white/10 bg-background/95 p-1.5 shadow-2xl backdrop-blur-xl animate-in fade-in-0 zoom-in-95 duration-100"
      >
        {ORDER.map((mode) => {
          const Icon = ICON[mode];
          const selected = mode === theme;
          return (
            <DropdownMenuItem
              key={mode}
              onClick={() => setTheme(mode)}
              className={cn(
                "flex items-center justify-between rounded-md px-2 py-1.5 text-xs transition-colors cursor-pointer select-none",
                selected
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-foreground hover:bg-white/5",
              )}
            >
              <div className="flex items-center gap-2">
                <Icon className="h-3.5 w-3.5" />
                <span>{L[mode]}</span>
              </div>
              {selected && <Check className="h-3 w-3 text-primary" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
