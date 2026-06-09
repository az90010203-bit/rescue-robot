import { describe, expect, it } from "vitest";
import { normalizeAiVisionDetection } from "@domains/ai-vision/aiVision";

describe("ai vision contract", () => {
  it("normalizes detection boxes and centers", () => {
    expect(normalizeAiVisionDetection({
      label: "competition_mannequin",
      confidence: 1.4,
      bbox: { x: 0.8, y: -0.2, width: 0.4, height: 0.5 },
      sourceId: "main",
      frameTimestamp: 100
    })).toEqual({
      label: "competition_mannequin",
      confidence: 1,
      bbox: { x: 0.8, y: 0, width: 0.19999999999999996, height: 0.5 },
      center: { x: 0.9, y: 0.25 },
      sourceId: "main",
      frameTimestamp: 100
    });
  });

  it("falls back to the shared competition mannequin label", () => {
    const detection = normalizeAiVisionDetection({
      confidence: 0.5,
      bbox: { x: 0.1, y: 0.2, width: 0.3, height: 0.4 }
    }, "secondary");

    expect(detection.label).toBe("competition_mannequin");
    expect(detection.sourceId).toBe("secondary");
    expect(detection.center).toEqual({ x: 0.25, y: 0.4 });
  });
});
