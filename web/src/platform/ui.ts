import { createPlatformCommand, PlatformCommand } from "./commands";
import { DeviceDescriptor, PlatformEvent, UiPanelSchema } from "./types";
import { formatScalarValue } from "../shared/formatters";

export type PlatformControlDraft = Record<string, unknown>;

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
  return formatScalarValue(value);
}

export function limitPlatformEvents(events: PlatformEvent[], limit = 10): PlatformEvent[] {
  return events.slice(0, Math.max(0, limit));
}

export function findPlatformUiPanelForDevice(device: DeviceDescriptor | undefined, panels: UiPanelSchema[]): UiPanelSchema | undefined {
  if (!device) {
    return undefined;
  }
  const capabilityIds = new Set(device.capabilities.map((capability) => capability.id));
  return (
    panels.find((panel) => panel.deviceId === device.id) ??
    panels.find((panel) => panel.driverId === device.driverId) ??
    panels.find((panel) => !panel.driverId && !panel.deviceId && (panel.capability === device.type || capabilityIds.has(panel.capability)))
  );
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
  if (device.type === "camera") {
    return {
      panAngleDeg: device.metadata?.panAngleDeg ?? 90,
      tiltAngleDeg: device.metadata?.tiltAngleDeg ?? 90
    };
  }
  if (device.type === "firmware") {
    return {
      port: device.metadata?.port ?? ""
    };
  }
  if (device.type === "raspberry-pi") {
    return {
      command: "",
      file: null
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

  if (device.type === "camera") {
    if (actionId === "open_stream" || actionId === "start_stream") {
      return createPlatformCommand("camera.stream.start", device.id);
    }
    if (actionId === "stop_stream") {
      return createPlatformCommand("camera.stream.stop", device.id);
    }
    if (actionId === "center_gimbal") {
      return createPlatformCommand("camera.center_gimbal", device.id);
    }
    if (actionId === "move_gimbal" || actionId === "set_gimbal") {
      const panAngleDeg = Number(draft.panAngleDeg);
      const tiltAngleDeg = Number(draft.tiltAngleDeg);
      if (!Number.isFinite(panAngleDeg) || !Number.isFinite(tiltAngleDeg)) {
        return "camera gimbal control requires panAngleDeg and tiltAngleDeg";
      }
      return createPlatformCommand("camera.set_gimbal", device.id, { panAngleDeg, tiltAngleDeg });
    }
  }

  if (device.type === "robot-arm") {
    if (actionId === "send_pose" || actionId === "set_pose") {
      return createPlatformCommand("robot-arm.set_pose", device.id, { joints: Array.isArray(draft.joints) ? draft.joints : [] });
    }
    if (actionId === "pause") {
      return createPlatformCommand("robot-arm.pause", device.id);
    }
    if (actionId === "teach_start") {
      return createPlatformCommand("robot-arm.teach.start", device.id);
    }
    if (actionId === "teach_stop") {
      return createPlatformCommand("robot-arm.teach.stop", device.id);
    }
    if (actionId === "teach_play") {
      return createPlatformCommand("robot-arm.teach.play", device.id);
    }
  }

  if (device.type === "raspberry-pi") {
    if (actionId === "check") {
      return createPlatformCommand("pi.check", device.id);
    }
    if (actionId === "setup") {
      return createPlatformCommand("pi.setup", device.id);
    }
    if (actionId === "upload_file") {
      return createPlatformCommand("pi.upload_file", device.id, { file: draft.file });
    }
    if (actionId === "exec") {
      return createPlatformCommand("pi.exec", device.id, { command: String(draft.command ?? "") });
    }
    if (actionId === "upload_and_exec") {
      return createPlatformCommand("pi.upload_and_exec", device.id, { file: draft.file, command: String(draft.command ?? "") });
    }
    if (actionId === "camera_check") {
      return createPlatformCommand("pi.camera.check", device.id);
    }
    if (actionId === "camera_start") {
      return createPlatformCommand("pi.camera.start", device.id);
    }
    if (actionId === "camera_stop") {
      return createPlatformCommand("pi.camera.stop", device.id);
    }
    if (actionId === "camera_install_tools") {
      return createPlatformCommand("pi.camera.install_tools", device.id);
    }
  }

  if (device.type === "firmware") {
    if (actionId === "helper_check") {
      return createPlatformCommand("firmware.helper.check", device.id);
    }
    if (actionId === "ports_refresh") {
      return createPlatformCommand("firmware.ports.refresh", device.id);
    }
    if (actionId === "compile") {
      return createPlatformCommand("firmware.compile", device.id);
    }
    if (actionId === "upload") {
      return createPlatformCommand("firmware.upload", device.id, { port: String(draft.port ?? "") });
    }
  }

  return `unsupported platform control action: ${device.type}.${actionId}`;
}
