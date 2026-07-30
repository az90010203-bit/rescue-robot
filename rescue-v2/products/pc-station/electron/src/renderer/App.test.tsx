import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import type { RescueBridge } from "../shared/bridge";
import type { AgentHealth } from "../shared/contracts";

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

const bridge: RescueBridge = {
  getHealth: vi.fn<RescueBridge["getHealth"]>().mockResolvedValue(null),
  onHealth: vi.fn<RescueBridge["onHealth"]>().mockReturnValue(() => undefined),
  onOperation: vi.fn<RescueBridge["onOperation"]>().mockReturnValue(() => undefined),
  setMotion: vi.fn<RescueBridge["setMotion"]>().mockResolvedValue(),
  clearMotion: vi.fn<RescueBridge["clearMotion"]>().mockResolvedValue(),
  setSpeedLimits: vi.fn<RescueBridge["setSpeedLimits"]>().mockResolvedValue(),
  arm: vi.fn<RescueBridge["arm"]>().mockResolvedValue(),
  stop: vi.fn<RescueBridge["stop"]>().mockResolvedValue(),
  invokeCapability: vi.fn<RescueBridge["invokeCapability"]>().mockResolvedValue(),
  restartSoftware: vi.fn<RescueBridge["restartSoftware"]>().mockResolvedValue(),
  camera: {
    healthUrl: "http://192.168.55.131:8080/health",
    videoWebSocketUrl: "ws://192.168.55.131:8080/video-ws",
    audioOfferUrl: "http://192.168.55.131:8080/audio-offer",
    codec: 'video/mp4; codecs="avc1.640028"'
  }
};

let healthListener: ((health: AgentHealth | null) => void) | undefined;

describe("App", () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    Object.defineProperty(window, "rescue", {
      configurable: true,
      value: bridge
    });
    vi.clearAllMocks();
    healthListener = undefined;
    vi.mocked(bridge.onHealth).mockImplementation((listener) => {
      healthListener = listener;
      return () => undefined;
    });
  });

  it("exposes every Qt-equivalent operator page", () => {
    render(<App />);

    expect(screen.getByRole("banner")).toBeDefined();
    expect(screen.getByRole("navigation", { name: "控制站页面" })).toBeDefined();
    for (const label of [
      "整机操作",
      "机械臂",
      "CAN 四腿",
      "主摄像头",
      "设备遥测",
      "设置"
    ]) {
      expect(screen.getByRole("button", { name: label })).toBeDefined();
    }
  });

  it("keeps safety state and emergency stop visible in the command deck", () => {
    render(<App />);

    expect(screen.getByText("SAFE / STANDBY")).toBeDefined();
    expect(screen.getByRole("button", { name: "整机急停" })).toBeDefined();
    expect(screen.getByText("CONTROL AGENT")).toBeDefined();
    expect(screen.getByText("ROBOT LINK")).toBeDefined();
  });

  it("sends emergency stop through the dedicated bridge method", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "整机急停" }));

    expect(bridge.stop).toHaveBeenCalledWith("electron_emergency_stop");
  });

  it("clears stale Agent health when main publishes a disconnect", () => {
    render(<App />);

    act(() => healthListener?.(piOfflineHealth));
    const agentCard = screen.getByText("PC AGENT").closest("article");
    expect(agentCard?.classList.contains("good")).toBe(true);

    act(() => healthListener?.(null));
    expect(agentCard?.classList.contains("bad")).toBe(true);
  });
});
