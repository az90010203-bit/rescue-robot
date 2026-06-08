import { PlatformPluginPackage } from "@platform/types";

export const secondaryCameraPackage: PlatformPluginPackage = {
  manifest: {
    id: "builtin.secondary-camera",
    name: "Second Camera",
    version: "0.1.0",
    description: "Video-only Raspberry Pi secondary camera source metadata.",
    provides: ["driver.secondary-camera", "ui.secondary-camera"],
    requires: ["capability.camera", "transport.ssh", "transport.local-helper"]
  },
  plugins: [
    {
      id: "driver.secondary-camera",
      kind: "driver",
      name: "Second Camera",
      version: "0.1.0",
      provides: ["camera"],
      requiresTransport: ["transport.ssh", "transport.local-helper"],
      protocol: "pi-mjpeg-secondary-camera"
    }
  ],
  uiPanels: [
    {
      id: "secondary-camera-control",
      title: "Second Camera",
      capability: "camera",
      driverId: "driver.secondary-camera",
      controls: [
        { id: "viewer", kind: "cameraView", label: "Second Camera", capability: "camera", stateField: "streamUrl" },
        { id: "source", kind: "metric", label: "Source", capability: "camera", stateField: "sourceId" },
        { id: "device", kind: "metric", label: "Device", capability: "camera", stateField: "devicePath" },
        { id: "port", kind: "metric", label: "Port", capability: "camera", stateField: "port" },
        { id: "start-stream", kind: "button", label: "Start Stream", capability: "camera", actionId: "start_stream" },
        { id: "stop-stream", kind: "button", label: "Stop Stream", capability: "camera", actionId: "stop_stream" }
      ]
    }
  ]
};
