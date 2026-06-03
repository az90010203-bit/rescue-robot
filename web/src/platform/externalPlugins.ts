import { ExternalPluginSource, PlatformPluginManifest, PlatformPluginPackage } from "./types";

export function parsePluginManifest(value: unknown): PlatformPluginManifest {
  if (!value || typeof value !== "object") {
    throw new Error("plugin manifest must be an object");
  }
  const draft = value as Record<string, unknown>;
  const id = stringField(draft, "id");
  const name = stringField(draft, "name");
  const version = stringField(draft, "version");
  const provides = stringArrayField(draft, "provides");
  const requires = draft.requires === undefined ? undefined : stringArrayField(draft, "requires");
  const description = draft.description === undefined ? undefined : stringField(draft, "description");
  return { id, name, version, provides, ...(requires ? { requires } : {}), ...(description ? { description } : {}) };
}

export function parsePluginManifestJson(json: string): PlatformPluginManifest {
  try {
    return parsePluginManifest(JSON.parse(json));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error("plugin manifest JSON is invalid");
    }
    throw error;
  }
}

export function createExternalPluginSource(options: {
  label?: string;
  path?: string;
  manifest: PlatformPluginManifest;
  enabled?: boolean;
}): ExternalPluginSource {
  return {
    id: options.manifest.id,
    label: options.label ?? options.manifest.name,
    path: options.path,
    manifest: options.manifest,
    enabled: options.enabled ?? false
  };
}

export function createManifestOnlyPluginPackage(manifest: PlatformPluginManifest): PlatformPluginPackage {
  return {
    manifest,
    plugins: [],
    uiPanels: []
  };
}

export function enabledExternalPluginSources(sources: ExternalPluginSource[]): ExternalPluginSource[] {
  return sources.filter((source) => source.enabled);
}

function stringField(value: Record<string, unknown>, key: string): string {
  const field = value[key];
  if (typeof field !== "string" || !field.trim()) {
    throw new Error(`plugin manifest requires ${key}`);
  }
  return field.trim();
}

function stringArrayField(value: Record<string, unknown>, key: string): string[] {
  const field = value[key];
  if (!Array.isArray(field) || field.length === 0 || field.some((item) => typeof item !== "string" || !item.trim())) {
    throw new Error(`plugin manifest requires non-empty ${key}`);
  }
  return field.map((item) => String(item).trim());
}
