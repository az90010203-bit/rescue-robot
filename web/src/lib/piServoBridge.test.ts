import { describe, expect, it, vi } from "vitest";
import { buildPiServoBridgeBaseUrl, buildPiServoBridgeServiceCommand, checkPiServoBridge, sendPiServoBridgeFrame } from "./piServoBridge";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("Pi servo serial bridge client", () => {
  it("builds the bridge base URL from a Pi host", () => {
    expect(buildPiServoBridgeBaseUrl("raspberrypi.local")).toBe("http://raspberrypi.local:17354");
    expect(buildPiServoBridgeBaseUrl("http://192.168.1.4:17354/")).toBe("http://192.168.1.4:17354");
  });

  it("checks bridge health", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ ok: true, serialPort: "/dev/serial0", baudRate: 115200 }));

    await expect(checkPiServoBridge("pi.local", { fetcher: fetcher as unknown as typeof fetch })).resolves.toEqual({
      ok: true,
      serialPort: "/dev/serial0",
      baudRate: 115200
    });
    expect(fetcher).toHaveBeenCalledWith("http://pi.local:17354/health", undefined);
  });

  it("builds a persistent systemd service install command and protects serial0 from the A board bridge", () => {
    const command = buildPiServoBridgeServiceCommand({
      password: "oct",
      remotePath: "/home/robot1/rescue-robot/pi_servo_serial_bridge.py",
      username: "robot1",
      workspaceDir: "/home/robot1/rescue-robot"
    });

    expect(command).toContain("pi-servo-serial-bridge.service");
    expect(command).toContain("Description=Rescue Robot Pi Feetech servo serial HTTP bridge");
    expect(command).toContain("User=robot1");
    expect(command).toContain("Environment=PI_SERVO_SERIAL_PORT=/dev/serial0");
    expect(command).toContain("Environment=PI_SERVO_BAUD=115200");
    expect(command).toContain("Environment=PI_SERVO_BRIDGE_PORT=17354");
    expect(command).toContain("enable_uart=1");
    expect(command).toContain("A_BOARD_SERIAL_PORT=/dev/serial0");
    expect(command).toContain("legacy_a_board_serial0:disabled");
    expect(command).toContain("sudo -n systemctl enable --now 'pi-servo-serial-bridge.service'");
    expect(command).toContain("pi_servo_bridge_service:active");
  });

  it("sends a Feetech frame and preserves raw bytes plus parsed packet", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        ok: true,
        rxBytes: [0xff, 0xff, 1, 2, 0, 0xfc],
        serialPort: "/dev/serial0",
        baudRate: 115200
      })
    );

    await expect(sendPiServoBridgeFrame("pi.local", [0xff, 0xff, 1, 2, 1, 0xfb], { fetcher: fetcher as unknown as typeof fetch, waitMs: 140 })).resolves.toEqual({
      ok: true,
      rxBytes: [0xff, 0xff, 1, 2, 0, 0xfc],
      packet: { id: 1, status: 0, params: [], checksum: 0xfc },
      serialPort: "/dev/serial0",
      baudRate: 115200
    });

    const init = (fetcher.mock.calls as unknown as Array<[string, RequestInit]>)[0][1];
    expect(fetcher).toHaveBeenCalledWith("http://pi.local:17354/frame", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(String(init.body))).toEqual({ frame: [0xff, 0xff, 1, 2, 1, 0xfb], waitMs: 140 });
  });
});
