import { describe, expect, it } from "vitest";
import { BUILTIN_PLATFORM_PLUGINS, BUILTIN_PLUGIN_PACKAGES, BUILTIN_UI_PANELS } from "./builtinPlugins";
import { flattenPlatformPlugins, flattenUiPanels, validatePluginPackages } from "./packages";

describe("platform plugin packages", () => {
  it("keeps built-in package manifest ids unique", () => {
    const ids = BUILTIN_PLUGIN_PACKAGES.map((pluginPackage) => pluginPackage.manifest.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("flattens built-in packages into compatible plugin and ui panel exports", () => {
    expect(flattenPlatformPlugins(BUILTIN_PLUGIN_PACKAGES)).toEqual(BUILTIN_PLATFORM_PLUGINS);
    expect(flattenUiPanels(BUILTIN_PLUGIN_PACKAGES)).toEqual(BUILTIN_UI_PANELS);

    expect(BUILTIN_PLATFORM_PLUGINS.map((plugin) => plugin.id)).toEqual(
      expect.arrayContaining([
        "capability.servo",
        "capability.motor",
        "driver.feetech-servo",
        "driver.tb6618-motor",
        "transport.web-serial"
      ])
    );
    expect(BUILTIN_UI_PANELS.map((panel) => panel.id)).toEqual(expect.arrayContaining(["servo-control", "motor-control"]));
  });

  it("rejects duplicate package, plugin, and ui panel ids", () => {
    const [firstPackage, secondPackage] = BUILTIN_PLUGIN_PACKAGES;

    expect(() => validatePluginPackages([firstPackage, firstPackage])).toThrow("platform plugin package already registered");
    expect(() =>
      validatePluginPackages([
        firstPackage,
        {
          ...secondPackage,
          plugins: [firstPackage.plugins[0]]
        }
      ])
    ).toThrow("platform plugin already registered");

    expect(() =>
      validatePluginPackages([
        BUILTIN_PLUGIN_PACKAGES[2],
        {
          ...BUILTIN_PLUGIN_PACKAGES[3],
          uiPanels: [BUILTIN_PLUGIN_PACKAGES[2].uiPanels![0]]
        }
      ])
    ).toThrow("platform ui panel already registered");
  });
});
