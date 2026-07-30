import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { RescueBridge } from "../../shared/bridge";
import type { AgentHealth } from "../../shared/contracts";
import { DrivePage } from "./DrivePage";

const piOfflineHealth: AgentHealth = {
  ok: false,
  service: "rescue-v2-control-agent",
  version: "0.1.0",
  armed: false,
  qtHeartbeatFresh: true,
  lastStopReason: null,
  stopCount: 0,
  speedLimits: {
    mecanum: 50,
    tracked: 60
  },
  lastError: "Pi unavailable",
  controller: null,
  pi: null
};

describe("DrivePage", () => {
  beforeEach(() => {
    Object.defineProperty(window, "rescue", {
      configurable: true,
      value: {
        setMotion: vi.fn<RescueBridge["setMotion"]>().mockResolvedValue(),
        clearMotion: vi.fn<RescueBridge["clearMotion"]>().mockResolvedValue(),
        setSpeedLimits: vi.fn<RescueBridge["setSpeedLimits"]>().mockResolvedValue()
      }
    });
  });

  afterEach(() => {
    cleanup();
  });

  it("sends forward intent while held and stops immediately on release", () => {
    render(<DrivePage health={null} />);
    const forward = screen.getByRole("button", { name: "前进 W" });

    fireEvent.pointerDown(forward);
    expect(window.rescue.setMotion).toHaveBeenCalledWith({
      mode: "mecanum",
      forwardMilli: 1000,
      strafeMilli: 0,
      turnMilli: 0,
      speedLimitPercent: 50
    });

    fireEvent.pointerUp(forward);
    expect(window.rescue.clearMotion).toHaveBeenCalled();
  });

  it("combines simultaneous keyboard controls without dropping the first key", () => {
    render(<DrivePage health={null} />);

    fireEvent.keyDown(window, { code: "KeyW" });
    fireEvent.keyDown(window, { code: "KeyD" });

    expect(window.rescue.setMotion).toHaveBeenLastCalledWith({
      mode: "mecanum",
      forwardMilli: 500,
      strafeMilli: 500,
      turnMilli: 0,
      speedLimitPercent: 50
    });
  });

  it("shows the local Agent online when only the Pi is unavailable", () => {
    render(<DrivePage health={piOfflineHealth} />);

    const agentCard = screen.getByText("PC AGENT").closest("article");
    expect(agentCard?.classList.contains("good")).toBe(true);
    expect(agentCard?.textContent).toContain("在线");
  });
});
