export function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function finiteNumber(value: unknown, fallback: number): number {
  if (typeof value === "number") {
    return Number.isFinite(value) ? value : fallback;
  }
  if (typeof value === "string" && value.trim()) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
  }
  return fallback;
}

export function integerInRange(value: unknown, min: number, max: number, fallback: number): number {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : fallback;
  return Number.isInteger(number) ? clampNumber(number, min, max) : fallback;
}

export function roundedIntegerInRange(value: unknown, min: number, max: number, fallback: number): number {
  const number = finiteNumber(value, fallback);
  return Math.round(clampNumber(number, min, max));
}

export function positiveNumber(value: unknown, fallback: number, options: { allowZero?: boolean } = {}): number {
  const number = typeof value === "number" && Number.isFinite(value) ? value : fallback;
  return options.allowZero ? (number >= 0 ? number : fallback) : (number > 0 ? number : fallback);
}

export function nonEmptyString(value: unknown, fallback: string): string {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function optionalString(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

export function errorMessage(error: unknown, fallback = "unknown error"): string {
  return error instanceof Error && error.message ? error.message : fallback;
}
