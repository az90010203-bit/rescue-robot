import { describe, expect, it } from "vitest";
import { driveCommandSignature, runtimeValuesMatch, stableRuntimeSignature } from "@app/useAppRuntimeEffects";

describe("runtime effect helpers", () => {
  it("creates stable signatures for equivalent objects with different key order", () => {
    const left = stableRuntimeSignature({
      name: "drive",
      config: { speedPercent: 30, channel: "M1" }
    });
    const right = stableRuntimeSignature({
      config: { channel: "M1", speedPercent: 30 },
      name: "drive"
    });

    expect(left).toBe(right);
    expect(runtimeValuesMatch({ b: 2, a: 1 }, { a: 1, b: 2 })).toBe(true);
  });

  it("keeps drive command signatures stable while preserving target order", () => {
    const first = driveCommandSignature("brake", [
      { channel: "M1", speedPercent: 40 },
      { channel: "M2", speedPercent: -40 }
    ]);
    const same = driveCommandSignature("brake", [
      { speedPercent: 40, channel: "M1" },
      { speedPercent: -40, channel: "M2" }
    ]);
    const reversed = driveCommandSignature("brake", [
      { channel: "M2", speedPercent: -40 },
      { channel: "M1", speedPercent: 40 }
    ]);

    expect(first).toBe(same);
    expect(first).not.toBe(reversed);
  });
});
