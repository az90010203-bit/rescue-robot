import { describe, expect, it } from "vitest";
import { validatePlatformCommand } from "@platform/commands";
import { BUILTIN_UI_PANELS } from "@platform/builtinPlugins";
import { DeviceDescriptor, PlatformEvent, UiControlSchema } from "@platform/types";
import {
  findPlatformUiPanelForDevice,
  formatPlatformStateValue,
  limitPlatformEvents,
  platformCommandForControl,
  platformControlDefaultsForDevice,
  resolveSelectedPlatformDeviceId
} from "@platform/ui";

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
  },
  {
    id: "camera:main",
    name: "Camera",
    type: "camera",
    driverId: "driver.camera-gimbal",
    transportId: "transport.controller-json",
    status: "standby",
    capabilities: []
  },
  {
    id: "camera:secondary",
    name: "Second Camera",
    type: "camera",
    driverId: "driver.secondary-camera",
    transportId: "transport.ssh",
    status: "standby",
    capabilities: []
  },
  {
    id: "camera:browser",
    name: "Computer Camera",
    type: "camera",
    driverId: "driver.browser-camera",
    transportId: "transport.browser-media",
    status: "standby",
    capabilities: []
  },
  {
    id: "robot-arm:main",
    name: "Robot Arm",
    type: "robot-arm",
    driverId: "driver.robot-arm-composite",
    transportId: "transport.web-serial",
    status: "standby",
    capabilities: []
  },
  {
    id: "pi:main",
    name: "Raspberry Pi",
    type: "raspberry-pi",
    driverId: "driver.raspberry-pi-ssh",
    transportId: "transport.ssh",
    status: "offline",
    capabilities: []
  },
  {
    id: "firmware:local",
    name: "Firmware Helper",
    type: "firmware",
    driverId: "driver.local-firmware-helper",
    transportId: "transport.local-helper",
    status: "offline",
    capabilities: []
  },
  {
    id: "gamepad:active",
    name: "Gamepad",
    type: "gamepad",
    driverId: "driver.browser-gamepad",
    transportId: "transport.browser-gamepad-api",
    status: "offline",
    capabilities: []
  },
  {
    id: "ai-vision:local",
    name: "AI Vision",
    type: "ai-vision",
    driverId: "driver.ai-vision-helper",
    transportId: "transport.local-helper",
    status: "offline",
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
    expect(findPlatformUiPanelForDevice({ ...devices[2], capabilities: [{ id: "camera", features: [] }] }, BUILTIN_UI_PANELS)?.id).toBe("camera-gimbal-control");
    expect(findPlatformUiPanelForDevice({ ...devices[3], capabilities: [{ id: "camera", features: [] }] }, BUILTIN_UI_PANELS)?.id).toBe("secondary-camera-control");
    expect(findPlatformUiPanelForDevice({ ...devices[4], capabilities: [{ id: "camera", features: [] }] }, BUILTIN_UI_PANELS)?.id).toBe("browser-camera-control");
    expect(findPlatformUiPanelForDevice({ ...devices[5], capabilities: [{ id: "robot-arm", features: [] }] }, BUILTIN_UI_PANELS)?.id).toBe("robot-arm-control");
    expect(findPlatformUiPanelForDevice({ ...devices[6], capabilities: [{ id: "raspberry-pi", features: [] }] }, BUILTIN_UI_PANELS)?.id).toBe("raspberry-pi-remote");
    expect(findPlatformUiPanelForDevice({ ...devices[7], capabilities: [{ id: "firmware", features: [] }] }, BUILTIN_UI_PANELS)?.id).toBe("firmware-upload");
    expect(findPlatformUiPanelForDevice({ ...devices[8], capabilities: [{ id: "gamepad", features: [] }] }, BUILTIN_UI_PANELS)?.id).toBe("gamepad-status");
    expect(findPlatformUiPanelForDevice({ ...devices[9], capabilities: [{ id: "ai-vision", features: [] }] }, BUILTIN_UI_PANELS)?.id).toBe("ai-vision-control");
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

    const cameraCommand = platformCommandForControl(devices[2], "set_gimbal", { panAngleDeg: 45, tiltAngleDeg: 120 });
    expect(typeof cameraCommand).not.toBe("string");
    if (typeof cameraCommand !== "string") {
      expect(cameraCommand.type).toBe("camera.set_gimbal");
    }

    const armCommand = platformCommandForControl(devices[5], "set_pose", { joints: [{ id: "base", angleDeg: 90 }] });
    expect(typeof armCommand).not.toBe("string");
    if (typeof armCommand !== "string") {
      expect(armCommand.type).toBe("robot-arm.set_pose");
    }

    const piCommand = platformCommandForControl(devices[6], "exec", { command: "python3 main.py" });
    expect(typeof piCommand).not.toBe("string");
    if (typeof piCommand !== "string") {
      expect(piCommand.type).toBe("pi.exec");
    }

    const firmwareCommand = platformCommandForControl(devices[7], "upload", { port: "COM6" });
    expect(typeof firmwareCommand).not.toBe("string");
    if (typeof firmwareCommand !== "string") {
      expect(firmwareCommand.type).toBe("firmware.upload");
    }

    const aiVisionCommand = platformCommandForControl(devices[9], "analyze", { sourceId: "main", streamUrl: "http://127.0.0.1:8080/stream" });
    expect(typeof aiVisionCommand).not.toBe("string");
    if (typeof aiVisionCommand !== "string") {
      expect(aiVisionCommand.type).toBe("ai-vision.analyze");
    }
  });

  it("returns clear errors for incomplete or unsupported controls", () => {
    expect(platformCommandForControl(devices[0], "set_position", { angleDeg: 90 })).toBe("servo position control requires angleDeg and speedRaw");
    expect(platformCommandForControl(devices[0], "missing", platformControlDefaultsForDevice(devices[0]))).toBe("unsupported platform control action: servo.missing");
  });

  it("keeps built-in ui panel actions mapped to valid platform commands", () => {
    for (const panel of BUILTIN_UI_PANELS) {
      const device = devices.find((item) => item.type === panel.capability);
      expect(device, `missing test device for ${panel.capability}`).toBeDefined();
      if (!device) {
        continue;
      }
      for (const control of flattenControls(panel.controls)) {
        if (!control.actionId) {
          continue;
        }
        const command = platformCommandForControl(device, control.actionId, draftForDevice(device));
        expect(typeof command, `${panel.id}.${control.id}`).not.toBe("string");
        if (typeof command !== "string") {
          expect(validatePlatformCommand(command), `${panel.id}.${control.id}`).toBeNull();
        }
      }
    }
  });
});

function flattenControls(controls: UiControlSchema[]): UiControlSchema[] {
  return controls.flatMap((control) => [control, ...flattenControls(control.controls ?? [])]);
}

function draftForDevice(device: DeviceDescriptor) {
  return {
    ...platformControlDefaultsForDevice(device),
    angleDeg: 90,
    speedRaw: 800,
    speedPercent: 20,
    stopMode: "coast",
    panAngleDeg: 90,
    tiltAngleDeg: 90,
    joints: [],
    command: "python3 main.py",
    file: { name: "main.py" },
    port: "COM6",
    sourceId: "main",
    streamUrl: "http://127.0.0.1:8080/stream",
    label: "competition_mannequin"
  };
}
