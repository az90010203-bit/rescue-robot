import { useEffect, useMemo, useRef } from "react";
import { clamp, servoLogicalSpan } from "@adapters/hardware/protocol";
import {
  CAN_SERVO_GROUP_DEFAULT_SPEED_RAW,
  CAN_SERVO_GROUP_SLOTS,
  canServoGroupCenterPositions,
  canServoGroupPluginIds,
  canServoPluginToProfile,
  compileCanServoGroupPositionCommands,
  normalizeCanServoGroupConfig,
  validateCanServoGroupComponentConfig,
  type CanServoGroupComponentConfig,
  type CanServoGroupSlot
} from "@domains/can-servo/canServoGroupComponent";
import { createPlatformCommand, type PlatformCommandResult } from "@platform/commands";
import type { ComponentDefinition, PluginInstance } from "@platform/architectureTypes";

const CAN_GAMEPAD_INTERVAL_MS = 120;
const CAN_GAMEPAD_DEGREES_PER_TICK = 3;
const CAN_GAMEPAD_DEADZONE = 0.08;

interface UseCanServoGamepadRuntimeOptions {
  angleInput: number;
  dispatchPlatformCommand: (command: ReturnType<typeof createPlatformCommand>) => Promise<PlatformCommandResult>;
  enabled: boolean;
  nextSeq: () => number;
  pluginInstances: PluginInstance[];
  components: ComponentDefinition[];
}

export function useCanServoGamepadRuntime({
  angleInput,
  components,
  dispatchPlatformCommand,
  enabled,
  nextSeq,
  pluginInstances
}: UseCanServoGamepadRuntimeOptions) {
  const primaryComponent = useMemo(
    () => components.find((component) => component.kind === "can-servo-group") ?? null,
    [components]
  );
  const config = useMemo(
    () => primaryComponent ? normalizeCanServoGroupConfig(primaryComponent.config, pluginInstances) : null,
    [pluginInstances, primaryComponent]
  );
  const validation = useMemo(
    () => primaryComponent && config
      ? validateCanServoGroupComponentConfig({
          ...primaryComponent,
          kind: "can-servo-group",
          pluginInstanceIds: canServoGroupPluginIds(config),
          config
        }, pluginInstances)
      : "missing CAN servo group component",
    [config, pluginInstances, primaryComponent]
  );
  const runtimeRef = useRef({
    angleInput,
    component: primaryComponent,
    config,
    dispatchPlatformCommand,
    enabled,
    nextSeq,
    pluginInstances,
    validation
  });
  const offsetDegRef = useRef(0);
  const sendingRef = useRef(false);
  const configuredSignatureRef = useRef("");
  const lastCommandSignatureRef = useRef("");
  const componentSignature = primaryComponent && config ? `${primaryComponent.id}:${JSON.stringify(config)}` : "";

  useEffect(() => {
    runtimeRef.current = {
      angleInput,
      component: primaryComponent,
      config,
      dispatchPlatformCommand,
      enabled,
      nextSeq,
      pluginInstances,
      validation
    };
  }, [angleInput, config, dispatchPlatformCommand, enabled, nextSeq, pluginInstances, primaryComponent, validation]);

  useEffect(() => {
    offsetDegRef.current = 0;
    configuredSignatureRef.current = "";
    lastCommandSignatureRef.current = "";
  }, [componentSignature]);

  useEffect(() => {
    const tick = async () => {
      const runtime = runtimeRef.current;
      if (
        sendingRef.current ||
        !runtime.enabled ||
        !runtime.component ||
        !runtime.config ||
        runtime.validation ||
        Math.abs(runtime.angleInput) <= CAN_GAMEPAD_DEADZONE
      ) {
        return;
      }

      const range = canServoGroupOffsetRange(runtime.config, runtime.pluginInstances);
      const nextOffset = clamp(offsetDegRef.current + runtime.angleInput * CAN_GAMEPAD_DEGREES_PER_TICK, range.min, range.max);
      if (nextOffset === offsetDegRef.current && lastCommandSignatureRef.current) {
        return;
      }
      offsetDegRef.current = nextOffset;

      const centers = canServoGroupCenterPositions(runtime.config, runtime.pluginInstances);
      const positions = Object.fromEntries(CAN_SERVO_GROUP_SLOTS.map((slot) => {
        const span = canServoGroupSlotSpan(runtime.config!, runtime.pluginInstances, slot);
        return [slot, clamp((centers[slot] ?? span / 2) + nextOffset, 0, span)];
      })) as Record<CanServoGroupSlot, number>;
      const commandSignature = JSON.stringify({ componentId: runtime.component.id, positions });
      if (commandSignature === lastCommandSignatureRef.current) {
        return;
      }
      lastCommandSignatureRef.current = commandSignature;

      sendingRef.current = true;
      try {
        const configure = configuredSignatureRef.current !== componentSignature;
        const compiled = compileCanServoGroupPositionCommands(
          runtime.config,
          runtime.pluginInstances,
          positions,
          CAN_SERVO_GROUP_DEFAULT_SPEED_RAW,
          {
            configure,
            nextSeq: runtime.nextSeq
          }
        );
        const result = await runtime.dispatchPlatformCommand(createPlatformCommand("can-servo-group.set_positions", `can-servo-group:${runtime.component.id}`, {
          pcCommands: compiled.commands,
          live: true,
          log: false
        }));
        if (result.status !== "failed") {
          configuredSignatureRef.current = componentSignature;
        }
      } finally {
        sendingRef.current = false;
      }
    };

    const timer = window.setInterval(() => void tick(), CAN_GAMEPAD_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [componentSignature]);
}

function canServoGroupOffsetRange(config: CanServoGroupComponentConfig, pluginInstances: PluginInstance[]) {
  const centers = canServoGroupCenterPositions(config, pluginInstances);
  let min = -360;
  let max = 360;
  for (const slot of CAN_SERVO_GROUP_SLOTS) {
    const span = canServoGroupSlotSpan(config, pluginInstances, slot);
    const center = clamp(centers[slot] ?? span / 2, 0, span);
    min = Math.max(min, -center);
    max = Math.min(max, span - center);
  }
  return min <= max ? { min, max } : { min: 0, max: 0 };
}

function canServoGroupSlotSpan(config: CanServoGroupComponentConfig, pluginInstances: PluginInstance[], slot: CanServoGroupSlot): number {
  const plugin = pluginInstances.find((instance) => instance.id === config.servos[slot]);
  const profile = plugin ? canServoPluginToProfile(plugin) : null;
  return profile ? servoLogicalSpan(profile) : 360;
}
