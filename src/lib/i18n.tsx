import { useSyncExternalStore } from "react";

import { en, type Dict } from "./i18n-dicts/en";
import { ru } from "./i18n-dicts/ru";
import { kk } from "./i18n-dicts/kk";
import { de } from "./i18n-dicts/de";
import { fr } from "./i18n-dicts/fr";
import { it } from "./i18n-dicts/it";
import { es } from "./i18n-dicts/es";
import { tr } from "./i18n-dicts/tr";
import { pl } from "./i18n-dicts/pl";
import { pt } from "./i18n-dicts/pt";
import { zhCN } from "./i18n-dicts/zh-CN";
import { ja } from "./i18n-dicts/ja";
import { ko } from "./i18n-dicts/ko";
import { ar } from "./i18n-dicts/ar";
import { hi } from "./i18n-dicts/hi";
import { vi } from "./i18n-dicts/vi";
import { id } from "./i18n-dicts/id";

export type Lang =
  | "en" | "ru" | "kk" | "de" | "fr" | "it" | "es" | "tr"
  | "pl" | "pt" | "zh-CN" | "ja" | "ko" | "ar" | "hi" | "vi" | "id";

const KEY = "sn.language.v1";
const listeners = new Set<() => void>();
let current: Lang = "en";
let hydrated = false;

export const SUPPORTED_LANGS: Lang[] = [
  "en", "ru", "kk", "pt", "es", "fr", "ar", "zh-CN",
  "ko", "ja", "de", "it", "tr", "pl", "hi", "vi", "id",
];

export const LANGUAGES: { value: Lang; label: string; dir: "ltr" }[] = [
  { value: "en", label: "English", dir: "ltr" },
  { value: "ru", label: "Русский", dir: "ltr" },
  { value: "kk", label: "Қазақ тілі", dir: "ltr" },
  { value: "pt", label: "Português", dir: "ltr" },
  { value: "es", label: "Español", dir: "ltr" },
  { value: "fr", label: "Français", dir: "ltr" },
  { value: "ar", label: "العربية", dir: "ltr" },
  { value: "zh-CN", label: "中文", dir: "ltr" },
  { value: "ko", label: "한국어", dir: "ltr" },
  { value: "ja", label: "日本語", dir: "ltr" },
  { value: "de", label: "Deutsch", dir: "ltr" },
  { value: "it", label: "Italiano", dir: "ltr" },
  { value: "tr", label: "Türkçe", dir: "ltr" },
  { value: "pl", label: "Polski", dir: "ltr" },
  { value: "hi", label: "हिन्दी", dir: "ltr" },
  { value: "vi", label: "Tiếng Việt", dir: "ltr" },
  { value: "id", label: "Bahasa Indonesia", dir: "ltr" },
];

/**
 * The UI is never mirrored: Arabic is translated but the layout stays LTR,
 * identical in structure to the English version.
 */
export function dirOf(_lang: Lang): "ltr" {
  return "ltr";
}

/** Maps any BCP-47 tag (or a legacy stored value) onto a supported Lang. */
export function normalizeLang(raw: string | null | undefined): Lang | null {
  if (!raw) return null;
  const tag = raw.replace("_", "-");
  const exact = SUPPORTED_LANGS.find((l) => l.toLowerCase() === tag.toLowerCase());
  if (exact) return exact;
  const base = tag.toLowerCase().split("-")[0];
  if (base === "zh") return "zh-CN";
  const byBase = SUPPORTED_LANGS.find((l) => l.toLowerCase() === base);
  return byBase ?? null;
}

function detect(): Lang {
  try {
    const langs = [...(navigator.languages ?? []), navigator.language].filter(
      Boolean,
    ) as string[];
    for (const raw of langs) {
      const match = normalizeLang(raw);
      if (match) return match;
    }
  } catch {}
  return "en";
}

function applyDocumentLang(l: Lang) {
  try {
    document.documentElement.lang = l;
    document.documentElement.dir = dirOf(l);
  } catch {}
}

function hydrate() {
  if (hydrated || typeof window === "undefined") return;
  hydrated = true;
  try {
    const saved = normalizeLang(localStorage.getItem(KEY));
    current = saved ?? detect();
    localStorage.setItem(KEY, current);
    applyDocumentLang(current);
  } catch {}
}

export function setLang(l: Lang) {
  current = l;
  try {
    localStorage.setItem(KEY, l);
  } catch {}
  applyDocumentLang(l);
  listeners.forEach((f) => f());
}

export function useLang(): Lang {
  return useSyncExternalStore(
    (cb) => {
      hydrate();
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => {
      hydrate();
      return current;
    },
    () => "en" as Lang,
  );
}

const DICTS: Record<Lang, Dict> = {
  en, ru, kk, de, fr, it, es, tr, pl, pt, "zh-CN": zhCN, ja, ko, ar, hi, vi, id,
};

export type TKey = keyof Dict;

export function t(lang: Lang, key: TKey): string {
  const dict = DICTS[lang] ?? en;
  return dict[key] ?? en[key] ?? String(key);
}

export function useT() {
  const lang = useLang();
  return (key: TKey) => t(lang, key);
}