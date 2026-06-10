import { describe, expect, it, vi } from "vitest";
import { buildAboardBridgeBaseUrl, buildAboardBridgeServiceCommand, checkAboardBridge, requestAboardBridgeDiagnostics, sendAboardBridgeCommand } from "@adapters/pi/piAboardBridge";

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
    const fetcher = vi.fn(async () =>
      jsonResponse({
        ok: true,
        service: "a-board-serial-bridge",
        version: "0.1.0",
        serialPort: "/dev/ttyAMA5",
        baudRate: 115200,
        queueDepth: 0,
        inFlight: false,
        motionPending: false,
        latestMotionSeq: 18,
        droppedMotionCount: 3,
        activeCommand: null,
        canServoReady: true,
        mecanumReady: true,
        serialOpen: true,
        deviceExists: true,
        lastSerialEvent: { kind: "opened", deviceExists: true },
        consecutiveOpenFailures: 0,
        diagnosticsPath: "/diagnostics",
        serialProtocolMode: "auto",
        serialProtocolActive: "binary",
        binaryProtocolReady: true,
        bytesIn: 120,
        bytesOut: 64,
        framesIn: 4,
        framesOut: 3,
        crcError: 0,
        cobsError: 0,
        dropCount: 3,
        lastAckMs: 1700000000000,
        lastFrameMs: 1700000000123,
        binaryFallbackCount: 1
      })
    );

    await expect(checkAboardBridge("pi.local", { fetcher: fetcher as unknown as typeof fetch })).resolves.toEqual({
      ok: true,
      serialPort: "/dev/ttyAMA5",
      baudRate: 115200,
      service: "a-board-serial-bridge",
      version: "0.1.0",
      queueDepth: 0,
      inFlight: false,
      busy: false,
      motionPending: false,
      latestMotionSeq: 18,
      droppedMotionCount: 3,
      activeCommand: null,
      canServoReady: true,
      mecanumReady: true,
      serialOpen: true,
      deviceExists: true,
      lastSerialEvent: { kind: "opened", deviceExists: true },
      consecutiveOpenFailures: 0,
      diagnosticsPath: "/diagnostics",
      serialProtocolMode: "auto",
      serialProtocolActive: "binary",
      binaryProtocolReady: true,
      bytesIn: 120,
      bytesOut: 64,
      framesIn: 4,
      framesOut: 3,
      crcError: 0,
      cobsError: 0,
      dropCount: 3,
      lastAckMs: 1700000000000,
      lastFrameMs: 1700000000123,
      binaryFallbackCount: 1
    });
    expect(fetcher).toHaveBeenCalledWith("http://pi.local:17353/health", undefined);
  });

  it("reads serial diagnostics events", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        ok: true,
        service: "a-board-serial-bridge",
        serialPort: "/dev/ttyAMA5",
        baudRate: 115200,
        serialOpen: false,
        busy: false,
        deviceExists: true,
        lastCloseReason: "request_failed",
        lastException: { type: "OSError", errno: 5, message: "Input/output error" },
        consecutiveOpenFailures: 1,
        serialProtocolMode: "auto",
        serialProtocolActive: "json",
        binaryProtocolReady: false,
        crcError: 2,
        cobsError: 1,
        binaryFallbackCount: 4,
        device: { path: "/dev/ttyAMA5", exists: true, realpath: "/dev/ttyAMA5" },
        events: [
          { kind: "no_matching_response", requestId: 4, seq: 18, commandType: "imu.read" },
          { kind: "closed", reason: "request_failed" }
        ]
      })
    );

    await expect(requestAboardBridgeDiagnostics("pi.local", { fetcher: fetcher as unknown as typeof fetch })).resolves.toMatchObject({
      ok: true,
      serialPort: "/dev/ttyAMA5",
      serialOpen: false,
      busy: false,
      deviceExists: true,
      lastCloseReason: "request_failed",
      lastException: { type: "OSError", errno: 5 },
      consecutiveOpenFailures: 1,
      serialProtocolMode: "auto",
      serialProtocolActive: "json",
      binaryProtocolReady: false,
      crcError: 2,
      cobsError: 1,
      binaryFallbackCount: 4,
      device: { exists: true },
      events: [
        { kind: "no_matching_response", requestId: 4, seq: 18 },
        { kind: "closed", reason: "request_failed" }
      ]
    });
    expect(fetcher).toHaveBeenCalledWith("http://pi.local:17353/diagnostics", undefined);
  });

  it("keeps health metadata when the Pi service is online but UART5 is unavailable", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        ok: false,
        service: "a-board-serial-bridge",
        version: "0.1.0",
        serialPort: "/dev/ttyAMA5",
        baudRate: 115200,
        serialOpen: false
      })
    );

    await expect(checkAboardBridge("pi.local", { fetcher: fetcher as unknown as typeof fetch })).resolves.toEqual({
      ok: false,
      service: "a-board-serial-bridge",
      version: "0.1.0",
      serialPort: "/dev/ttyAMA5",
      baudRate: 115200,
      busy: false,
      serialOpen: false
    });
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
    expect(command).toContain("Environment=A_BOARD_SERIAL_PROTOCOL=auto");
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
        serialProtocolMode: "auto",
        serialProtocolActive: "binary",
        binaryProtocolReady: true,
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
      baudRate: undefined,
      serialProtocolMode: "auto",
      serialProtocolActive: "binary",
      binaryProtocolReady: true
    });

    const init = (fetcher.mock.calls as unknown as Array<[string, RequestInit]>)[0][1];
    expect(fetcher).toHaveBeenCalledWith("http://pi.local:17353/command", expect.objectContaining({ method: "POST" }));
    expect(JSON.parse(String(init.body))).toEqual({ command: { type: "motor.read", seq: 42, channel: "M1" } });
  });

  it("preserves busy command responses and sends request timeout metadata", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        ok: false,
        busy: true,
        accepted: false,
        messages: [],
        serialPort: "/dev/ttyAMA5",
        baudRate: 115200,
        queueDepth: 1,
        inFlight: true
      })
    );

    await expect(
      sendAboardBridgeCommand("pi.local", { type: "motor.set", seq: 43, channel: "M1", speedPercent: 20 }, { fetcher: fetcher as unknown as typeof fetch, timeoutMs: 700 })
    ).resolves.toEqual({
      ok: false,
      messages: [],
      busy: true,
      accepted: false,
      queueDepth: 1,
      inFlight: true,
      serialPort: "/dev/ttyAMA5",
      baudRate: 115200
    });

    const init = (fetcher.mock.calls as unknown as Array<[string, RequestInit]>)[0][1];
    expect(JSON.parse(String(init.body))).toEqual({
      command: { type: "motor.set", seq: 43, channel: "M1", speedPercent: 20 },
      timeoutMs: 700
    });
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
