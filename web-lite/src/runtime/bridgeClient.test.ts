import { describe, expect, it } from "vitest";
import { buildCommandEnvelope, sendPiServoBridgeCommand } from "./bridgeClient";
import { DEFAULT_PRIORITY_SETTINGS } from "./priority";
import type { PcCommand } from "@adapters/hardware/protocol";

describe("web-lite bridge command envelope", () => {
  it("wraps existing PC-to-Pi command shape with priority scheduling", () => {
    const command: PcCommand = {
      type: "can_servo.group_move",
      seq: 1,
      targets: [{ id: 1, position: 120 }],
      speed: 800
    };
    expect(buildCommandEnvelope(command, DEFAULT_PRIORITY_SETTINGS, { timeoutMs: 1500 })).toEqual({
      timeoutMs: 1500,
      command: {
        type: "can_servo.group_move",
        seq: 1,
        targets: [{ id: 1, position: 120 }],
        speed: 800,
        priority: 40,
        commandClass: "can-servo",
        policy: "latest"
      }
    });
  });

  it("sends Feetech servo commands through the Pi servo bridge endpoint", async () => {
    const requests: Array<{ url: string; body: unknown }> = [];
    const fetcher = async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({ url: String(input), body: init?.body ? JSON.parse(String(init.body)) : null });
      return new Response(JSON.stringify({ ok: true, messages: [{ type: "ack", seq: 4, command: "servo.ping" }] }), { status: 200 });
    };

    const result = await sendPiServoBridgeCommand(
      "pi.local",
      { type: "servo.ping", seq: 4, id: 22 },
      { fetcher: fetcher as typeof fetch, waitMs: 140 }
    );

    expect(requests).toEqual([{
      url: "http://pi.local:17354/command",
      body: { command: { type: "servo.ping", seq: 4, id: 22 }, waitMs: 140 }
    }]);
    expect(result.messages).toEqual([{ type: "ack", seq: 4, command: "servo.ping" }]);
  });
});
