export const FEETECH_BROADCAST_ID = 0xfe;
export const FEETECH_PING = 0x01;
export const FEETECH_READ = 0x02;
export const FEETECH_WRITE = 0x03;
export const SERVO_ID_ADDR = 0x05;
export const MODE_ADDR = 0x21;
export const TORQUE_ENABLE_ADDR = 0x28;
export const GOAL_POSITION_ADDR = 0x2a;
export const ACC_ADDR = 0x29;
export const GOAL_SPEED_ADDR = 0x2e;
export const EEPROM_LOCK_ADDR = 0x37;
export const PRESENT_POSITION_ADDR = 0x38;
export const FEEDBACK_READ_LENGTH = 0x0f;
export const DEFAULT_WHEEL_SPEED_LIMIT = 1000;
export const FEETECH_VOLTAGE_UNIT_V = 0.1;
export const FEETECH_CURRENT_UNIT_MA = 6.5;
export const FEETECH_LOAD_FULL_SCALE_RAW = 1000;
export const FEETECH_SPEED_STEPS_PER_SECOND = 50;
export const FEETECH_STEPS_PER_REVOLUTION = 4096;

export type ServoDirection = 1 | -1;
export type DebugModule = "servo" | "motor" | "camera";
export type MotorDirection = "forward" | "reverse" | "stopped";
export type MotorDriverType = "tb6618";
export type MotorStopMode = "coast" | "brake";
export type MotorCommandType = "motor.config" | "motor.set" | "motor.target" | "motor.stop" | "motor.read";
export type MecanumCommandType = "mecanum.config" | "mecanum.target" | "mecanum.stop";
export type CanCommandType = "can.config" | "can.send" | "can.read" | "can.robomaster.current" | "can.robomaster.stop";
export type CanServoCommandType =
  | "can_servo.config"
  | "can_servo.move"
  | "can_servo.group_move"
  | "can_servo.read"
  | "can_servo.set_current"
  | "can_servo.pid"
  | "can_servo.set_id"
  | "can_servo.save_center"
  | "can_servo.factory_reset";
export type ImuCommandType = "imu.read";
export const MOTOR_DIRECTION_DEADTIME_MS = 50;

export interface ImuRawVector {
  x: number;
  y: number;
  z: number;
}

export interface ServoProfile {
  id: number;
  name: string;
  minDeg?: number;
  maxDeg?: number;
  zeroOffset?: number;
  direction?: ServoDirection;
}

export interface ServoTarget {
  id: number;
  name?: string;
  angleDeg: number;
  speedRaw: number;
  acc?: number;
}

export interface ServoSpeedTarget {
  id: number;
  name?: string;
  speedRaw: number;
  acc?: number;
}

export const DEFAULT_SERVO_MIN_DEG = 0;
export const DEFAULT_SERVO_MAX_DEG = 360;
export const DEFAULT_SERVO_DIRECTION: ServoDirection = 1;

export interface FeetechStatusPacket {
  id: number;
  status: number;
  params: number[];
  checksum: number;
}

export interface MotorProfile {
  channel: string;
  name: string;
  pwmPin?: string;
  in1Pin?: string;
  in2Pin?: string;
  enablePin?: string;
  /** @deprecated Use in1Pin/in2Pin for TB6618-style H-bridge drivers. */
  dirPin?: string;
  /** @deprecated Use enablePin for TB6618 EN/STBY when present. */
  brakePin?: string;
  sensorPin?: string;
  encoderAPin?: string;
  encoderBPin?: string;
}

export interface MotorTarget {
  channel: string;
  speedPercent: number;
  stopMode?: MotorStopMode;
  closedLoop?: boolean;
  targetRpm?: number;
}

export interface MotorPortMapping {
  channel: string;
  driver?: MotorDriverType;
  pwmPin: string;
  in1Pin: string;
  in2Pin: string;
  enablePin?: string;
  sensorPin?: string;
  encoderAPin?: string;
  encoderBPin?: string;
  closedLoop?: boolean;
  maxRpm?: number;
  encoderTicksPerRev?: number;
}

export interface MotorStopTarget {
  channel?: string;
  all?: boolean;
  stopMode?: MotorStopMode;
}

export interface MecanumVelocityTarget {
  forward: number;
  strafe: number;
  turn: number;
  speedLimitPercent?: number;
  stopMode?: MotorStopMode;
}

