import { describe, expect, it } from "vitest";
import { toHex, type FeetechStatusPacket, type InboundMessage, type PcCommand, type ServoProfile } from "@adapters/hardware/protocol";
import { createPlatformCommand } from "@platform/commands";
import { usePlatformCommands } from "@platform/usePlatformCommands";

function createRuntime(overrides: {
  sendServoFrameUnlocked: (frame: number[]) => Promise<FeetechStatusPacket | null>;
  sendServoCommand?: (command: PcCommand) => Promise<InboundMessage | null>;
  servos?: ServoProfile[];
  writeServoPositionUnlocked?: (options: {
    acc: number | undefined;
    live?: boolean;
    logFrame: boolean;
    physicalAngleDeg: number;
    servo: ServoProfile;
    speedRaw: number;
    waitMs: number;
  }) => Promise<unknown>;
}) {
  const events: unknown[] = [];
  const frames: number[][] = [];
  const commands: PcCommand[] = [];
  const aboardCommands: PcCommand[] = [];
  const runtime = usePlatformCommands({
    enqueueServoSerialTask: (task) => task(),
    nextSeq: () => 1,
    platformEventBusRef: { current: { emit: (event: unknown) => events.push(event) } as any },
    rememberServoFeedback: () => undefined,
    sendAboardCommand: async (command) => {
      aboardCommands.push(command);
      return { ok: true, messages: [{ type: "ack", seq: command.seq }] };
    },
    sendServoCommand: overrides.sendServoCommand
      ? async (command) => {
          commands.push(command);
          return overrides.sendServoCommand!(command);
        }
      : undefined,
    sendServoFrameUnlocked: async (frame) => {
      frames.push(frame);
      return overrides.sendServoFrameUnlocked(frame);
    },
    sendServoFrames: async () => null,
    servos: overrides.servos ?? [],
    writeServoPositionUnlocked: overrides.writeServoPositionUnlocked ?? (async () => true),
    writeServoWheelSpeedUnlocked: async () => true
  });
  return { aboardCommands, commands, events, frames, runtime };
}

