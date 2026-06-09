import { describe, expect, it, vi } from "vitest";
import { normalizeServoProfile } from "@adapters/hardware/protocol";
import { createDefaultServoCommandState, type ServoCommandState } from "@app/appModel";
import { useServoActionsRuntime } from "@domains/servo/useServoActionsRuntime";

function createRuntime(overrides: Partial<Parameters<typeof useServoActionsRuntime>[0]> = {}) {
  return useServoActionsRuntime({
    addLog: vi.fn(),
    addSystemLog: vi.fn(),
    cancelLiveAngleMove: vi.fn(),
    cancelLiveWheelMove: vi.fn(),
    cancelServoMotionForServo: vi.fn(),
    cancelServoSafetyMonitor: vi.fn(),
    cancelWheelTurnMonitor: vi.fn(),
    dispatchPlatformCommand: vi.fn(async () => ({ response: null })),
    lastServoWheelSpeedRef: { current: {} },
    livePositionModeServoRef: { current: new Set<number>() },
    pauseServoLinkageGroup: vi.fn(async () => undefined),
    pauseServoLinkageWheelTargets: vi.fn(async () => undefined),
    pauseWheelServo: vi.fn(async () => undefined),
    runServoLinkagePositionMotion: vi.fn(async () => true),
    runServoLinkageWheelMotion: vi.fn(async () => true),
    runServoPositionMotion: vi.fn(async () => true),
    runServoWheelMotion: vi.fn(async () => true),
    servos: [],
    setLinkageWheelDirectionByGroup: vi.fn(),
    startWheelTurnMonitor: vi.fn(async () => true),
    updateServoCommandField: vi.fn(),
    sendServoFrames: vi.fn(async () => null),
    servoBusReady: true,
    ...overrides
  });
}

describe("useServoActionsRuntime", () => {
  it("passes live position moves through to the position motion runtime", async () => {
    const runServoPositionMotion = vi.fn(async () => true);
    const runtime = createRuntime({ runServoPositionMotion });
    const servo = normalizeServoProfile({ id: 7, name: "ID7" });
    const state: ServoCommandState = {
      ...createDefaultServoCommandState(),
      mode: "position",
      angleDeg: "123"
    };

    await runtime.sendMoveForServo(servo, state, { live: true });

    expect(runServoPositionMotion).toHaveBeenCalledWith(servo, state, 123, { live: true });
  });
});
