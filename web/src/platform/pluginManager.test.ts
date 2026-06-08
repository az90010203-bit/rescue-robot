import { describe, expect, it } from "vitest";
import { BUILTIN_PLUGIN_PACKAGES } from "@platform/builtinPlugins";
import {
  createPluginManagerState,
  defaultEnabledPluginPackageIds,
  disablePluginPackage,
  enablePluginPackage
} from "@platform/pluginManager";

describe("plugin manager state", () => {
  it("enables built-in plugin packages by default", () => {
    const enabled = defaultEnabledPluginPackageIds(BUILTIN_PLUGIN_PACKAGES);
    const state = createPluginManagerState(BUILTIN_PLUGIN_PACKAGES, enabled);

    expect(state.every((item) => item.status === "enabled")).toBe(true);
  });

  it("blocks packages with missing dependencies", () => {
    const state = createPluginManagerState(BUILTIN_PLUGIN_PACKAGES, ["builtin.feetech-servo"]);
    const feetech = state.find((item) => item.id === "builtin.feetech-servo");

    expect(feetech?.status).toBe("enabled");
    expect(feetech?.missingRequires).toEqual(["capability.servo", "transport.web-serial"]);
    expect(state.find((item) => item.id === "builtin.tb6618-motor")?.status).toBe("blocked");
  });

  it("updates enabled package ids without duplicates", () => {
    expect(enablePluginPackage(["a"], "a")).toEqual(["a"]);
    expect(enablePluginPackage(["a"], "b")).toEqual(["a", "b"]);
    expect(disablePluginPackage(["a", "b"], "a")).toEqual(["b"]);
  });
});
