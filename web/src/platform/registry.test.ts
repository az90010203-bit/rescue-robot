import { describe, expect, it } from "vitest";
import { BUILTIN_PLATFORM_PLUGINS, feetechServoPackage } from "@platform/builtinPlugins";
import { createPlatformRegistry } from "@platform/registry";

describe("platform registry", () => {
  it("loads built-in platform plugins by kind", () => {
    const registry = createPlatformRegistry(BUILTIN_PLATFORM_PLUGINS);

    expect(registry.listCapabilities().map((plugin) => plugin.id)).toContain("capability.servo");
    expect(registry.listDrivers().map((plugin) => plugin.id)).toContain("driver.feetech-servo");
    expect(registry.listTransports().map((plugin) => plugin.id)).toContain("transport.web-serial");
  });

  it("rejects duplicate plugin ids", () => {
    const [plugin] = BUILTIN_PLATFORM_PLUGINS;
    const registry = createPlatformRegistry([plugin]);

    expect(() => registry.register(plugin)).toThrow("platform plugin already registered");
  });

  it("registers plugin packages and exposes manifests", () => {
    const registry = createPlatformRegistry();
    registry.registerPackage(feetechServoPackage);

    expect(registry.getPackageManifest("builtin.feetech-servo")).toMatchObject({
      id: "builtin.feetech-servo",
      name: "Feetech Servo"
    });
    expect(registry.listPackages().map((manifest) => manifest.id)).toEqual(["builtin.feetech-servo"]);
    expect(registry.getPlugin("driver.feetech-servo")?.id).toBe("driver.feetech-servo");
  });

  it("rejects duplicate plugin package ids", () => {
    const registry = createPlatformRegistry();
    registry.registerPackage(feetechServoPackage);

    expect(() => registry.registerPackage(feetechServoPackage)).toThrow("platform plugin package already registered");
  });

  it("does not keep a package manifest when package registration fails", () => {
    const registry = createPlatformRegistry([feetechServoPackage.plugins[0]]);

    expect(() => registry.registerPackage(feetechServoPackage)).toThrow("platform plugin already registered");
    expect(registry.getPackageManifest("builtin.feetech-servo")).toBeUndefined();
  });
});
