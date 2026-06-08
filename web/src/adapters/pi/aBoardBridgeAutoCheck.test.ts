import { describe, expect, it } from "vitest";
import { shouldAutoCheckAboardBridge } from "@adapters/pi/aBoardBridgeAutoCheck";

const baseState = {
  activeSection: "tests" as const,
  activeTest: "motor" as const,
  alreadyCheckedHost: "",
  host: "raspberrypi.local",
  manualDisconnect: false,
  motorTestBoard: "robomaster-a" as const,
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
        activeTest: "servo",
        motorTestBoard: "arduino"
      })
    ).toBe(true);
  });

  it("checks when the CAN servo test is visible", () => {
    expect(
      shouldAutoCheckAboardBridge({
        ...baseState,
        activeTest: "canServo",
        motorTestBoard: "arduino"
      })
    ).toBe(true);
  });

  it("does not check for Arduino motor tests or after manual disconnect", () => {
    expect(shouldAutoCheckAboardBridge({ ...baseState, motorTestBoard: "arduino" })).toBe(false);
    expect(shouldAutoCheckAboardBridge({ ...baseState, manualDisconnect: true })).toBe(false);
  });

  it("does not repeat an automatic check for the same host", () => {
    expect(shouldAutoCheckAboardBridge({ ...baseState, alreadyCheckedHost: "raspberrypi.local" })).toBe(false);
  });
});
