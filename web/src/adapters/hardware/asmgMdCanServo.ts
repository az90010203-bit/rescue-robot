import {
  clamp,
  normalizeServoProfile,
  servoLogicalSpan,
  servoLogicalToPhysicalAngle,
  servoPhysicalToLogicalAngle,
  type InboundMessage,
  type PcCommand,
  type ServoProfile
} from "@adapters/hardware/protocol";

export const ASMG_MD_HOST_EXTENDED_ID = 0x18ef0201;
export const ASMG_MD_DEFAULT_BITRATE_KBPS = 250;
export const ASMG_MD_DEFAULT_SERVO_ID = 1;
export const ASMG_MD_BROADCAST_ID = 0xfe;

export const ASMG_MD_POSITION_MIN = 0x0000;
export const ASMG_MD_POSITION_MAX = 0x7fff;
export const ASMG_MD_POSITION_STEPS_PER_TURN = ASMG_MD_POSITION_MAX + 1;
export const ASMG_MD_DEGREES_PER_TURN = 360;
export const ASMG_MD_SPEED_MIN = 0x0000;
export const ASMG_MD_SPEED_MAX = 0x0500;
export const ASMG_MD_CENTER_RATIO_MIN = 0x0000;
export const ASMG_MD_CENTER_RATIO_MAX = 0x03e8;

export type AsmgMdBaudKbps = 250 | 500 | 1000;

export interface AsmgMdServoProfile extends ServoProfile {
  bitrateKbps?: AsmgMdBaudKbps;
  canBus?: string;
}

export type AsmgMdParsedKind =
  | "moveEcho"
  | "positionCommand"
  | "currentSetting"
  | "pid"
  | "positionCurrent"
  | "saveCenterEcho"
  | "baudEcho"
  | "readId"
  | "setId"
  | "factoryReset"
  | "unknown";

export interface AsmgMdParsedFrame {
  kind: AsmgMdParsedKind;
  rawDataHex: string;
  rawBytes: number[];
  canId: number;
  extended: boolean;
  dlc: number;
  servoId?: number;
  command?: number;
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
  baudCode?: number;
  baudKbps?: AsmgMdBaudKbps;
  newId?: number;
}

export function buildAsmgMdCanConfigCommand(seq: number, bitrateKbps: AsmgMdBaudKbps = ASMG_MD_DEFAULT_BITRATE_KBPS): PcCommand {
  return { type: "can_servo.config", seq, bitrateKbps };
}

export function buildAsmgMdCanReadCommand(seq: number): PcCommand {
  return { type: "can_servo.read", seq, request: "frames" };
}

export function buildAsmgMdMoveCommand(seq: number, options: { id: number; position: number; speed: number }): PcCommand {
  const id = normalizeAsmgMdServoId(options.id);
  const position = normalizeAsmgMdWord(options.position, ASMG_MD_POSITION_MIN, ASMG_MD_POSITION_MAX, "position");
  const speed = normalizeAsmgMdWord(options.speed, ASMG_MD_SPEED_MIN, ASMG_MD_SPEED_MAX, "speed");
  return { type: "can_servo.move", seq, id, position, speed };
}

export function buildAsmgMdGroupMoveCommand(seq: number, targets: Array<{ id: number; position: number }>, speedRaw: number): PcCommand {
  if (targets.length === 0) {
    throw new RangeError("ASMG-MD group move requires at least one target");
  }
  if (targets.length > 8) {
    throw new RangeError("ASMG-MD group move supports at most 8 targets");
  }
  const speed = normalizeAsmgMdWord(speedRaw, ASMG_MD_SPEED_MIN, ASMG_MD_SPEED_MAX, "speed");
  return {
    type: "can_servo.group_move",
    seq,
    targets: targets.map((target) => ({
      id: normalizeAsmgMdServoId(target.id),
      position: normalizeAsmgMdWord(target.position, ASMG_MD_POSITION_MIN, ASMG_MD_POSITION_MAX, "position")
    })),
    speed
  };
}

export function normalizeAsmgMdBaudKbps(value: unknown): AsmgMdBaudKbps {
  const bitrate = Number(value);
  if (bitrate === 500 || bitrate === 1000) {
    return bitrate;
  }
  return ASMG_MD_DEFAULT_BITRATE_KBPS;
}

export function normalizeAsmgMdServoProfile(profile: AsmgMdServoProfile): AsmgMdServoProfile {
  const normalized = normalizeServoProfile(profile);
  return {
    ...normalized,
    bitrateKbps: normalizeAsmgMdBaudKbps(profile.bitrateKbps),
    canBus: String(profile.canBus ?? "CAN1").trim() || "CAN1"
  };
}

export function asmgMdLogicalAngleToPhysicalDegrees(profile: AsmgMdServoProfile, logicalAngleDeg: number): number {
  return servoLogicalToPhysicalAngle(normalizeAsmgMdServoProfile(profile), logicalAngleDeg);
}

