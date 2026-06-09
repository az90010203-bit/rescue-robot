import { describe, expect, it, vi } from "vitest";
import { buildPiServoBridgeBaseUrl, buildPiServoBridgeServiceCommand, checkPiServoBridge, requestPiServoBridgeDiagnostics, sendPiServoBridgeFrame } from "@adapters/pi/piServoBridge";

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
    const fetcher = vi.fn(async () =>
      jsonResponse({
        ok: true,
        service: "pi-servo-serial-bridge",
        version: "0.1.0",
        serialPort: "/dev/serial0",
        baudRate: 115200,
        queueDepth: 0,
        inFlight: false,
        serialOpen: true,
        deviceExists: true,
        lastSerialEvent: { kind: "opened", deviceExists: true },
        consecutiveOpenFailures: 0,
        diagnosticsPath: "/diagnostics"
      })
    );

    await expect(checkPiServoBridge("pi.local", { fetcher: fetcher as unknown as typeof fetch })).resolves.toEqual({
      ok: true,
      serialPort: "/dev/serial0",
      baudRate: 115200,
      service: "pi-servo-serial-bridge",
      version: "0.1.0",
      queueDepth: 0,
      inFlight: false,
      serialOpen: true,
      deviceExists: true,
      lastSerialEvent: { kind: "opened", deviceExists: true },
      consecutiveOpenFailures: 0,
      diagnosticsPath: "/diagnostics"
    });
    expect(fetcher).toHaveBeenCalledWith("http://pi.local:17354/health", undefined);
  });

  it("reads serial diagnostics events", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        ok: true,
        service: "pi-servo-serial-bridge",
        serialPort: "/dev/serial0",
        baudRate: 115200,
        serialOpen: false,
        deviceExists: false,
        lastCloseReason: "request_failed",
        lastException: { type: "OSError", errno: 5, message: "Input/output error" },
        consecutiveOpenFailures: 2,
        device: { path: "/dev/serial0", exists: false, realpath: "/dev/ttyAMA0" },
        events: [
          { kind: "request_failed", requestId: 12, exception: { type: "OSError", errno: 5, message: "Input/output error" } },
          { kind: "device_missing", deviceExists: false }
        ]
      })
    );

    await expect(requestPiServoBridgeDiagnostics("pi.local", { fetcher: fetcher as unknown as typeof fetch })).resolves.toMatchObject({
      ok: true,
      serialPort: "/dev/serial0",
      serialOpen: false,
      deviceExists: false,
      lastCloseReason: "request_failed",
      lastException: { type: "OSError", errno: 5 },
      consecutiveOpenFailures: 2,
      device: { exists: false },
      events: [
        { kind: "request_failed", requestId: 12 },
        { kind: "device_missing", deviceExists: false }
      ]
    });
    expect(fetcher).toHaveBeenCalledWith("http://pi.local:17354/diagnostics", undefined);
  });

  it("keeps health metadata when the Pi service is online but serial0 is unavailable", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        ok: false,
        service: "pi-servo-serial-bridge",
        version: "0.1.0",
        serialPort: "/dev/serial0",
        baudRate: 115200,
        serialOpen: false
      })
    );

    await expect(checkPiServoBridge("pi.local", { fetcher: fetcher as unknown as typeof fetch })).resolves.toEqual({
      ok: false,
      service: "pi-servo-serial-bridge",
      version: "0.1.0",
      serialPort: "/dev/serial0",
      baudRate: 115200,
      serialOpen: false
    });
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

  it("sends live latest metadata for coalesced servo frames", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        ok: true,
        rxBytes: [],
        responseExpected: false,
        skipped: true,
        reason: "stale"
      })
    );

    await expect(
      sendPiServoBridgeFrame("pi.local", [0xff, 0xff, 7, 4, 3, 0x2a, 0, 0xc7], {
        fetcher: fetcher as unknown as typeof fetch,
        waitMs: 12,
        policy: "latest",
        coalesceKey: "servo:7:position",
        minIntervalMs: 40,
        ackDrainMs: 4
      })
    ).resolves.toMatchObject({
      ok: true,
      rxBytes: [],
      packet: null,
      responseExpected: false,
      skipped: true,
      reason: "stale"
    });

    const init = (fetcher.mock.calls as unknown as Array<[string, RequestInit]>)[0][1];
    expect(JSON.parse(String(init.body))).toEqual({
      frame: [0xff, 0xff, 7, 4, 3, 0x2a, 0, 0xc7],
      waitMs: 12,
      policy: "latest",
      coalesceKey: "servo:7:position",
      minIntervalMs: 40,
      ackDrainMs: 4
    });
  });

  it("selects the target packet when stale servo bytes precede the response", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        ok: true,
        rxBytes: [
          0xff, 0xff, 10, 2, 0, 0xf3,
          0xff, 0xff, 9, 2, 0, 0xf4
        ]
      })
    );

    await expect(sendPiServoBridgeFrame("pi.local", [0xff, 0xff, 9, 2, 1, 0xf3], { fetcher: fetcher as unknown as typeof fetch, waitMs: 140 })).resolves.toMatchObject({
      ok: true,
      packet: { id: 9, status: 0, params: [], checksum: 0xf4 }
    });
  });

  it("prefers a read packet over a stale same-id write ack", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        ok: true,
        rxBytes: [
          0xff, 0xff, 9, 2, 0, 0xf4,
          0xff, 0xff, 9, 17, 0, 71, 8, 0, 0, 8, 0, 119, 26, 0, 0, 0, 68, 8, 0, 0, 177
        ]
      })
    );

    await expect(sendPiServoBridgeFrame("pi.local", [0xff, 0xff, 9, 4, 2, 0x38, 0x0f, 0xa9], { fetcher: fetcher as unknown as typeof fetch, waitMs: 180 })).resolves.toMatchObject({
      ok: true,
      packet: { id: 9, status: 0, params: expect.arrayContaining([71, 8]) }
    });
  });

  it("preserves bridge response expectation metadata for no-reply write frames", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        ok: true,
        rxBytes: [],
        responseExpected: false,
        serialPort: "/dev/serial0",
        baudRate: 115200
      })
    );

    await expect(sendPiServoBridgeFrame("pi.local", [0xff, 0xff, 1, 4, 3, 0x28, 0, 0xd3], { fetcher: fetcher as unknown as typeof fetch, waitMs: 80 })).resolves.toEqual({
      ok: true,
      rxBytes: [],
      packet: null,
      responseExpected: false,
      serialPort: "/dev/serial0",
      baudRate: 115200
    });
  });

  it("times out stalled frame requests so reconnect can recover the queue", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              const error = new Error("Aborted");
              error.name = "AbortError";
              reject(error);
            });
          })
      );

      const request = sendPiServoBridgeFrame("pi.local", [0xff, 0xff, 1, 2, 1, 0xfb], {
        fetcher: fetcher as unknown as typeof fetch,
        timeoutMs: 25,
        waitMs: 80
      });
      const expectation = expect(request).rejects.toThrow("Pi servo serial bridge timed out after 25ms");
      await vi.advanceTimersByTimeAsync(25);

      await expectation;
    } finally {
      vi.useRealTimers();
    }
  });

  it("keeps the default frame timeout behind the bridge worker wait margin", async () => {
    vi.useFakeTimers();
    try {
      const fetcher = vi.fn(
        (_url: string, init?: RequestInit) =>
          new Promise<Response>((_resolve, reject) => {
            init?.signal?.addEventListener("abort", () => {
              const error = new Error("Aborted");
              error.name = "AbortError";
              reject(error);
            });
          })
      );

      const request = sendPiServoBridgeFrame("pi.local", [0xff, 0xff, 1, 4, 2, 0x38, 0x0f, 0xa9], {
        fetcher: fetcher as unknown as typeof fetch,
        waitMs: 180
      });
      let settled = false;
      const observed = request.catch((error) => {
        settled = true;
        throw error;
      });

      await vi.advanceTimersByTimeAsync(1200);
      expect(settled).toBe(false);

      const expectation = expect(observed).rejects.toThrow("Pi servo serial bridge timed out after 3000ms");
      await vi.advanceTimersByTimeAsync(1800);
      await expectation;
    } finally {
      vi.useRealTimers();
    }
  });
});
