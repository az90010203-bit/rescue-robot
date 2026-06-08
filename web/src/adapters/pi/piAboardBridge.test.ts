import { describe, expect, it, vi } from "vitest";
import { buildAboardBridgeBaseUrl, buildAboardBridgeServiceCommand, checkAboardBridge, sendAboardBridgeCommand } from "@adapters/pi/piAboardBridge";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("A board Raspberry Pi serial bridge client", () => {
  it("builds the bridge base URL from a Pi host", () => {
    expect(buildAboardBridgeBaseUrl("raspberrypi.local")).toBe("http://raspberrypi.local:17353");
    expect(buildAboardBridgeBaseUrl("http://192.168.1.4:17353/")).toBe("http://192.168.1.4:17353");
  });

  it("checks bridge health", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ ok: true, serialPort: "/dev/ttyAMA5", baudRate: 115200 }));

    await expect(checkAboardBridge("pi.local", { fetcher: fetcher as unknown as typeof fetch })).resolves.toEqual({
      ok: true,
      serialPort: "/dev/ttyAMA5",
      baudRate: 115200
    });
    expect(fetcher).toHaveBeenCalledWith("http://pi.local:17353/health", undefined);
  });

  it("rejects the old serial0 A board bridge because the servo HAT owns pins 6/8/10", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ ok: true, serialPort: "/dev/serial0", baudRate: 115200 }));

    await expect(checkAboardBridge("pi.local", { fetcher: fetcher as unknown as typeof fetch })).rejects.toThrow(
      "expected /dev/ttyAMA5"
    );
  });

  it("builds a persistent systemd service install command", () => {
    const command = buildAboardBridgeServiceCommand({
      password: "oct",
      remotePath: "/home/robot1/rescue-robot/a_board_serial_bridge.py",
      username: "robot1",
      workspaceDir: "/home/robot1/rescue-robot"
    });

    expect(command).toContain("a-board-serial-bridge.service");
    expect(command).toContain("Description=RoboMaster A board serial HTTP bridge");
    expect(command).toContain("User=robot1");
    expect(command).toContain("Environment=A_BOARD_SERIAL_PORT=/dev/ttyAMA5");
    expect(command).toContain("boot_config='/boot/firmware/config.txt'");
    expect(command).toContain("dtoverlay=uart5");
    expect(command).toContain("sudo -n dtoverlay uart5");
    expect(command).toContain("reboot Raspberry Pi after dtoverlay=uart5");
    expect(command).toContain("Environment=A_BOARD_BAUD=115200");
    expect(command).toContain("Environment=A_BOARD_BRIDGE_HOST=0.0.0.0");
    expect(command).toContain("Environment=A_BOARD_BRIDGE_PORT=17353");
    expect(command).toContain("ExecStart=/usr/bin/python3 /home/robot1/rescue-robot/a_board_serial_bridge.py");
    expect(command).toContain("Restart=always");
    expect(command).toContain("sudo -n systemctl enable --now 'a-board-serial-bridge.service'");
    expect(command).toContain("a_board_bridge_service:active");
  });

  it("sends a command and preserves encoder feedback messages", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        ok: true,
        messages: [
          { type: "ack", seq: 42, command: "motor.read" },
          { type: "motor.feedback", seq: 42, channel: "M1", encoderTicks: 128, pulseHz: 32, encoderA: 1, encoderB: 0, encoderDelta: 2, encoderDirection: "forward", sampleMs: 4096 }
        ]
      })
    );

    await expect(sendAboardBridgeCommand("pi.local", { type: "motor.read", seq: 42, channel: "M1" }, { fetcher: fetcher as unknown as typeof fetch })).resolves.toEqual({
      ok: true,
      messages: [
        { type: "ack", seq: 42, command: "motor.read" },
        { type: "motor.feedback", seq: 42, channel: "M1", encoderTicks: 128, pulseHz: 32, encoderA: 1, encoderB: 0, encoderDelta: 2, encoderDirection: "forward", sampleMs: 4096 }
      ],
      serialPort: undefined,
      baudRate: undefined
    });

    const init = (fetcher.mock.calls as unknown as Array<[string, RequestInit]>)[0][1];
    expect(fetcher).toHaveBeenCalledWith("http://pi.local:17353/command", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(String(init.body))).toEqual({ command: { type: "motor.read", seq: 42, channel: "M1" } });
  });

  it("sends IMU commands and preserves attitude sensor feedback", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        ok: true,
        messages: [
          {
            type: "imu.feedback",
            seq: 77,
            ready: true,
            mpuWhoAmI: 112,
            istWhoAmI: 16,
            accelRaw: { x: 0, y: 0, z: 4096 },
            gyroRaw: { x: 10, y: -20, z: 30 },
            magRaw: { x: 101, y: 202, z: -303 },
            tempRaw: 512,
            sampleMs: 9000
          }
        ]
      })
    );

    await expect(sendAboardBridgeCommand("pi.local", { type: "imu.read", seq: 77 }, { fetcher: fetcher as unknown as typeof fetch })).resolves.toEqual({
      ok: true,
      messages: [
        {
          type: "imu.feedback",
          seq: 77,
          ready: true,
          mpuWhoAmI: 112,
          istWhoAmI: 16,
          accelRaw: { x: 0, y: 0, z: 4096 },
          gyroRaw: { x: 10, y: -20, z: 30 },
          magRaw: { x: 101, y: 202, z: -303 },
          tempRaw: 512,
          sampleMs: 9000
        }
      ],
      serialPort: undefined,
      baudRate: undefined
    });
  });
});
