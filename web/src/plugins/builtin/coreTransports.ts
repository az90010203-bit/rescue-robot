import { PlatformPluginPackage } from "../../platform/types";

export const coreTransportsPackage: PlatformPluginPackage = {
  manifest: {
    id: "builtin.core-transports",
    name: "Core Transports",
    version: "0.1.0",
    description: "Shared transport definitions for browser serial, browser input, local helpers, and SSH links.",
    provides: ["transport.web-serial", "transport.controller-json", "transport.browser-gamepad-api", "transport.local-helper", "transport.ssh"]
  },
  plugins: [
    {
      id: "transport.web-serial",
      kind: "transport",
      name: "Web Serial",
      version: "0.1.0",
      modes: ["binary", "json"]
    },
    {
      id: "transport.controller-json",
      kind: "transport",
      name: "Controller JSON Serial",
      version: "0.1.0",
      modes: ["json"]
    },
    {
      id: "transport.browser-gamepad-api",
      kind: "transport",
      name: "Browser Gamepad API",
      version: "0.1.0",
      modes: ["browser-event", "polling"]
    },
    {
      id: "transport.local-helper",
      kind: "transport",
      name: "Local Helper HTTP",
      version: "0.1.0",
      modes: ["http", "json"]
    },
    {
      id: "transport.ssh",
      kind: "transport",
      name: "SSH Helper",
      version: "0.1.0",
      modes: ["ssh", "sftp", "json"]
    }
  ]
};
