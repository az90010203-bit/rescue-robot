import { PlatformPluginPackage } from "@platform/types";

export const firmwareUploadPackage: PlatformPluginPackage = {
  manifest: {
    id: "builtin.firmware-upload",
    name: "Firmware Upload",
    version: "0.1.0",
    description: "Local PlatformIO helper driver and firmware upload UI schema.",
    provides: ["driver.local-firmware-helper", "ui.firmware-upload"],
    requires: ["capability.firmware", "transport.local-helper"]
  },
  plugins: [
    {
      id: "driver.local-firmware-helper",
      kind: "driver",
      name: "Local Firmware Helper",
      version: "0.1.0",
      provides: ["firmware"],
      requiresTransport: ["transport.local-helper"],
      protocol: "platformio-helper-json"
    }
  ],
  uiPanels: [
    {
      id: "firmware-upload",
      title: "Firmware Upload",
      capability: "firmware",
      controls: [
        { id: "board", kind: "metric", label: "Board", capability: "firmware", stateField: "board" },
        { id: "helper", kind: "metric", label: "Helper", capability: "firmware", stateField: "helperReady" },
        { id: "port", kind: "textarea", label: "Serial Port", capability: "firmware", actionId: "upload", stateField: "port", placeholder: "COM6" },
        { id: "status", kind: "metric", label: "Status", capability: "firmware", stateField: "status" },
        { id: "hex-size", kind: "metric", label: "HEX Size", capability: "firmware", stateField: "hexSizeBytes" },
        { id: "logs", kind: "output", label: "Logs", capability: "firmware", stateField: "logs" },
        { id: "check", kind: "button", label: "Check Helper", capability: "firmware", actionId: "helper_check" },
        { id: "ports", kind: "button", label: "Refresh Ports", capability: "firmware", actionId: "ports_refresh" },
        { id: "compile", kind: "button", label: "Compile", capability: "firmware", actionId: "compile" },
        { id: "upload", kind: "button", label: "Upload", capability: "firmware", actionId: "upload" }
      ]
    }
  ]
};
