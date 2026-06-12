export const LITE_LANGUAGE_STORAGE_KEY = "rescue-robot-lite.language.v1";

export const SUPPORTED_LANGUAGES = ["zh-CN", "en-US", "ja-JP"] as const;

export type LiteLanguage = typeof SUPPORTED_LANGUAGES[number];

export const LANGUAGE_LABELS: Record<LiteLanguage, string> = {
  "zh-CN": "中文",
  "en-US": "English",
  "ja-JP": "日本語"
};

export function isLiteLanguage(value: unknown): value is LiteLanguage {
  return typeof value === "string" && SUPPORTED_LANGUAGES.includes(value as LiteLanguage);
}

export function readInitialLanguage(storage: Pick<Storage, "getItem"> | undefined = globalThis.localStorage): LiteLanguage {
  try {
    const stored = storage?.getItem(LITE_LANGUAGE_STORAGE_KEY);
    return isLiteLanguage(stored) ? stored : "zh-CN";
  } catch {
    return "zh-CN";
  }
}
