import { describe, expect, it } from "vitest";
import { SUPPORTED_LANGUAGES } from "./languages";
import { resources } from "./resources";

describe("web-lite i18n resources", () => {
  it("keeps zh-CN, en-US, and ja-JP resource keys in parity", () => {
    const baseKeys = flattenKeys(resources["zh-CN"].translation);

    for (const language of SUPPORTED_LANGUAGES) {
      const keys = flattenKeys(resources[language].translation);
      expect(difference(baseKeys, keys), `${language} is missing keys`).toEqual([]);
      expect(difference(keys, baseKeys), `${language} has extra keys`).toEqual([]);
    }
  });

  it("does not ship empty visible strings", () => {
    for (const language of SUPPORTED_LANGUAGES) {
      const entries = flattenEntries(resources[language].translation);
      const emptyKeys = entries.filter(([, value]) => value.trim().length === 0).map(([key]) => key);
      expect(emptyKeys, `${language} has empty strings`).toEqual([]);
    }
  });
});

function flattenKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object") {
    return [prefix];
  }
  return Object.entries(value).flatMap(([key, child]) => flattenKeys(child, prefix ? `${prefix}.${key}` : key));
}

function flattenEntries(value: unknown, prefix = ""): Array<[string, string]> {
  if (typeof value === "string") {
    return [[prefix, value]];
  }
  if (!value || typeof value !== "object") {
    return [];
  }
  return Object.entries(value).flatMap(([key, child]) => flattenEntries(child, prefix ? `${prefix}.${key}` : key));
}

function difference(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return left.filter((key) => !rightSet.has(key));
}
