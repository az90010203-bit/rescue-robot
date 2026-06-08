import { PlatformPluginPackage } from "@platform/types";

export type ManagedPluginStatus = "enabled" | "disabled" | "blocked";

export interface ManagedPluginPackage {
  id: string;
  name: string;
  version: string;
  status: ManagedPluginStatus;
  provides: string[];
  requires: string[];
  missingRequires: string[];
}

export function createPluginManagerState(packages: PlatformPluginPackage[], enabledPackageIds: string[]): ManagedPluginPackage[] {
  const enabledIds = new Set(enabledPackageIds);
  const providedByEnabled = new Set<string>();

  for (const pluginPackage of packages) {
    if (enabledIds.has(pluginPackage.manifest.id)) {
      for (const item of pluginPackage.manifest.provides) {
        providedByEnabled.add(item);
      }
    }
  }

  return packages.map((pluginPackage) => {
    const requires = pluginPackage.manifest.requires ?? [];
    const missingRequires = requires.filter((item) => !providedByEnabled.has(item));
    const enabled = enabledIds.has(pluginPackage.manifest.id);
    return {
      id: pluginPackage.manifest.id,
      name: pluginPackage.manifest.name,
      version: pluginPackage.manifest.version,
      status: enabled ? "enabled" : missingRequires.length > 0 ? "blocked" : "disabled",
      provides: pluginPackage.manifest.provides,
      requires,
      missingRequires
    };
  });
}

export function enablePluginPackage(enabledPackageIds: string[], packageId: string): string[] {
  return enabledPackageIds.includes(packageId) ? enabledPackageIds : [...enabledPackageIds, packageId];
}

export function disablePluginPackage(enabledPackageIds: string[], packageId: string): string[] {
  return enabledPackageIds.filter((id) => id !== packageId);
}

export function defaultEnabledPluginPackageIds(packages: PlatformPluginPackage[]): string[] {
  return packages.map((pluginPackage) => pluginPackage.manifest.id);
}
