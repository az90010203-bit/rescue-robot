import { describe, expect, it } from "vitest";

import { applyRendererCsp } from "./csp";

const template =
  "style-src 'self' __DEV_STYLE_SOURCES__; connect-src 'self' __DEV_CONNECT_SOURCES__";

describe("applyRendererCsp", () => {
  it("allows Vite style injection and live reload only while serving", () => {
    const policy = applyRendererCsp(template, "serve");

    expect(policy).toContain("style-src 'self' 'unsafe-inline'");
    expect(policy).toContain("ws://localhost:* http://localhost:*");
  });

  it("keeps the packaged policy strict", () => {
    const policy = applyRendererCsp(template, "build");

    expect(policy).toBe("style-src 'self' ; connect-src 'self' ");
    expect(policy).not.toContain("unsafe-inline");
    expect(policy).not.toContain("localhost");
  });
});
