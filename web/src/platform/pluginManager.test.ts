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
    const state = createPluginManagerState(BUILTIN_PLUGIN_PACKAGES, ["builtin.asme-can-servo"]);
    const asme = state.find((item) => item.id === "builtin.asme-can-servo");

    expect(asme?.status).toBe("enabled");
    expect(asme?.missingRequires).toEqual(["capability.servo", "transport.a-board-can1"]);
    expect(state.find((item) => item.id === "builtin.tb6618-motor")?.status).toBe("blocked");
  });

  it("updates enabled package ids without duplicates", () => {
    expect(enablePluginPackage(["a"], "a")).toEqual(["a"]);
    expect(enablePluginPackage(["a"], "b")).toEqual(["a", "b"]);
    expect(disablePluginPackage(["a", "b"], "a")).toEqual(["b"]);
  });
});
