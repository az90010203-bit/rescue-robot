import { lazy, Suspense } from "react";
import type { TFunction } from "i18next";
import { CanServoTestPage, type CanServoConfigPatch, type PiAboardBridgeControls } from "@workspaces/can-servo/CanServoTestPage";
import type { ArchitectureLayer } from "@workspaces/architecture/ThreeLayerWorkspace";
import { updatePluginInstance, type DataProject } from "@adapters/data-service/dataService";
import type { AboardBridgeCommandResult } from "@adapters/pi/piAboardBridge";
import type { PiSetupProfile } from "@adapters/pi/piRemote";
import type { AsmgMdBaudKbps } from "@adapters/hardware/asmgMdCanServo";
import type { MotorTarget, PcCommand } from "@adapters/hardware/protocol";
import type { PlatformCommand, PlatformCommandResult } from "@platform/commands";
import { BUILTIN_UI_PANELS } from "@platform/builtinPlugins";
import type { CapabilityId } from "@platform/types";
import type { DatabaseSaveStatus, GamepadSummary } from "@app/appModel";
import type { PluginInstance } from "@platform/architecture";
import type { MotorFeedbackMap, ServoFeedbackMap } from "@platform/stateStore";

const ThreeLayerWorkspace = lazy(async () => {
  const module = await import("@workspaces/architecture/ThreeLayerWorkspace");
  return { default: module.ThreeLayerWorkspace };
});

interface ArchitectureWorkspacePageProps {
  aBoardBridge: PiAboardBridgeControls;
  activeSection: ArchitectureLayer;
  canServoHost: string;
  currentProject: DataProject | null;
  databaseStatus: DatabaseSaveStatus;
  dispatchPlatformCommand: (command: PlatformCommand) => Promise<PlatformCommandResult>;
  driveTargets: MotorTarget[];
  gamepads: GamepadSummary[];
  motorFeedback: MotorFeedbackMap;
  nextCommandSeq: () => number;
  onPluginInstancesChange: (instances: PluginInstance[]) => void;
  onPrepareCommand: (capability: CapabilityId) => Promise<void> | void;
  piRemoteProfile: PiSetupProfile;
  sendAboardBridgeCanServoCommand: (command: PcCommand, options?: { log?: boolean }) => Promise<AboardBridgeCommandResult | null>;
  servoFeedback: ServoFeedbackMap;
  t: TFunction;
}

export function ArchitectureWorkspacePage({
  aBoardBridge,
  activeSection,
  canServoHost,
  currentProject,
  databaseStatus,
  dispatchPlatformCommand,
  driveTargets,
  gamepads,
  motorFeedback,
  nextCommandSeq,
  onPluginInstancesChange,
  onPrepareCommand,
  piRemoteProfile,
  sendAboardBridgeCanServoCommand,
  servoFeedback,
  t
}: ArchitectureWorkspacePageProps) {
  async function updateAsmeCanServoPluginConfig(instance: PluginInstance, patch: CanServoConfigPatch, replacePluginInstance: (instance: PluginInstance) => void) {
    if (!currentProject) {
      return;
    }
    const updated = await updatePluginInstance(currentProject.id, instance.id, {
      config: {
        ...instance.config,
        ...patch
      }
    });
    replacePluginInstance(updated);
  }

  return (
    <Suspense fallback={<div className="empty-state">{t("loading.architecture")}</div>}>
      <ThreeLayerWorkspace
        dataServiceOnline={databaseStatus !== "offline"}
        dispatchPlatformCommand={dispatchPlatformCommand}
        driveTargets={driveTargets}
        gamepads={gamepads}
        layer={activeSection}
        motorFeedback={motorFeedback}
        nextCommandSeq={nextCommandSeq}
        onPluginInstancesChange={onPluginInstancesChange}
        onPrepareCommand={onPrepareCommand}
        piRemoteProfile={piRemoteProfile}
        project={currentProject}
        renderPluginDebugPanel={(instance, { replacePluginInstance }) => {
          if (instance.driverId !== "driver.asme-can-servo") {
            return null;
          }
          return (
            <CanServoTestPage
              aBoardBridge={aBoardBridge}
              host={canServoHost}
              initialBitrateKbps={asmgBaudFromConfig(instance.config.bitrateKbps)}
              initialTargetId={servoIdFromConfig(instance.config.servoId)}
              key={instance.id}
              nextCommandSeq={nextCommandSeq}
              onServoConfigChange={(patch) => updateAsmeCanServoPluginConfig(instance, patch, replacePluginInstance)}
              sendAboardBridgeCanServoCommand={sendAboardBridgeCanServoCommand}
              t={t}
            />
          );
        }}
        sendAboardBridgeCanServoCommand={sendAboardBridgeCanServoCommand}
        servoFeedback={servoFeedback}
        uiPanels={BUILTIN_UI_PANELS}
      />
    </Suspense>
  );
}

function servoIdFromConfig(value: unknown): number {
  const servoId = Number(value);
  return Number.isInteger(servoId) && servoId >= 0 && servoId <= 253 ? servoId : 1;
}

function asmgBaudFromConfig(value: unknown): AsmgMdBaudKbps {
  const bitrate = Number(value);
  if (bitrate === 500 || bitrate === 1000) {
    return bitrate;
  }
  return 250;
}
