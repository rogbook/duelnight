import React from "react";
import { useI18n, Language } from "@/i18n/language-context";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Globe, Check, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

const languages: { code: Language; label: string; flag: string; nativeName: string }[] = [
  { code: "ko", label: "한국어", flag: "🇰🇷", nativeName: "한국어" },
  { code: "en", label: "English", flag: "🇺🇸", nativeName: "English" },
  { code: "ja", label: "日本語", flag: "🇯🇵", nativeName: "日本語" },
];

export function LanguageSelector() {
  const { language, setLanguage } = useI18n();
  const currentLang = languages.find((lang) => lang.code === language) || languages[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-xs font-medium text-foreground transition-all duration-200 hover:border-white/20 hover:bg-white/10 focus:outline-none sm:gap-2 sm:px-3 sm:py-1.5",
            "backdrop-blur-md shadow-[0_4px_30px_rgba(0,0,0,0.1)]"
          )}
          aria-label="Select language"
        >
          <span className="text-sm select-none">{currentLang.flag}</span>
          <span className="uppercase text-[11px] tracking-wider text-muted-foreground group-hover:text-foreground">
            {currentLang.code}
          </span>
          <ChevronDown className="h-3 w-3 text-muted-foreground opacity-60 transition-transform duration-200 data-[state=open]:rotate-180" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-40 border border-white/10 bg-background/95 p-1.5 shadow-2xl backdrop-blur-xl animate-in fade-in-0 zoom-in-95 duration-100"
      >
        <div className="px-2 py-1 text-[10px] font-semibold tracking-wider text-muted-foreground uppercase">
          Language / 언어 / 言語
        </div>
        {languages.map((lang) => {
          const isSelected = lang.code === language;
          return (
            <DropdownMenuItem
              key={lang.code}
              onClick={() => setLanguage(lang.code)}
              className={cn(
                "flex items-center justify-between rounded-md px-2 py-1.5 text-xs transition-colors cursor-pointer select-none",
                isSelected
                  ? "bg-primary/10 text-primary font-medium"
                  : "text-foreground hover:bg-white/5"
              )}
            >
              <div className="flex items-center gap-2">
                <span className="text-sm">{lang.flag}</span>
                <div className="flex flex-col">
                  <span>{lang.nativeName}</span>
                </div>
              </div>
              {isSelected && <Check className="h-3 w-3 text-primary" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