export function asmgMdPhysicalAngleToLogicalDegrees(profile: AsmgMdServoProfile, physicalAngleDeg: number): number {
  return servoPhysicalToLogicalAngle(normalizeAsmgMdServoProfile(profile), physicalAngleDeg);
}

export function asmgMdLogicalAngleToPositionRaw(profile: AsmgMdServoProfile, logicalAngleDeg: number): number {
  const normalized = normalizeAsmgMdServoProfile(profile);
  const logicalAngle = clamp(Number.isFinite(logicalAngleDeg) ? logicalAngleDeg : 0, 0, servoLogicalSpan(normalized));
  return asmgMdDegreesToPositionRaw(servoLogicalToPhysicalAngle(normalized, logicalAngle));
}

export function asmgMdPositionRawToLogicalDegrees(profile: AsmgMdServoProfile, raw: number): number {
  return asmgMdPhysicalAngleToLogicalDegrees(normalizeAsmgMdServoProfile(profile), asmgMdPositionRawToDegrees(raw));
}

export function asmgMdDegreesToPositionRaw(degrees: number): number {
  if (!Number.isFinite(degrees)) {
    throw new RangeError("degrees must be finite");
  }
  const bounded = Math.min(ASMG_MD_DEGREES_PER_TURN, Math.max(0, degrees));
  const raw = Math.round((bounded / ASMG_MD_DEGREES_PER_TURN) * ASMG_MD_POSITION_STEPS_PER_TURN);
  return Math.min(ASMG_MD_POSITION_MAX, Math.max(ASMG_MD_POSITION_MIN, raw));
}

export function asmgMdPositionRawToDegrees(raw: number): number {
  if (!Number.isFinite(raw)) {
    throw new RangeError("position raw must be finite");
  }
  const bounded = Math.min(ASMG_MD_POSITION_MAX, Math.max(ASMG_MD_POSITION_MIN, Math.round(raw)));
  if (bounded === ASMG_MD_POSITION_MAX) {
    return ASMG_MD_DEGREES_PER_TURN;
  }
  const normalized = bounded % ASMG_MD_POSITION_STEPS_PER_TURN;
  const steps = bounded > 0 && normalized === 0 ? ASMG_MD_POSITION_STEPS_PER_TURN : normalized;
  return (steps / ASMG_MD_POSITION_STEPS_PER_TURN) * ASMG_MD_DEGREES_PER_TURN;
}

export function buildAsmgMdReadPositionCommand(seq: number, id: number): PcCommand {
  return { type: "can_servo.read", seq, id: normalizeAsmgMdServoId(id), request: "position" };
}

export function buildAsmgMdSetCurrentCommand(seq: number, options: { id: number; current: number }): PcCommand {
  const current = normalizeAsmgMdWord(options.current, 0x0000, 0xffff, "current");
  return { type: "can_servo.set_current", seq, id: normalizeAsmgMdServoId(options.id), current };
}

export function buildAsmgMdReadCurrentCommand(seq: number, id: number): PcCommand {
  return { type: "can_servo.read", seq, id: normalizeAsmgMdServoId(id), request: "current" };
}

export function buildAsmgMdSetPidCommand(seq: number, options: { id: number; p: number; i: number; d: number }): PcCommand {
  const p = normalizeAsmgMdWord(options.p, 0x0000, 0xffff, "p");
  const i = normalizeAsmgMdWord(options.i, 0x0000, 0xffff, "i");
  const d = normalizeAsmgMdWord(options.d, 0x0000, 0xffff, "d");
  return { type: "can_servo.pid", seq, id: normalizeAsmgMdServoId(options.id), p, i, d };
}

export function buildAsmgMdReadPidCommand(seq: number, id: number): PcCommand {
  return { type: "can_servo.pid", seq, id: normalizeAsmgMdServoId(id), read: true };
}

export function buildAsmgMdReadPositionCurrentCommand(seq: number, id: number): PcCommand {
  return { type: "can_servo.read", seq, id: normalizeAsmgMdServoId(id), request: "position_current" };
}

export function buildAsmgMdSaveCenterCommand(seq: number, options: { id: number; ratio: number }): PcCommand {
  const ratio = normalizeAsmgMdWord(options.ratio, ASMG_MD_CENTER_RATIO_MIN, ASMG_MD_CENTER_RATIO_MAX, "center ratio");
  return { type: "can_servo.save_center", seq, id: normalizeAsmgMdServoId(options.id), ratio };
}

export function buildAsmgMdSetBaudCommand(seq: number, options: { id: number; baudKbps: AsmgMdBaudKbps }): PcCommand {
  return { type: "can_servo.config", seq, id: normalizeAsmgMdServoId(options.id), baudKbps: options.baudKbps, applyToServo: true };
}

export function buildAsmgMdFactoryResetCommand(seq: number, id: number): PcCommand {
  return { type: "can_servo.factory_reset", seq, id: normalizeAsmgMdServoId(id) };
}

export function buildAsmgMdReadIdCommand(seq: number): PcCommand {
  return { type: "can_servo.read", seq, request: "id" };
}

