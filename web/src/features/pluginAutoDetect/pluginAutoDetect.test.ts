import { describe, expect, it, vi } from "vitest";
import {
  autoAddDetectedPlugins,
  candidateFromPiProfile,
  candidatesFromCanMessages,
  candidatesFromFirmwarePorts,
  candidatesFromGamepads,
  candidatesFromLocalCameras,
  candidatesFromMotorFeedback,
  candidatesFromMotorMessages,
  candidatesFromServoFeedback,
  detectedDeviceIdFromParts,
  findMatchingPluginInstance
} from "./pluginAutoDetect";
import type { PluginInstance } from "../../platform/architecture";

describe("plugin auto detection", () => {
  it("builds stable detected device ids", () => {
    expect(detectedDeviceIdFromParts("camera", ["USB Camera", "A/B"])).toBe("camera:usb-camera:a-b");
  });

  it("normalizes serial port candidates and classifies common controllers", () => {
    const candidates = candidatesFromFirmwarePorts([
      { path: "COM7", description: "Silicon Labs CP210x USB to UART Bridge", hwid: "USB VID:PID=10C4:EA60 SER=ESP32" },
      { path: "/dev/ttyACM0", description: "Arduino Uno", hwid: "USB VID:PID=2341:0043" }
    ], 100);

    expect(candidates).toHaveLength(2);
    expect(candidates[0]).toMatchObject({ type: "firmware", source: "serial-port", confidence: "medium" });
    expect(candidates[0].config).toMatchObject({ portPath: "COM7", detectedAt: 100, baudRate: 115200 });
    expect(candidates[1].tags).toContain("tb6618");
  });

  it("creates camera, gamepad, servo, motor, CAN, and Pi candidates", () => {
    expect(candidatesFromLocalCameras([{ deviceId: "cam-a", label: "USB Camera" }], 1)[0]).toMatchObject({
      catalogItemId: "catalog.browser.local-camera",
      config: { preferredDeviceId: "cam-a" }
    });
    expect(candidatesFromGamepads([{ index: 0, id: "Xbox Pad", axes: 4, buttons: 12, mapping: "standard" }], 1)[0]).toMatchObject({
      catalogItemId: "catalog.browser.gamepad",
      config: { preferredIndex: 0, gamepadId: "Xbox Pad" }
    });
    expect(candidatesFromServoFeedback({ 7: { id: 7 } }, 1)[0]).toMatchObject({ config: { servoId: 7 }, source: "feetech-servo" });
    expect(candidatesFromMotorFeedback({ M2: { channel: "m2" } }, 1)[0]).toMatchObject({ config: { channel: "M2" }, source: "motor-controller" });
    expect(candidatesFromMotorMessages([{ type: "motor.feedback", seq: 1, channel: "m3" }], 1)[0]).toMatchObject({ config: { channel: "M3" } });
    expect(candidateFromPiProfile({ host: "raspberrypi.local", username: "robot1", workspaceDir: "~/rescue-robot" }, 1)).toMatchObject({
      type: "raspberry-pi",
      config: { host: "raspberrypi.local", username: "robot1" }
    });
    expect(candidatesFromCanMessages([{ type: "can.frame", seq: 1, id: 0x18ef0201, extended: true, dlc: 8, dataHex: "07 FD 00 00 00 00 00 00" }], 1)[0]).toMatchObject({
      driverId: "driver.asme-can-servo",
      config: { servoId: 7, canBus: "CAN1" }
    });
  });

  it("matches old plugins without detectedDeviceId by hardware fields", () => {
    const existing = [plugin("servo-a", "Servo A", "servo", { servoId: 7 }, "driver.feetech-servo", "transport.web-serial")];
    const candidate = candidatesFromServoFeedback({ 7: { id: 7 } }, 1)[0];

    expect(findMatchingPluginInstance(candidate, existing)?.id).toBe("servo-a");
  });

  it("auto-adds new plugins, skips existing ones, and preserves user config", async () => {
    const existing = [plugin("servo-a", "Custom Shoulder", "servo", { servoId: 7, minDeg: 10 }, "driver.feetech-servo", "transport.web-serial")];
    const candidates = [
      candidatesFromServoFeedback({ 7: { id: 7 } }, 1)[0],
      candidatesFromMotorFeedback({ M1: { channel: "M1" } }, 1)[0]
    ];
    const createPluginInstance = vi.fn(async (_projectId: string, value: Partial<PluginInstance>) => plugin("motor-a", value.name ?? "Motor", "motor", value.config ?? {}, value.driverId, value.transportId));
    const updatePluginInstance = vi.fn(async (_projectId: string, _id: string, value: Partial<PluginInstance>) => ({
      ...existing[0],
      config: { ...existing[0].config, ...value.config }
    }));

    const result = await autoAddDetectedPlugins("project", candidates, existing, { createPluginInstance, updatePluginInstance }, { nowMs: 2 });

    expect(result.created).toHaveLength(1);
    expect(result.skipped).toHaveLength(1);
    expect(createPluginInstance).toHaveBeenCalledOnce();
    expect(updatePluginInstance).toHaveBeenCalledWith("project", "servo-a", {
      config: expect.objectContaining({ servoId: 7, minDeg: 10, detectedAt: 2, detectedSource: "feetech-servo" })
    });
  });
});

function plugin(
  id: string,
  name: string,
  type: PluginInstance["type"],
  config: PluginInstance["config"],
  driverId = `driver.${type}`,
  transportId = "transport.test"
): PluginInstance {
  return {
    id,
    name,
    type,
    catalogItemId: null,
    brand: "Test",
    model: "Test",
    driverId,
    transportId,
    capabilities: [{ id: type, features: [] }],
    config,
    tags: []
  };
}
