export type SupportedLanguage = "zh-CN" | "en-US" | "ja-JP";

export interface LanguageOption {
  code: SupportedLanguage;
  label: string;
}

export const defaultLanguage: SupportedLanguage = "zh-CN";
export const languageStorageKey = "rescue-robot.language.v1";

export const supportedLanguages: LanguageOption[] = [
  { code: "zh-CN", label: "中文" },
  { code: "en-US", label: "English" },
  { code: "ja-JP", label: "日本語" }
];

export function isSupportedLanguage(value: string | null | undefined): value is SupportedLanguage {
  return supportedLanguages.some((language) => language.code === value);
}

function getBrowserStorage(): Storage | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

export function getInitialLanguage(storage: Storage | undefined = getBrowserStorage()): SupportedLanguage {
  const storedLanguage = storage?.getItem(languageStorageKey);
  return isSupportedLanguage(storedLanguage) ? storedLanguage : defaultLanguage;
}

export function saveLanguagePreference(language: SupportedLanguage, storage: Storage | undefined = getBrowserStorage()): void {
  storage?.setItem(languageStorageKey, language);
}
