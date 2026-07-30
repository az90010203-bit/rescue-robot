import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App } from "./App";
import type { RescueBridge } from "../shared/bridge";

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
  });

  it("exposes every Qt-equivalent operator page", () => {
    render(<App />);

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

  it("sends emergency stop through the dedicated bridge method", () => {
    render(<App />);

    fireEvent.click(screen.getByRole("button", { name: "整机急停" }));

    expect(bridge.stop).toHaveBeenCalledWith("electron_emergency_stop");
  });
});
