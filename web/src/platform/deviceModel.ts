import { InboundMessage, MotorProfile, ServoProfile, normalizeMotorChannel } from "../lib/protocol";
import { ArmConfig, CameraConfig } from "../lib/storage";
import { DeviceDescriptor, DeviceStatus } from "./types";

export type ServoFeedbackMap = Record<number, InboundMessage & { type: "servo.feedback" }>;
export type MotorFeedbackMap = Record<string, InboundMessage & { type: "motor.feedback" }>;

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
      streamUrl: input.cameraConfig.streamUrl,
      panServoId: input.cameraConfig.panServoId,
      tiltServoId: input.cameraConfig.tiltServoId
    }
  };

  const armDevice: DeviceDescriptor = {
    id: "robot-arm:main",
    name: "Robot Arm",
    type: "robot-arm",
    driverId: "driver.feetech-servo",
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

  return [...servoDevices, ...motorDevices, cameraDevice, armDevice];
}

function statusForConnection(connected: boolean, activeTransport: boolean): DeviceStatus {
  if (!connected) {
    return "offline";
  }
  return activeTransport ? "standby" : "offline";
}
