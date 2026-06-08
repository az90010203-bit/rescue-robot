export interface Vector3Like {
  x: number;
  y: number;
  z: number;
}

export function metricNumber(value: number | null | undefined, digits = 1, fallback: string | number = "--"): string | number {
  return value === null || value === undefined || !Number.isFinite(value) ? fallback : Number(value.toFixed(digits));
}

export function metricNumberText(value: number | null | undefined, digits = 1): string | undefined {
  return value === null || value === undefined || !Number.isFinite(value) ? undefined : value.toFixed(digits);
}

export function formatAngle(value: number | null | undefined, digits = 1, fallback = "--"): string {
  return value === null || value === undefined || !Number.isFinite(value) ? fallback : value.toFixed(digits);
}

export function formatVector3(value: Vector3Like | null | undefined, digits = 0, fallback = "--"): string {
  if (!value) {
    return fallback;
  }
  return `${value.x.toFixed(digits)} / ${value.y.toFixed(digits)} / ${value.z.toFixed(digits)}`;
}

export function formatHexByte(value: number | null | undefined, fallback = "--"): string {
  return value === null || value === undefined || !Number.isFinite(value) ? fallback : `0x${value.toString(16).toUpperCase().padStart(2, "0")}`;
}

export function formatScalarValue(
  value: string | number | boolean | null | undefined,
  options: { falseLabel?: string; fallback?: string; trueLabel?: string } = {}
): string {
  if (value === null || value === undefined || value === "") {
    return options.fallback ?? "--";
  }
  if (typeof value === "boolean") {
    return value ? options.trueLabel ?? "yes" : options.falseLabel ?? "no";
  }
  return String(value);
}
