import { describe, expect, it } from "vitest";
import { toHex, type FeetechStatusPacket } from "@adapters/hardware/protocol";
import { createPlatformCommand } from "@platform/commands";
import { usePlatformCommands } from "@platform/usePlatformCommands";

function createRuntime(overrides: {
  sendServoFrameUnlocked: (frame: number[]) => Promise<FeetechStatusPacket | null>;
}) {
  const events: unknown[] = [];
  const frames: number[][] = [];
  const runtime = usePlatformCommands({
    enqueueServoSerialTask: (task) => task(),
    nextSeq: () => 1,
    platformEventBusRef: { current: { emit: (event: unknown) => events.push(event) } as any },
    rememberServoFeedback: () => undefined,
    sendMotorCommand: async () => true,
    sendServoFrameUnlocked: async (frame) => {
      frames.push(frame);
      return overrides.sendServoFrameUnlocked(frame);
    },
    sendServoFrames: async () => null,
    servos: [],
    writeServoPositionUnlocked: async () => true,
    writeServoWheelSpeedUnlocked: async () => true
  });
  return { events, frames, runtime };
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
});
