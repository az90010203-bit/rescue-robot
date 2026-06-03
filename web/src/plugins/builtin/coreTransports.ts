import { PlatformPluginPackage } from "../../platform/types";

export const coreTransportsPackage: PlatformPluginPackage = {
  manifest: {
    id: "builtin.core-transports",
    name: "Core Transports",
    version: "0.1.0",
    description: "Shared transport definitions for browser serial and controller JSON links.",
    provides: ["transport.web-serial", "transport.controller-json"]
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
    }
  ]
};
