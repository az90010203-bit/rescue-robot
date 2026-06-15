import { describe, expect, it } from "vitest";
import { shouldAutoCheckAboardBridge, shouldAutoCheckPiServoBridgeContext, shouldAutoRecoverBridge } from "@adapters/pi/aBoardBridgeAutoCheck";

const baseState = {
  activeSection: "tests" as const,
  activeTest: "motor" as const,
  alreadyCheckedHost: "",
  host: "raspberrypi.local",
  manualDisconnect: false,
  status: "idle" as const
};

describe("A board bridge auto-check", () => {
  it("checks when the RoboMaster A motor test is visible", () => {
    expect(shouldAutoCheckAboardBridge(baseState)).toBe(true);
  });

  it("keeps the console auto-check path for A board telemetry", () => {
    expect(
      shouldAutoCheckAboardBridge({
        ...baseState,
        activeSection: "console",
        activeTest: "servo"
      })
    ).toBe(true);
  });

  it("checks when the CAN servo test is visible", () => {
    expect(
      shouldAutoCheckAboardBridge({
        ...baseState,
        activeTest: "canServo"
      })
    ).toBe(true);
  });

  it("does not check after manual disconnect", () => {
    expect(shouldAutoCheckAboardBridge({ ...baseState, manualDisconnect: true })).toBe(false);
  });

  it("does not repeat an automatic check for the same host", () => {
    expect(shouldAutoCheckAboardBridge({ ...baseState, alreadyCheckedHost: "raspberrypi.local" })).toBe(false);
  });
});

describe("bridge auto-recover", () => {
  it("recovers only bridge errors with an active host", () => {
    expect(shouldAutoRecoverBridge({ host: "192.168.55.220", manualDisconnect: false, status: "error" })).toBe(true);
    expect(shouldAutoRecoverBridge({ host: "", manualDisconnect: false, status: "error" })).toBe(false);
    expect(shouldAutoRecoverBridge({ host: "192.168.55.220", manualDisconnect: false, status: "connected" })).toBe(false);
  });

  it("does not recover after a manual disconnect", () => {
    expect(shouldAutoRecoverBridge({ host: "192.168.55.220", manualDisconnect: true, status: "error" })).toBe(false);
  });
});

describe("Pi servo bridge auto-check context", () => {
  it.each(["servo", "arm", "arm3d", "machineClaw"] as const)("checks in the %s test panel", (activeTest) => {
    expect(shouldAutoCheckPiServoBridgeContext({ activeModule: "camera", activeSection: "tests", activeTest })).toBe(true);
  });

  it("checks when the active module already needs the servo bus", () => {
    expect(shouldAutoCheckPiServoBridgeContext({ activeModule: "arm", activeSection: "console", activeTest: "motor" })).toBe(true);
    expect(shouldAutoCheckPiServoBridgeContext({ activeModule: "servo", activeSection: "settings", activeTest: "pi" })).toBe(true);
  });

  it("does not check unrelated tests", () => {
    expect(shouldAutoCheckPiServoBridgeContext({ activeModule: "camera", activeSection: "tests", activeTest: "driveCamera" })).toBe(false);
  });
});
