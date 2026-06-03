import { describe, expect, it } from "vitest";
import {
  createServoSafetyRuntime,
  evaluateServoSafety,
  resolveServoSafetyConfig,
  updateServoSafetyTarget
} from "./servoSafety";

describe("servo safety protection", () => {
  const config = resolveServoSafetyConfig("standard");

  it("triggers when load stays over the limit", () => {
    let runtime = createServoSafetyRuntime({ mode: "position", targetPositionRaw: 2000 }, 0);

    runtime = evaluateServoSafety(runtime, { positionRaw: 1000, loadRaw: 760 }, 600, config).runtime;
    const result = evaluateServoSafety(runtime, { positionRaw: 1000, loadRaw: 760 }, 600 + config.overLimitMs, config);

    expect(result.trigger).toBe("load");
  });

  it("triggers when current stays over the limit", () => {
    let runtime = createServoSafetyRuntime({ mode: "wheel", targetSpeedRaw: 300 }, 0);

    runtime = evaluateServoSafety(runtime, { positionRaw: 100, currentRaw: -950 }, 600, config).runtime;
    const result = evaluateServoSafety(runtime, { positionRaw: 100, currentRaw: -950 }, 600 + config.overLimitMs, config);

    expect(result.trigger).toBe("current");
  });

  it("triggers immediately on high temperature", () => {
    const runtime = createServoSafetyRuntime({ mode: "position", targetPositionRaw: 2200 }, 0);
    const result = evaluateServoSafety(runtime, { positionRaw: 1000, temperatureC: config.temperatureLimitC }, 100, config);

    expect(result.trigger).toBe("temperature");
  });

  it("triggers a position stall after grace and no raw progress", () => {
    let runtime = createServoSafetyRuntime({ mode: "position", targetPositionRaw: 2200 }, 0);

    runtime = evaluateServoSafety(runtime, { positionRaw: 1000 }, config.startGraceMs, config).runtime;
    const result = evaluateServoSafety(runtime, { positionRaw: 1001 }, config.startGraceMs + config.stallMs, config);

    expect(result.trigger).toBe("stall");
  });

  it("triggers a wheel stall when commanded speed is nonzero and feedback does not progress", () => {
    let runtime = createServoSafetyRuntime({ mode: "wheel", targetSpeedRaw: 300 }, 0);

    runtime = evaluateServoSafety(runtime, { positionRaw: 300, speedRaw: 0 }, config.startGraceMs, config).runtime;
    const result = evaluateServoSafety(runtime, { positionRaw: 301, speedRaw: 0 }, config.startGraceMs + config.stallMs, config);

    expect(result.trigger).toBe("stall");
  });

  it("does not trigger inside start grace or after reaching the position target", () => {
    const runtime = createServoSafetyRuntime({ mode: "position", targetPositionRaw: 1200 }, 0);
    const grace = evaluateServoSafety(runtime, { positionRaw: 1000 }, config.startGraceMs - 1, config);
    const settled = evaluateServoSafety(grace.runtime, { positionRaw: 1204 }, config.startGraceMs + config.stallMs, config);

    expect(grace.trigger).toBeUndefined();
    expect(settled.trigger).toBeUndefined();
    expect(settled.settled).toBe(true);
  });

  it("updates live targets without resetting the stall timer", () => {
    let runtime = createServoSafetyRuntime({ mode: "position", targetPositionRaw: 1600 }, 0);

    runtime = evaluateServoSafety(runtime, { positionRaw: 1000 }, config.startGraceMs, config).runtime;
    runtime = updateServoSafetyTarget(runtime, { mode: "position", targetPositionRaw: 1800 });
    const result = evaluateServoSafety(runtime, { positionRaw: 1000 }, config.startGraceMs + config.stallMs, config);

    expect(result.trigger).toBe("stall");
  });
});
