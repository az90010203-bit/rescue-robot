import type { PcCommand, PcCommandClass, PcCommandSchedulingPolicy } from "@adapters/hardware/protocol";

export const PRIORITY_STORAGE_KEY = "rescue-robot-lite.priority.v1";

export interface PrioritySettings {
  safety: number;
  motor: number;
  armServo: number;
  canServo: number;
  telemetry: number;
}

export interface CommandScheduling {
  priority: number;
  commandClass: PcCommandClass;
  policy: PcCommandSchedulingPolicy;
}

export const DEFAULT_PRIORITY_SETTINGS: PrioritySettings = {
  safety: 100,
  motor: 80,
  armServo: 60,
  canServo: 40,
  telemetry: 20
};

export const PRIORITY_FIELDS: Array<{ key: keyof PrioritySettings; labelKey: string; detailKey: string }> = [
  { key: "safety", labelKey: "priority.fields.safety.label", detailKey: "priority.fields.safety.detail" },
  { key: "motor", labelKey: "priority.fields.motor.label", detailKey: "priority.fields.motor.detail" },
  { key: "armServo", labelKey: "priority.fields.armServo.label", detailKey: "priority.fields.armServo.detail" },
  { key: "canServo", labelKey: "priority.fields.canServo.label", detailKey: "priority.fields.canServo.detail" },
  { key: "telemetry", labelKey: "priority.fields.telemetry.label", detailKey: "priority.fields.telemetry.detail" }
];

export function normalizePrioritySettings(value: unknown): PrioritySettings {
  const draft = value && typeof value === "object" ? value as Partial<Record<keyof PrioritySettings, unknown>> : {};
  return {
    safety: clampPriority(draft.safety, DEFAULT_PRIORITY_SETTINGS.safety),
    motor: clampPriority(draft.motor, DEFAULT_PRIORITY_SETTINGS.motor),
    armServo: clampPriority(draft.armServo, DEFAULT_PRIORITY_SETTINGS.armServo),
    canServo: clampPriority(draft.canServo, DEFAULT_PRIORITY_SETTINGS.canServo),
    telemetry: clampPriority(draft.telemetry, DEFAULT_PRIORITY_SETTINGS.telemetry)
  };
}

export function loadPrioritySettings(storage: Pick<Storage, "getItem" | "removeItem"> | undefined = globalThis.localStorage): PrioritySettings {
  if (!storage) {
    return DEFAULT_PRIORITY_SETTINGS;
  }
  try {
    const raw = storage.getItem(PRIORITY_STORAGE_KEY);
    return raw ? normalizePrioritySettings(JSON.parse(raw)) : DEFAULT_PRIORITY_SETTINGS;
  } catch {
    storage.removeItem(PRIORITY_STORAGE_KEY);
    return DEFAULT_PRIORITY_SETTINGS;
  }
}

export function savePrioritySettings(settings: PrioritySettings, storage: Pick<Storage, "setItem"> | undefined = globalThis.localStorage): void {
  storage?.setItem(PRIORITY_STORAGE_KEY, JSON.stringify(normalizePrioritySettings(settings)));
}

export function resolveCommandScheduling(command: Pick<PcCommand, "type">, settings: PrioritySettings): CommandScheduling {
  const type = command.type;
  if (type === "motor.stop" || type === "mecanum.stop" || type === "system.protocol" || type === "debug.set") {
    return { priority: settings.safety, commandClass: "system", policy: "stop" };
  }
  if (type === "motor.target" || type === "motor.set" || type === "motor.config" || type === "mecanum.target") {
    return { priority: settings.motor, commandClass: "motor", policy: "latest" };
  }
  if (type === "servo.move" || type === "servo.speed" || type === "servo.torque") {
    return { priority: settings.armServo, commandClass: "arm-servo", policy: "latest" };
  }
  if (type === "imu.read" || type === "motor.read" || type === "can.read" || type === "can_servo.read") {
    return { priority: settings.telemetry, commandClass: "telemetry", policy: "fifo" };
  }
  if (type === "can_servo.move" || type === "can_servo.group_move") {
    return { priority: settings.canServo, commandClass: "can-servo", policy: "latest" };
  }
  if (String(type).startsWith("can_servo.")) {
    return { priority: settings.canServo, commandClass: "can-servo", policy: "fifo" };
  }
  return { priority: settings.safety, commandClass: "system", policy: "fifo" };
}

export function withCommandScheduling(command: PcCommand, settings: PrioritySettings): PcCommand {
  const scheduling = resolveCommandScheduling(command, settings);
  return {
    ...command,
    priority: typeof command.priority === "number" ? clampPriority(command.priority, scheduling.priority) : scheduling.priority,
    commandClass: command.commandClass ?? scheduling.commandClass,
    policy: command.policy ?? scheduling.policy
  };
}

function clampPriority(value: unknown, fallback: number): number {
  const number = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(number)) {
    return fallback;
  }
  return Math.max(0, Math.min(1000, Math.round(number)));
}
