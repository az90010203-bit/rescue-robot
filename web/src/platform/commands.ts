export type PlatformCommandStatus = "sent" | "skipped" | "failed" | "timeout";

export type PlatformCommandType =
  | "servo.set_position"
  | "servo.set_speed"
  | "servo.read_feedback"
  | "servo.set_torque"
  | "servo.ping"
  | "motor.set_speed"
  | "motor.stop"
  | "motor.read_feedback"
  | "motor.configure";

export interface PlatformCommandTarget {
  deviceId: string;
  capability: "servo" | "motor";
}

export interface PlatformCommand {
  id: string;
  type: PlatformCommandType;
  targetDeviceId: string;
  payload: Record<string, unknown>;
  createdAt?: number;
}

export interface PlatformCommandResult {
  commandId: string;
  status: PlatformCommandStatus;
  deviceId: string;
  message?: string;
  response?: unknown;
}

export const PLATFORM_COMMAND_TYPES = new Set<PlatformCommandType>([
  "servo.set_position",
  "servo.set_speed",
  "servo.read_feedback",
  "servo.set_torque",
  "servo.ping",
  "motor.set_speed",
  "motor.stop",
  "motor.read_feedback",
  "motor.configure"
]);

export function createPlatformCommand(type: PlatformCommandType, targetDeviceId: string, payload: Record<string, unknown> = {}): PlatformCommand {
  return {
    id: `${type}:${targetDeviceId}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`,
    type,
    targetDeviceId,
    payload,
    createdAt: Date.now()
  };
}

export function validatePlatformCommand(command: PlatformCommand): string | null {
  if (!PLATFORM_COMMAND_TYPES.has(command.type)) {
    return `unknown platform command: ${command.type}`;
  }
  if (!command.targetDeviceId.trim()) {
    return "platform command target is required";
  }
  if (!command.targetDeviceId.startsWith("servo:") && !command.targetDeviceId.startsWith("motor:")) {
    return `unsupported platform command target: ${command.targetDeviceId}`;
  }
  if (command.type.startsWith("servo.") && !command.targetDeviceId.startsWith("servo:")) {
    return "servo command requires a servo target";
  }
  if (command.type.startsWith("motor.") && !command.targetDeviceId.startsWith("motor:")) {
    return "motor command requires a motor target";
  }
  if (command.type === "servo.set_position") {
    if (typeof command.payload.angleDeg !== "number" || typeof command.payload.speedRaw !== "number") {
      return "servo.set_position requires angleDeg and speedRaw";
    }
    if (!Number.isFinite(command.payload.angleDeg) || command.payload.angleDeg < 0 || command.payload.angleDeg > 360) {
      return "servo.set_position angleDeg must be 0-360";
    }
    if (!Number.isInteger(command.payload.speedRaw) || command.payload.speedRaw < 0 || command.payload.speedRaw > 4095) {
      return "servo.set_position speedRaw must be an integer from 0 to 4095";
    }
  }
  if (command.type === "servo.set_speed") {
    if (typeof command.payload.speedRaw !== "number") {
      return "servo.set_speed requires speedRaw";
    }
    if (!Number.isInteger(command.payload.speedRaw) || command.payload.speedRaw < -4095 || command.payload.speedRaw > 4095) {
      return "servo.set_speed speedRaw must be an integer from -4095 to 4095";
    }
  }
  if (command.type === "servo.set_torque" && typeof command.payload.enabled !== "boolean") {
    return "servo.set_torque requires enabled";
  }
  if (command.type === "motor.set_speed") {
    if (typeof command.payload.speedPercent !== "number") {
      return "motor.set_speed requires speedPercent";
    }
    if (!Number.isFinite(command.payload.speedPercent) || command.payload.speedPercent < -100 || command.payload.speedPercent > 100) {
      return "motor.set_speed speedPercent must be from -100 to 100";
    }
  }
  if ((command.type === "motor.set_speed" || command.type === "motor.stop") && command.payload.stopMode !== undefined && command.payload.stopMode !== "coast" && command.payload.stopMode !== "brake") {
    return `${command.type} stopMode must be coast or brake`;
  }
  if (command.type === "motor.configure") {
    for (const key of ["pwmPin", "in1Pin", "in2Pin"]) {
      if (typeof command.payload[key] !== "string" || !String(command.payload[key]).trim()) {
        return `motor.configure requires ${key}`;
      }
    }
  }
  return null;
}

export function resolvePlatformCommandTarget(command: PlatformCommand): PlatformCommandTarget {
  return {
    deviceId: command.targetDeviceId,
    capability: command.targetDeviceId.startsWith("servo:") ? "servo" : "motor"
  };
}

export function platformCommandEventType(status: PlatformCommandStatus): string {
  return `platform.command.${status}`;
}
