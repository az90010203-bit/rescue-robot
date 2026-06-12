import { describe, expect, it } from "vitest";
import { buildPiDiscoveryCandidates, discoverPiHosts, normalizeHost, recommendedPiResult } from "./piDiscoveryLite";

describe("web-lite Pi discovery", () => {
  it("deduplicates saved and built-in Pi candidates", () => {
    const candidates = buildPiDiscoveryCandidates("http://rescue-pi.local/");
    expect(candidates.map((candidate) => candidate.host)).toEqual([
      "rescue-pi.local",
      "raspberrypi.local",
      "10.12.194.1",
      "10.43.0.1"
    ]);
  });

  it("normalizes manual host input", () => {
    expect(normalizeHost(" http://192.168.55.220/ ")).toBe("192.168.55.220");
  });

  it("sorts candidates by service probes and recommends the strongest host", async () => {
    const fetcher = async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes("10.12.194.1") && (url.includes(":17353") || url.includes(":17354"))) {
        return new Response("{}", { status: 200 });
      }
      if (url.includes("raspberrypi.local") && url.includes(":17353")) {
        return new Response("{}", { status: 200 });
      }
      return new Response("nope", { status: 404 });
    };
    const results = await discoverPiHosts("", { fetcher: fetcher as typeof fetch, timeoutMs: 10 });
    expect(recommendedPiResult(results)?.candidate.host).toBe("10.12.194.1");
  });
});
