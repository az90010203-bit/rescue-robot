import { describe, expect, it } from "vitest";
import {
  CAN_SERVO_STALL_CURRENT_RAW,
  assessCanServoLiveStop,
  buildCanServoLivePrimeCommands,
  canServoCircularDistanceRaw,
  findLatestCanServoPositionCurrentFeedback,
  isCanServoLiveFeedbackFresh,
  normalizeCanServoStallCurrentThreshold,
  type CanServoLiveFeedback,
  type CanServoLiveTarget
} from "./canServoLiveSafety";
import { ASMG_MD_POSITION_STEPS_PER_TURN, parseAsmgMdCanFrame } from "@adapters/hardware/asmgMdCanServo";

describe("CAN servo live safety", () => {
  it("primes live drag by configuring CAN and reading current position", () => {
    let seq = 1;
    const commands = buildCanServoLivePrimeCommands(() => seq++, { autoConfigure: true, bitrateKbps: 250, servoId: 1 });

    expect(commands).toEqual([
      { type: "can_servo.config", seq: 1, bitrateKbps: 250 },
      { type: "can_servo.read", seq: 2, id: 1, request: "position_current" }
    ]);
  });

  it("can prime without configuring CAN when auto configure is off", () => {
    const commands = buildCanServoLivePrimeCommands(() => 7, { autoConfigure: false, bitrateKbps: 250, servoId: 0 });

    expect(commands).toEqual([{ type: "can_servo.read", seq: 7, id: 0, request: "position_current" }]);
  });

  it("extracts the latest position/current feedback for the selected ID", () => {
    const parsed = [
      parseAsmgMdCanFrame({ type: "can.frame", seq: 1, id: 0x18ef0201, extended: true, dlc: 8, dataHex: "0107123400100000" }),
      parseAsmgMdCanFrame({ type: "can.frame", seq: 2, id: 0x18ef0201, extended: true, dlc: 8, dataHex: "0207567800200000" }),
      parseAsmgMdCanFrame({ type: "can.frame", seq: 3, id: 0x18ef0201, extended: true, dlc: 8, dataHex: "01079abc00300000" })
    ].filter((frame): frame is NonNullable<typeof frame> => frame !== null);

    expect(findLatestCanServoPositionCurrentFeedback(parsed, 1, 1000)).toEqual({
      servoId: 1,
      position: 0x9abc,
      current: 0x0030,
      atMs: 1000
    });
    expect(findLatestCanServoPositionCurrentFeedback(parsed, 3, 1000)).toBeNull();
  });

  it("requires fresh feedback before live sends", () => {
    const feedback: CanServoLiveFeedback = { servoId: 1, position: 0x1234, current: 20, atMs: 1000 };

    expect(isCanServoLiveFeedbackFresh(feedback, 2499)).toBe(true);
    expect(isCanServoLiveFeedbackFresh(feedback, 2501)).toBe(false);
    expect(isCanServoLiveFeedbackFresh(null, 1000)).toBe(false);
  });

  it("stops live drag when target is not progressing and current is high", () => {
    const target: CanServoLiveTarget = { targetPosition: 0x2000, commandAtMs: 1000, baselinePosition: 0x1000 };
    const latestFeedback: CanServoLiveFeedback = { servoId: 1, position: 0x1010, current: CAN_SERVO_STALL_CURRENT_RAW, atMs: 1900 };

    expect(
      assessCanServoLiveStop({
        protectionEnabled: true,
        target,
        latestFeedback,
        lostFeedbackCount: 0,
        nowMs: 1900,
        currentThreshold: CAN_SERVO_STALL_CURRENT_RAW
      })
    ).toEqual({ shouldStop: true, reason: "stalled" });
  });

  it("does not stop when the servo makes progress or current stays below threshold", () => {
    const target: CanServoLiveTarget = { targetPosition: 0x2000, commandAtMs: 1000, baselinePosition: 0x1000 };

    expect(
      assessCanServoLiveStop({
        protectionEnabled: true,
        target,
        latestFeedback: { servoId: 1, position: 0x1100, current: 200, atMs: 1900 },
        lostFeedbackCount: 0,
        nowMs: 1900,
        currentThreshold: CAN_SERVO_STALL_CURRENT_RAW
      }).shouldStop
    ).toBe(false);

    expect(
      assessCanServoLiveStop({
        protectionEnabled: true,
        target,
        latestFeedback: { servoId: 1, position: 0x1010, current: 30, atMs: 1900 },
        lostFeedbackCount: 0,
        nowMs: 1900,
        currentThreshold: CAN_SERVO_STALL_CURRENT_RAW
      }).shouldStop
    ).toBe(false);
  });

  it("stops live drag after repeated feedback loss", () => {
    const target: CanServoLiveTarget = { targetPosition: 0x2000, commandAtMs: 1000, baselinePosition: 0x1000 };

    expect(
      assessCanServoLiveStop({
        protectionEnabled: true,
        target,
        latestFeedback: null,
        lostFeedbackCount: 3,
        nowMs: 1600,
        currentThreshold: CAN_SERVO_STALL_CURRENT_RAW
      })
    ).toEqual({ shouldStop: true, reason: "feedback-lost" });
  });

  it("uses circular raw distance around the 15-bit boundary", () => {
    expect(ASMG_MD_POSITION_STEPS_PER_TURN).toBe(0x8000);
    expect(canServoCircularDistanceRaw(0x7ff0, 0x0010)).toBe(0x20);
  });

  it("normalizes current threshold input", () => {
    expect(normalizeCanServoStallCurrentThreshold(121.6)).toBe(122);
    expect(normalizeCanServoStallCurrentThreshold(-1)).toBe(0);
    expect(normalizeCanServoStallCurrentThreshold(Number.NaN)).toBe(CAN_SERVO_STALL_CURRENT_RAW);
  });
});