export interface PcCommand {
  type:
    | "debug.set"
    | "servo.move"
    | "servo.speed"
    | "servo.mode"
    | "servo.ping"
    | "servo.read"
    | "servo.torque"
    | "motor.config"
    | "motor.set"
    | "motor.target"
    | "motor.stop"
    | "motor.read"
    | MecanumCommandType
    | ImuCommandType
    | CanCommandType
    | CanServoCommandType;
  seq: number;
  [key: string]: unknown;
}

const MOTOR_COMMAND_TYPES = new Set<MotorCommandType>(["motor.config", "motor.set", "motor.target", "motor.stop", "motor.read"]);

export type InboundMessage =
  | { type: "ack"; seq: number; command?: string; message?: string }
  | { type: "error"; seq: number; command?: string; code?: string; message: string }
  | {
      type: "servo.feedback";
      seq: number;
      id: number;
      positionRaw?: number;
      positionDeg?: number;
      speedRaw?: number;
      speedRpm?: number;
      loadRaw?: number;
      loadPercent?: number;
      voltageRaw?: number;
      voltageV?: number;
      temperatureC?: number;
      moving?: boolean;
      currentRaw?: number;
      currentMa?: number;
    }
  | {
      type: "motor.feedback";
      seq: number;
      channel: string;
      commandedSpeedPercent?: number;
      dutyPercent?: number;
      direction?: MotorDirection;
      stopMode?: MotorStopMode;
      speedRpm?: number;
      closedLoop?: boolean;
      targetRpm?: number;
      controlDutyPercent?: number;
      controlErrorRpm?: number;
      pulseHz?: number;
      encoderTicks?: number;
      encoderA?: number;
      encoderB?: number;
      encoderDelta?: number;
      encoderDirection?: MotorDirection;
      sampleMs?: number;
    }
  | {
      type: "can.feedback";
      seq: number;
      command?: CanCommandType | CanServoCommandType | string;
      ok?: boolean;
      ready?: boolean;
      controlId?: number;
      slot?: number;
      current?: number;
      sent?: number;
      txOk?: number;
      txError?: number;
      txTimeout?: number;
      rxPending?: number;
      esr?: number;
    }
  | {
      type: "can.frame";
      seq: number;
      id: number;
      extended?: boolean;
      rtr?: boolean;
      dlc?: number;
      dataHex?: string;
    }
  | {
      type: "can_servo.feedback";
      seq: number;
      command?: CanServoCommandType;
      ok?: boolean;
      ready?: boolean;
      servoId?: number;
      asmgCommand?: number;
      rawDataHex?: string;
      dataHex?: string;
      position?: number;
      currentPosition?: number;
      commandPosition?: number;
      speed?: number;
      current?: number;
      currentTorque?: number;
      setCurrent?: number;
      p?: number;
      i?: number;
      d?: number;
      centerRatio?: number;
      baudKbps?: number;
      newId?: number;
      txOk?: number;
      txError?: number;
      txTimeout?: number;
      rxPending?: number;
      esr?: number;
    }
  | {
      type: "mecanum.feedback";
      seq: number;
      forward?: number;
      strafe?: number;
      turn?: number;
      speedLimitPercent?: number;
      stopMode?: MotorStopMode;
      frontLeft?: number;
      frontRight?: number;
      rearLeft?: number;
      rearRight?: number;
      droppedMotionCount?: number;
      sampleMs?: number;
    }
  | {
      type: "scheduler.feedback";
      seq: number;
      command?: string;
      accepted?: boolean;
      motionPending?: boolean;
      latestMotionSeq?: number;
      droppedMotionCount?: number;
      activeCommand?: string;
      message?: string;
    }
  | {
      type: "protocol.feedback";
      seq: number;
      protocolVersion?: number;
      binaryProtocolReady?: boolean;
      framesIn?: number;
      framesOut?: number;
      crcError?: number;
      cobsError?: number;
      dropCount?: number;
      lastFrameMs?: number;
    }
  | {
      type: "imu.feedback";
      seq: number;
      ready?: boolean;
      mpuWhoAmI?: number;
      istWhoAmI?: number;
      accelRaw?: ImuRawVector;
      gyroRaw?: ImuRawVector;
      magRaw?: ImuRawVector;
      tempRaw?: number;
      sampleMs?: number;
      error?: string;
    }
  | { type: "log"; seq?: number; level?: "info" | "warn" | "error"; message: string };

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function isValidServoId(id: number): boolean {
  return Number.isInteger(id) && id >= 0 && id <= 253;
}

