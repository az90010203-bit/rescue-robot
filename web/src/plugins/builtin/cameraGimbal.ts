import { PlatformPluginPackage } from "../../platform/types";

export const cameraGimbalPackage: PlatformPluginPackage = {
  manifest: {
    id: "builtin.camera-gimbal",
    name: "Camera Gimbal",
    version: "0.1.0",
    description: "MJPEG camera and servo gimbal driver metadata.",
    provides: ["driver.camera-gimbal"],
    requires: ["capability.camera", "transport.controller-json"]
  },
  plugins: [
    {
      id: "driver.camera-gimbal",
      kind: "driver",
      name: "Camera Gimbal",
      version: "0.1.0",
      provides: ["camera"],
      requiresTransport: ["transport.controller-json"],
      protocol: "mjpeg-and-servo-gimbal"
    }
  ],
  uiPanels: [
    {
      id: "camera-gimbal-control",
      title: "Camera Gimbal Control",
      capability: "camera",
      controls: [
        { id: "viewer", kind: "cameraView", label: "Camera View", capability: "camera", stateField: "streamUrl" },
        { id: "panAngleDeg", kind: "number", label: "Pan", capability: "camera", actionId: "set_gimbal", stateField: "panAngleDeg", min: 0, max: 360, step: 1 },
        { id: "tiltAngleDeg", kind: "number", label: "Tilt", capability: "camera", actionId: "set_gimbal", stateField: "tiltAngleDeg", min: 0, max: 360, step: 1 },
        { id: "set-gimbal", kind: "button", label: "Set Gimbal", capability: "camera", actionId: "set_gimbal" },
        { id: "center-gimbal", kind: "button", label: "Center", capability: "camera", actionId: "center_gimbal" },
        { id: "start-stream", kind: "button", label: "Start Stream", capability: "camera", actionId: "start_stream" },
        { id: "stop-stream", kind: "button", label: "Stop Stream", capability: "camera", actionId: "stop_stream" }
      ]
    }
  ]
};
