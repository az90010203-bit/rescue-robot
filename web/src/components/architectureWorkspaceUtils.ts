import {
  BUILTIN_DEVICE_CATALOG_ITEMS,
  type DeviceCatalogItem,
  type DeviceCodeLibraryItem,
  type DeviceConfig,
  type DeviceConfigField,
  type DriverLibraryItem,
  type PluginInstance
} from "../platform/architecture";
import type { UiControlSchema } from "../platform/types";
import type { MotorStopMode } from "../lib/protocol";

export type ArchitectureDraftValues = Record<string, string | number | boolean | null>;
export type ArchitectureMetricTone = "neutral" | "online" | "warning" | "danger";

export type PluginDebugDraft = {
  mode: "position" | "wheel";
  angleDeg: string;
  newServoId: string;
  confirmSingleServo: boolean;
  speedRaw: string;
  acc: string;
  liveDragEnabled: boolean;
  reverse: boolean;
  minDeg: string;
  maxDeg: string;
  resetDeg: string;
  motorSpeedPercent: string;
  stopMode: MotorStopMode;
  pwmPin: string;
  in1Pin: string;
  in2Pin: string;
  enablePin: string;
  sensorPin: string;
};

export type ServoSetIdStepLog = {
  label: string;
  tx: string;
  rx: string | null;
  status: number | null;
};

export type ServoSetIdCommandResponse = {
  ok: boolean;
  oldId: number;
  newId: number;
  stage: string;
  steps: ServoSetIdStepLog[];
};

export function customCatalogDraft(library: DeviceCodeLibraryItem, brand: string, model: string, template: DeviceCatalogItem | null): DeviceCatalogItem {
  const fallback =
    template ??
    BUILTIN_DEVICE_CATALOG_ITEMS.find((item) => item.id === library.catalogItemId) ??
    BUILTIN_DEVICE_CATALOG_ITEMS.find((item) => item.driverId === library.driverId) ??
    BUILTIN_DEVICE_CATALOG_ITEMS.find((item) => item.type === library.type) ??
    BUILTIN_DEVICE_CATALOG_ITEMS[0];
  return {
    ...fallback,
    id: `custom.${library.type}.${brand}.${model}`,
    type: library.type,
    brand: brand.trim() || library.brand || "Custom",
    model: model.trim() || "Custom Device",
    displayName: `${brand.trim() || library.brand || "Custom"} ${model.trim() || "Custom Device"}`,
    driverId: library.driverId,
    transportId: fallback.transportId || library.transportId,
    capabilities: fallback.capabilities.length > 0 ? fallback.capabilities : [{ id: library.type, features: [] }],
    tags: Array.from(new Set([...fallback.tags, library.driverId, library.sourceFile])),
    userDefined: true
  };
}

export function driverSourceForInstance(instance: PluginInstance, drivers: DriverLibraryItem[]): string {
  return drivers.find((driver) => driver.driverId === instance.driverId)?.sourceFile ?? instance.driverId;
}

export function normalizeConfigDraft(schema: DeviceConfigField[], draft: ArchitectureDraftValues): DeviceConfig {
  const config: DeviceConfig = {};
  for (const field of schema) {
    const value = draft[field.id];
    if (field.kind === "number") {
      const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : null;
      config[field.id] = Number.isFinite(number) ? number : null;
    } else if (field.kind === "toggle") {
      config[field.id] = value === true;
    } else if (field.kind === "select") {
      config[field.id] = field.options?.find((option) => String(option.value) === String(value))?.value ?? field.options?.[0]?.value ?? null;
    } else {
      config[field.id] = value === null || value === undefined ? "" : String(value);
    }
  }
  return config;
}

export function nextPluginName(catalogItem: DeviceCatalogItem, instances: PluginInstance[]) {
  const base = catalogItem.type === "servo" ? `ID${catalogItem.defaultConfig.servoId ?? instances.length + 1}` : catalogItem.model;
  let name = String(base);
  for (let index = 2; instances.some((item) => item.name === name); index += 1) {
    name = `${base} ${index}`;
  }
  return name;
}

export function servoSetIdResponseFromResult(response: unknown): ServoSetIdCommandResponse | null {
  if (!response || typeof response !== "object") {
    return null;
  }
  const draft = response as Partial<ServoSetIdCommandResponse>;
  if (typeof draft.oldId !== "number" || typeof draft.newId !== "number" || !Array.isArray(draft.steps)) {
    return null;
  }
  return {
    ok: draft.ok === true,
    oldId: draft.oldId,
    newId: draft.newId,
    stage: typeof draft.stage === "string" ? draft.stage : "unknown",
    steps: draft.steps.filter((step): step is ServoSetIdStepLog => (
      step &&
      typeof step.label === "string" &&
      typeof step.tx === "string" &&
      (typeof step.rx === "string" || step.rx === null) &&
      (typeof step.status === "number" || step.status === null)
    ))
  };
}

export function servoSetIdLogLines(response: ServoSetIdCommandResponse): string[] {
  const lines = [`ID ${response.oldId} -> ${response.newId} ${response.ok ? "OK" : `FAILED ${response.stage}`}`];
  for (const step of response.steps) {
    lines.push(`${step.label} TX ${step.tx}`);
    lines.push(`${step.label} RX ${step.rx ?? "--"}${step.status === null ? "" : ` status=${step.status}`}`);
  }
  return lines;
}

export function platformActionControls(controls: UiControlSchema[]): UiControlSchema[] {
  return controls.flatMap((control) => {
    const children = control.kind === "group" ? platformActionControls(control.controls ?? []) : [];
    return control.actionId ? [control, ...children] : children;
  });
}

export function formatArmNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

export function normalizeArmDisplayDegrees(value: number): number {
  return ((value % 360) + 360) % 360;
}

export function sleepMs(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function toggleSet(values: Set<string>, id: string): Set<string> {
  const next = new Set(values);
  if (next.has(id)) {
    next.delete(id);
  } else {
    next.add(id);
  }
  return next;
}
