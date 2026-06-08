import { describe, expect, it, vi } from "vitest";
import {
  enumerateLocalCameraDevices,
  isLocalCameraSupported,
  localCameraConstraints,
  startLocalCameraStream,
  stopLocalCameraStream,
  type LocalCameraMediaDevices
} from "@domains/camera/localCamera";

describe("local browser camera helpers", () => {
  it("reports unsupported browsers clearly", async () => {
    expect(isLocalCameraSupported(null)).toBe(false);
    await expect(enumerateLocalCameraDevices(null)).rejects.toThrow("Browser camera API is not available");
  });

  it("enumerates only video input devices and fills private labels", async () => {
    const mediaDevices = fakeMediaDevices([
      mediaDevice({ kind: "audioinput", deviceId: "mic", label: "Microphone" }),
      mediaDevice({ kind: "videoinput", deviceId: "cam-a", label: "" }),
      mediaDevice({ kind: "videoinput", deviceId: "cam-b", label: "USB Camera" })
    ]);

    await expect(enumerateLocalCameraDevices(mediaDevices)).resolves.toEqual([
      { deviceId: "cam-a", label: "Camera 1" },
      { deviceId: "cam-b", label: "USB Camera" }
    ]);
  });

  it("builds getUserMedia constraints from saved plugin config", () => {
    expect(localCameraConstraints({ deviceId: "cam-a", width: "640", height: 480, fps: 30 })).toEqual({
      video: {
        deviceId: { exact: "cam-a" },
        width: { ideal: 640 },
        height: { ideal: 480 },
        frameRate: { ideal: 30 }
      }
    });
  });

  it("starts streams and stops all tracks", async () => {
    const stopOne = vi.fn();
    const stopTwo = vi.fn();
    const stream = {
      getTracks: () => [{ stop: stopOne }, { stop: stopTwo }]
    } as unknown as MediaStream;
    const mediaDevices = fakeMediaDevices([], stream);

    await expect(startLocalCameraStream({ deviceId: "cam-a" }, mediaDevices)).resolves.toBe(stream);
    expect(mediaDevices.getUserMedia).toHaveBeenCalledWith({ video: { deviceId: { exact: "cam-a" } } });

    stopLocalCameraStream(stream);
    expect(stopOne).toHaveBeenCalledTimes(1);
    expect(stopTwo).toHaveBeenCalledTimes(1);
  });
});

function fakeMediaDevices(devices: MediaDeviceInfo[], stream: MediaStream = {} as MediaStream): LocalCameraMediaDevices {
  return {
    enumerateDevices: vi.fn(async () => devices),
    getUserMedia: vi.fn(async () => stream)
  };
}

function mediaDevice(device: Pick<MediaDeviceInfo, "deviceId" | "kind" | "label">): MediaDeviceInfo {
  return {
    deviceId: device.deviceId,
    groupId: "",
    kind: device.kind,
    label: device.label,
    toJSON: () => ({})
  } as MediaDeviceInfo;
}
