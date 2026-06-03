import { describe, expect, it } from "vitest";
import { defaultLanguage, getInitialLanguage, isSupportedLanguage, languageStorageKey, saveLanguagePreference } from "./languages";

function createMemoryStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map(Object.entries(initial));

  return {
    get length() {
      return data.size;
    },
    clear() {
      data.clear();
    },
    getItem(key: string) {
      return data.get(key) ?? null;
    },
    key(index: number) {
      return Array.from(data.keys())[index] ?? null;
    },
    removeItem(key: string) {
      data.delete(key);
    },
    setItem(key: string, value: string) {
      data.set(key, value);
    }
  };
}

describe("language preferences", () => {
  it("defaults to Chinese when no language has been saved", () => {
    expect(getInitialLanguage(createMemoryStorage())).toBe(defaultLanguage);
  });

  it("falls back to Chinese when storage contains an unsupported value", () => {
    expect(getInitialLanguage(createMemoryStorage({ [languageStorageKey]: "fr-FR" }))).toBe(defaultLanguage);
  });

  it("reads and writes supported language preferences", () => {
    const storage = createMemoryStorage();

    saveLanguagePreference("ja-JP", storage);

    expect(getInitialLanguage(storage)).toBe("ja-JP");
    expect(isSupportedLanguage("en-US")).toBe(true);
    expect(isSupportedLanguage("fr-FR")).toBe(false);
  });
});
