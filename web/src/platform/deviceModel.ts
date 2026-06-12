import { InboundMessage, MotorProfile, ServoProfile, normalizeMotorChannel } from "@adapters/hardware/protocol";
import { ArmConfig, CameraConfig, MAIN_CAMERA_SOURCE_ID, SECONDARY_CAMERA_SOURCE_ID } from "@adapters/persistence/storage";
import { DeviceDescriptor, DeviceStatus } from "@platform/types";
import { gamepadSnapshotValues, type PlatformGamepadSnapshotInput } from "@platform/gamepadState";

export type ServoFeedbackMap = Record<number, InboundMessage & { type: "servo.feedback" }>;
export type MotorFeedbackMap = Record<string, InboundMessage & { type: "motor.feedback" }>;

export type PlatformGamepadInput = PlatformGamepadSnapshotInput;

export interface PlatformDeviceModelInput {
  servos: ServoProfile[];
  motors: MotorProfile[];
  cameraConfig: CameraConfig;
  armConfig: ArmConfig;
  servoFeedback: ServoFeedbackMap;
  motorFeedback: MotorFeedbackMap;
  connected: boolean;
  connectionMode: "servo-bus" | "controller" | null;
  cameraReady: boolean;
  cameraReadyBySourceId?: Record<string, boolean>;
  piHelperReady?: boolean;
  piConnectionReady?: boolean;
  piCameraReady?: boolean;
  piTarget?: string;
  firmwareHelperReady?: boolean;
  firmwareBusy?: boolean;
  firmwareStatus?: string;
  selectedFirmwarePort?: string;
  firmwareBoard?: string;
  activeGamepad?: PlatformGamepadInput | null;
  aiVisionHelperReady?: boolean;
  aiVisionMode?: string | null;
  aiVisionSampleDir?: string | null;
  aiVisionDetectionCount?: number | null;
  aiVisionSourceId?: string | null;
}

