import { describe, expect, it } from "vitest";
import {
  DEFAULT_CAMERA_CONFIG,
  MAIN_CAMERA_SOURCE_ID,
  SECONDARY_CAMERA_SOURCE_ID,
  type CameraConfig
} from "../../lib/storage";
import { adaptCameraConfigToPiHost } from "./cameraSources";

describe("camera source helpers", () => {
  it("adapts Raspberry Pi USB camera URLs to the current Pi host", () => {
    const config: CameraConfig = {
      ...DEFAULT_CAMERA_CONFIG,
      streamUrl: "http://192.168.55.220:8080/stream",
      webrtcOfferUrl: "http://192.168.55.220:8080/offer",
      videoSources: DEFAULT_CAMERA_CONFIG.videoSources.map((source) => ({
        ...source,
        streamUrl: source.id === MAIN_CAMERA_SOURCE_ID ? "http://192.168.55.220:8080/stream" : "http://192.168.55.220:8081/stream"
      }))
    };

    const result = adaptCameraConfigToPiHost(config, "raspberrypi.local");

    expect(result.streamUrl).toBe("http://raspberrypi.local:8080/stream");
    expect(result.webrtcOfferUrl).toBe("http://raspberrypi.local:8080/offer");
    expect(result.videoSources).toEqual([
      expect.objectContaining({ id: MAIN_CAMERA_SOURCE_ID, streamUrl: "http://raspberrypi.local:8080/stream" }),
      expect.objectContaining({ id: SECONDARY_CAMERA_SOURCE_ID, streamUrl: "http://raspberrypi.local:8081/stream" })
    ]);
  });

  it("leaves non-Pi camera sources unchanged", () => {
    const config: CameraConfig = {
      ...DEFAULT_CAMERA_CONFIG,
      videoSources: [
        {
          id: "network",
          label: "Network Camera",
          devicePath: "rtsp://camera.local/live",
          port: 8554,
          streamUrl: "http://camera.local:8080/stream"
        }
      ],
      streamUrl: "http://camera.local:8080/stream",
      webrtcOfferUrl: "http://camera.local:8080/offer"
    };

    const result = adaptCameraConfigToPiHost(config, "raspberrypi.local");

    expect(result.videoSources[0].streamUrl).toBe("http://camera.local:8080/stream");
  });
});
