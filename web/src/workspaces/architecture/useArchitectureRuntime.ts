import { useCallback, useEffect, useState } from "react";
import { listPluginInstances } from "@adapters/data-service/dataService";
import type { MotorProfile, ServoProfile } from "@adapters/hardware/protocol";
import {
  type PluginInstance,
  pluginInstancesToMotorProfiles,
  pluginInstancesToServoProfiles
} from "@platform/architecture";
import type { CapabilityId } from "@platform/types";
import { isServoBusModule, type ActiveModule, type ConnectionMode } from "@app/appModel";

interface UseArchitectureRuntimeOptions {
  activeModule: ActiveModule;
  autoSyncPluginInstances?: boolean;
  connected: boolean;
  connectionMode: ConnectionMode | null;
  projectId?: string | null;
  selectModule: (module: ActiveModule) => Promise<void>;
  setMotors: (updater: (current: MotorProfile[]) => MotorProfile[]) => void;
  setServos: (updater: (current: ServoProfile[]) => ServoProfile[]) => void;
}

export function useArchitectureRuntime({
  activeModule,
  autoSyncPluginInstances = false,
  connected,
  connectionMode,
  projectId,
  selectModule,
  setMotors,
  setServos
}: UseArchitectureRuntimeOptions) {
  const [architecturePluginInstances, setArchitecturePluginInstances] = useState<PluginInstance[]>([]);

  const syncArchitecturePluginInstances = useCallback((instances: PluginInstance[]) => {
    setArchitecturePluginInstances(instances);
    const architectureServos = pluginInstancesToServoProfiles(instances);
    const architectureMotors = pluginInstancesToMotorProfiles(instances);
    if (architectureServos.length > 0) {
      setServos((current) => mergeServoProfiles(current, architectureServos));
    }
    if (architectureMotors.length > 0) {
      setMotors((current) => mergeMotorProfiles(current, architectureMotors));
    }
  }, [setMotors, setServos]);

  useEffect(() => {
    if (!autoSyncPluginInstances || !projectId) {
      return;
    }
    let cancelled = false;
    void listPluginInstances(projectId)
      .then((instances) => {
        if (!cancelled) {
          syncArchitecturePluginInstances(instances);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [autoSyncPluginInstances, projectId, syncArchitecturePluginInstances]);

  const prepareArchitectureCommand = useCallback(async (capability: CapabilityId) => {
    const module =
      capability === "servo"
        ? "servo"
        : capability === "motor" || capability === "mecanum-drive" || capability === "can-servo-group"
          ? "motor"
          : capability === "robot-arm"
            ? "arm"
            : capability === "camera"
              ? "camera"
              : activeModule;
    const targetMode: ConnectionMode = isServoBusModule(module) ? "servo-bus" : "controller";
    if (module !== activeModule || (connected && connectionMode !== targetMode)) {
      await selectModule(module);
    }
  }, [activeModule, connected, connectionMode, selectModule]);

  return {
    architecturePluginInstances,
    prepareArchitectureCommand,
    syncArchitecturePluginInstances
  };
}

function mergeServoProfiles(current: ServoProfile[], incoming: ServoProfile[]): ServoProfile[] {
  const byId = new Map(current.map((servo) => [servo.id, servo]));
  for (const servo of incoming) {
    byId.set(servo.id, { ...byId.get(servo.id), ...servo });
  }
  return Array.from(byId.values()).sort((a, b) => a.id - b.id);
}

function mergeMotorProfiles(current: MotorProfile[], incoming: MotorProfile[]): MotorProfile[] {
  const byChannel = new Map(current.map((motor) => [motor.channel, motor]));
  for (const motor of incoming) {
    byChannel.set(motor.channel, { ...byChannel.get(motor.channel), ...motor });
  }
  return Array.from(byChannel.values()).sort((a, b) => a.channel.localeCompare(b.channel, undefined, { numeric: true }));
}