export function assertServoId(id: number): void {
  if (!isValidServoId(id)) {
    throw new RangeError("servo id must be an integer from 0 to 253");
  }
}

export function angleDegToRaw(angleDeg: number): number {
  if (!Number.isFinite(angleDeg)) {
    throw new RangeError("angleDeg must be finite");
  }
  return clamp(Math.round((angleDeg / 360) * 4095), 0, 4095);
}

export function rawToAngleDeg(positionRaw: number): number {
  if (!Number.isFinite(positionRaw)) {
    throw new RangeError("positionRaw must be finite");
  }
  return (clamp(Math.round(positionRaw), 0, 4095) / 4095) * 360;
}

export function voltageRawToVolts(voltageRaw: number): number {
  return roundMetric(voltageRaw * FEETECH_VOLTAGE_UNIT_V, 2);
}

export function currentRawToMilliamps(currentRaw: number): number {
  return roundMetric(currentRaw * FEETECH_CURRENT_UNIT_MA, 1);
}

export function loadRawToPercent(loadRaw: number): number {
  return roundMetric((loadRaw / FEETECH_LOAD_FULL_SCALE_RAW) * 100, 1);
}

export function speedRawToRpm(speedRaw: number): number {
  return roundMetric((speedRaw * FEETECH_SPEED_STEPS_PER_SECOND * 60) / FEETECH_STEPS_PER_REVOLUTION, 2);
}

export function normalizeServoProfile(servo: ServoProfile): ServoProfile {
  const minDeg = typeof servo.minDeg === "number" && Number.isFinite(servo.minDeg) ? servo.minDeg : DEFAULT_SERVO_MIN_DEG;
  const maxDeg = typeof servo.maxDeg === "number" && Number.isFinite(servo.maxDeg) ? servo.maxDeg : DEFAULT_SERVO_MAX_DEG;
  const hasValidRange = minDeg >= 0 && maxDeg <= 360 && minDeg < maxDeg;

  return {
    id: servo.id,
    name: servo.name.trim(),
    minDeg: hasValidRange ? minDeg : DEFAULT_SERVO_MIN_DEG,
    maxDeg: hasValidRange ? maxDeg : DEFAULT_SERVO_MAX_DEG,
    direction: servo.direction === -1 ? -1 : DEFAULT_SERVO_DIRECTION,
    ...(typeof servo.zeroOffset === "number" && Number.isFinite(servo.zeroOffset) ? { zeroOffset: servo.zeroOffset } : {})
  };
}

export function servoLogicalSpan(servo: ServoProfile): number {
  const normalized = normalizeServoProfile(servo);
  return normalized.maxDeg! - normalized.minDeg!;
}

export function clampServoLogicalAngle(servo: ServoProfile, logicalAngleDeg: number): number {
  return clamp(Number.isFinite(logicalAngleDeg) ? logicalAngleDeg : 0, 0, servoLogicalSpan(servo));
}

export function servoLogicalToPhysicalAngle(servo: ServoProfile, logicalAngleDeg: number): number {
  const normalized = normalizeServoProfile(servo);
  const logicalAngle = clampServoLogicalAngle(normalized, logicalAngleDeg);
  return normalized.direction === -1 ? normalized.maxDeg! - logicalAngle : normalized.minDeg! + logicalAngle;
}

export function servoLogicalToPhysicalAngleWithReverse(servo: ServoProfile, logicalAngleDeg: number, reverse = false): number {
  const normalized = normalizeServoProfile(servo);
  const logicalAngle = clampServoLogicalAngle(normalized, logicalAngleDeg);
  const reversed = (normalized.direction === -1) !== reverse;
  return reversed ? normalized.maxDeg! - logicalAngle : normalized.minDeg! + logicalAngle;
}

export function servoPhysicalToLogicalAngle(servo: ServoProfile, physicalAngleDeg: number): number {
  const normalized = normalizeServoProfile(servo);
  const physicalAngle = clamp(Number.isFinite(physicalAngleDeg) ? physicalAngleDeg : normalized.minDeg!, normalized.minDeg!, normalized.maxDeg!);
  return normalized.direction === -1 ? normalized.maxDeg! - physicalAngle : physicalAngle - normalized.minDeg!;
}

