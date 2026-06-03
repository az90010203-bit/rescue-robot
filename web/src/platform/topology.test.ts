import { describe, expect, it } from "vitest";
import { createRobotProjectTemplateFromDevices, summarizeRobotProjectTemplate, validateRobotProjectTemplate } from "./topology";
import { DeviceDescriptor } from "./types";

const devices: DeviceDescriptor[] = [
  {
    id: "servo:22",
    name: "ID22",
    type: "servo",
    driverId: "driver.feetech-servo",
    transportId: "transport.web-serial",
    status: "offline",
    capabilities: [],
    metadata: { servoId: 22 }
  },
  {
    id: "motor:M1",
    name: "Left Track",
    type: "motor",
    driverId: "driver.tb6618-motor",
    transportId: "transport.controller-json",
    status: "offline",
    capabilities: []
  }
];

describe("robot project topology templates", () => {
  it("creates a template from platform devices", () => {
    const template = createRobotProjectTemplateFromDevices({ id: "rescue", name: "Rescue Robot", devices });

    expect(template.transports.map((transport) => transport.id)).toEqual(["transport.web-serial", "transport.controller-json"]);
    expect(template.devices[0]).toMatchObject({ id: "servo:22", driverId: "driver.feetech-servo", config: { servoId: 22 } });
    expect(validateRobotProjectTemplate(template)).toBeNull();
  });

  it("validates duplicate devices and missing transports", () => {
    const template = createRobotProjectTemplateFromDevices({ id: "rescue", name: "Rescue Robot", devices });

    expect(validateRobotProjectTemplate({ ...template, devices: [template.devices[0], template.devices[0]] })).toBe("duplicate robot device: servo:22");
    expect(validateRobotProjectTemplate({ ...template, transports: [] })).toBe("robot device references missing transport: servo:22");
  });

  it("summarizes devices by capability", () => {
    const template = createRobotProjectTemplateFromDevices({ id: "rescue", name: "Rescue Robot", devices });

    expect(summarizeRobotProjectTemplate(template)).toMatchObject({ servo: 1, motor: 1, camera: 0 });
  });
});
