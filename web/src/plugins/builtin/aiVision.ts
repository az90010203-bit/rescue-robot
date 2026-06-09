import { PlatformPluginPackage } from "@platform/types";

export const aiVisionPackage: PlatformPluginPackage = {
  manifest: {
    id: "builtin.ai-vision",
    name: "AI Vision",
    version: "0.1.0",
    description: "External local AI vision helper for competition mannequin perception.",
    provides: ["driver.ai-vision-helper", "ui.ai-vision-control"],
    requires: ["capability.ai-vision", "transport.local-helper"]
  },
  plugins: [
    {
      id: "driver.ai-vision-helper",
      kind: "driver",
      name: "Local AI Vision Helper",
      version: "0.1.0",
      description: "Connects the console to an external Python vision service over loopback HTTP.",
      provides: ["ai-vision"],
      requiresTransport: ["transport.local-helper"],
      protocol: "ai-vision-http-v1"
    }
  ],
  uiPanels: [
    {
      id: "ai-vision-control",
      title: "AI Vision",
      capability: "ai-vision",
      driverId: "driver.ai-vision-helper",
      controls: [
        { id: "sourceId", kind: "select", label: "Source", capability: "ai-vision", options: [{ label: "Main camera", value: "main" }, { label: "Second camera", value: "secondary" }] },
        { id: "streamUrl", kind: "textarea", label: "Stream URL", capability: "ai-vision" },
        { id: "label", kind: "textarea", label: "Label", capability: "ai-vision" },
        { id: "helper", kind: "button", label: "Check helper", capability: "ai-vision", actionId: "helper_check" },
        { id: "analyze", kind: "button", label: "Analyze", capability: "ai-vision", actionId: "analyze" },
        { id: "capture", kind: "button", label: "Capture sample", capability: "ai-vision", actionId: "capture_sample" },
        { id: "detectionCount", kind: "metric", label: "Detections", capability: "ai-vision", stateField: "detectionCount" }
      ]
    }
  ]
};
