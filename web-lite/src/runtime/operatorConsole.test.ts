import { describe, expect, it } from "vitest";
import {
  WHOLE_ROBOT_STOP_TARGETS,
  buildOperatorDeviceMatrix,
  isConsoleViewVisible,
  resolveConsoleViewForMode,
  visibleConsoleViews
} from "./operatorConsole";

describe("web-lite operator console", () => {
  it("hides engineering views in operator mode", () => {
    expect(visibleConsoleViews("operator")).toEqual(["control"]);
    expect(isConsoleViewVisible("operator", "can")).toBe(false);
    expect(isConsoleViewVisible("engineering", "can")).toBe(true);
    expect(resolveConsoleViewForMode("operator", "settings")).toBe("control");
    expect(resolveConsoleViewForMode("engineering", "settings")).toBe("settings");
  });

  it("describes the whole-robot stop coverage", () => {
    expect(WHOLE_ROBOT_STOP_TARGETS).toEqual({
      motors: ["mecanum", "tracked", "pwm"],
      servos: ["arm", "machine-claw"],
      can: ["jog"]
    });
  });

  it("builds a compact operator device readiness matrix", () => {
    expect(buildOperatorDeviceMatrix({
      aBoardHealth: { ok: true, serialOpen: true, serialPort: "/dev/ttyAMA5", serialProtocolActive: "json" },
      cameraHost: "192.168.1.12",
      gamepadConnected: false,
      imuDetail: "0x70 / 0x10",
      imuReady: true,
      piServoHealth: { ok: true, serialOpen: true, serialPort: "/dev/serial0", binaryProtocolReady: true }
    })).toMatchObject([
      { id: "aBoard", detail: "/dev/ttyAMA5 / json", tone: "online", required: true },
      { id: "piServo", detail: "/dev/serial0", tone: "online", required: true },
      { id: "camera", detail: "192.168.1.12", tone: "online", required: true },
      { id: "imu", detail: "0x70 / 0x10", tone: "online", required: true },
      { id: "gamepad", detail: "not connected", tone: "warning", required: false }
    ]);
  });
});
