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
  ]
};