describe("usePlatformCommands", () => {
  it("verifies torque writes by reading the torque register", async () => {
    const { frames, runtime } = createRuntime({
      sendServoFrameUnlocked: async (frame) =>
        frame[4] === 0x02
          ? { id: 22, status: 0, params: [0], checksum: 0 }
          : { id: 22, status: 0, params: [], checksum: 0 }
    });

    const result = await runtime.dispatchPlatformCommand(createPlatformCommand("servo.set_torque", "servo:22", { enabled: false }));

    expect(result.status).toBe("sent");
    expect(result.message).toBe("ID22 torque=0");
    expect(frames.map(toHex)).toEqual([
      "FF FF 16 04 03 28 00 BA",
      "FF FF 16 04 02 28 01 BA"
    ]);
  });

  it("fails torque writes when the readback register value does not match", async () => {
    const { runtime } = createRuntime({
      sendServoFrameUnlocked: async (frame) =>
        frame[4] === 0x02
          ? { id: 22, status: 0, params: [1], checksum: 0 }
          : { id: 22, status: 0, params: [], checksum: 0 }
    });

    const result = await runtime.dispatchPlatformCommand(createPlatformCommand("servo.set_torque", "servo:22", { enabled: false }));

    expect(result.status).toBe("failed");
    expect(result.message).toBe("ID22 torque verify failed: expected 0, got 1");
  });

  it("retries torque verification when the first readback has no register value", async () => {
    let readCount = 0;
    const { frames, runtime } = createRuntime({
      sendServoFrameUnlocked: async (frame) => {
        if (frame[4] !== 0x02) {
          return { id: 22, status: 0, params: [], checksum: 0 };
        }
        readCount += 1;
        return readCount === 1
          ? { id: 22, status: 0, params: [], checksum: 0 }
          : { id: 22, status: 0, params: [0], checksum: 0 };
      }
    });

    const result = await runtime.dispatchPlatformCommand(createPlatformCommand("servo.set_torque", "servo:22", { enabled: false }));

    expect(result.status).toBe("sent");
    expect(frames.map(toHex)).toEqual([
      "FF FF 16 04 03 28 00 BA",
      "FF FF 16 04 02 28 01 BA",
      "FF FF 16 04 02 28 01 BA"
    ]);
  });

  it("routes servo platform commands through semantic Pi servo commands when available", async () => {
    let seq = 10;
    const remembered: unknown[] = [];
    const commands: PcCommand[] = [];
    const runtime = usePlatformCommands({
      enqueueServoSerialTask: (task) => task(),
      nextSeq: () => seq++,
      platformEventBusRef: { current: { emit: () => undefined } as any },
      rememberServoFeedback: (feedback) => remembered.push(feedback),
      sendAboardCommand: async (command) => ({ ok: true, messages: [{ type: "ack", seq: command.seq }] }),
      sendServoCommand: async (command) => {
        commands.push(command);
        if (command.type === "servo.read") {
          return { type: "servo.feedback", seq: command.seq, id: Number(command.id), positionRaw: 2048 };
        }
        return { type: "ack", seq: command.seq, command: command.type };
      },
      sendServoFrameUnlocked: async () => null,
      sendServoFrames: async () => null,
      servos: [],
      writeServoPositionUnlocked: async () => true,
      writeServoWheelSpeedUnlocked: async () => true
    });

    await expect(runtime.dispatchPlatformCommand(createPlatformCommand("servo.ping", "servo:22"))).resolves.toMatchObject({ status: "sent" });
    await expect(runtime.dispatchPlatformCommand(createPlatformCommand("servo.read_feedback", "servo:22"))).resolves.toMatchObject({ status: "sent" });
    await expect(runtime.dispatchPlatformCommand(createPlatformCommand("servo.set_torque", "servo:22", { enabled: true }))).resolves.toMatchObject({ status: "sent" });
    await expect(runtime.dispatchPlatformCommand(createPlatformCommand("servo.set_id", "servo:22", { newId: 23, confirmSingleServo: true }))).resolves.toMatchObject({ status: "sent" });

    expect(commands).toEqual([
      { type: "servo.ping", seq: 10, id: 22 },
      { type: "servo.read", seq: 11, id: 22 },
      { type: "servo.torque", seq: 12, id: 22, enabled: true },
      { type: "servo.set_id", seq: 13, oldId: 22, newId: 23 }
    ]);
    expect(remembered).toEqual([{ type: "servo.feedback", seq: 11, id: 22, positionRaw: 2048 }]);
  });

  it("routes compiled servo preset pcCommands without decomposing them", async () => {
    const pcCommands: PcCommand[] = [
      { type: "servo.move", seq: 50, sync: true, targets: [{ id: 7, angleDeg: 120, speedRaw: 500, acc: 20 }, { id: 8, angleDeg: 90, speedRaw: 500, acc: 20 }] },
      { type: "can_servo.config", seq: 51, bitrateKbps: 250 },
      { type: "can_servo.group_move", seq: 52, targets: [{ id: 1, position: 8192 }, { id: 2, position: 9000 }], speed: 300 }
    ];
    const { aboardCommands, commands, runtime } = createRuntime({
      sendServoCommand: async (command) => ({ type: "ack", seq: command.seq, command: command.type }),
      sendServoFrameUnlocked: async () => null
    });

    const result = await runtime.dispatchPlatformCommand(createPlatformCommand("servo-preset.run", "servo-preset:ready", { pcCommands }));

    expect(result.status).toBe("sent");
    expect(commands).toEqual([pcCommands[0]]);
    expect(aboardCommands).toEqual([pcCommands[1], pcCommands[2]]);
  });

  it("preserves live servo position commands for realtime plugin drags", async () => {
    const servo: ServoProfile = { id: 9, name: "J1", minDeg: 0, maxDeg: 360, direction: 1 };
    const writes: unknown[] = [];
    const { runtime } = createRuntime({
      sendServoFrameUnlocked: async () => null,
      servos: [servo],
      writeServoPositionUnlocked: async (options) => {
        writes.push(options);
        return true;
      }
    });

    const result = await runtime.dispatchPlatformCommand(createPlatformCommand("servo.set_position", "servo:9", {
      angleDeg: 190,
      speedRaw: 300,
      acc: 30,
      live: true
    }));

    expect(result.status).toBe("sent");
    expect(writes).toMatchObject([{
      acc: 30,
      live: true,
      physicalAngleDeg: 190,
      servo,
      speedRaw: 300,
      waitMs: 80
    }]);
  });

  it("routes motor platform commands through the A board sender", async () => {
    let seq = 30;
    const aboardCommands: PcCommand[] = [];
    const runtime = usePlatformCommands({
      enqueueServoSerialTask: (task) => task(),
      nextSeq: () => seq++,
      platformEventBusRef: { current: { emit: () => undefined } as any },
      rememberServoFeedback: () => undefined,
      sendAboardCommand: async (command) => {
        aboardCommands.push(command);
        return { ok: true, messages: [{ type: "ack", seq: command.seq, command: command.type }] };
      },
      sendServoFrameUnlocked: async () => null,
      sendServoFrames: async () => null,
      servos: [],
      writeServoPositionUnlocked: async () => true,
      writeServoWheelSpeedUnlocked: async () => true
    });

    await expect(runtime.dispatchPlatformCommand(createPlatformCommand("motor.set_speed", "motor:M1", { speedPercent: 45, stopMode: "brake" }))).resolves.toMatchObject({ status: "sent" });
    await expect(runtime.dispatchPlatformCommand(createPlatformCommand("motor.stop", "motor:M1", { stopMode: "coast" }))).resolves.toMatchObject({ status: "sent" });
    await expect(runtime.dispatchPlatformCommand(createPlatformCommand("motor.read_feedback", "motor:M1"))).resolves.toMatchObject({ status: "sent" });

    expect(aboardCommands).toEqual([
      { type: "motor.set", seq: 30, channel: "M1", speedPercent: 45, stopMode: "brake" },
      { type: "motor.stop", seq: 31, channel: "M1", stopMode: "coast" },
      { type: "motor.read", seq: 32, channel: "M1" }
    ]);
  });
});
