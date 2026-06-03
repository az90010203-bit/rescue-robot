import { InboundMessage, normalizeMotorChannel } from "../lib/protocol";
import { ArmConfig, CameraConfig } from "../lib/storage";
import { DeviceStateSnapshot } from "./types";

export type ServoFeedbackMap = Record<number, InboundMessage & { type: "servo.feedback" }>;
export type MotorFeedbackMap = Record<string, InboundMessage & { type: "motor.feedback" }>;

export interface PlatformStateInput {
  servoFeedback: ServoFeedbackMap;
  motorFeedback: MotorFeedbackMap;
  cameraConfig: CameraConfig;
  armConfig: ArmConfig;
  connected: boolean;
  connectionMode: "servo-bus" | "controller" | null;
  updatedAt?: number;
}

export function createPlatformStateSnapshot(input: PlatformStateInput): Record<string, DeviceStateSnapshot> {
  const updatedAt = input.updatedAt ?? Date.now();
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
      status: input.connected && input.connectionMode === "controller" ? "standby" : "offline",
      values: {
        streamUrl: input.cameraConfig.streamUrl,
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
    }
  };

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