export function servoPhysicalToLogicalAngleWithReverse(servo: ServoProfile, physicalAngleDeg: number, reverse = false): number {
  const normalized = normalizeServoProfile(servo);
  const physicalAngle = clamp(Number.isFinite(physicalAngleDeg) ? physicalAngleDeg : normalized.minDeg!, normalized.minDeg!, normalized.maxDeg!);
  const reversed = (normalized.direction === -1) !== reverse;
  return reversed ? normalized.maxDeg! - physicalAngle : physicalAngle - normalized.minDeg!;
}

export function applyServoWheelDirection(servo: ServoProfile, speedRaw: number, reverse = false): number {
  const normalized = normalizeServoProfile(servo);
  return (normalized.direction === -1) !== reverse ? -speedRaw : speedRaw;
}

export function calculateWheelTurnDelta(previousRaw: number, currentRaw: number, speedRaw: number): number {
  if (!Number.isFinite(previousRaw) || !Number.isFinite(currentRaw) || !Number.isFinite(speedRaw) || speedRaw === 0) {
    return 0;
  }

  const previous = clamp(Math.round(previousRaw), 0, 4095);
  const current = clamp(Math.round(currentRaw), 0, 4095);
  let deltaRaw = current - previous;
  if (deltaRaw > 2048) {
    deltaRaw -= 4096;
  } else if (deltaRaw < -2048) {
    deltaRaw += 4096;
  }

  const signedDelta = speedRaw < 0 ? -deltaRaw : deltaRaw;
  return Math.max(0, signedDelta / 4096);
}

export function validateAngleDeg(angleDeg: number): void {
  if (!Number.isFinite(angleDeg) || angleDeg < 0 || angleDeg > 360) {
    throw new RangeError("angleDeg must be 0-360");
  }
}

export function validateSpeedRaw(speedRaw: number): void {
  if (!Number.isInteger(speedRaw) || speedRaw < 0 || speedRaw > 4095) {
    throw new RangeError("speedRaw must be an integer from 0 to 4095");
  }
}

export function validateWheelSpeedRaw(speedRaw: number, limit = DEFAULT_WHEEL_SPEED_LIMIT): void {
  if (!Number.isInteger(speedRaw) || speedRaw < -limit || speedRaw > limit) {
    throw new RangeError(`wheel speedRaw must be an integer from ${-limit} to ${limit}`);
  }
}

export function validateAcc(acc: number | undefined): void {
  if (acc === undefined) {
    return;
  }
  if (!Number.isInteger(acc) || acc < 0 || acc > 254) {
    throw new RangeError("acc must be an integer from 0 to 254");
  }
}

export function normalizeMotorChannel(channel: string): string {
  return channel.trim().toUpperCase();
}

export function isValidMotorChannel(channel: string): boolean {
  return /^[A-Z][A-Z0-9_-]{0,15}$/.test(normalizeMotorChannel(channel));
}

export function assertMotorChannel(channel: string): void {
  if (!isValidMotorChannel(channel)) {
    throw new RangeError("motor channel must start with a letter and contain only letters, numbers, _ or -");
  }
}

export function normalizeMotorPin(pin: string | undefined): string | undefined {
  const normalized = pin?.trim();
  return normalized ? normalized.toUpperCase() : undefined;
}

export function isValidMotorPin(pin: string | undefined, required = false): boolean {
  const normalized = normalizeMotorPin(pin);
  if (!normalized) {
    return !required;
  }
  return /^[A-Z0-9_.:-]{1,24}$/.test(normalized);
}

export function assertMotorPin(pin: string | undefined, label: string, required = false): string | undefined {
  if (!isValidMotorPin(pin, required)) {
    throw new RangeError(`${label} must contain only letters, numbers, _, ., : or -`);
  }
  return normalizeMotorPin(pin);
}

export function validateSpeedPercent(speedPercent: number): void {
  if (!Number.isFinite(speedPercent) || speedPercent < -100 || speedPercent > 100) {
    throw new RangeError("speedPercent must be from -100 to 100");
  }
}

