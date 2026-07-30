import path from "node:path";
import { describe, expect, it } from "vitest";

import { resolveRendererAsset } from "./renderer-protocol";

describe("resolveRendererAsset", () => {
  const rendererRoot = path.resolve("C:\\rescue-app\\renderer");

  it("maps the fixed app origin into the renderer directory", () => {
    expect(
      resolveRendererAsset(rendererRoot, "rescue://app/assets/index.js")
    ).toBe(path.join(rendererRoot, "assets", "index.js"));
  });

  it("rejects other hosts and encoded traversal", () => {
    expect(
      resolveRendererAsset(rendererRoot, "rescue://other/index.html")
    ).toBeNull();
    expect(
      resolveRendererAsset(
        rendererRoot,
        "rescue://app/%2e%2e%5cprivate.txt"
      )
    ).toBeNull();
  });
});
