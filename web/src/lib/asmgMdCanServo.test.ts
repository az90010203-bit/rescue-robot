import { describe, expect, it } from "vitest";
import {
  ASMG_MD_HOST_EXTENDED_ID,
  buildAsmgMdCanConfigCommand,
  buildAsmgMdCanReadCommand,
  buildAsmgMdFactoryResetCommand,
  buildAsmgMdMoveCommand,
  buildAsmgMdReadCurrentCommand,
  buildAsmgMdReadIdCommand,
  buildAsmgMdReadPidCommand,
  buildAsmgMdReadPositionCommand,
  buildAsmgMdReadPositionCurrentCommand,
  buildAsmgMdSaveCenterCommand,
  buildAsmgMdSetBaudCommand,
  buildAsmgMdSetCurrentCommand,
  buildAsmgMdSetIdCommand,
  buildAsmgMdSetPidCommand,
  parseAsmgMdCanFrame,
  parseAsmgMdDataHex
} from "./asmgMdCanServo";
import type { PcCommand } from "./protocol";

function dataBytes(command: PcCommand): number[] {
  return [command.b0, command.b1, command.b2, command.b3, command.b4, command.b5, command.b6, command.b7] as number[];
}

describe("ASMG-MD CAN servo protocol", () => {
  it("builds the A-board CAN config and raw read commands", () => {
    expect(buildAsmgMdCanConfigCommand(1)).toEqual({ type: "can.config", seq: 1, bitrateKbps: 250 });
    expect(buildAsmgMdCanConfigCommand(2, 500)).toEqual({ type: "can.config", seq: 2, bitrateKbps: 500 });
    expect(buildAsmgMdCanReadCommand(3)).toEqual({ type: "can.read", seq: 3 });
  });

  it("builds position and speed control frames", () => {
    const command = buildAsmgMdMoveCommand(10, { id: 1, position: 0x1234, speed: 0x0500 });

    expect(command).toMatchObject({ type: "can.send", seq: 10, id: ASMG_MD_HOST_EXTENDED_ID, extended: true, dlc: 8 });
    expect(dataBytes(command)).toEqual([0x01, 0x01, 0x12, 0x34, 0x05, 0x00, 0x00, 0x00]);
  });

  it("builds read and configuration frames", () => {
    expect(dataBytes(buildAsmgMdReadPositionCommand(1, 1))).toEqual([0x01, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    expect(dataBytes(buildAsmgMdSetCurrentCommand(2, { id: 1, current: 0x0032 }))).toEqual([0x01, 0x03, 0x00, 0x32, 0x00, 0x00, 0x00, 0x00]);
    expect(dataBytes(buildAsmgMdReadCurrentCommand(3, 1))).toEqual([0x01, 0x04, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    expect(dataBytes(buildAsmgMdSetPidCommand(4, { id: 1, p: 0x0102, i: 0x0304, d: 0x0506 }))).toEqual([0x01, 0x05, 0x01, 0x02, 0x03, 0x04, 0x05, 0x06]);
    expect(dataBytes(buildAsmgMdReadPidCommand(5, 1))).toEqual([0x01, 0x06, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    expect(dataBytes(buildAsmgMdReadPositionCurrentCommand(6, 1))).toEqual([0x01, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    expect(dataBytes(buildAsmgMdSaveCenterCommand(7, { id: 1, ratio: 0x03e8 }))).toEqual([0x01, 0x08, 0x03, 0xe8, 0x00, 0x00, 0x00, 0x00]);
    expect(dataBytes(buildAsmgMdSetBaudCommand(8, { id: 1, baudKbps: 1000 }))).toEqual([0x01, 0x09, 0x02, 0x00, 0x00, 0x00, 0x00, 0x00]);
    expect(dataBytes(buildAsmgMdFactoryResetCommand(9, 1))).toEqual([0x01, 0xfc, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
  });

  it("builds ID read and ID change frames", () => {
    expect(dataBytes(buildAsmgMdReadIdCommand(1))).toEqual([0xfe, 0xfd, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    expect(dataBytes(buildAsmgMdSetIdCommand(2, 1))).toEqual([0x01, 0xfe, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00]);
    expect(() => buildAsmgMdSetIdCommand(3, 0xfe)).toThrow(RangeError);
  });

  it("parses returned frame data into ASMG-MD fields", () => {
    expect(parseAsmgMdCanFrame({ type: "can.frame", seq: 1, id: ASMG_MD_HOST_EXTENDED_ID, extended: true, dlc: 8, dataHex: "01 02 12 34 56 78 00 00" })).toMatchObject({
      kind: "positionCommand",
      servoId: 1,
      currentPosition: 0x1234,
      commandPosition: 0x5678
    });
    expect(parseAsmgMdCanFrame({ type: "can.frame", seq: 2, id: ASMG_MD_HOST_EXTENDED_ID, extended: true, dlc: 8, dataHex: "0103000900320000" })).toMatchObject({
      kind: "currentSetting",
      currentTorque: 0x0009,
      setCurrent: 0x0032
    });
    expect(parseAsmgMdCanFrame({ type: "can.frame", seq: 3, id: ASMG_MD_HOST_EXTENDED_ID, extended: true, dlc: 8, dataHex: "0106001000200030" })).toMatchObject({
      kind: "pid",
      p: 0x0010,
      i: 0x0020,
      d: 0x0030
    });
    expect(parseAsmgMdCanFrame({ type: "can.frame", seq: 4, id: ASMG_MD_HOST_EXTENDED_ID, extended: true, dlc: 8, dataHex: "01071234000a0000" })).toMatchObject({
      kind: "positionCurrent",
      currentPosition: 0x1234,
      current: 0x000a
    });
    expect(parseAsmgMdCanFrame({ type: "can.frame", seq: 5, id: ASMG_MD_HOST_EXTENDED_ID, extended: true, dlc: 8, dataHex: "FE FD 00 00 00 00 00 00" })).toMatchObject({
      kind: "readId",
      servoId: 0xfe
    });
    expect(parseAsmgMdCanFrame({ type: "can.frame", seq: 6, id: ASMG_MD_HOST_EXTENDED_ID, extended: true, dlc: 8, dataHex: "01 FE 00 00 00 00 00 00" })).toMatchObject({
      kind: "setId",
      newId: 1
    });
  });

  it("keeps unknown frames with raw bytes", () => {
    expect(parseAsmgMdCanFrame({ type: "can.frame", seq: 7, id: 123, dataHex: "010a000000000000" })).toMatchObject({
      kind: "unknown",
      rawBytes: [0x01, 0x0a, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00],
      canId: 123
    });
    expect(parseAsmgMdDataHex("0x01, 0x07, 12 34")).toEqual([0x01, 0x07, 0x12, 0x34]);
  });
});