export function validateStopMode(stopMode: MotorStopMode | undefined): void {
  if (stopMode !== undefined && stopMode !== "coast" && stopMode !== "brake") {
    throw new RangeError("stopMode must be coast or brake");
  }
}

function validateOptionalPositiveInteger(value: number | undefined, label: string, max: number): number | undefined {
  if (value === undefined) {
    return undefined;
  }
  if (!Number.isInteger(value) || value < 1 || value > max) {
    throw new RangeError(`${label} must be an integer from 1 to ${max}`);
  }
  return value;
}

export function motorDirectionFromSpeed(speedPercent: number): MotorDirection {
  if (speedPercent > 0) {
    return "forward";
  }
  if (speedPercent < 0) {
    return "reverse";
  }
  return "stopped";
}

export function littleEndianWord(value: number): [number, number] {
  const word = clamp(Math.round(value), 0, 0xffff);
  return [word & 0xff, (word >> 8) & 0xff];
}

export function signed15BitWord(value: number): [number, number] {
  const magnitude = Math.min(0x7fff, Math.abs(Math.round(value)));
  const encoded = value < 0 ? magnitude | 0x8000 : magnitude;
  return littleEndianWord(encoded);
}

export function decodeSigned15Bit(low: number, high: number): number {
  const value = ((high & 0xff) << 8) | (low & 0xff);
  const magnitude = value & 0x7fff;
  return value & 0x8000 ? -magnitude : magnitude;
}

export function decodeSigned10Bit(low: number, high: number): number {
  const value = ((high & 0xff) << 8) | (low & 0xff);
  const magnitude = value & 0x03ff;
  return value & 0x0400 ? -magnitude : magnitude;
}

export function feetechChecksum(bytesFromIdToLastParam: number[]): number {
  const sum = bytesFromIdToLastParam.reduce((total, byte) => total + (byte & 0xff), 0);
  return (~sum) & 0xff;
}

export function buildInstructionFrame(id: number, instruction: number, params: number[] = []): number[] {
  assertServoId(id === FEETECH_BROADCAST_ID ? 253 : id);
  const length = params.length + 2;
  const body = [id & 0xff, length & 0xff, instruction & 0xff, ...params.map((param) => param & 0xff)];
  return [0xff, 0xff, ...body, feetechChecksum(body)];
}

export function buildWriteRegisterFrame(id: number, address: number, values: number[]): number[] {
  assertServoId(id);
  if (!Number.isInteger(address) || address < 0 || address > 0xff) {
    throw new Error("Feetech register address must be 0-255");
  }
  if (values.length === 0 || values.some((value) => !Number.isInteger(value) || value < 0 || value > 0xff)) {
    throw new Error("Feetech register values must be one or more bytes");
  }
  return buildInstructionFrame(id, FEETECH_WRITE, [address, ...values]);
}

export function buildReadRegisterFrame(id: number, address: number, length: number): number[] {
  assertServoId(id);
  if (!Number.isInteger(address) || address < 0 || address > 0xff) {
    throw new Error("Feetech register address must be 0-255");
  }
  if (!Number.isInteger(length) || length < 1 || length > 0xff) {
    throw new Error("Feetech register read length must be 1-255");
  }
  return buildInstructionFrame(id, FEETECH_READ, [address, length]);
}

export function buildPingFrame(id: number): number[] {
  assertServoId(id);
  return buildInstructionFrame(id, FEETECH_PING);
}

export function buildReadFeedbackFrame(id: number): number[] {
  assertServoId(id);
  return buildReadRegisterFrame(id, PRESENT_POSITION_ADDR, FEEDBACK_READ_LENGTH);
}

export function buildTorqueFrame(id: number, enabled: boolean): number[] {
  assertServoId(id);
  return buildInstructionFrame(id, FEETECH_WRITE, [TORQUE_ENABLE_ADDR, enabled ? 1 : 0]);
}

export function buildModeFrame(id: number, mode: "servo" | "wheel"): number[] {
  assertServoId(id);
  return buildInstructionFrame(id, FEETECH_WRITE, [MODE_ADDR, mode === "wheel" ? 1 : 0]);
}

export function buildWheelModeSetupFrames(id: number): number[][] {
  return [buildTorqueFrame(id, false), buildModeFrame(id, "wheel"), buildTorqueFrame(id, true)];
}

