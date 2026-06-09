import { useEffect, useRef } from "react";
import { buildMotorConfigCommand, buildMotorSetCommand, type MotorPortMapping, type MotorProfile, type MotorStopMode, type MotorTarget, type PcCommand, type ServoProfile } from "@adapters/hardware/protocol";
import {
  normalizeArmConfig,
  normalizeMotorLinkageGroups,
  normalizeServoLinkageGroups,
  type ArmConfig,
  type MotorLinkageGroup,
  type ServoLinkageGroup
} from "@adapters/persistence/storage";
import {
  clampServoCommandStateToLimits,
  createDefaultServoCommandState,
  type ActiveModule,
  type ServoCommandStateMap,
  type ServoSafetyStatusMap
} from "@app/appModel";
import type { ServoSafetyPreset } from "@domains/servo/servoSafety";

export function stableRuntimeSignature(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableRuntimeSignature).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableRuntimeSignature(entry)}`)
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

export function runtimeValuesMatch(left: unknown, right: unknown): boolean {
  return stableRuntimeSignature(left) === stableRuntimeSignature(right);
}

export function driveCommandSignature(stopMode: MotorStopMode, targets: MotorTarget[]): string {
  return stableRuntimeSignature({
    stopMode,
    targets: targets.map((target) => ({
      channel: target.channel,
      speedPercent: target.speedPercent,
      closedLoop: target.closedLoop,
      targetRpm: target.targetRpm
    }))
  });
}

interface UseAppRuntimeEffectsOptions {
  activeModule: ActiveModule;
  addSystemLog: (messageKey: string, level?: any, values?: any) => void;
  cameraCanCommand: boolean;
  cameraConfig: { streamUrl: string; panAngleDeg: number; stepDeg: number; tiltAngleDeg: number };
  cancelServoSafetyMonitor: (id?: number, status?: ServoSafetyStatusMap[number]) => void;
  checkFirmwareHelper: (log?: boolean) => Promise<unknown>;
  connected: boolean;
  currentLanguage: string;
  driveInput: { cameraPan: number; cameraTilt: number };
  driveSetupMappings?: MotorPortMapping[];
  driveTargets: MotorTarget[];
  driveTargetsRef: { current: MotorTarget[] };
  lastDriveCommandRef: { current: string };
  motorLinkageGroups: MotorLinkageGroup[];
  motorLinkageGroupsRef: { current: MotorLinkageGroup[] };
  motors: MotorProfile[];
  nextSeq: () => number;
  nudgeCamera: (deltaPan: number, deltaTilt: number) => Promise<void>;
  sendMotorCommandBatch: (commands: PcCommand[]) => Promise<unknown>;
  selectedChannel: string;
  selectedId: number | "";
  servoLinkageGroups: ServoLinkageGroup[];
  servoLinkageGroupsRef: { current: ServoLinkageGroup[] };
  servoSafetyEnabled: boolean;
  servoSafetyPreset: ServoSafetyPreset;
  servoSafetySettingsRef: { current: { enabled: boolean; preset: ServoSafetyPreset } };
  servos: ServoProfile[];
  setArmConfig: (updater: (current: ArmConfig) => ArmConfig) => void;
  setCameraStreamFailed: (failed: boolean) => void;
  setCameraStreamLoaded: (loaded: boolean) => void;
  setMotorLinkageGroups: (updater: (current: MotorLinkageGroup[]) => MotorLinkageGroup[]) => void;
  setSelectedChannel: (channel: string) => void;
  setSelectedId: (id: number | "") => void;
  setServoCommandById: (updater: (current: ServoCommandStateMap) => ServoCommandStateMap) => void;
  setServoLinkageGroups: (updater: (current: ServoLinkageGroup[]) => ServoLinkageGroup[]) => void;
  stopMode: MotorStopMode;
}

export function useAppRuntimeEffects({
  activeModule,
  addSystemLog,
  cameraCanCommand,
  cameraConfig,
  cancelServoSafetyMonitor,
  checkFirmwareHelper,
  connected,
  currentLanguage,
  driveInput,
  driveSetupMappings = [],
  driveTargets,
  driveTargetsRef,
  lastDriveCommandRef,
  motorLinkageGroups,
  motorLinkageGroupsRef,
  motors,
  nextSeq,
  nudgeCamera,
  sendMotorCommandBatch,
  selectedChannel,
  selectedId,
  servoLinkageGroups,
  servoLinkageGroupsRef,
  servoSafetyEnabled,
  servoSafetyPreset,
  servoSafetySettingsRef,
  servos,
  setArmConfig,
  setCameraStreamFailed,
  setCameraStreamLoaded,
  setMotorLinkageGroups,
  setSelectedChannel,
  setSelectedId,
  setServoCommandById,
  setServoLinkageGroups,
  stopMode
}: UseAppRuntimeEffectsOptions) {
  const lastDriveSetupSignatureRef = useRef("");

  useEffect(() => {
    document.documentElement.lang = currentLanguage;
  }, [currentLanguage]);

  useEffect(() => {
    servoLinkageGroupsRef.current = servoLinkageGroups;
  }, [servoLinkageGroups, servoLinkageGroupsRef]);

  useEffect(() => {
    motorLinkageGroupsRef.current = motorLinkageGroups;
  }, [motorLinkageGroups, motorLinkageGroupsRef]);

  useEffect(() => {
    if (selectedId === "" && servos[0]) {
      setSelectedId(servos[0].id);
    }
  }, [selectedId, servos, setSelectedId]);

  useEffect(() => {
    setServoLinkageGroups((current) => {
      const normalized = normalizeServoLinkageGroups(current, servos);
      return runtimeValuesMatch(normalized, current) ? current : normalized;
    });
  }, [servos, setServoLinkageGroups]);

  useEffect(() => {
    setArmConfig((current) => {
      const normalized = normalizeArmConfig(current, servos);
      return runtimeValuesMatch(normalized, current) ? current : normalized;
    });
  }, [servos, setArmConfig]);

  useEffect(() => {
    setMotorLinkageGroups((current) => {
      const normalized = normalizeMotorLinkageGroups(current, motors);
      return runtimeValuesMatch(normalized, current) ? current : normalized;
    });
  }, [motors, setMotorLinkageGroups]);

  useEffect(() => {
    servoSafetySettingsRef.current = { enabled: servoSafetyEnabled, preset: servoSafetyPreset };
    if (!servoSafetyEnabled) {
      cancelServoSafetyMonitor();
    }
  }, [cancelServoSafetyMonitor, servoSafetyEnabled, servoSafetyPreset, servoSafetySettingsRef]);

  useEffect(() => {
    setServoCommandById((current) => {
      const activeIds = new Set(servos.map((servo) => servo.id));
      let changed = false;
      const next: ServoCommandStateMap = {};

      for (const servo of servos) {
        const nextState = clampServoCommandStateToLimits(current[servo.id] ?? createDefaultServoCommandState(), servo);
        next[servo.id] = nextState;
        if (!current[servo.id] || current[servo.id]?.angleDeg !== nextState.angleDeg) {
          changed = true;
        }
      }

      for (const idText of Object.keys(current)) {
        if (!activeIds.has(Number(idText))) {
          changed = true;
        }
      }

      return changed ? next : current;
    });
  }, [servos, setServoCommandById]);

  useEffect(() => {
    if (!selectedChannel && motors[0]) {
      setSelectedChannel(motors[0].channel);
    }
  }, [motors, selectedChannel, setSelectedChannel]);

  useEffect(() => {
    setCameraStreamLoaded(false);
    setCameraStreamFailed(false);
  }, [cameraConfig.streamUrl, setCameraStreamFailed, setCameraStreamLoaded]);

  useEffect(() => {
    driveTargetsRef.current = driveTargets;
  }, [driveTargets, driveTargetsRef]);

  useEffect(() => {
    if (activeModule !== "camera") {
      lastDriveCommandRef.current = "";
      lastDriveSetupSignatureRef.current = "";
    }
    if (!connected) {
      lastDriveSetupSignatureRef.current = "";
    }
  }, [activeModule, connected, lastDriveCommandRef]);

  useEffect(() => {
    if (activeModule !== "camera" || !connected) {
      return;
    }
    const timer = window.setInterval(async () => {
      const targets = driveTargetsRef.current;
      const signature = driveCommandSignature(stopMode, targets);
      if (signature === lastDriveCommandRef.current) {
        return;
      }
      lastDriveCommandRef.current = signature;
      try {
        const setupSignature = stableRuntimeSignature(driveSetupMappings);
        const setupCommands = setupSignature === lastDriveSetupSignatureRef.current
          ? []
          : driveSetupMappings.map((mapping) => buildMotorConfigCommand(nextSeq(), mapping));
        if (setupCommands.length > 0) {
          lastDriveSetupSignatureRef.current = setupSignature;
        }
        await sendMotorCommandBatch([
          ...setupCommands,
          ...targets.map((target) => buildMotorSetCommand(nextSeq(), { ...target, stopMode }))
        ]);
      } catch {
        addSystemLog("logs.driveCommandInvalid", "error");
      }
    }, 120);
    return () => window.clearInterval(timer);
  }, [activeModule, addSystemLog, connected, driveSetupMappings, driveTargetsRef, lastDriveCommandRef, nextSeq, sendMotorCommandBatch, stopMode]);

  useEffect(() => {
    if (activeModule !== "camera" || !cameraCanCommand || (driveInput.cameraPan === 0 && driveInput.cameraTilt === 0)) {
      return;
    }
    const moveCameraFromInput = () => {
      void nudgeCamera(driveInput.cameraPan * cameraConfig.stepDeg, driveInput.cameraTilt * cameraConfig.stepDeg);
    };
    moveCameraFromInput();
    const timer = window.setInterval(moveCameraFromInput, 220);
    return () => window.clearInterval(timer);
  }, [activeModule, cameraCanCommand, cameraConfig.panAngleDeg, cameraConfig.stepDeg, cameraConfig.tiltAngleDeg, driveInput.cameraPan, driveInput.cameraTilt, nudgeCamera]);

  useEffect(() => {
    void checkFirmwareHelper(false);
  }, [checkFirmwareHelper]);
}
