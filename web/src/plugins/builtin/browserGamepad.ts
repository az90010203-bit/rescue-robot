import { PlatformPluginPackage } from "@platform/types";

export const browserGamepadPackage: PlatformPluginPackage = {
  manifest: {
    id: "builtin.browser-gamepad",
    name: "Browser Gamepad",
    version: "0.1.0",
    description: "Browser Gamepad API input driver and live status panel.",
    provides: ["driver.browser-gamepad", "ui.gamepad-status"],
    requires: ["capability.gamepad", "transport.browser-gamepad-api"]
  },
  plugins: [
    {
      id: "driver.browser-gamepad",
      kind: "driver",
      name: "Browser Gamepad",
      version: "0.1.0",
      description: "Reads axes and buttons through navigator.getGamepads for drive and camera input.",
      provides: ["gamepad"],
      requiresTransport: ["transport.browser-gamepad-api"],
      protocol: "w3c-gamepad-api"
    }
  ],
  uiPanels: [
    {
      id: "gamepad-status",
      title: "Gamepad Status",
      capability: "gamepad",
      controls: [
        { id: "connected", kind: "metric", label: "Connected", capability: "gamepad", stateField: "connected" },
        { id: "id", kind: "metric", label: "Device", capability: "gamepad", stateField: "id" },
        { id: "mapping", kind: "metric", label: "Mapping", capability: "gamepad", stateField: "mapping" },
        { id: "axes", kind: "metric", label: "Axes", capability: "gamepad", stateField: "axes" },
        { id: "buttons", kind: "metric", label: "Buttons", capability: "gamepad", stateField: "buttons" },
        { id: "pressedButtons", kind: "metric", label: "Pressed", capability: "gamepad", stateField: "pressedButtons" },
        { id: "forward", kind: "metric", label: "Forward", capability: "gamepad", stateField: "forward" },
        { id: "strafe", kind: "metric", label: "Strafe", capability: "gamepad", stateField: "strafe" },
        { id: "turn", kind: "metric", label: "Turn", capability: "gamepad", stateField: "turn" },
        { id: "cameraPan", kind: "metric", label: "Camera Pan", capability: "gamepad", stateField: "cameraPan" },
        { id: "cameraTilt", kind: "metric", label: "Camera Tilt", capability: "gamepad", stateField: "cameraTilt" },
        { id: "stop", kind: "metric", label: "Stop", capability: "gamepad", stateField: "stop" }
      ]
    }
  ]
};
