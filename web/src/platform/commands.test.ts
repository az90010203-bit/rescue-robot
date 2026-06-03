import { describe, expect, it } from "vitest";
import {
  createPlatformCommand,
  platformCommandEventType,
  resolvePlatformCommandTarget,
  validatePlatformCommand
} from "./commands";

describe("platform commands", () => {
  it("accepts valid servo and motor commands", () => {
    expect(validatePlatformCommand(createPlatformCommand("servo.ping", "servo:22"))).toBeNull();
    expect(validatePlatformCommand(createPlatformCommand("servo.set_torque", "servo:22", { enabled: true }))).toBeNull();
    expect(validatePlatformCommand(createPlatformCommand("motor.set_speed", "motor:M1", { speedPercent: 45, stopMode: "brake" }))).toBeNull();
    expect(validatePlatformCommand(createPlatformCommand("motor.configure", "motor:M1", { pwmPin: "D5", in1Pin: "D4", in2Pin: "D7" }))).toBeNull();
  });

  it("rejects unknown targets and missing payload", () => {
    expect(validatePlatformCommand(createPlatformCommand("servo.ping", "camera:main"))).toContain("unsupported");
    expect(validatePlatformCommand(createPlatformCommand("servo.set_position", "servo:22", { angleDeg: 90 }))).toBe("servo.set_position requires angleDeg and speedRaw");
    expect(validatePlatformCommand(createPlatformCommand("motor.set_speed", "motor:M1"))).toBe("motor.set_speed requires speedPercent");
  });

  it("rejects non-finite and out-of-range numeric payloads", () => {
    expect(validatePlatformCommand(createPlatformCommand("servo.set_position", "servo:22", { angleDeg: Number.NaN, speedRaw: 800 }))).toBe("servo.set_position angleDeg must be 0-360");
    expect(validatePlatformCommand(createPlatformCommand("servo.set_position", "servo:22", { angleDeg: 90, speedRaw: 5000 }))).toBe("servo.set_position speedRaw must be an integer from 0 to 4095");
    expect(validatePlatformCommand(createPlatformCommand("servo.set_speed", "servo:22", { speedRaw: Infinity }))).toBe("servo.set_speed speedRaw must be an integer from -4095 to 4095");
    expect(validatePlatformCommand(createPlatformCommand("motor.set_speed", "motor:M1", { speedPercent: 101 }))).toBe("motor.set_speed speedPercent must be from -100 to 100");
  });

  it("resolves target capability from device id", () => {
    expect(resolvePlatformCommandTarget(createPlatformCommand("servo.ping", "servo:22"))).toEqual({
      deviceId: "servo:22",
      capability: "servo"
    });
    expect(resolvePlatformCommandTarget(createPlatformCommand("motor.stop", "motor:M1"))).toEqual({
      deviceId: "motor:M1",
      capability: "motor"
    });
  });

  it("generates stable command event names", () => {
    expect(platformCommandEventType("sent")).toBe("platform.command.sent");
    expect(platformCommandEventType("skipped")).toBe("platform.command.skipped");
    expect(platformCommandEventType("failed")).toBe("platform.command.failed");
    expect(platformCommandEventType("timeout")).toBe("platform.command.timeout");
  });
});
