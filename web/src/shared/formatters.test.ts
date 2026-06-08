import { describe, expect, it } from "vitest";
import { formatAngle, formatHexByte, formatScalarValue, formatVector3, metricNumber, metricNumberText } from "./formatters";

describe("shared formatters", () => {
  it("formats metric numbers for dashboard and app contexts", () => {
    expect(metricNumber(12.345, 1)).toBe(12.3);
    expect(metricNumber(undefined)).toBe("--");
    expect(metricNumberText(12.345, 2)).toBe("12.35");
    expect(metricNumberText(Number.NaN)).toBeUndefined();
  });

  it("formats angles, vectors, and hex bytes", () => {
    expect(formatAngle(4.567)).toBe("4.6");
    expect(formatAngle(null)).toBe("--");
    expect(formatVector3({ x: 1.2, y: -2.4, z: 3.6 })).toBe("1 / -2 / 4");
    expect(formatVector3({ x: 1.23, y: -2.34, z: 3.45 }, 1)).toBe("1.2 / -2.3 / 3.5");
    expect(formatHexByte(10)).toBe("0x0A");
    expect(formatHexByte(undefined)).toBe("--");
  });

  it("formats scalar values with optional boolean labels", () => {
    expect(formatScalarValue("COM6")).toBe("COM6");
    expect(formatScalarValue(42)).toBe("42");
    expect(formatScalarValue(true)).toBe("yes");
    expect(formatScalarValue(false, { falseLabel: "否", trueLabel: "是" })).toBe("否");
    expect(formatScalarValue(null)).toBe("--");
  });
});
