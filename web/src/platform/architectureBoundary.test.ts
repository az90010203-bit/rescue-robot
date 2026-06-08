import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const srcRoot = join(process.cwd(), "src");
const retiredRoots = ["features", "lib", "components"];
const importPattern = /(?:from\s+["']|import\s+["']|import\(\s*["'])([^"']+)(?:["'])/g;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      return sourceFiles(fullPath);
    }
    return /\.(ts|tsx)$/.test(entry.name) ? [fullPath] : [];
  });
}

describe("architecture boundaries", () => {
  it("keeps retired source roots out of the current tree", () => {
    for (const root of retiredRoots) {
      expect(existsSync(join(srcRoot, root)), `${root} should be migrated into workspaces/domains/adapters`).toBe(false);
    }
  });

  it("does not import through retired deep paths", () => {
    const violations: string[] = [];

    for (const file of sourceFiles(srcRoot)) {
      const text = readFileSync(file, "utf8");
      for (const match of text.matchAll(importPattern)) {
        const specifier = match[1];
        if (/(^|\/)(features|lib|components)\//.test(specifier) || /(^|\\)(features|lib|components)\\/.test(specifier)) {
          violations.push(`${relative(srcRoot, file)} -> ${specifier}`);
        }
      }
    }

    expect(violations).toEqual([]);
  });

  it("keeps the new architectural roots present", () => {
    for (const root of ["workspaces", "domains", "adapters", "platform", "plugins", "shared"]) {
      expect(statSync(join(srcRoot, root)).isDirectory(), `${root} should exist`).toBe(true);
    }
  });
});
