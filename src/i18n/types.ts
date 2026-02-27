/**
 * Server-side i18n types for command descriptions
 */

export type Locale = "en" | "zh-CN" | "zh-TW" | "pt-BR";

export interface CommandTranslations {
  [key: string]: string;
}

export interface TranslationMap {
  commands: CommandTranslations;
}

export type TranslationLoader = (locale: Locale) => TranslationMap | undefined;
