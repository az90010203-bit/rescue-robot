import { InboundMessage, normalizeMotorChannel } from "@adapters/hardware/protocol";
import { ArmConfig, CameraConfig, MAIN_CAMERA_SOURCE_ID, SECONDARY_CAMERA_SOURCE_ID } from "@adapters/persistence/storage";
import { DeviceStateSnapshot } from "@platform/types";
import { gamepadSnapshotValues, type PlatformGamepadSnapshotInput } from "@platform/gamepadState";

export type ServoFeedbackMap = Record<number, InboundMessage & { type: "servo.feedback" }>;
export type MotorFeedbackMap = Record<string, InboundMessage & { type: "motor.feedback" }>;

export type PlatformGamepadStateInput = PlatformGamepadSnapshotInput;

export interface PlatformStateInput {
  servoFeedback: ServoFeedbackMap;
  motorFeedback: MotorFeedbackMap;
  cameraConfig: CameraConfig;
  armConfig: ArmConfig;
  connected: boolean;
  connectionMode: "servo-bus" | "controller" | null;
  cameraReady?: boolean;
  cameraReadyBySourceId?: Record<string, boolean>;
  piHelperReady?: boolean;
  piConnectionReady?: boolean;
  piCameraReady?: boolean;
  piTarget?: string;
  piLastExitCode?: number | null;
  piLastOutput?: string | null;
  firmwareHelperReady?: boolean;
  firmwareBusy?: boolean;
  firmwareStatus?: string;
  selectedFirmwarePort?: string;
  firmwareBoard?: string;
  firmwareHexSizeBytes?: number | null;
  firmwareLogs?: string | null;
  activeGamepad?: PlatformGamepadStateInput | null;
  aiVisionHelperReady?: boolean;
  aiVisionMode?: string | null;
  aiVisionSampleDir?: string | null;
  aiVisionDetectionCount?: number | null;
  aiVisionLastLabel?: string | null;
  aiVisionLastConfidence?: number | null;
  aiVisionLastCapturePath?: string | null;
  aiVisionSourceId?: string | null;
  updatedAt?: number;
}

