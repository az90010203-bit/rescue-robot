import { useEffect, useMemo, useRef, useState } from "react";
import { ArmConfig, CameraConfig } from "@adapters/persistence/storage";
import { MotorProfile, ServoProfile, normalizeMotorChannel } from "@adapters/hardware/protocol";
import { BUILTIN_PLATFORM_PLUGINS, BUILTIN_UI_PANELS } from "@platform/builtinPlugins";
import { createPlatformDevices } from "@platform/deviceModel";
import { PlatformEventBus } from "@platform/events";
import { createPlatformRegistry } from "@platform/registry";
import { createPlatformStateSnapshot } from "@platform/stateStore";
import { PlatformEvent } from "@platform/types";
import {
  findPlatformUiPanelForDevice,
  limitPlatformEvents,
  platformControlDefaultsForDevice,
  PlatformControlDraft,
  resolveSelectedPlatformDeviceId
} from "@platform/ui";
import { ActiveModule, MotorFeedbackMap, ServoFeedbackMap } from "@app/appModel";

interface UsePlatformRuntimeOptions {
  activeModule: ActiveModule;
  armConfig: ArmConfig;
  cameraConfig: CameraConfig;
  cameraReady: boolean;
  cameraReadyBySourceId?: Record<string, boolean>;
  connected: boolean;
  connectionMode: "servo-bus" | "controller" | null;
  motorFeedback: MotorFeedbackMap;
  motors: MotorProfile[];
  selectedChannel: string;
  selectedId: number | "";
  servoFeedback: ServoFeedbackMap;
  servos: ServoProfile[];
}

export function usePlatformRuntime({
  activeModule,
  armConfig,
  cameraConfig,
  cameraReady,
  cameraReadyBySourceId,
  connected,
  connectionMode,
  motorFeedback,
  motors,
  selectedChannel,
  selectedId,
  servoFeedback,
  servos
}: UsePlatformRuntimeOptions) {
  const platformRegistryRef = useRef(createPlatformRegistry(BUILTIN_PLATFORM_PLUGINS));
  const platformEventBusRef = useRef(new PlatformEventBus());
  const [selectedPlatformDeviceId, setSelectedPlatformDeviceId] = useState("");
  const [platformEvents, setPlatformEvents] = useState<PlatformEvent[]>([]);
  const [platformControlDraftByDeviceId, setPlatformControlDraftByDeviceId] = useState<Record<string, PlatformControlDraft>>({});

  const platformDevices = useMemo(
    () =>
      createPlatformDevices({
        servos,
        motors,
        cameraConfig,
        armConfig,
        servoFeedback,
        motorFeedback,
        connected,
        connectionMode,
        cameraReady,
        cameraReadyBySourceId
      }),
    [armConfig, cameraConfig, cameraReady, cameraReadyBySourceId, connected, connectionMode, motorFeedback, motors, servoFeedback, servos]
  );
  const platformState = useMemo(
    () =>
      createPlatformStateSnapshot({
        servoFeedback,
        motorFeedback,
        cameraConfig,
        armConfig,
        connected,
        connectionMode,
        cameraReady,
        cameraReadyBySourceId
      }),
    [armConfig, cameraConfig, cameraReady, cameraReadyBySourceId, connected, connectionMode, motorFeedback, servoFeedback]
  );
  const preferredPlatformDeviceId =
    activeModule === "servo" && selectedId !== ""
      ? `servo:${selectedId}`
      : activeModule === "motor" && selectedChannel
        ? `motor:${normalizeMotorChannel(selectedChannel)}`
        : activeModule === "arm"
          ? "robot-arm:main"
          : activeModule === "camera"
            ? "camera:main"
            : null;
  const resolvedPlatformDeviceId = resolveSelectedPlatformDeviceId(platformDevices, selectedPlatformDeviceId, preferredPlatformDeviceId);
  const selectedPlatformDevice = platformDevices.find((device) => device.id === resolvedPlatformDeviceId);
  const selectedPlatformState = resolvedPlatformDeviceId ? platformState[resolvedPlatformDeviceId] : undefined;
  const selectedPlatformUiPanel = findPlatformUiPanelForDevice(selectedPlatformDevice, BUILTIN_UI_PANELS);
  const selectedPlatformControlDraft =
    (resolvedPlatformDeviceId ? platformControlDraftByDeviceId[resolvedPlatformDeviceId] : undefined) ?? platformControlDefaultsForDevice(selectedPlatformDevice);
  const platformCapabilityCount = platformRegistryRef.current.listCapabilities().length;
  const platformDeviceCount = platformDevices.length;
  const platformStateCount = Object.keys(platformState).length;

  useEffect(() => {
    if (selectedPlatformDeviceId !== resolvedPlatformDeviceId) {
      setSelectedPlatformDeviceId(resolvedPlatformDeviceId);
    }
  }, [resolvedPlatformDeviceId, selectedPlatformDeviceId]);

  useEffect(() => {
    const unsubscribe = platformEventBusRef.current.subscribe(() => {
      setPlatformEvents(limitPlatformEvents(platformEventBusRef.current.getRecentEvents(), 10));
    });
    setPlatformEvents(limitPlatformEvents(platformEventBusRef.current.getRecentEvents(), 10));
    return unsubscribe;
  }, []);

  function updatePlatformControlDraft(deviceId: string, key: string, value: string | number | boolean) {
    const defaults = platformControlDefaultsForDevice(platformDevices.find((device) => device.id === deviceId));
    setPlatformControlDraftByDeviceId((current) => ({
      ...current,
      [deviceId]: {
        ...defaults,
        ...current[deviceId],
        [key]: value
      }
    }));
  }

  return {
    platformCapabilityCount,
    platformDeviceCount,
    platformDevices,
    platformEventBusRef,
    platformEvents,
    platformState,
    platformStateCount,
    resolvedPlatformDeviceId,
    selectedPlatformControlDraft,
    selectedPlatformDevice,
    selectedPlatformState,
    selectedPlatformUiPanel,
    setSelectedPlatformDeviceId,
    updatePlatformControlDraft
  };
}
