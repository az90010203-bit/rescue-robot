import { describe, expect, it, vi } from "vitest";

import type { AgentRequest, AgentTransport } from "../core/control-runtime";
import { OperatorService } from "./operator-service";

describe("OperatorService", () => {
  it("validates renderer motion before updating the runtime", () => {
    const transport: AgentTransport = {
      request: vi.fn<AgentTransport["request"]>().mockResolvedValue()
    };
    const service = new OperatorService(transport);

    expect(() =>
      service.setMotion({
        mode: "mecanum",
        forwardMilli: 4000,
        strafeMilli: 0,
        turnMilli: 0,
        speedLimitPercent: 50
      })
    ).toThrow();
  });

  it("maps a validated capability to its fixed Agent route", async () => {
    const requests: AgentRequest[] = [];
    const transport: AgentTransport = {
      request: async (request) => {
        requests.push(request);
      }
    };
    const service = new OperatorService(transport);

    await service.invokeCapability({
      name: "can",
      body: {
        action: "jog",
        group: "front_left",
        direction: 1,
        stepDeg: 4,
        speedRaw: 0
      }
    });

    expect(requests).toEqual([
      {
        method: "POST",
        path: "/v2/capability/can",
        body: {
          action: "jog",
          group: "front_left",
          direction: 1,
          stepDeg: 4,
          speedRaw: 0
        }
      }
    ]);
  });

  it("sends speed limits through the dedicated endpoint", async () => {
    const request = vi.fn<AgentTransport["request"]>().mockResolvedValue();
    const service = new OperatorService({ request });

    await service.setSpeedLimits({ mecanumPercent: 50, trackedPercent: 60 });

    expect(request).toHaveBeenCalledWith({
      method: "POST",
      path: "/v2/control/speed-limits",
      body: { mecanumPercent: 50, trackedPercent: 60 }
    });
  });
});
