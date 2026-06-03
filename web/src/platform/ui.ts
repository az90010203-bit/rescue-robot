import { createPlatformCommand, PlatformCommand } from "./commands";
import { DeviceDescriptor, PlatformEvent, UiPanelSchema } from "./types";

export type PlatformControlDraft = Record<string, string | number | boolean | null | undefined>;

export function resolveSelectedPlatformDeviceId(devices: DeviceDescriptor[], selectedId: string | null | undefined, preferredId?: string | null): string {
  if (selectedId && devices.some((device) => device.id === selectedId)) {
    return selectedId;
  }
  if (preferredId && devices.some((device) => device.id === preferredId)) {
    return preferredId;
  }
  return devices[0]?.id ?? "";
}

export function formatPlatformStateValue(value: string | number | boolean | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "--";
  }
  if (typeof value === "boolean") {
    return value ? "yes" : "no";
  }
  return String(value);
}

export function limitPlatformEvents(events: PlatformEvent[], limit = 10): PlatformEvent[] {
  return events.slice(0, Math.max(0, limit));
}

export function findPlatformUiPanelForDevice(device: DeviceDescriptor | undefined, panels: UiPanelSchema[]): UiPanelSchema | undefined {
  if (!device) {
    return undefined;
  }
  const capabilityIds = new Set(device.capabilities.map((capability) => capability.id));
  return panels.find((panel) => panel.capability === device.type || capabilityIds.has(panel.capability));
}

export function platformControlDefaultsForDevice(device: DeviceDescriptor | undefined): PlatformControlDraft {
  if (!device) {
    return {};
  }
  if (device.type === "servo") {
    return {
      angleDeg: 90,
      speedRaw: 800,
      enabled: true
    };
  }
  if (device.type === "motor") {
    return {
      speedPercent: 0,
      stopMode: "coast"
    };
  }
  return {};
}

export function platformCommandForControl(device: DeviceDescriptor, actionId: string | undefined, draft: PlatformControlDraft): PlatformCommand | string {
  if (!actionId) {
    return "platform control action is missing";
  }

  if (device.type === "servo") {
    if (actionId === "scan") {
      return createPlatformCommand("servo.ping", device.id);
    }
    if (actionId === "read_position") {
      return createPlatformCommand("servo.read_feedback", device.id);
    }
    if (actionId === "enable_torque") {
      if (typeof draft.enabled !== "boolean") {
        return "servo torque control requires enabled";
      }
      return createPlatformCommand("servo.set_torque", device.id, { enabled: draft.enabled });
    }
    if (actionId === "set_position") {
      const angleDeg = Number(draft.angleDeg);
      const speedRaw = Number(draft.speedRaw);
      if (!Number.isFinite(angleDeg) || !Number.isFinite(speedRaw)) {
        return "servo position control requires angleDeg and speedRaw";
      }
      return createPlatformCommand("servo.set_position", device.id, { angleDeg, speedRaw });
    }
    if (actionId === "set_speed") {
      const speedRaw = Number(draft.speedRaw);
      if (!Number.isFinite(speedRaw)) {
        return "servo speed control requires speedRaw";
      }
      return createPlatformCommand("servo.set_speed", device.id, { speedRaw });
    }
  }

  if (device.type === "motor") {
    if (actionId === "set_speed") {
      const speedPercent = Number(draft.speedPercent);
      if (!Number.isFinite(speedPercent)) {
        return "motor speed control requires speedPercent";
      }
      return createPlatformCommand("motor.set_speed", device.id, { speedPercent, stopMode: draft.stopMode ?? "coast" });
    }
    if (actionId === "stop") {
      return createPlatformCommand("motor.stop", device.id, { stopMode: draft.stopMode ?? "coast" });
    }
    if (actionId === "read_feedback") {
      return createPlatformCommand("motor.read_feedback", device.id);
    }
  }

  return `unsupported platform control action: ${device.type}.${actionId}`;
}
