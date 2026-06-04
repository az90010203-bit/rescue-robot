import { ThreeLayerWorkspace, type ArchitectureLayer } from "../components/ThreeLayerWorkspace";
import type { DataProject } from "../lib/dataService";
import type { PlatformCommand, PlatformCommandResult } from "../platform/commands";
import { BUILTIN_UI_PANELS } from "../platform/builtinPlugins";
import type { CapabilityId } from "../platform/types";
import type { DatabaseSaveStatus } from "./appModel";
import type { PluginInstance } from "../platform/architecture";

interface ArchitectureWorkspacePageProps {
  activeSection: ArchitectureLayer;
  currentProject: DataProject | null;
  databaseStatus: DatabaseSaveStatus;
  dispatchPlatformCommand: (command: PlatformCommand) => Promise<PlatformCommandResult>;
  onPluginInstancesChange: (instances: PluginInstance[]) => void;
  onPrepareCommand: (capability: CapabilityId) => Promise<void> | void;
}

export function ArchitectureWorkspacePage({
  activeSection,
  currentProject,
  databaseStatus,
  dispatchPlatformCommand,
  onPluginInstancesChange,
  onPrepareCommand
}: ArchitectureWorkspacePageProps) {
  return (
    <ThreeLayerWorkspace
      dataServiceOnline={databaseStatus !== "offline"}
      dispatchPlatformCommand={dispatchPlatformCommand}
      layer={activeSection}
      onPluginInstancesChange={onPluginInstancesChange}
      onPrepareCommand={onPrepareCommand}
      project={currentProject}
      uiPanels={BUILTIN_UI_PANELS}
    />
  );
}
