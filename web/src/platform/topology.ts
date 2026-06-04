import { CapabilityId, DeviceDescriptor } from "./types";

export interface RobotDeviceTemplate {
  id: string;
  name: string;
  type: CapabilityId;
  driverId: string;
  transportId: string;
  config?: Record<string, string | number | boolean | null>;
}

export interface RobotTransportTemplate {
  id: string;
  transportId: string;
  name: string;
  config?: Record<string, string | number | boolean | null>;
}

export interface RobotProjectTemplate {
  id: string;
  name: string;
  version: string;
  devices: RobotDeviceTemplate[];
  transports: RobotTransportTemplate[];
}

export function createRobotProjectTemplateFromDevices(options: {
  id: string;
  name: string;
  version?: string;
  devices: DeviceDescriptor[];
}): RobotProjectTemplate {
  const transportIds = new Set(options.devices.map((device) => device.transportId));
  return {
    id: options.id,
    name: options.name,
    version: options.version ?? "0.1.0",
    devices: options.devices.map((device) => ({
      id: device.id,
      name: device.name,
      type: device.type,
      driverId: device.driverId,
      transportId: device.transportId,
      config: device.metadata
    })),
    transports: Array.from(transportIds).map((transportId) => ({
      id: transportId,
      transportId,
      name: transportId.replace("transport.", "")
    }))
  };
}

export function validateRobotProjectTemplate(template: RobotProjectTemplate): string | null {
  if (!template.id.trim() || !template.name.trim() || !template.version.trim()) {
    return "robot project template requires id, name, and version";
  }
  const transportIds = new Set(template.transports.map((transport) => transport.id));
  const deviceIds = new Set<string>();
  for (const device of template.devices) {
    if (!device.id.trim() || !device.name.trim()) {
      return "robot device template requires id and name";
    }
    if (deviceIds.has(device.id)) {
      return `duplicate robot device: ${device.id}`;
    }
    deviceIds.add(device.id);
    if (!transportIds.has(device.transportId)) {
      return `robot device references missing transport: ${device.id}`;
    }
  }
  return null;
}

export function summarizeRobotProjectTemplate(template: RobotProjectTemplate): Record<CapabilityId, number> {
  const summary: Record<CapabilityId, number> = {
    servo: 0,
    motor: 0,
    camera: 0,
    "robot-arm": 0,
    "raspberry-pi": 0,
    firmware: 0,
    gamepad: 0,
    gpio: 0,
    sensor: 0
  };
  for (const device of template.devices) {
    summary[device.type] += 1;
  }
  return summary;
}
