import type { Locale, TranslationMap } from "./types.ts";
import { en } from "./locales/en.ts";
import { zh_CN } from "./locales/zh-CN.ts";

const translations: Record<Locale, TranslationMap> = {
  en,
  "zh-CN": zh_CN,
  "zh-TW": en, // Fallback to en for now
  "pt-BR": en, // Fallback to en for now
};

/**
 * Get the translation map for a specific locale
 */
export function getTranslations(locale: Locale): TranslationMap {
  return translations[locale] || translations.en;
}

/**
 * Get a localized command description
 * @param commandKey - The command key (e.g., "help")
 * @param locale - The target locale (defaults to "en")
 * @returns The localized description
 */
export function getCommandDescription(
  commandKey: string,
  locale: Locale = "en",
): string {
  const translations = getTranslations(locale);
  const key = `${commandKey}.description`;
  return translations.commands[key] || translations.en.commands[key] || commandKey;
}

/**
 * Normalize locale string to supported Locale type
 */
export function normalizeLocale(locale: string | undefined): Locale {
  if (!locale) return "en";
  
  // Handle common variations
  const normalized = locale.toLowerCase().replace("_", "-");
  
  switch (normalized) {
    case "zh":
    case "zh-cn":
    case "zh-hans":
      return "zh-CN";
    case "zh-tw":
    case "zh-hk":
    case "zh-hant":
      return "zh-TW";
    case "pt":
    case "pt-br":
      return "pt-BR";
    case "en":
    case "en-us":
    case "en-gb":
      return "en";
    default:
      return "en";
  }
}

export type { Locale, TranslationMap } from "./types.ts";
