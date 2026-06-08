import { PlatformPluginPackage } from "@platform/types";

export const asmeCanServoPackage: PlatformPluginPackage = {
  manifest: {
    id: "builtin.asme-can-servo",
    name: "ASME CAN Servo",
    version: "0.1.0",
    description: "ASME ASME-SE CAN servo driver for RoboMaster A board CAN1 bridge.",
    provides: ["driver.asme-can-servo", "ui.asme-can-servo-control"],
    requires: ["capability.servo", "transport.a-board-can1"]
  },
  plugins: [
    {
      id: "driver.asme-can-servo",
      kind: "driver",
      name: "ASME ASME-SE CAN Servo",
      version: "0.1.0",
      provides: ["servo"],
      requiresTransport: ["transport.a-board-can1"],
      protocol: "asmg-md-can"
    }
  ],
  uiPanels: [
    {
      id: "asme-can-servo-control",
      title: "ASME CAN Servo",
      capability: "servo",
      driverId: "driver.asme-can-servo",
      controls: []
    }
  ]
};