export function createPlatformDevices(input: PlatformDeviceModelInput): DeviceDescriptor[] {
  const servoStatus = statusForConnection(input.connected, input.connectionMode === "servo-bus");
  const controllerStatus = statusForConnection(input.connected, input.connectionMode === "controller");

  const servoDevices = input.servos.map<DeviceDescriptor>((servo) => ({
    id: `servo:${servo.id}`,
    name: servo.name,
    type: "servo",
    driverId: "driver.feetech-servo",
    transportId: "transport.web-serial",
    status: input.servoFeedback[servo.id] ? "online" : servoStatus,
    capabilities: [
      {
        id: "servo",
        features: ["position_control", "wheel_speed_control", "torque_control", "feedback"]
      }
    ],
    metadata: {
      servoId: servo.id,
      minDeg: servo.minDeg ?? null,
      maxDeg: servo.maxDeg ?? null,
      direction: servo.direction ?? 1
    }
  }));

  const motorDevices = input.motors.map<DeviceDescriptor>((motor) => {
    const channel = normalizeMotorChannel(motor.channel);
    return {
      id: `motor:${channel}`,
      name: motor.name,
      type: "motor",
      driverId: "driver.tb6618-motor",
      transportId: "transport.controller-json",
      status: input.motorFeedback[channel] ? "online" : controllerStatus,
      capabilities: [
        {
          id: "motor",
          features: ["pwm_control", "direction_control", motor.sensorPin ? "encoder_feedback" : "open_loop"]
        }
      ],
      metadata: {
        channel,
        pwmPin: motor.pwmPin ?? null,
        in1Pin: motor.in1Pin ?? null,
        in2Pin: motor.in2Pin ?? null,
        enablePin: motor.enablePin ?? null,
        sensorPin: motor.sensorPin ?? null
      }
    };
  });

  const mainCameraSource = input.cameraConfig.videoSources.find((source) => source.id === MAIN_CAMERA_SOURCE_ID) ?? input.cameraConfig.videoSources[0];
  const secondaryCameraSource = input.cameraConfig.videoSources.find((source) => source.id === SECONDARY_CAMERA_SOURCE_ID);

  const cameraDevice: DeviceDescriptor = {
    id: "camera:main",
    name: "Camera",
    type: "camera",
    driverId: "driver.camera-gimbal",
    transportId: "transport.controller-json",
    status: input.cameraReady ? "online" : controllerStatus,
    capabilities: [
      {
        id: "camera",
        features: ["mjpeg_stream", "servo_gimbal"]
      }
    ],
    metadata: {
      sourceId: MAIN_CAMERA_SOURCE_ID,
      streamUrl: mainCameraSource?.streamUrl ?? input.cameraConfig.streamUrl,
      devicePath: mainCameraSource?.devicePath ?? "/dev/video0",
      port: mainCameraSource?.port ?? 8080,
      panServoId: input.cameraConfig.panServoId,
      tiltServoId: input.cameraConfig.tiltServoId,
      panAngleDeg: input.cameraConfig.panAngleDeg,
      tiltAngleDeg: input.cameraConfig.tiltAngleDeg
    }
  };
  const secondaryCameraDevice: DeviceDescriptor | null = secondaryCameraSource
    ? {
        id: "camera:secondary",
        name: secondaryCameraSource.label,
        type: "camera",
        driverId: "driver.secondary-camera",
        transportId: "transport.ssh",
        status: input.cameraReadyBySourceId?.[SECONDARY_CAMERA_SOURCE_ID] ? "online" : secondaryCameraSource.streamUrl ? "standby" : "offline",
        capabilities: [
          {
            id: "camera",
            features: ["mjpeg_stream", "secondary_source"]
          }
        ],
        metadata: {
          sourceId: SECONDARY_CAMERA_SOURCE_ID,
          streamUrl: secondaryCameraSource.streamUrl,
          devicePath: secondaryCameraSource.devicePath,
          port: secondaryCameraSource.port
        }
      }
    : null;

  const armDevice: DeviceDescriptor = {
    id: "robot-arm:main",
    name: "Robot Arm",
    type: "robot-arm",
    driverId: "driver.robot-arm-composite",
    transportId: "transport.web-serial",
    status: input.armConfig.joints.length > 0 ? servoStatus : "standby",
    capabilities: [
      {
        id: "robot-arm",
        features: ["joint_position_control", "linkage_control"]
      }
    ],
    metadata: {
      jointCount: input.armConfig.joints.length,
      liveDragEnabled: input.armConfig.liveDragEnabled,
      selectedJointId: input.armConfig.selectedJointId
    }
  };

  const piDevice: DeviceDescriptor = {
    id: "pi:main",
    name: "Raspberry Pi",
    type: "raspberry-pi",
    driverId: "driver.raspberry-pi-ssh",
    transportId: "transport.ssh",
    status: input.piConnectionReady ? "online" : input.piHelperReady ? "standby" : "offline",
    capabilities: [
      {
        id: "raspberry-pi",
        features: ["ssh_remote", "sftp_upload", "camera_stream", "python_runtime"]
      }
    ],
    metadata: {
      target: input.piTarget ?? null,
      helperReady: input.piHelperReady ?? false,
      connectionReady: input.piConnectionReady ?? false,
      cameraReady: input.piCameraReady ?? false
    }
  };

  const firmwareDevice: DeviceDescriptor = {
    id: "firmware:local",
    name: "Firmware Helper",
    type: "firmware",
    driverId: "driver.local-firmware-helper",
    transportId: "transport.local-helper",
    status: input.firmwareBusy ? "standby" : input.firmwareHelperReady ? "online" : "offline",
    capabilities: [
      {
        id: "firmware",
        features: ["platformio_compile", "serial_port_scan", "firmware_upload"]
      }
    ],
    metadata: {
      board: input.firmwareBoard ?? null,
      port: input.selectedFirmwarePort ?? null,
      helperReady: input.firmwareHelperReady ?? false,
      busy: input.firmwareBusy ?? false,
      status: input.firmwareStatus ?? null
    }
  };

  const gamepadDevice: DeviceDescriptor = {
    id: "gamepad:active",
    name: input.activeGamepad ? `Gamepad #${input.activeGamepad.index}` : "Gamepad",
    type: "gamepad",
    driverId: "driver.browser-gamepad",
    transportId: "transport.browser-gamepad-api",
    status: input.activeGamepad ? "online" : "offline",
    capabilities: [
      {
        id: "gamepad",
        features: ["drive_input", "camera_gimbal_input", "button_mapping", "live_axes"]
      }
    ],
    metadata: gamepadSnapshotValues(input.activeGamepad)
  };

  const aiVisionDevice: DeviceDescriptor = {
    id: "ai-vision:local",
    name: "AI Vision",
    type: "ai-vision",
    driverId: "driver.ai-vision-helper",
    transportId: "transport.local-helper",
    status: input.aiVisionHelperReady ? "online" : "offline",
    capabilities: [
      {
        id: "ai-vision",
        features: ["mjpeg_stream_analysis", "sample_capture", "external_helper"]
      }
    ],
    metadata: {
      helperReady: input.aiVisionHelperReady ?? false,
      mode: input.aiVisionMode ?? null,
      sampleDir: input.aiVisionSampleDir ?? null,
      detectionCount: input.aiVisionDetectionCount ?? null,
      sourceId: input.aiVisionSourceId ?? MAIN_CAMERA_SOURCE_ID,
      streamUrl: mainCameraSource?.streamUrl ?? input.cameraConfig.streamUrl
    }
  };

  return [...servoDevices, ...motorDevices, cameraDevice, ...(secondaryCameraDevice ? [secondaryCameraDevice] : []), armDevice, piDevice, firmwareDevice, gamepadDevice, aiVisionDevice];
}

function statusForConnection(connected: boolean, activeTransport: boolean): DeviceStatus {
  if (!connected) {
    return "offline";
  }
  return activeTransport ? "standby" : "offline";
}
