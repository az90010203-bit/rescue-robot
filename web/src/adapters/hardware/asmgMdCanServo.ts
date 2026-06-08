import type { InboundMessage, PcCommand } from "@adapters/hardware/protocol";

export const ASMG_MD_HOST_EXTENDED_ID = 0x18ef0201;
export const ASMG_MD_DEFAULT_BITRATE_KBPS = 250;
export const ASMG_MD_DEFAULT_SERVO_ID = 1;
export const ASMG_MD_BROADCAST_ID = 0xfe;

export const ASMG_MD_POSITION_MIN = 0x0000;
export const ASMG_MD_POSITION_MAX = 0x7fff;
export const ASMG_MD_SPEED_MIN = 0x0000;
export const ASMG_MD_SPEED_MAX = 0x0500;
export const ASMG_MD_CENTER_RATIO_MIN = 0x0000;
export const ASMG_MD_CENTER_RATIO_MAX = 0x03e8;

export type AsmgMdBaudKbps = 250 | 500 | 1000;

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
  return { type: "can.config", seq, bitrateKbps };
}

export function buildAsmgMdCanReadCommand(seq: number): PcCommand {
  return { type: "can.read", seq };
}

export function buildAsmgMdMoveCommand(seq: number, options: { id: number; position: number; speed: number }): PcCommand {
  const id = normalizeAsmgMdServoId(options.id);
  const position = normalizeAsmgMdWord(options.position, ASMG_MD_POSITION_MIN, ASMG_MD_POSITION_MAX, "position");
  const speed = normalizeAsmgMdWord(options.speed, ASMG_MD_SPEED_MIN, ASMG_MD_SPEED_MAX, "speed");
  return buildAsmgMdCanSendCommand(seq, [id, 0x01, hi(position), lo(position), hi(speed), lo(speed), 0x00, 0x00]);
}

export function buildAsmgMdReadPositionCommand(seq: number, id: number): PcCommand {
  return buildAsmgMdCanSendCommand(seq, [normalizeAsmgMdServoId(id), 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
}

export function buildAsmgMdSetCurrentCommand(seq: number, options: { id: number; current: number }): PcCommand {
  const current = normalizeAsmgMdWord(options.current, 0x0000, 0xffff, "current");
  return buildAsmgMdCanSendCommand(seq, [normalizeAsmgMdServoId(options.id), 0x03, hi(current), lo(current), 0x00, 0x00, 0x00, 0x00]);
}

export function buildAsmgMdReadCurrentCommand(seq: number, id: number): PcCommand {
  return buildAsmgMdCanSendCommand(seq, [normalizeAsmgMdServoId(id), 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
}

export function buildAsmgMdSetPidCommand(seq: number, options: { id: number; p: number; i: number; d: number }): PcCommand {
  const p = normalizeAsmgMdWord(options.p, 0x0000, 0xffff, "p");
  const i = normalizeAsmgMdWord(options.i, 0x0000, 0xffff, "i");
  const d = normalizeAsmgMdWord(options.d, 0x0000, 0xffff, "d");
  return buildAsmgMdCanSendCommand(seq, [normalizeAsmgMdServoId(options.id), 0x05, hi(p), lo(p), hi(i), lo(i), hi(d), lo(d)]);
}

export function buildAsmgMdReadPidCommand(seq: number, id: number): PcCommand {
  return buildAsmgMdCanSendCommand(seq, [normalizeAsmgMdServoId(id), 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
}

export function buildAsmgMdReadPositionCurrentCommand(seq: number, id: number): PcCommand {
  return buildAsmgMdCanSendCommand(seq, [normalizeAsmgMdServoId(id), 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
}

export function buildAsmgMdSaveCenterCommand(seq: number, options: { id: number; ratio: number }): PcCommand {
  const ratio = normalizeAsmgMdWord(options.ratio, ASMG_MD_CENTER_RATIO_MIN, ASMG_MD_CENTER_RATIO_MAX, "center ratio");
  return buildAsmgMdCanSendCommand(seq, [normalizeAsmgMdServoId(options.id), 0x08, hi(ratio), lo(ratio), 0x00, 0x00, 0x00, 0x00]);
}

export function buildAsmgMdSetBaudCommand(seq: number, options: { id: number; baudKbps: AsmgMdBaudKbps }): PcCommand {
  const baudCode = baudKbpsToCode(options.baudKbps);
  return buildAsmgMdCanSendCommand(seq, [normalizeAsmgMdServoId(options.id), 0x09, baudCode, 0x00, 0x00, 0x00, 0x00, 0x00]);
}

export function buildAsmgMdFactoryResetCommand(seq: number, id: number): PcCommand {
  return buildAsmgMdCanSendCommand(seq, [normalizeAsmgMdServoId(id), 0xfc, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
}

export function buildAsmgMdReadIdCommand(seq: number): PcCommand {
  return buildAsmgMdCanSendCommand(seq, [ASMG_MD_BROADCAST_ID, 0xfd, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
}

export function buildAsmgMdSetIdCommand(seq: number, newId: number): PcCommand {
  return buildAsmgMdCanSendCommand(seq, [normalizeAsmgMdServoId(newId), 0xfe, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
}

export function buildAsmgMdCanSendCommand(seq: number, bytes: readonly number[]): PcCommand {
  if (bytes.length !== 8) {
    throw new RangeError("ASMG-MD CAN data must be exactly 8 bytes");
  }
  const data = bytes.map((byte) => normalizeAsmgMdByte(byte, "data byte"));
  return {
    type: "can.send",
    seq,
    id: ASMG_MD_HOST_EXTENDED_ID,
    extended: true,
    dlc: 8,
    b0: data[0],
    b1: data[1],
    b2: data[2],
    b3: data[3],
    b4: data[4],
    b5: data[5],
    b6: data[6],
    b7: data[7]
  };
}

export function parseAsmgMdCanFrame(message: InboundMessage): AsmgMdParsedFrame | null {
  if (message.type !== "can.frame") {
    return null;
  }
  const rawDataHex = message.dataHex ?? "";
  const bytes = parseAsmgMdDataHex(rawDataHex);
  if (bytes.length < 2) {
    return {
      kind: "unknown",
      rawDataHex,
      rawBytes: bytes,
      canId: message.id,
      extended: message.extended === true,
      dlc: message.dlc ?? bytes.length
    };
  }

  const command = bytes[1];
  const base = {
    rawDataHex,
    rawBytes: bytes,
    canId: message.id,
    extended: message.extended === true,
    dlc: message.dlc ?? bytes.length,
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

export function normalizeAsmgMdByte(value: number, label: string): number {
  if (!Number.isInteger(value) || value < 0x00 || value > 0xff) {
    throw new RangeError(`${label} must be an integer from 0x00 to 0xff`);
  }
  return value;
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
