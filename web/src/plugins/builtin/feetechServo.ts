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
        { id: "angleDeg", kind: "slider", label: "Position", capability: "servo", actionId: "set_position", stateField: "positionRaw", min: 0, max: 360, step: 1 },
        { id: "speedRaw", kind: "number", label: "Speed", capability: "servo", actionId: "set_speed", stateField: "speedRaw", min: -4095, max: 4095, step: 1 },
        { id: "enabled", kind: "toggle", label: "Torque", capability: "servo", actionId: "enable_torque" },
        { id: "feedback", kind: "metric", label: "Feedback", capability: "servo", actionId: "read_position", stateField: "positionRaw" }
      ]
    }
  ]
};
