import type { PiDiscoveryCandidate } from "./runtime/piDiscoveryLite";
import { DEFAULT_PRIORITY_SETTINGS } from "./runtime/priority";
import type { AsmgMdServoProfile } from "@adapters/hardware/asmgMdCanServo";
import type { MotorProfile, MotorStopMode, ServoProfile } from "@adapters/hardware/protocol";

export const A_BOARD_BRIDGE_PORT = 17353;
export const PI_SERVO_BRIDGE_PORT = 17354;
export const CAMERA_PORTS = {
  main: 8080,
  secondary: 8081
} as const;

export interface PwmServoProfile {
  id: string;
  name: string;
  silk: string;
  pin: string;
  frequencyHz: number;
  minPulseUs: number;
  centerPulseUs: number;
  maxPulseUs: number;
}

export interface LiteDriveProfile {
  speedLimitPercent: number;
  stopMode: MotorStopMode;
  deadzone: number;
  mecanum: {
    frontLeft: string;
    frontRight: string;
    rearLeft: string;
    rearRight: string;
  };
  tracked: {
    left: string;
    right: string;
  };
}

export interface LiteCanJogProfile {
  frontIds: number[];
  rearIds: number[];
  positions: {
    leftFront: number;
    rightFront: number;
    leftRear: number;
    rightRear: number;
  };
  stepDeg: number;
  intervalMs: number;
  speedRaw: number;
}

export interface LiteArmProfile {
  j1ServoId: number;
  j2ServoId: number;
  link1Length: number;
  link2Length: number;
  forwardSpeedPerSecond: number;
  liftSpeedPerSecond: number;
  deadzone: number;
  commandIntervalMs: number;
  maxAngleStepDeg: number;
  minForward: number;
  maxForward: number;
  minHeight: number;
  maxHeight: number;
  minReachMargin: number;
  maxReachMargin: number;
  zeroJ1Deg: number;
  zeroJ2Deg: number;
  trimJ1Deg: number;
  trimJ2Deg: number;
  j1Sign: 1 | -1;
  j2Sign: 1 | -1;
  elbowSign: 1 | -1;
  speedRaw: number;
  acc: number;
  calibrated: boolean;
}

