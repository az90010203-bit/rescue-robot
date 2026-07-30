import { describe, expect, it, vi } from "vitest";

import { AgentClient } from "./agent-client";

describe("AgentClient", () => {
  it("sends JSON only to the configured loopback Agent", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    const client = new AgentClient("http://127.0.0.1:18400", fetcher);

    await client.request({
      method: "POST",
      path: "/v2/control/stop",
      body: { reason: "test_stop" }
    });

    expect(fetcher).toHaveBeenCalledWith(
      "http://127.0.0.1:18400/v2/control/stop",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ reason: "test_stop" })
      })
    );
  });

  it("reports a rejected Agent operation with its concrete reason", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({ ok: false, error: "control lease is not armed" }),
        { status: 409, headers: { "Content-Type": "application/json" } }
      )
    );
    const client = new AgentClient("http://127.0.0.1:18400", fetcher);

    await expect(
      client.request({ method: "POST", path: "/v2/control/arm", body: {} })
    ).rejects.toThrow("control lease is not armed");
  });

  it("accepts an offline health snapshot without treating it as a rejected command", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(
        JSON.stringify({
          ok: false,
          service: "rescue-v2-control-agent",
          version: "0.1.0",
          armed: false,
          qtHeartbeatFresh: true,
          lastStopReason: "pi_offline",
          stopCount: 3,
          speedLimits: { mecanum: 50, tracked: 60 },
          lastError: "Pi unavailable",
          controller: null,
          pi: null
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      )
    );
    const client = new AgentClient("http://127.0.0.1:18400", fetcher);

    const health = await client.health();

    expect(health.ok).toBe(false);
    expect(health.lastError).toBe("Pi unavailable");
  });

  it("aborts a stalled loopback request instead of blocking future heartbeats", async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>((_input, init) => {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          reject(new DOMException("aborted", "AbortError"));
        });
      });
    });
    const client = new AgentClient(
      "http://127.0.0.1:18400",
      fetcher,
      25
    );

    const health = expect(client.health()).rejects.toThrow(
      "Control Agent request timed out"
    );
    await vi.advanceTimersByTimeAsync(26);

    await health;
    vi.useRealTimers();
  });
});
