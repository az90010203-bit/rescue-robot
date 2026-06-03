import { describe, expect, it, vi } from "vitest";
import {
  compileFirmware,
  isFirmwareUploadError,
  listFirmwarePorts,
  normalizeFirmwarePorts,
  requestFirmwareHealth,
  uploadFirmware
} from "./firmwareUpload";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("firmware upload client", () => {
  it("reports the local helper as unavailable when fetch fails", async () => {
    const fetcher = vi.fn(async () => {
      throw new Error("connection refused");
    });

    await expect(listFirmwarePorts({ fetcher: fetcher as unknown as typeof fetch })).rejects.toMatchObject({
      code: "helperUnavailable",
      message: "connection refused"
    });
  });

  it("normalizes firmware port lists", () => {
    expect(
      normalizeFirmwarePorts([
        { path: "COM6", description: "Arduino Uno", hwid: "USB VID:PID=2341:0043" },
        { port: "/dev/ttyACM0", description: "Nano" },
        { description: "missing path" },
        null
      ])
    ).toEqual([
      { path: "COM6", description: "Arduino Uno", hwid: "USB VID:PID=2341:0043" },
      { path: "/dev/ttyACM0", description: "Nano", hwid: "" }
    ]);
  });

  it("reads helper health and filters unsupported boards", async () => {
    const fetcher = vi.fn(async () =>
      jsonResponse({
        ok: true,
        pioAvailable: true,
        pioPath: "C:/Users/example/.platformio/penv/Scripts/pio.exe",
        boards: [
          { id: "arduino-uno", label: "Arduino Uno", board: "uno" },
          { id: "unsupported", label: "Other", board: "other" }
        ]
      })
    );

    await expect(requestFirmwareHealth({ fetcher: fetcher as unknown as typeof fetch })).resolves.toEqual({
      ok: true,
      pioAvailable: true,
      pioPath: "C:/Users/example/.platformio/penv/Scripts/pio.exe",
      boards: [{ id: "arduino-uno", label: "Arduino Uno", board: "uno" }]
    });
  });

  it("compiles firmware and preserves returned logs", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ jobId: "job-1", hexSizeBytes: 1234, logs: "SUCCESS" }));

    await expect(compileFirmware({ board: "arduino-uno", source: "void setup(){}" }, { fetcher: fetcher as unknown as typeof fetch })).resolves.toEqual({
      jobId: "job-1",
      hexSizeBytes: 1234,
      logs: "SUCCESS"
    });
    expect(fetcher).toHaveBeenCalledWith(
      "http://127.0.0.1:17350/compile",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ board: "arduino-uno", source: "void setup(){}" })
      })
    );
  });

  it("exposes compile failures with helper logs", async () => {
    const fetcher = vi.fn(async () => jsonResponse({ error: "compile failed", logs: "missing semicolon" }, 500));

    try {
      await compileFirmware({ board: "arduino-uno", source: "broken" }, { fetcher: fetcher as unknown as typeof fetch });
      throw new Error("expected compile to fail");
    } catch (error) {
      expect(isFirmwareUploadError(error)).toBe(true);
      expect(error).toMatchObject({
        code: "requestFailed",
        message: "compile failed",
        logs: "missing semicolon"
      });
    }
  });

  it("uploads a compiled firmware job and exposes upload failures", async () => {
    const successFetcher = vi.fn(async () => jsonResponse({ ok: true, logs: "Uploaded" }));
    await expect(uploadFirmware({ jobId: "job-1", port: "COM6" }, { fetcher: successFetcher as unknown as typeof fetch })).resolves.toEqual({ ok: true, logs: "Uploaded" });

    const failureFetcher = vi.fn(async () => jsonResponse({ error: "upload failed", logs: "programmer is not responding" }, 500));
    await expect(uploadFirmware({ jobId: "job-1", port: "COM6" }, { fetcher: failureFetcher as unknown as typeof fetch })).rejects.toMatchObject({
      code: "requestFailed",
      message: "upload failed",
      logs: "programmer is not responding"
    });
  });
});
