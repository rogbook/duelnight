import React, { createContext, useContext, useState, useEffect } from "react";
import { ko } from "./locales/ko";
import { en } from "./locales/en";
import { ja } from "./locales/ja";

export type Language = "ko" | "en" | "ja";

const dictionaries = { ko, en, ja };
const DRAFT_LANG_KEY = "duelnight.i18n.locale";

// 타입 세이프한 중첩 키 자동 추출 유틸리티 타입 (TypeScript 4.1+)
type NestedKeys<T> = {
  [K in keyof T]: T[K] extends object
    ? `${K & string}.${NestedKeys<T[K]> & string}`
    : K & string;
}[keyof T];

export type TranslationKey = NestedKeys<typeof ko>;

interface LanguageContextType {
  language: Language;
  setLanguage: (lang: Language) => void;
  t: (key: TranslationKey, fallback?: string) => string;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

// 중첩 번역 키 안전 해석 함수
function getValueByPath(obj: any, path: string): string | null {
  const parts = path.split(".");
  let current = obj;
  for (const part of parts) {
    if (current == null || typeof current !== "object") {
      return null;
    }
    current = current[part];
  }
  return typeof current === "string" ? current : null;
}

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  // SSR 호환 기본값 설정: 최초엔 "ko"로 잡고, 클라이언트에서 즉시 보정
  const [language, setLanguageState] = useState<Language>("ko");

  useEffect(() => {
    // 1. LocalStorage 체크
    const saved = localStorage.getItem(DRAFT_LANG_KEY) as Language | null;
    if (saved && (saved === "ko" || saved === "en" || saved === "ja")) {
      setLanguageState(saved);
      document.documentElement.lang = saved;
      return;
    }

    // 2. 브라우저 언어 감지
    const browserLang = navigator.language.slice(0, 2).toLowerCase();
    let initialLang: Language = "ko"; // 기본 한글 fallback

    if (browserLang === "ja") {
      initialLang = "ja";
    } else if (browserLang === "en") {
      initialLang = "en";
    }

    setLanguageState(initialLang);
    document.documentElement.lang = initialLang;
  }, []);

  const setLanguage = (lang: Language) => {
    setLanguageState(lang);
    try {
      localStorage.setItem(DRAFT_LANG_KEY, lang);
      document.documentElement.lang = lang;
    } catch (e) {
      /* ignore block */
    }
  };

  const t = (key: TranslationKey, fallback?: string): string => {
    const dict = dictionaries[language] || ko;
    const value = getValueByPath(dict, key);
    if (value !== null) {
      return value;
    }

    // fallback이 없을 경우, 한국어 원본 사전을 예비로 사용
    if (language !== "ko") {
      const koValue = getValueByPath(ko, key);
      if (koValue !== null) {
        return koValue;
      }
    }

    return fallback ?? key;
  };

  return (
    <LanguageContext.Provider value={{ language, setLanguage, t }}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useI18n() {
  const context = useContext(LanguageContext);
  if (context === undefined) {
    throw new Error("useI18n must be used within a LanguageProvider");
  }
  return context;
}
