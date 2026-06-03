import { PlatformPlugin, PlatformPluginPackage, UiPanelSchema } from "./types";

export function flattenPlatformPlugins(packages: PlatformPluginPackage[]): PlatformPlugin[] {
  return packages.flatMap((pluginPackage) => pluginPackage.plugins);
}

export function flattenUiPanels(packages: PlatformPluginPackage[]): UiPanelSchema[] {
  return packages.flatMap((pluginPackage) => pluginPackage.uiPanels ?? []);
}

export function validatePluginPackages(packages: PlatformPluginPackage[]): void {
  const packageIds = new Set<string>();
  const pluginIds = new Set<string>();
  const uiPanelIds = new Set<string>();

  for (const pluginPackage of packages) {
    if (packageIds.has(pluginPackage.manifest.id)) {
      throw new Error(`platform plugin package already registered: ${pluginPackage.manifest.id}`);
    }
    packageIds.add(pluginPackage.manifest.id);

    for (const plugin of pluginPackage.plugins) {
      if (pluginIds.has(plugin.id)) {
        throw new Error(`platform plugin already registered: ${plugin.id}`);
      }
      pluginIds.add(plugin.id);
    }

    for (const panel of pluginPackage.uiPanels ?? []) {
      if (uiPanelIds.has(panel.id)) {
        throw new Error(`platform ui panel already registered: ${panel.id}`);
      }
      uiPanelIds.add(panel.id);
    }
  }
}
