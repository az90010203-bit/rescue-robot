import { describe, expect, it } from "vitest";
import {
  createExternalPluginSource,
  createManifestOnlyPluginPackage,
  enabledExternalPluginSources,
  parsePluginManifest,
  parsePluginManifestJson
} from "./externalPlugins";

describe("external plugin manifest loading", () => {
  it("parses and normalizes plugin manifests", () => {
    expect(
      parsePluginManifest({
        id: "local.dynamixel",
        name: "Dynamixel",
        version: "1.0.0",
        provides: ["driver.dynamixel"],
        requires: ["capability.servo"],
        description: " Servo bus "
      })
    ).toEqual({
      id: "local.dynamixel",
      name: "Dynamixel",
      version: "1.0.0",
      provides: ["driver.dynamixel"],
      requires: ["capability.servo"],
      description: "Servo bus"
    });
  });

  it("parses manifest JSON and reports invalid JSON clearly", () => {
    expect(parsePluginManifestJson('{"id":"x","name":"X","version":"0.1.0","provides":["driver.x"]}').id).toBe("x");
    expect(() => parsePluginManifestJson("{")).toThrow("plugin manifest JSON is invalid");
  });

  it("rejects incomplete manifests", () => {
    expect(() => parsePluginManifest({ id: "x", name: "X", version: "0.1.0", provides: [] })).toThrow("plugin manifest requires non-empty provides");
    expect(() => parsePluginManifest({ id: "x", version: "0.1.0", provides: ["driver.x"] })).toThrow("plugin manifest requires name");
  });

  it("creates disabled external sources and manifest-only packages", () => {
    const manifest = parsePluginManifest({ id: "local.sensor", name: "Sensor", version: "0.1.0", provides: ["driver.sensor"] });
    const source = createExternalPluginSource({ manifest, path: "plugins/sensor" });

    expect(source).toMatchObject({ id: "local.sensor", label: "Sensor", enabled: false, path: "plugins/sensor" });
    expect(createManifestOnlyPluginPackage(manifest)).toEqual({ manifest, plugins: [], uiPanels: [] });
    expect(enabledExternalPluginSources([source, { ...source, id: "enabled", enabled: true }]).map((item) => item.id)).toEqual(["enabled"]);
  });
});