export const ROBOT_PROFILE = {
  name: "Rescue Robot Lite",
  defaultPiHost: "rescue-pi.local",
  piCandidates: [
    { host: "rescue-pi.local", label: "USB hostname", source: "usb-gadget-hostname" },
    { host: "raspberrypi.local", label: "mDNS hostname", source: "mdns" },
    { host: "10.12.194.1", label: "USB gadget fallback", source: "usb-gadget-fallback" },
    { host: "10.43.0.1", label: "Manual USB fallback", source: "manual-usb-fallback" }
  ] satisfies PiDiscoveryCandidate[],
  priorities: DEFAULT_PRIORITY_SETTINGS,
  can: {
    bus: "CAN1",
    bitrateKbps: 250 as const,
    servos: [
      { id: 1, name: "CAN J1", minDeg: 10, maxDeg: 110, direction: 1, bitrateKbps: 250, canBus: "CAN1" },
      { id: 2, name: "CAN J2", minDeg: 20, maxDeg: 120, direction: -1, bitrateKbps: 250, canBus: "CAN1" },
      { id: 3, name: "CAN J3", minDeg: 0, maxDeg: 360, direction: 1, bitrateKbps: 250, canBus: "CAN1" },
      { id: 4, name: "CAN J4", minDeg: 0, maxDeg: 360, direction: 1, bitrateKbps: 250, canBus: "CAN1" }
    ] satisfies AsmgMdServoProfile[]
  },
  feetech: {
    busBaudRate: 1000000,
    bridgeBaudRate: 115200,
    servos: [
      { id: 9, name: "J1", minDeg: 180, maxDeg: 360, direction: 1 },
      { id: 10, name: "J2", minDeg: 90, maxDeg: 270, direction: 1 },
      { id: 22, name: "ID22", minDeg: 0, maxDeg: 360, direction: 1 }
    ] satisfies ServoProfile[]
  },
  arm: {
    j1ServoId: 9,
    j2ServoId: 10,
    link1Length: 88,
    link2Length: 88,
    forwardSpeedPerSecond: 64,
    liftSpeedPerSecond: 56,
    deadzone: 0.12,
    commandIntervalMs: 120,
    maxAngleStepDeg: 3,
    minForward: -18,
    maxForward: 154,
    minHeight: -88,
    maxHeight: 126,
    minReachMargin: 4,
    maxReachMargin: 4,
    zeroJ1Deg: 90,
    zeroJ2Deg: 90,
    trimJ1Deg: 0,
    trimJ2Deg: 0,
    j1Sign: 1,
    j2Sign: 1,
    elbowSign: 1,
    speedRaw: 300,
    acc: 30,
    calibrated: false
  } satisfies LiteArmProfile,
  pwmServos: [
    { id: "pwm-pan", name: "PWM Pan", silk: "S", pin: "PA0", frequencyHz: 50, minPulseUs: 500, centerPulseUs: 1500, maxPulseUs: 2500 },
    { id: "pwm-tilt", name: "PWM Tilt", silk: "T", pin: "PA1", frequencyHz: 50, minPulseUs: 500, centerPulseUs: 1500, maxPulseUs: 2500 },
    { id: "pwm-aux-1", name: "PWM Aux 1", silk: "U", pin: "PA2", frequencyHz: 50, minPulseUs: 500, centerPulseUs: 1500, maxPulseUs: 2500 },
    { id: "pwm-aux-2", name: "PWM Aux 2", silk: "V", pin: "PA3", frequencyHz: 50, minPulseUs: 500, centerPulseUs: 1500, maxPulseUs: 2500 }
  ] satisfies PwmServoProfile[],
  drive: {
    speedLimitPercent: 35,
    stopMode: "brake",
    deadzone: 0.12,
    mecanum: {
      frontLeft: "M3",
      frontRight: "M1",
      rearLeft: "M4",
      rearRight: "M2"
    },
    tracked: {
      left: "M5",
      right: "M6"
    }
  } satisfies LiteDriveProfile,
  canJog: {
    frontIds: [4, 1],
    rearIds: [3, 2],
    positions: {
      leftFront: 4,
      rightFront: 1,
      leftRear: 3,
      rightRear: 2
    },
    stepDeg: 1,
    intervalMs: 80,
    speedRaw: 300
  } satisfies LiteCanJogProfile,
  motors: [
    { channel: "M1", name: "Mecanum FR", pwmPin: "PD14", in1Pin: "PB1", in2Pin: "PC0", enablePin: "PI0", encoderAPin: "PC1", encoderBPin: "PA4" },
    { channel: "M2", name: "Mecanum BR", pwmPin: "PD13", in1Pin: "PF0", in2Pin: "PE4", enablePin: "PI0", encoderAPin: "PE12", encoderBPin: "PB0" },
    { channel: "M3", name: "Mecanum FL", pwmPin: "PD15", in1Pin: "PI5", in2Pin: "PI6", enablePin: "PH12", encoderAPin: "PI7", encoderBPin: "PI2" },
    { channel: "M4", name: "Mecanum BL", pwmPin: "PH11", in1Pin: "PC3", in2Pin: "PC4", enablePin: "PH12", encoderAPin: "PC5", encoderBPin: "PA5" },
    { channel: "M5", name: "Left Track", pwmPin: "PH10", in1Pin: "PA0", in2Pin: "PA1", enablePin: "PH12", encoderAPin: "PA2", encoderBPin: "PA3" },
    { channel: "M6", name: "Right Track", pwmPin: "PD12", in1Pin: "PF1", in2Pin: "PE5", enablePin: "PI0", encoderAPin: "PE6", encoderBPin: "PC2" }
  ] satisfies MotorProfile[]
};
