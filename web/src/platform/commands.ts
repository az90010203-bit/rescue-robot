import { CapabilityId } from "./types";

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
  | "motor.configure"
  | "camera.set_gimbal"
  | "camera.center_gimbal"
  | "camera.stream.start"
  | "camera.stream.stop"
  | "robot-arm.set_pose"
  | "robot-arm.pause"
  | "robot-arm.teach.start"
  | "robot-arm.teach.stop"
  | "robot-arm.teach.play"
  | "pi.check"
  | "pi.setup"
  | "pi.upload_file"
  | "pi.exec"
  | "pi.upload_and_exec"
  | "pi.camera.check"
  | "pi.camera.start"
  | "pi.camera.stop"
  | "pi.camera.install_tools"
  | "firmware.helper.check"
  | "firmware.ports.refresh"
  | "firmware.compile"
  | "firmware.upload";

export interface PlatformCommandTarget {
  deviceId: string;
  capability: CapabilityId;
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
  "motor.configure",
  "camera.set_gimbal",
  "camera.center_gimbal",
  "camera.stream.start",
  "camera.stream.stop",
  "robot-arm.set_pose",
  "robot-arm.pause",
  "robot-arm.teach.start",
  "robot-arm.teach.stop",
  "robot-arm.teach.play",
  "pi.check",
  "pi.setup",
  "pi.upload_file",
  "pi.exec",
  "pi.upload_and_exec",
  "pi.camera.check",
  "pi.camera.start",
  "pi.camera.stop",
  "pi.camera.install_tools",
  "firmware.helper.check",
  "firmware.ports.refresh",
  "firmware.compile",
  "firmware.upload"
]);

const COMMAND_CAPABILITY: Record<PlatformCommandType, CapabilityId> = {
  "servo.set_position": "servo",
  "servo.set_speed": "servo",
  "servo.read_feedback": "servo",
  "servo.set_torque": "servo",
  "servo.ping": "servo",
  "motor.set_speed": "motor",
  "motor.stop": "motor",
  "motor.read_feedback": "motor",
  "motor.configure": "motor",
  "camera.set_gimbal": "camera",
  "camera.center_gimbal": "camera",
  "camera.stream.start": "camera",
  "camera.stream.stop": "camera",
  "robot-arm.set_pose": "robot-arm",
  "robot-arm.pause": "robot-arm",
  "robot-arm.teach.start": "robot-arm",
  "robot-arm.teach.stop": "robot-arm",
  "robot-arm.teach.play": "robot-arm",
  "pi.check": "raspberry-pi",
  "pi.setup": "raspberry-pi",
  "pi.upload_file": "raspberry-pi",
  "pi.exec": "raspberry-pi",
  "pi.upload_and_exec": "raspberry-pi",
  "pi.camera.check": "raspberry-pi",
  "pi.camera.start": "raspberry-pi",
  "pi.camera.stop": "raspberry-pi",
  "pi.camera.install_tools": "raspberry-pi",
  "firmware.helper.check": "firmware",
  "firmware.ports.refresh": "firmware",
  "firmware.compile": "firmware",
  "firmware.upload": "firmware"
};

const TARGET_CAPABILITY_BY_PREFIX: Array<[string, CapabilityId]> = [
  ["servo:", "servo"],
  ["motor:", "motor"],
  ["camera:", "camera"],
  ["robot-arm:", "robot-arm"],
  ["pi:", "raspberry-pi"],
  ["firmware:", "firmware"],
  ["gamepad:", "gamepad"]
];

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
  const targetCapability = capabilityForTargetDeviceId(command.targetDeviceId);
  if (!targetCapability) {
    return `unsupported platform command target: ${command.targetDeviceId}`;
  }
  const commandCapability = COMMAND_CAPABILITY[command.type];
  if (targetCapability !== commandCapability) {
    return `${commandCapability} command requires a ${commandCapability} target`;
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
  if (command.type === "camera.set_gimbal") {
    if (typeof command.payload.panAngleDeg !== "number" || typeof command.payload.tiltAngleDeg !== "number") {
      return "camera.set_gimbal requires panAngleDeg and tiltAngleDeg";
    }
    if (!isAngle(command.payload.panAngleDeg) || !isAngle(command.payload.tiltAngleDeg)) {
      return "camera.set_gimbal angles must be 0-360";
    }
  }
  if (command.type === "robot-arm.set_pose" && !Array.isArray(command.payload.joints)) {
    return "robot-arm.set_pose requires joints";
  }
  if ((command.type === "pi.exec" || command.type === "pi.upload_and_exec") && typeof command.payload.command !== "string") {
    return `${command.type} requires command`;
  }
  if ((command.type === "pi.upload_file" || command.type === "pi.upload_and_exec") && !command.payload.file) {
    return `${command.type} requires file`;
  }
  if (command.type === "firmware.upload" && typeof command.payload.port !== "string") {
    return "firmware.upload requires port";
  }
  return null;
}

export function resolvePlatformCommandTarget(command: PlatformCommand): PlatformCommandTarget {
  const capability = capabilityForTargetDeviceId(command.targetDeviceId);
  return {
    deviceId: command.targetDeviceId,
    capability: capability ?? COMMAND_CAPABILITY[command.type]
  };
}

export function platformCommandEventType(status: PlatformCommandStatus): string {
  return `platform.command.${status}`;
}

export function capabilityForTargetDeviceId(deviceId: string): CapabilityId | null {
  return TARGET_CAPABILITY_BY_PREFIX.find(([prefix]) => deviceId.startsWith(prefix))?.[1] ?? null;
}

function isAngle(value: unknown): boolean {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 360;
}
