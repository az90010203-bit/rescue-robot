import { PlatformPluginPackage } from "@platform/types";

export const raspberryPiPackage: PlatformPluginPackage = {
  manifest: {
    id: "builtin.raspberry-pi",
    name: "Raspberry Pi Remote",
    version: "0.1.0",
    description: "Raspberry Pi SSH helper driver and remote test UI schema.",
    provides: ["driver.raspberry-pi-ssh", "ui.raspberry-pi-remote"],
    requires: ["capability.raspberry-pi", "transport.ssh", "transport.local-helper"]
  },
  plugins: [
    {
      id: "driver.raspberry-pi-ssh",
      kind: "driver",
      name: "Raspberry Pi SSH",
      version: "0.1.0",
      provides: ["raspberry-pi"],
      requiresTransport: ["transport.ssh", "transport.local-helper"],
      protocol: "ssh-helper-json"
    }
  ],
  uiPanels: [
    {
      id: "raspberry-pi-remote",
      title: "Raspberry Pi Remote",
      capability: "raspberry-pi",
      controls: [
        { id: "target", kind: "metric", label: "Target", capability: "raspberry-pi", stateField: "target" },
        { id: "helper", kind: "metric", label: "Helper", capability: "raspberry-pi", stateField: "helperReady" },
        { id: "command", kind: "textarea", label: "Command", capability: "raspberry-pi", actionId: "exec", stateField: "command", placeholder: "python3 main.py" },
        { id: "file", kind: "file", label: "Local File", capability: "raspberry-pi", actionId: "upload_file", stateField: "file" },
        { id: "output", kind: "output", label: "Output", capability: "raspberry-pi", stateField: "lastOutput" },
        { id: "check", kind: "button", label: "Check", capability: "raspberry-pi", actionId: "check" },
        { id: "setup", kind: "button", label: "Setup", capability: "raspberry-pi", actionId: "setup" },
        { id: "upload", kind: "button", label: "Upload", capability: "raspberry-pi", actionId: "upload_file" },
        { id: "exec", kind: "button", label: "Execute", capability: "raspberry-pi", actionId: "exec" },
        { id: "upload-exec", kind: "button", label: "Upload + Execute", capability: "raspberry-pi", actionId: "upload_and_exec" },
        { id: "camera-check", kind: "button", label: "Check Camera", capability: "raspberry-pi", actionId: "camera_check" },
        { id: "camera-start", kind: "button", label: "Start Camera", capability: "raspberry-pi", actionId: "camera_start" },
        { id: "camera-stop", kind: "button", label: "Stop Camera", capability: "raspberry-pi", actionId: "camera_stop" },
        { id: "camera-tools", kind: "button", label: "Install Camera Tools", capability: "raspberry-pi", actionId: "camera_install_tools" }
      ]
    }
  ]
};