export function buildEepromLockFrame(id: number, locked: boolean): number[] {
  return buildWriteRegisterFrame(id, EEPROM_LOCK_ADDR, [locked ? 1 : 0]);
}

export function buildServoIdWriteFrame(currentId: number, nextId: number): number[] {
  assertServoId(nextId);
  return buildWriteRegisterFrame(currentId, SERVO_ID_ADDR, [nextId]);
}

export function buildServoIdChangeFrames(currentId: number, nextId: number): number[][] {
  return [
    buildPingFrame(currentId),
    buildEepromLockFrame(currentId, false),
    buildServoIdWriteFrame(currentId, nextId),
    buildEepromLockFrame(nextId, true),
    buildPingFrame(nextId)
  ];
}

export function buildWritePositionFrame(target: ServoTarget): number[] {
  assertServoId(target.id);
  validateAngleDeg(target.angleDeg);
  validateSpeedRaw(target.speedRaw);
  validateAcc(target.acc);

  const [posL, posH] = littleEndianWord(angleDegToRaw(target.angleDeg));
  const [speedL, speedH] = littleEndianWord(target.speedRaw);
  const time: [number, number] = [0, 0];
  const params =
    target.acc === undefined
      ? [GOAL_POSITION_ADDR, posL, posH, ...time, speedL, speedH]
      : [ACC_ADDR, target.acc, posL, posH, ...time, speedL, speedH];

  return buildInstructionFrame(target.id, FEETECH_WRITE, params);
}

export function buildWriteSpeedFrame(target: ServoSpeedTarget): number[] {
  return buildWriteSpeedFrames(target)[1];
}

export function buildWriteSpeedFrames(target: ServoSpeedTarget): number[][] {
  assertServoId(target.id);
  validateWheelSpeedRaw(target.speedRaw);
  validateAcc(target.acc);

  const [speedL, speedH] = signed15BitWord(target.speedRaw);
  return [
    buildInstructionFrame(target.id, FEETECH_WRITE, [ACC_ADDR, target.acc ?? 50]),
    buildInstructionFrame(target.id, FEETECH_WRITE, [GOAL_SPEED_ADDR, speedL, speedH])
  ];
}

export function toHex(frame: number[]): string {
  return frame.map((byte) => byte.toString(16).toUpperCase().padStart(2, "0")).join(" ");
}

export function parseFeetechStatusPacket(bytes: ArrayLike<number>): FeetechStatusPacket | null {
  return parseFeetechStatusPackets(bytes)[0] ?? null;
}

export function parseFeetechStatusPackets(bytes: ArrayLike<number>): FeetechStatusPacket[] {
  const packets: FeetechStatusPacket[] = [];
  for (let start = 0; start <= bytes.length - 6; start += 1) {
    if (bytes[start] !== 0xff || bytes[start + 1] !== 0xff) {
      continue;
    }

    const id = bytes[start + 2] & 0xff;
    const length = bytes[start + 3] & 0xff;
    const frameEnd = start + 4 + length;
    if (length < 2 || frameEnd > bytes.length) {
      continue;
    }

    const status = bytes[start + 4] & 0xff;
    const params = Array.from({ length: length - 2 }, (_, index) => bytes[start + 5 + index] & 0xff);
    const checksum = bytes[frameEnd - 1] & 0xff;
    const body = [id, length, status, ...params];
    if (feetechChecksum(body) !== checksum) {
      continue;
    }

    packets.push({ id, status, params, checksum });
  }

  return packets;
}

export function parseServoFeedback(packet: FeetechStatusPacket): Extract<InboundMessage, { type: "servo.feedback" }> {
  const params = packet.params;
  const positionRaw = params.length >= 2 ? littleEndianValue(params[0], params[1]) : undefined;
  const speedRaw = params.length >= 4 ? decodeSigned15Bit(params[2], params[3]) : undefined;
  const loadRaw = params.length >= 6 ? decodeSigned10Bit(params[4], params[5]) : undefined;
  const voltageRaw = params[6];
  const currentRaw = params.length >= 15 ? decodeSigned15Bit(params[13], params[14]) : undefined;
  return {
    type: "servo.feedback",
    seq: 0,
    id: packet.id,
    positionRaw,
    positionDeg: positionRaw === undefined ? undefined : rawToAngleDeg(positionRaw),
    speedRaw,
    speedRpm: speedRaw === undefined ? undefined : speedRawToRpm(speedRaw),
    loadRaw,
    loadPercent: loadRaw === undefined ? undefined : loadRawToPercent(loadRaw),
    voltageRaw,
    voltageV: voltageRaw === undefined ? undefined : voltageRawToVolts(voltageRaw),
    temperatureC: params[7],
    moving: params[10] === undefined ? undefined : params[10] !== 0,
    currentRaw,
    currentMa: currentRaw === undefined ? undefined : currentRawToMilliamps(currentRaw)
  };
}

