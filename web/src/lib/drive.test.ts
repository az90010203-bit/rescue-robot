import { describe, expect, it } from "vitest";
import { DEFAULT_DRIVE_CHANNELS, mixMecanumDrive, mixTrackedDrive } from "./drive";

describe("tracked drive mixer", () => {
  it("drives both tracks forward and backward", () => {
    expect(mixTrackedDrive({ forward: 1, turn: 0 })).toEqual([
      { channel: "M1", speedPercent: 100 },
      { channel: "M2", speedPercent: 100 }
    ]);

    expect(mixTrackedDrive({ forward: -0.5, turn: 0 })).toEqual([
      { channel: "M1", speedPercent: -50 },
      { channel: "M2", speedPercent: -50 }
    ]);
  });

  it("turns by opposing track speeds and normalizes combined input", () => {
    expect(mixTrackedDrive({ forward: 0, turn: 1 })).toEqual([
      { channel: "M1", speedPercent: 100 },
      { channel: "M2", speedPercent: -100 }
    ]);

    expect(mixTrackedDrive({ forward: 1, turn: 1 }, { speedLimitPercent: 80 })).toEqual([
      { channel: "M1", speedPercent: 80 },
      { channel: "M2", speedPercent: 0 }
    ]);
  });

  it("supports reversed motor directions", () => {
    expect(mixTrackedDrive({ forward: 1, turn: 0 }, { directions: { rightTrack: -1 } })).toEqual([
      { channel: "M1", speedPercent: 100 },
      { channel: "M2", speedPercent: -100 }
    ]);
  });
});

describe("mecanum drive mixer", () => {
  it("drives all mecanum wheels forward", () => {
    expect(mixMecanumDrive({ forward: 1, strafe: 0, turn: 0 })).toEqual([
      { channel: "M3", speedPercent: 100 },
      { channel: "M4", speedPercent: 100 },
      { channel: "M5", speedPercent: 100 },
      { channel: "M6", speedPercent: 100 }
    ]);
  });

  it("strafes sideways", () => {
    expect(mixMecanumDrive({ forward: 0, strafe: 1, turn: 0 })).toEqual([
      { channel: "M3", speedPercent: 100 },
      { channel: "M4", speedPercent: -100 },
      { channel: "M5", speedPercent: -100 },
      { channel: "M6", speedPercent: 100 }
    ]);
  });

  it("rotates in place", () => {
    expect(mixMecanumDrive({ forward: 0, strafe: 0, turn: 1 })).toEqual([
      { channel: "M3", speedPercent: 100 },
      { channel: "M4", speedPercent: -100 },
      { channel: "M5", speedPercent: 100 },
      { channel: "M6", speedPercent: -100 }
    ]);
  });

  it("normalizes diagonal and rotational commands", () => {
    expect(mixMecanumDrive({ forward: 1, strafe: 1, turn: 1 }, { speedLimitPercent: 60 })).toEqual([
      { channel: "M3", speedPercent: 60 },
      { channel: "M4", speedPercent: -20 },
      { channel: "M5", speedPercent: 20 },
      { channel: "M6", speedPercent: 20 }
    ]);
  });

  it("supports custom channels and reversed wheel directions", () => {
    expect(
      mixMecanumDrive(
        { forward: 1, strafe: 0, turn: 0 },
        {
          channels: { ...DEFAULT_DRIVE_CHANNELS, frontLeft: "x1" },
          directions: { frontLeft: -1, rearRight: -1 }
        }
      )
    ).toEqual([
      { channel: "X1", speedPercent: -100 },
      { channel: "M4", speedPercent: 100 },
      { channel: "M5", speedPercent: 100 },
      { channel: "M6", speedPercent: -100 }
    ]);
  });
});