export function buildAsmgMdSetIdCommand(seq: number, newId: number): PcCommand {
  return { type: "can_servo.set_id", seq, newId: normalizeAsmgMdServoId(newId) };
}

export function parseAsmgMdCanFrame(message: InboundMessage): AsmgMdParsedFrame | null {
  if (message.type !== "can.frame" && message.type !== "can_servo.feedback") {
    return null;
  }
  const rawDataHex = message.type === "can_servo.feedback" ? message.rawDataHex ?? message.dataHex ?? "" : message.dataHex ?? "";
  const bytes = parseAsmgMdDataHex(rawDataHex);
  if (bytes.length < 2) {
    return {
      kind: "unknown",
      rawDataHex,
      rawBytes: bytes,
      canId: message.type === "can.frame" ? message.id : ASMG_MD_HOST_EXTENDED_ID,
      extended: message.type === "can.frame" ? message.extended === true : true,
      dlc: message.type === "can.frame" ? message.dlc ?? bytes.length : bytes.length
    };
  }

  const command = bytes[1];
  const base = {
    rawDataHex,
    rawBytes: bytes,
    canId: message.type === "can.frame" ? message.id : ASMG_MD_HOST_EXTENDED_ID,
    extended: message.type === "can.frame" ? message.extended === true : true,
    dlc: message.type === "can.frame" ? message.dlc ?? bytes.length : bytes.length,
    servoId: bytes[0],
    command
  };

  if (command === 0x01 && bytes.length >= 6) {
    return { ...base, kind: "moveEcho", position: u16(bytes[2], bytes[3]), speed: u16(bytes[4], bytes[5]) };
  }
  if (command === 0x02 && bytes.length >= 6) {
    return { ...base, kind: "positionCommand", currentPosition: u16(bytes[2], bytes[3]), commandPosition: u16(bytes[4], bytes[5]) };
  }
  if (command === 0x03 && bytes.length >= 6) {
    return { ...base, kind: "currentSetting", currentTorque: u16(bytes[2], bytes[3]), setCurrent: u16(bytes[4], bytes[5]) };
  }
  if (command === 0x06 && bytes.length >= 8) {
    return { ...base, kind: "pid", p: u16(bytes[2], bytes[3]), i: u16(bytes[4], bytes[5]), d: u16(bytes[6], bytes[7]) };
  }
  if (command === 0x07 && bytes.length >= 6) {
    return { ...base, kind: "positionCurrent", currentPosition: u16(bytes[2], bytes[3]), current: u16(bytes[4], bytes[5]) };
  }
  if (command === 0x08 && bytes.length >= 4) {
    return { ...base, kind: "saveCenterEcho", centerRatio: u16(bytes[2], bytes[3]) };
  }
  if (command === 0x09 && bytes.length >= 3) {
    return { ...base, kind: "baudEcho", baudCode: bytes[2], baudKbps: codeToBaudKbps(bytes[2]) };
  }
  if (command === 0xfc) {
    return { ...base, kind: "factoryReset" };
  }
  if (command === 0xfd) {
    return { ...base, kind: "readId" };
  }
  if (command === 0xfe) {
    return { ...base, kind: "setId", newId: bytes[0] };
  }
  return { ...base, kind: "unknown" };
}

export function parseAsmgMdDataHex(dataHex: string): number[] {
  const compact = dataHex.replace(/0x/gi, "").replace(/[^0-9a-fA-F]/g, "");
  if (!compact || compact.length % 2 !== 0) {
    return [];
  }
  const bytes: number[] = [];
  for (let index = 0; index < compact.length; index += 2) {
    bytes.push(Number.parseInt(compact.slice(index, index + 2), 16));
  }
  return bytes;
}

export function normalizeAsmgMdServoId(id: number): number {
  if (!Number.isInteger(id) || id < 0 || id >= ASMG_MD_BROADCAST_ID) {
    throw new RangeError("ASMG-MD servo id must be an integer from 0 to 253");
  }
  return id;
}

export function normalizeAsmgMdWord(value: number, min: number, max: number, label: string): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new RangeError(`${label} must be an integer from 0x${min.toString(16)} to 0x${max.toString(16)}`);
  }
  return value;
}

export function baudKbpsToCode(baudKbps: AsmgMdBaudKbps): number {
  if (baudKbps === 250) {
    return 0x00;
  }
  if (baudKbps === 500) {
    return 0x01;
  }
  if (baudKbps === 1000) {
    return 0x02;
  }
  throw new RangeError("ASMG-MD baud must be 250, 500, or 1000 kbit/s");
}

export function codeToBaudKbps(code: number): AsmgMdBaudKbps | undefined {
  if (code === 0x00) {
    return 250;
  }
  if (code === 0x01) {
    return 500;
  }
  if (code === 0x02) {
    return 1000;
  }
  return undefined;
}

function hi(value: number): number {
  return (value >> 8) & 0xff;
}

function lo(value: number): number {
  return value & 0xff;
}

function u16(high: number, low: number): number {
  return ((high & 0xff) << 8) | (low & 0xff);
}