export function createPlatformStateSnapshot(input: PlatformStateInput): Record<string, DeviceStateSnapshot> {
  const updatedAt = input.updatedAt ?? Date.now();
  const mainCameraSource = input.cameraConfig.videoSources.find((source) => source.id === MAIN_CAMERA_SOURCE_ID) ?? input.cameraConfig.videoSources[0];
  const secondaryCameraSource = input.cameraConfig.videoSources.find((source) => source.id === SECONDARY_CAMERA_SOURCE_ID);
  const state: Record<string, DeviceStateSnapshot> = {
    "connection:serial": {
      deviceId: "connection:serial",
      status: input.connected ? "online" : "offline",
      values: {
        connected: input.connected,
        mode: input.connectionMode
      },
      updatedAt
    },
    "camera:main": {
      deviceId: "camera:main",
      status: (input.cameraReadyBySourceId?.[MAIN_CAMERA_SOURCE_ID] ?? input.cameraReady) ? "online" : input.connected && input.connectionMode === "controller" ? "standby" : "offline",
      values: {
        sourceId: MAIN_CAMERA_SOURCE_ID,
        streamUrl: mainCameraSource?.streamUrl ?? input.cameraConfig.streamUrl,
        devicePath: mainCameraSource?.devicePath ?? "/dev/video0",
        port: mainCameraSource?.port ?? 8080,
        webrtcOfferUrl: input.cameraConfig.webrtcOfferUrl,
        streamMode: input.cameraConfig.streamMode,
        latencyProfile: input.cameraConfig.latencyProfile,
        panServoId: input.cameraConfig.panServoId,
        tiltServoId: input.cameraConfig.tiltServoId,
        panAngleDeg: input.cameraConfig.panAngleDeg,
        tiltAngleDeg: input.cameraConfig.tiltAngleDeg
      },
      updatedAt
    },
    "robot-arm:main": {
      deviceId: "robot-arm:main",
      status: input.armConfig.joints.length > 0 ? "standby" : "offline",
      values: {
        jointCount: input.armConfig.joints.length,
        liveDragEnabled: input.armConfig.liveDragEnabled,
        selectedJointId: input.armConfig.selectedJointId
      },
      updatedAt
    },
    "pi:main": {
      deviceId: "pi:main",
      status: input.piConnectionReady ? "online" : input.piHelperReady ? "standby" : "offline",
      values: {
        target: input.piTarget ?? null,
        helperReady: input.piHelperReady ?? false,
        connectionReady: input.piConnectionReady ?? false,
        cameraReady: input.piCameraReady ?? false,
        lastExitCode: input.piLastExitCode ?? null,
        lastOutput: input.piLastOutput ?? null
      },
      updatedAt
    },
    "firmware:local": {
      deviceId: "firmware:local",
      status: input.firmwareBusy ? "standby" : input.firmwareHelperReady ? "online" : "offline",
      values: {
        board: input.firmwareBoard ?? null,
        port: input.selectedFirmwarePort ?? null,
        helperReady: input.firmwareHelperReady ?? false,
        busy: input.firmwareBusy ?? false,
        status: input.firmwareStatus ?? null,
        hexSizeBytes: input.firmwareHexSizeBytes ?? null,
        logs: input.firmwareLogs ?? null
      },
      updatedAt
    },
    "gamepad:active": {
      deviceId: "gamepad:active",
      status: input.activeGamepad ? "online" : "offline",
      values: gamepadSnapshotValues(input.activeGamepad),
      updatedAt
    },
    "ai-vision:local": {
      deviceId: "ai-vision:local",
      status: input.aiVisionHelperReady ? "online" : "offline",
      values: {
        helperReady: input.aiVisionHelperReady ?? false,
        mode: input.aiVisionMode ?? null,
        sampleDir: input.aiVisionSampleDir ?? null,
        sourceId: input.aiVisionSourceId ?? mainCameraSource?.id ?? MAIN_CAMERA_SOURCE_ID,
        detectionCount: input.aiVisionDetectionCount ?? null,
        lastLabel: input.aiVisionLastLabel ?? null,
        lastConfidence: input.aiVisionLastConfidence ?? null,
        lastCapturePath: input.aiVisionLastCapturePath ?? null
      },
      updatedAt
    }
  };

  if (secondaryCameraSource) {
    state["camera:secondary"] = {
      deviceId: "camera:secondary",
      status: input.cameraReadyBySourceId?.[SECONDARY_CAMERA_SOURCE_ID] ? "online" : secondaryCameraSource.streamUrl ? "standby" : "offline",
      values: {
        sourceId: SECONDARY_CAMERA_SOURCE_ID,
        streamUrl: secondaryCameraSource.streamUrl,
        devicePath: secondaryCameraSource.devicePath,
        port: secondaryCameraSource.port
      },
      updatedAt
    };
  }

  for (const feedback of Object.values(input.servoFeedback)) {
    state[`servo:${feedback.id}`] = {
      deviceId: `servo:${feedback.id}`,
      status: "online",
      values: {
        positionRaw: feedback.positionRaw ?? null,
        speedRaw: feedback.speedRaw ?? null,
        loadRaw: feedback.loadRaw ?? null,
        voltageRaw: feedback.voltageRaw ?? null,
        temperatureC: feedback.temperatureC ?? null,
        moving: feedback.moving ?? null,
        currentRaw: feedback.currentRaw ?? null
      },
      updatedAt
    };
  }

  for (const feedback of Object.values(input.motorFeedback)) {
    const channel = normalizeMotorChannel(feedback.channel);
    state[`motor:${channel}`] = {
      deviceId: `motor:${channel}`,
      status: "online",
      values: {
        channel,
        commandedSpeedPercent: feedback.commandedSpeedPercent ?? null,
        dutyPercent: feedback.dutyPercent ?? null,
        direction: feedback.direction ?? null,
        stopMode: feedback.stopMode ?? null,
        speedRpm: feedback.speedRpm ?? null,
        pulseHz: feedback.pulseHz ?? null,
        encoderTicks: feedback.encoderTicks ?? null
      },
      updatedAt
    };
  }

  return state;
}
