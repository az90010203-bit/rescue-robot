import { useState } from "react";
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
  connected: boolean;
  connectionMode: ConnectionMode | null;
  selectModule: (module: ActiveModule) => Promise<void>;
  setMotors: (updater: (current: MotorProfile[]) => MotorProfile[]) => void;
  setServos: (updater: (current: ServoProfile[]) => ServoProfile[]) => void;
}

export function useArchitectureRuntime({
  activeModule,
  connected,
  connectionMode,
  selectModule,
  setMotors,
  setServos
}: UseArchitectureRuntimeOptions) {
  const [architecturePluginInstances, setArchitecturePluginInstances] = useState<PluginInstance[]>([]);

  function syncArchitecturePluginInstances(instances: PluginInstance[]) {
    setArchitecturePluginInstances(instances);
    const architectureServos = pluginInstancesToServoProfiles(instances);
    const architectureMotors = pluginInstancesToMotorProfiles(instances);
    if (architectureServos.length > 0) {
      setServos((current) => mergeServoProfiles(current, architectureServos));
    }
    if (architectureMotors.length > 0) {
      setMotors((current) => mergeMotorProfiles(current, architectureMotors));
    }
  }

  async function prepareArchitectureCommand(capability: CapabilityId) {
    const module =
      capability === "servo"
        ? "servo"
        : capability === "motor"
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
  }

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
