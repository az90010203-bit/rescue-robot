import { PlatformPluginPackage } from "@platform/types";

export const tb6618MotorPackage: PlatformPluginPackage = {
  manifest: {
    id: "builtin.tb6618-motor",
    name: "TB6618 Motor",
    version: "0.1.0",
    description: "TB6618-style H-bridge motor driver and platform UI schema.",
    provides: ["driver.tb6618-motor", "ui.motor-control"],
    requires: ["capability.motor", "transport.controller-json"]
  },
  plugins: [
    {
      id: "driver.tb6618-motor",
      kind: "driver",
      name: "TB6618 Motor",
      version: "0.1.0",
      provides: ["motor"],
      requiresTransport: ["transport.controller-json"],
      protocol: "rescue-robot-json"
    }
  ],
  uiPanels: [
    {
      id: "motor-control",
      title: "Motor Control",
      capability: "motor",
      controls: [
        { id: "speedPercent", kind: "slider", label: "Speed", capability: "motor", actionId: "set_speed", stateField: "commandedSpeedPercent", min: -100, max: 100, step: 1 },
        {
          id: "stopMode",
          kind: "select",
          label: "Stop Mode",
          capability: "motor",
          actionId: "stop",
          options: [
            { label: "Coast", value: "coast" },
            { label: "Brake", value: "brake" }
          ]
        },
        { id: "stop", kind: "button", label: "Stop", capability: "motor", actionId: "stop" },
        { id: "rpm", kind: "metric", label: "RPM", capability: "motor", actionId: "read_feedback", stateField: "speedRpm" }
      ]
    }
  ]
};