function littleEndianValue(low: number, high: number): number {
  return ((high & 0xff) << 8) | (low & 0xff);
}

function roundMetric(value: number, digits: number): number {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function buildServoMoveCommand(seq: number, target: ServoTarget | ServoTarget[], sync = false): PcCommand {
  const targets = Array.isArray(target) ? target : [target];
  if (targets.length === 0) {
    throw new RangeError("targets must contain at least one servo");
  }

  for (const servoTarget of targets) {
    validateAngleDeg(servoTarget.angleDeg);
    validateSpeedRaw(servoTarget.speedRaw);
    validateAcc(servoTarget.acc);
    assertServoId(servoTarget.id);
  }

  return {
    type: "servo.move",
    seq,
    sync,
    targets
  };
}

export function buildServoSpeedCommand(seq: number, target: ServoSpeedTarget | ServoSpeedTarget[], setupWheelMode = true): PcCommand {
  const targets = Array.isArray(target) ? target : [target];
  if (targets.length === 0) {
    throw new RangeError("targets must contain at least one servo");
  }

  for (const servoTarget of targets) {
    assertServoId(servoTarget.id);
    validateWheelSpeedRaw(servoTarget.speedRaw);
    validateAcc(servoTarget.acc);
  }

  return {
    type: "servo.speed",
    seq,
    setupWheelMode,
    targets
  };
}

export function buildDebugSetCommand(seq: number, module: DebugModule, enabled: boolean): PcCommand {
  return {
    type: "debug.set",
    seq,
    enabled,
    module
  };
}

export function motorSpeedSign(speedPercent: number): -1 | 0 | 1 {
  if (!Number.isFinite(speedPercent) || speedPercent === 0) {
    return 0;
  }
  return speedPercent > 0 ? 1 : -1;
}

export function requiresMotorDirectionDeadtime(previousSpeedPercent: number | undefined, nextSpeedPercent: number): boolean {
  const previousSign = motorSpeedSign(previousSpeedPercent ?? 0);
  const nextSign = motorSpeedSign(nextSpeedPercent);
  return previousSign !== 0 && nextSign !== 0 && previousSign !== nextSign;
}

export function isMotorPcCommand(value: unknown): value is PcCommand & { type: MotorCommandType } {
  return Boolean(
    value &&
      typeof value === "object" &&
      typeof (value as PcCommand).seq === "number" &&
      MOTOR_COMMAND_TYPES.has((value as PcCommand).type as MotorCommandType)
  );
}

export function withCommandSeq(command: PcCommand, seq: number): PcCommand {
  return {
    ...command,
    seq
  };
}

export function isMotorDebugDisabledError(message: InboundMessage): message is InboundMessage & { type: "error"; code: "debug_disabled" } {
  return (
    message.type === "error" &&
    message.code === "debug_disabled" &&
    typeof message.command === "string" &&
    MOTOR_COMMAND_TYPES.has(message.command as MotorCommandType)
  );
}

export function buildMotorSetCommand(seq: number, target: MotorTarget): PcCommand {
  assertMotorChannel(target.channel);
  validateSpeedPercent(target.speedPercent);
  validateStopMode(target.stopMode);
  const targetRpm = validateOptionalPositiveInteger(target.targetRpm, "targetRpm", 30_000);
  return {
    type: "motor.set",
    seq,
    channel: normalizeMotorChannel(target.channel),
    speedPercent: target.speedPercent,
    stopMode: target.stopMode ?? "coast",
    ...(typeof target.closedLoop === "boolean" ? { closedLoop: target.closedLoop } : {}),
    ...(targetRpm === undefined ? {} : { targetRpm })
  };
}

export function buildMotorTargetCommand(seq: number, target: MotorTarget): PcCommand {
  assertMotorChannel(target.channel);
  validateSpeedPercent(target.speedPercent);
  validateStopMode(target.stopMode);
  const targetRpm = validateOptionalPositiveInteger(target.targetRpm, "targetRpm", 30_000);
  return {
    type: "motor.target",
    seq,
    channel: normalizeMotorChannel(target.channel),
    speedPercent: target.speedPercent,
    stopMode: target.stopMode ?? "coast",
    ...(typeof target.closedLoop === "boolean" ? { closedLoop: target.closedLoop } : {}),
    ...(targetRpm === undefined ? {} : { targetRpm })
  };
}

export function buildMecanumTargetCommand(seq: number, target: MecanumVelocityTarget): PcCommand {
  validateStopMode(target.stopMode);
  return {
    type: "mecanum.target",
    seq,
    forward: clampUnitAxis(target.forward),
    strafe: clampUnitAxis(target.strafe),
    turn: clampUnitAxis(target.turn),
    speedLimitPercent: clamp(Number.isFinite(target.speedLimitPercent) ? target.speedLimitPercent! : 100, 0, 100),
    stopMode: target.stopMode ?? "coast"
  };
}

export function buildMotorConfigCommand(seq: number, mapping: MotorPortMapping): PcCommand {
  assertMotorChannel(mapping.channel);
  const pwmPin = assertMotorPin(mapping.pwmPin, "pwmPin", true);
  const in1Pin = assertMotorPin(mapping.in1Pin, "in1Pin", true);
  const in2Pin = assertMotorPin(mapping.in2Pin, "in2Pin", true);
  const enablePin = assertMotorPin(mapping.enablePin, "enablePin");
  const sensorPin = assertMotorPin(mapping.sensorPin, "sensorPin");
  const encoderAPin = assertMotorPin(mapping.encoderAPin, "encoderAPin");
  const encoderBPin = assertMotorPin(mapping.encoderBPin, "encoderBPin");
  const maxRpm = validateOptionalPositiveInteger(mapping.maxRpm, "maxRpm", 30_000);
  const encoderTicksPerRev = validateOptionalPositiveInteger(mapping.encoderTicksPerRev, "encoderTicksPerRev", 100_000);

  return {
    type: "motor.config",
    seq,
    channel: normalizeMotorChannel(mapping.channel),
    driver: mapping.driver ?? "tb6618",
    ...(typeof mapping.closedLoop === "boolean" ? { closedLoop: mapping.closedLoop } : {}),
    ...(maxRpm === undefined ? {} : { maxRpm }),
    ...(encoderTicksPerRev === undefined ? {} : { encoderTicksPerRev }),
    pins: {
      pwm: pwmPin,
      in1: in1Pin,
      in2: in2Pin,
      ...(enablePin ? { enable: enablePin } : {}),
      ...(sensorPin ? { sensor: sensorPin } : {}),
      ...(encoderAPin ? { encoderA: encoderAPin } : {}),
      ...(encoderBPin ? { encoderB: encoderBPin } : {})
    }
  };
}

export function buildMotorStopCommand(seq: number, target: MotorStopTarget): PcCommand {
  validateStopMode(target.stopMode);
  const stopMode = target.stopMode ?? "coast";

  if (target.all) {
    return {
      type: "motor.stop",
      seq,
      all: true,
      stopMode
    };
  }

  if (!target.channel) {
    throw new RangeError("channel is required unless all is true");
  }

  assertMotorChannel(target.channel);
  return {
    type: "motor.stop",
    seq,
    channel: normalizeMotorChannel(target.channel),
    stopMode
  };
}

function clampUnitAxis(value: number): number {
  return Number.isFinite(value) ? clamp(value, -1, 1) : 0;
}

export class LineDelimitedJsonParser {
  private buffer = "";

  push(chunk: string): InboundMessage[] {
    this.buffer += chunk;
    const messages: InboundMessage[] = [];
    let newlineIndex = this.buffer.indexOf("\n");

    while (newlineIndex !== -1) {
      const line = this.buffer.slice(0, newlineIndex).trim();
      this.buffer = this.buffer.slice(newlineIndex + 1);
      if (line.length > 0) {
        messages.push(JSON.parse(line) as InboundMessage);
      }
      newlineIndex = this.buffer.indexOf("\n");
    }

    return messages;
  }
}
