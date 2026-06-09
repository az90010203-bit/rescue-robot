import { describe, expect, it } from "vitest";
import { shouldAutoRestorePiConnection } from "@adapters/pi/usePiRemote";

describe("Pi remote auto restore", () => {
  it("restores only when saved credentials are ready and no check is running", () => {
    expect(
      shouldAutoRestorePiConnection({
        attempted: false,
        busy: false,
        connectionReady: true,
        enabled: true
      })
    ).toBe(true);
  });

  it("does not restore without a saved profile, credentials, or while busy", () => {
    expect(
      shouldAutoRestorePiConnection({
        attempted: false,
        busy: false,
        connectionReady: true,
        enabled: false
      })
    ).toBe(false);
    expect(
      shouldAutoRestorePiConnection({
        attempted: false,
        busy: false,
        connectionReady: false,
        enabled: true
      })
    ).toBe(false);
    expect(
      shouldAutoRestorePiConnection({
        attempted: false,
        busy: true,
        connectionReady: true,
        enabled: true
      })
    ).toBe(false);
  });

  it("does not repeat an already attempted restore", () => {
    expect(
      shouldAutoRestorePiConnection({
        attempted: true,
        busy: false,
        connectionReady: true,
        enabled: true
      })
    ).toBe(false);
  });
});
