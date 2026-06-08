import { describe, expect, it, vi } from "vitest";
import { buildPiDiscoveryCandidates, discoverRaspberryPi, recommendedPiDiscoveryResult } from "@adapters/pi/piDiscovery";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("Raspberry Pi discovery", () => {
  it("builds direct USB and mDNS candidates without duplicates", () => {
    expect(buildPiDiscoveryCandidates("rescue-pi.local").map((candidate) => candidate.host)).toEqual([
      "rescue-pi.local",
      "raspberrypi.local",
      "10.12.194.1",
      "10.43.0.1"
    ]);
    expect(buildPiDiscoveryCandidates("192.168.55.220").map((candidate) => candidate.host)).toEqual([
      "192.168.55.220",
      "rescue-pi.local",
      "raspberrypi.local",
      "10.12.194.1",
      "10.43.0.1"
    ]);
  });

  it("recommends the USB fallback when SSH succeeds there", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      const requestUrl = String(url);
      if (requestUrl === "http://127.0.0.1:17352/health") {
        return jsonResponse({ ok: true, maxUploadBytes: 10, defaultCommandTimeoutMs: 30_000, maxCommandTimeoutMs: 300_000 });
      }
      if (requestUrl === "http://127.0.0.1:17352/connect-test") {
        const body = JSON.parse(String(init?.body ?? "{}"));
        if (body.host === "10.12.194.1") {
          return jsonResponse({ ok: true, durationMs: 18 });
        }
        return jsonResponse({ error: "offline" }, 500);
      }
      if (requestUrl === "http://10.12.194.1:17354/health") {
        return jsonResponse({ ok: true });
      }
      throw new Error("offline");
    });

    const results = await discoverRaspberryPi(
      { savedHost: "192.168.55.220", port: 22, username: "robot1", password: "secret" },
      { fetcher: fetcher as unknown as typeof fetch }
    );

    expect(recommendedPiDiscoveryResult(results)?.candidate.host).toBe("10.12.194.1");
    expect(results[0]).toMatchObject({
      candidate: { host: "10.12.194.1" },
      status: "online",
      ssh: { status: "online" }
    });
  });

  it("can still surface bridge-only candidates when SSH auth is missing", async () => {
    const fetcher = vi.fn(async (url: string | URL | Request) => {
      const requestUrl = String(url);
      if (requestUrl === "http://127.0.0.1:17352/health") {
        return jsonResponse({ ok: true, maxUploadBytes: 10, defaultCommandTimeoutMs: 30_000, maxCommandTimeoutMs: 300_000 });
      }
      if (requestUrl === "http://rescue-pi.local:17353/health") {
        return jsonResponse({ ok: true });
      }
      throw new Error("offline");
    });

    const results = await discoverRaspberryPi(
      { savedHost: "", port: 22, username: "robot1" },
      { fetcher: fetcher as unknown as typeof fetch }
    );

    const recommended = recommendedPiDiscoveryResult(results);
    expect(recommended?.candidate.host).toBe("rescue-pi.local");
    expect(recommended).toMatchObject({
      status: "partial",
      ssh: { status: "skipped" }
    });
  });
});
