import { PlatformPluginPackage } from "@platform/types";

export const browserCameraPackage: PlatformPluginPackage = {
  manifest: {
    id: "builtin.browser-camera",
    name: "Browser Camera",
    version: "0.1.0",
    description: "Local computer camera preview through the browser MediaDevices API.",
    provides: ["driver.browser-camera", "ui.browser-camera"],
    requires: ["capability.camera", "transport.browser-media"]
  },
  plugins: [
    {
      id: "driver.browser-camera",
      kind: "driver",
      name: "Browser Camera",
      version: "0.1.0",
      description: "Reads local USB or built-in cameras through navigator.mediaDevices.getUserMedia.",
      provides: ["camera"],
      requiresTransport: ["transport.browser-media"],
      protocol: "w3c-mediadevices-getusermedia"
    }
  ],
  uiPanels: [
    {
      id: "browser-camera-control",
      title: "Browser Camera",
      capability: "camera",
      driverId: "driver.browser-camera",
      controls: [
        { id: "preview", kind: "localCameraView", label: "Browser Camera Preview", capability: "camera", stateField: "preferredDeviceId" }
      ]
    }
  ]
};
