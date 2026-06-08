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
import { runPluginAutoDetection } from "./detectors";
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

  it("runs hardware detection through injectable detectors", async () => {
    const phases: string[] = [];
    const sendAboardBridgeCanServoCommand = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, messages: [] })
      .mockResolvedValueOnce({
        ok: true,
        messages: [{ type: "can.frame", seq: 2, id: 0x18ef0201, extended: true, dlc: 8, dataHex: "07 FD 00 00 00 00 00 00" }]
      })
      .mockResolvedValue({ ok: true, messages: [{ type: "motor.feedback", seq: 10, channel: "m4" }] });
    let seq = 0;

    const result = await runPluginAutoDetection({
      enumerateLocalCameraDevices: async () => [{ deviceId: "cam-a", label: "USB Camera" }],
      gamepads: [{ index: 0, id: "Xbox Pad", axes: 4, buttons: 12, mapping: "standard" }],
      listFirmwarePorts: async () => [{ path: "COM7", description: "ESP32", hwid: "USB VID:PID=10C4:EA60" }],
      motorFeedback: { M2: { type: "motor.feedback", seq: 11, channel: "m2" } },
      nextCommandSeq: () => {
        seq += 1;
        return seq;
      },
      nowMs: 123,
      onPhase: (phase) => phases.push(phase),
      piProfile: { host: "raspberrypi.local", username: "robot1", workspaceDir: "~/rescue-robot" },
      scanFeetechServoBus: async () => candidatesFromServoFeedback({ 7: { id: 7 } }, 123),
      sendAboardBridgeCanServoCommand,
      servoFeedback: { 8: { type: "servo.feedback", seq: 13, id: 8 } }
    });

    expect(phases).toEqual([
      "scanningLocalCameras",
      "scanningSerialPorts",
      "scanningFeetechServoBus",
      "scanningAboardCan",
      "scanningAboardMotorChannels"
    ]);
    expect(sendAboardBridgeCanServoCommand).toHaveBeenCalledTimes(10);
    expect(result.logs).toEqual(expect.arrayContaining([
      "Camera scan found 1 video input(s).",
      "Serial scan found 1 port(s).",
      "Feetech bus scan found 1 servo candidate(s).",
      "A board CAN scan found 1 servo candidate(s).",
      "A board motor scan found 1 channel candidate(s)."
    ]));
    expect(result.candidates.map((candidate) => candidate.source)).toEqual(expect.arrayContaining([
      "gamepad",
      "feetech-servo",
      "motor-controller",
      "raspberry-pi",
      "local-camera",
      "serial-port",
      "can-servo"
    ]));
    expect(result.candidates).toEqual(expect.arrayContaining([
      expect.objectContaining({ config: expect.objectContaining({ preferredDeviceId: "cam-a" }) }),
      expect.objectContaining({ config: expect.objectContaining({ portPath: "COM7" }) }),
      expect.objectContaining({ config: expect.objectContaining({ servoId: 7 }) }),
      expect.objectContaining({ config: expect.objectContaining({ servoId: 8 }) }),
      expect.objectContaining({ config: expect.objectContaining({ channel: "M4" }) })
    ]));
  });

  it("skips A board scans when detection is canceled", async () => {
    const sendAboardBridgeCanServoCommand = vi.fn();
    const result = await runPluginAutoDetection({
      canceled: () => true,
      enumerateLocalCameraDevices: async () => [],
      listFirmwarePorts: async () => [],
      nextCommandSeq: () => 1,
      nowMs: 1,
      scanFeetechServoBus: async () => [],
      sendAboardBridgeCanServoCommand
    });

    expect(sendAboardBridgeCanServoCommand).not.toHaveBeenCalled();
    expect(result.candidates).toEqual([]);
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
