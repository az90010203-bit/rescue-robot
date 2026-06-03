import { PlatformPluginPackage } from "../../platform/types";

export const feetechServoPackage: PlatformPluginPackage = {
  manifest: {
    id: "builtin.feetech-servo",
    name: "Feetech Servo",
    version: "0.1.0",
    description: "Feetech STS/SCS TTL bus servo driver and platform UI schema.",
    provides: ["driver.feetech-servo", "ui.servo-control"],
    requires: ["capability.servo", "transport.web-serial"]
  },
  plugins: [
    {
      id: "driver.feetech-servo",
      kind: "driver",
      name: "Feetech STS/SCS Servo",
      version: "0.1.0",
      provides: ["servo"],
      requiresTransport: ["transport.web-serial"],
      protocol: "feetech-ttl-bus"
    }
  ],
  uiPanels: [
    {
      id: "servo-control",
      title: "Servo Control",
      capability: "servo",
      controls: [
        { id: "position", kind: "slider", label: "Position", capability: "servo", actionId: "set_position", stateField: "positionRaw" },
        { id: "speed", kind: "number", label: "Speed", capability: "servo", actionId: "set_speed", stateField: "speedRaw" },
        { id: "torque", kind: "toggle", label: "Torque", capability: "servo", actionId: "enable_torque" },
        { id: "feedback", kind: "metric", label: "Feedback", capability: "servo", actionId: "read_position", stateField: "positionRaw" }
      ]
    }
  ]
};
