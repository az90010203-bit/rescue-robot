import type { ComponentProps, ReactNode } from "react";
import { ArmCanvas } from "@domains/arm/ArmPanels";
import { PlatformPanels } from "@workspaces/architecture/PlatformPanels";
import type { ArmConfig } from "@adapters/persistence/storage";
import type { PlatformCommand } from "@platform/commands";
import type { PlatformEventBus } from "@platform/events";
import { platformCommandForControl } from "@platform/ui";
import type { ArmMotionTarget } from "@app/appModel";

type PlatformPanelsProps = ComponentProps<typeof PlatformPanels>;
type ArmCanvasProps = ComponentProps<typeof ArmCanvas>;

export function createPlatformPanelRenderer(options: {
  addLog: (direction: "rx" | "tx" | "system", text: string, level?: "info" | "warn" | "error") => void;
  dispatchPlatformCommand: (command: PlatformCommand) => Promise<unknown>;
  platformCapabilityCount: number;
  platformDeviceCount: number;
  platformDevices: PlatformPanelsProps["platformDevices"];
  platformEventBusRef: { current: PlatformEventBus };
  platformEvents: PlatformPanelsProps["platformEvents"];
  platformStateCount: number;
  resolvedPlatformDeviceId: string;
  selectedPlatformControlDraft: PlatformPanelsProps["selectedPlatformControlDraft"];
  selectedPlatformDevice: PlatformPanelsProps["selectedPlatformDevice"];
  selectedPlatformState: PlatformPanelsProps["selectedPlatformState"];
  selectedPlatformUiPanel: PlatformPanelsProps["selectedPlatformUiPanel"];
  setSelectedPlatformDeviceId: PlatformPanelsProps["setSelectedPlatformDeviceId"];
  updatePlatformControlDraft: PlatformPanelsProps["updatePlatformControlDraft"];
}) {
  async function runPlatformControlAction(actionId: string | undefined) {
    if (!options.selectedPlatformDevice) {
      return;
    }

    const command = platformCommandForControl(
      options.selectedPlatformDevice,
      actionId,
      options.selectedPlatformControlDraft
    );
    if (typeof command === "string") {
      options.platformEventBusRef.current.emit({
        type: "platform.command.failed",
        level: "error",
        source: options.selectedPlatformDevice.id,
        payload: {
          commandType: actionId ?? "unknown",
          status: "failed",
          message: command
        }
      });
      options.addLog("system", command, "error");
      return;
    }

    await options.dispatchPlatformCommand(command);
  }

  return function renderPlatformPanel(variant: "control" | "deviceTree" | "events" | "state") {
    return (
      <PlatformPanels
        platformCapabilityCount={options.platformCapabilityCount}
        platformDeviceCount={options.platformDeviceCount}
        platformDevices={options.platformDevices}
        platformEvents={options.platformEvents}
        platformStateCount={options.platformStateCount}
        resolvedPlatformDeviceId={options.resolvedPlatformDeviceId}
        runPlatformControlAction={runPlatformControlAction}
        selectedPlatformControlDraft={options.selectedPlatformControlDraft}
        selectedPlatformDevice={options.selectedPlatformDevice}
        selectedPlatformState={options.selectedPlatformState}
        selectedPlatformUiPanel={options.selectedPlatformUiPanel}
        setSelectedPlatformDeviceId={options.setSelectedPlatformDeviceId}
        updatePlatformControlDraft={options.updatePlatformControlDraft}
        variant={variant}
      />
    );
  };
}

export function createArmCanvasRenderer(options: {
  armConfig: ArmConfig;
  armSegmentPoses: ArmCanvasProps["armSegmentPoses"];
  calculateArmMotionTargets: (armConfig: ArmConfig) => ArmMotionTarget[];
  handleArmPointerDown: ArmCanvasProps["handleArmPointerDown"];
  handleArmPointerEnd: ArmCanvasProps["handleArmPointerEnd"];
  handleArmPointerMove: ArmCanvasProps["handleArmPointerMove"];
  servoBusConnected: () => boolean;
  t: ArmCanvasProps["t"];
}) {
  return function renderArmCanvas(): ReactNode {
    return (
      <ArmCanvas
        activeTargets={options.calculateArmMotionTargets(options.armConfig)}
        armConfig={options.armConfig}
        armSegmentPoses={options.armSegmentPoses}
        handleArmPointerDown={options.handleArmPointerDown}
        handleArmPointerEnd={options.handleArmPointerEnd}
        handleArmPointerMove={options.handleArmPointerMove}
        servoBusConnected={options.servoBusConnected}
        t={options.t}
      />
    );
  };
}
