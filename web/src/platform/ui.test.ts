import { describe, expect, it } from "vitest";
import { BUILTIN_UI_PANELS } from "./builtinPlugins";
import { DeviceDescriptor, PlatformEvent } from "./types";
import {
  findPlatformUiPanelForDevice,
  formatPlatformStateValue,
  limitPlatformEvents,
  platformCommandForControl,
  platformControlDefaultsForDevice,
  resolveSelectedPlatformDeviceId
} from "./ui";

const devices: DeviceDescriptor[] = [
  {
    id: "servo:22",
    name: "ID22",
    type: "servo",
    driverId: "driver.feetech-servo",
    transportId: "transport.web-serial",
    status: "offline",
    capabilities: []
  },
  {
    id: "motor:M1",
    name: "Left Track",
    type: "motor",
    driverId: "driver.tb6618-motor",
    transportId: "transport.controller-json",
    status: "standby",
    capabilities: []
  }
];

describe("platform ui helpers", () => {
  it("keeps a valid selected device id", () => {
    expect(resolveSelectedPlatformDeviceId(devices, "motor:M1", "servo:22")).toBe("motor:M1");
  });

  it("falls back to preferred or first device when selection is invalid", () => {
    expect(resolveSelectedPlatformDeviceId(devices, "missing", "motor:M1")).toBe("motor:M1");
    expect(resolveSelectedPlatformDeviceId(devices, "missing", "missing-too")).toBe("servo:22");
    expect(resolveSelectedPlatformDeviceId([], "missing", "motor:M1")).toBe("");
  });

  it("formats state values consistently", () => {
    expect(formatPlatformStateValue("COM6")).toBe("COM6");
    expect(formatPlatformStateValue(42)).toBe("42");
    expect(formatPlatformStateValue(true)).toBe("yes");
    expect(formatPlatformStateValue(false)).toBe("no");
    expect(formatPlatformStateValue(null)).toBe("--");
    expect(formatPlatformStateValue(undefined)).toBe("--");
  });

  it("keeps newest platform events first and within the display limit", () => {
    const events: PlatformEvent[] = Array.from({ length: 12 }, (_, index) => ({
      id: index + 1,
      type: `event.${index + 1}`,
      level: "info" as const,
      source: "test",
      payload: {},
      createdAt: 100 + index
    })).reverse();

    expect(limitPlatformEvents(events, 3).map((event) => event.type)).toEqual(["event.12", "event.11", "event.10"]);
  });

  it("finds a ui panel from device capability", () => {
    expect(findPlatformUiPanelForDevice({ ...devices[0], capabilities: [{ id: "servo", features: [] }] }, BUILTIN_UI_PANELS)?.id).toBe("servo-control");
    expect(findPlatformUiPanelForDevice({ ...devices[1], capabilities: [{ id: "motor", features: [] }] }, BUILTIN_UI_PANELS)?.id).toBe("motor-control");
  });

  it("creates platform commands from control actions", () => {
    const pingCommand = platformCommandForControl(devices[0], "scan", {});
    expect(typeof pingCommand).not.toBe("string");
    if (typeof pingCommand !== "string") {
      expect(pingCommand.type).toBe("servo.ping");
    }

    const servoCommand = platformCommandForControl(devices[0], "set_position", { angleDeg: 120, speedRaw: 600 });
    expect(typeof servoCommand).not.toBe("string");
    if (typeof servoCommand !== "string") {
      expect(servoCommand.type).toBe("servo.set_position");
      expect(servoCommand.payload).toEqual({ angleDeg: 120, speedRaw: 600 });
    }

    const motorCommand = platformCommandForControl(devices[1], "set_speed", { speedPercent: -25, stopMode: "brake" });
    expect(typeof motorCommand).not.toBe("string");
    if (typeof motorCommand !== "string") {
      expect(motorCommand.type).toBe("motor.set_speed");
      expect(motorCommand.payload).toEqual({ speedPercent: -25, stopMode: "brake" });
    }
  });

  it("returns clear errors for incomplete or unsupported controls", () => {
    expect(platformCommandForControl(devices[0], "set_position", { angleDeg: 90 })).toBe("servo position control requires angleDeg and speedRaw");
    expect(platformCommandForControl(devices[0], "missing", platformControlDefaultsForDevice(devices[0]))).toBe("unsupported platform control action: servo.missing");
  });
});
