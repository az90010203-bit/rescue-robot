import { describe, expect, it, vi } from "vitest";

import {
  ControlRuntime,
  type AgentRequest,
  type AgentTransport
} from "./control-runtime";

class DeferredTransport implements AgentTransport {
  public readonly requests: AgentRequest[] = [];
  private resolvePending: (() => void) | null = null;

  public request(request: AgentRequest): Promise<void> {
    this.requests.push(request);
    return new Promise<void>((resolve) => {
      this.resolvePending = resolve;
    });
  }

  public resolve(): void {
    this.resolvePending?.();
    this.resolvePending = null;
  }
}

describe("ControlRuntime", () => {
  it("coalesces heartbeat requests while one is pending", async () => {
    const transport = new DeferredTransport();
    const runtime = new ControlRuntime(transport);

    const first = runtime.heartbeatTick();
    const second = runtime.heartbeatTick();

    expect(transport.requests).toEqual([
      { method: "POST", path: "/v2/ui/heartbeat", body: {} }
    ]);
    transport.resolve();
    await Promise.all([first, second]);
    const third = runtime.heartbeatTick();
    expect(transport.requests).toHaveLength(2);
    transport.resolve();
    await third;
  });

  it("sends current mecanum intent on the motion tick", async () => {
    const request = vi.fn<AgentTransport["request"]>().mockResolvedValue();
    const runtime = new ControlRuntime({ request });
    runtime.setMotion({
      mode: "mecanum",
      forwardMilli: 1000,
      strafeMilli: 0,
      turnMilli: -250,
      speedLimitPercent: 50
    });

    await runtime.motionTick();

    expect(request).toHaveBeenCalledWith({
      method: "POST",
      path: "/v2/control/drive",
      body: {
        forwardMilli: 1000,
        strafeMilli: 0,
        turnMilli: -250,
        speedLimitPercent: 50,
        deadman: true
      }
    });
  });

  it("coalesces motion ticks while the prior request is pending", async () => {
    const transport = new DeferredTransport();
    const runtime = new ControlRuntime(transport);
    runtime.setMotion({
      mode: "tracked",
      leftMilli: 1000,
      rightMilli: 1000,
      speedLimitPercent: 60
    });

    const first = runtime.motionTick();
    const second = runtime.motionTick();

    expect(transport.requests).toHaveLength(1);
    transport.resolve();
    await Promise.all([first, second]);

    const third = runtime.motionTick();
    expect(transport.requests).toHaveLength(2);
    transport.resolve();
    await third;
  });

  it("does not send motion while intent is neutral", async () => {
    const request = vi.fn<AgentTransport["request"]>().mockResolvedValue();
    const runtime = new ControlRuntime({ request });

    await runtime.motionTick();
    runtime.setMotion({
      mode: "tracked",
      leftMilli: 0,
      rightMilli: 0,
      speedLimitPercent: 60
    });
    await runtime.motionTick();
    runtime.setMotion({
      mode: "mecanum",
      forwardMilli: 0,
      strafeMilli: 0,
      turnMilli: 0,
      speedLimitPercent: 50
    });
    await runtime.motionTick();

    expect(request).not.toHaveBeenCalled();
  });

  it("clears motion and sends a high-priority stop when deactivated", async () => {
    const request = vi.fn<AgentTransport["request"]>().mockResolvedValue();
    const runtime = new ControlRuntime({ request });
    runtime.setMotion({
      mode: "tracked",
      leftMilli: 1000,
      rightMilli: 1000,
      speedLimitPercent: 60
    });

    await runtime.deactivate("electron_window_blurred");
    await runtime.motionTick();

    expect(request).toHaveBeenCalledTimes(1);
    expect(request).toHaveBeenCalledWith({
      method: "POST",
      path: "/v2/control/stop",
      body: { reason: "electron_window_blurred" }
    });
  });
});
