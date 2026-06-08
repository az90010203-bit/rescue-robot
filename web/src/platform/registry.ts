import { CapabilityPlugin, DriverPlugin, PlatformPlugin, PlatformPluginManifest, PlatformPluginPackage, TransportPlugin } from "@platform/types";

export class PlatformRegistry {
  private readonly plugins = new Map<string, PlatformPlugin>();
  private readonly packages = new Map<string, PlatformPluginManifest>();

  registerPackage(pluginPackage: PlatformPluginPackage): void {
    if (this.packages.has(pluginPackage.manifest.id)) {
      throw new Error(`platform plugin package already registered: ${pluginPackage.manifest.id}`);
    }
    for (const plugin of pluginPackage.plugins) {
      if (this.plugins.has(plugin.id)) {
        throw new Error(`platform plugin already registered: ${plugin.id}`);
      }
    }
    this.packages.set(pluginPackage.manifest.id, pluginPackage.manifest);
    for (const plugin of pluginPackage.plugins) {
      this.plugins.set(plugin.id, plugin);
    }
  }

  register(plugin: PlatformPlugin): void {
    if (this.plugins.has(plugin.id)) {
      throw new Error(`platform plugin already registered: ${plugin.id}`);
    }
    this.plugins.set(plugin.id, plugin);
  }

  registerMany(plugins: PlatformPlugin[]): void {
    for (const plugin of plugins) {
      this.register(plugin);
    }
  }

  getPlugin(id: string): PlatformPlugin | undefined {
    return this.plugins.get(id);
  }

  getPackageManifest(id: string): PlatformPluginManifest | undefined {
    return this.packages.get(id);
  }

  listPackages(): PlatformPluginManifest[] {
    return Array.from(this.packages.values());
  }

  listPlugins(): PlatformPlugin[] {
    return Array.from(this.plugins.values());
  }

  listCapabilities(): CapabilityPlugin[] {
    return this.listPlugins().filter((plugin): plugin is CapabilityPlugin => plugin.kind === "capability");
  }

  listDrivers(): DriverPlugin[] {
    return this.listPlugins().filter((plugin): plugin is DriverPlugin => plugin.kind === "driver");
  }

  listTransports(): TransportPlugin[] {
    return this.listPlugins().filter((plugin): plugin is TransportPlugin => plugin.kind === "transport");
  }
}

export function createPlatformRegistry(plugins: PlatformPlugin[] = []): PlatformRegistry {
  const registry = new PlatformRegistry();
  registry.registerMany(plugins);
  return registry;
}
