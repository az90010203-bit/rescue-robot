import { describe, expect, it } from "vitest";
import {
  ASMG_MD_POSITION_STEPS_PER_TURN,
  ASMG_MD_HOST_EXTENDED_ID,
  asmgMdDegreesToPositionRaw,
  asmgMdLogicalAngleToPhysicalDegrees,
  asmgMdLogicalAngleToPositionRaw,
  asmgMdPositionRawToLogicalDegrees,
  asmgMdPositionRawToDegrees,
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
} from "@adapters/hardware/asmgMdCanServo";

describe("ASMG-MD CAN servo protocol", () => {
  it("builds semantic A-board CAN servo config and read commands", () => {
    expect(buildAsmgMdCanConfigCommand(1)).toEqual({ type: "can_servo.config", seq: 1, bitrateKbps: 250 });
    expect(buildAsmgMdCanConfigCommand(2, 500)).toEqual({ type: "can_servo.config", seq: 2, bitrateKbps: 500 });
    expect(buildAsmgMdCanReadCommand(3)).toEqual({ type: "can_servo.read", seq: 3, request: "frames" });
  });

  it("builds semantic position and speed control commands", () => {
    const command = buildAsmgMdMoveCommand(10, { id: 1, position: 0x1234, speed: 0x0500 });

    expect(command).toEqual({ type: "can_servo.move", seq: 10, id: 1, position: 0x1234, speed: 0x0500 });
  });

  it("maps full-turn angles to ASMG-MD 15-bit position units", () => {
    expect(ASMG_MD_POSITION_STEPS_PER_TURN).toBe(0x8000);
    expect(asmgMdDegreesToPositionRaw(0)).toBe(0x0000);
    expect(asmgMdDegreesToPositionRaw(90)).toBe(0x2000);
    expect(asmgMdDegreesToPositionRaw(180)).toBe(0x4000);
    expect(asmgMdDegreesToPositionRaw(360)).toBe(0x7fff);
    expect(asmgMdPositionRawToDegrees(0x2000)).toBe(90);
    expect(asmgMdPositionRawToDegrees(0x4000)).toBe(180);
    expect(asmgMdPositionRawToDegrees(0x7fff)).toBe(360);
  });

  it("maps logical CAN servo angles through plugin limits and reverse direction", () => {
    const profile = { id: 2, name: "J2", minDeg: 20, maxDeg: 120, direction: -1 as const, bitrateKbps: 250 as const };

    expect(asmgMdLogicalAngleToPhysicalDegrees(profile, 30)).toBe(90);
    expect(asmgMdLogicalAngleToPositionRaw(profile, 30)).toBe(asmgMdDegreesToPositionRaw(90));
    expect(asmgMdPositionRawToLogicalDegrees(profile, asmgMdDegreesToPositionRaw(90))).toBe(30);
  });

  it("builds semantic read and configuration commands", () => {
    expect(buildAsmgMdReadPositionCommand(1, 1)).toEqual({ type: "can_servo.read", seq: 1, id: 1, request: "position" });
    expect(buildAsmgMdSetCurrentCommand(2, { id: 1, current: 0x0032 })).toEqual({ type: "can_servo.set_current", seq: 2, id: 1, current: 0x0032 });
    expect(buildAsmgMdReadCurrentCommand(3, 1)).toEqual({ type: "can_servo.read", seq: 3, id: 1, request: "current" });
    expect(buildAsmgMdSetPidCommand(4, { id: 1, p: 0x0102, i: 0x0304, d: 0x0506 })).toEqual({ type: "can_servo.pid", seq: 4, id: 1, p: 0x0102, i: 0x0304, d: 0x0506 });
    expect(buildAsmgMdReadPidCommand(5, 1)).toEqual({ type: "can_servo.pid", seq: 5, id: 1, read: true });
    expect(buildAsmgMdReadPositionCurrentCommand(6, 1)).toEqual({ type: "can_servo.read", seq: 6, id: 1, request: "position_current" });
    expect(buildAsmgMdSaveCenterCommand(7, { id: 1, ratio: 0x03e8 })).toEqual({ type: "can_servo.save_center", seq: 7, id: 1, ratio: 0x03e8 });
    expect(buildAsmgMdSetBaudCommand(8, { id: 1, baudKbps: 1000 })).toEqual({ type: "can_servo.config", seq: 8, id: 1, baudKbps: 1000, applyToServo: true });
    expect(buildAsmgMdFactoryResetCommand(9, 1)).toEqual({ type: "can_servo.factory_reset", seq: 9, id: 1 });
  });

  it("builds semantic ID read and ID change commands", () => {
    expect(buildAsmgMdReadIdCommand(1)).toEqual({ type: "can_servo.read", seq: 1, request: "id" });
    expect(buildAsmgMdSetIdCommand(2, 1)).toEqual({ type: "can_servo.set_id", seq: 2, newId: 1 });
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
