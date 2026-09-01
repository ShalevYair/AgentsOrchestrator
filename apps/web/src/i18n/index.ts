import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import he from "./locales/he.json";
import en from "./locales/en.json";

export const SUPPORTED_LOCALES = ["he", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

const STORAGE_KEY = "ao.locale";
const DEFAULT_LOCALE: Locale = "he";

function isLocale(value: string | null): value is Locale {
  return value !== null && (SUPPORTED_LOCALES as readonly string[]).includes(value);
}

/** localStorage can throw (private browsing, blocked site data) — never let a settings read/write crash the app. */
function readStoredLocale(): Locale | undefined {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    return isLocale(stored) ? stored : undefined;
  } catch {
    return undefined;
  }
}

function writeStoredLocale(locale: Locale): void {
  try {
    localStorage.setItem(STORAGE_KEY, locale);
  } catch {
    // Best-effort persistence only.
  }
}

void i18n.use(initReactI18next).init({
  resources: { he: { translation: he }, en: { translation: en } },
  lng: readStoredLocale() ?? DEFAULT_LOCALE,
  fallbackLng: DEFAULT_LOCALE,
  interpolation: { escapeValue: false },
});

export function setLocale(locale: Locale): void {
  writeStoredLocale(locale);
  void i18n.changeLanguage(locale);
}

export function isRtl(locale: string): boolean {
  return locale === "he";
}

export default i18n;
