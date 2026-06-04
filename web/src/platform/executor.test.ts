import { describe, expect, it } from "vitest";
import { createPlatformCommand } from "./commands";
import { executePlatformCommand } from "./executor";

describe("platform command executor", () => {
  it("fails before dispatching invalid commands", async () => {
    const result = await executePlatformCommand(createPlatformCommand("servo.ping", "camera:main"), {
      handlers: {
        "servo.ping": async () => ({ status: "sent" })
      }
    });

    expect(result.status).toBe("failed");
    expect(result.message).toContain("requires a servo target");
  });

  it("returns skipped when no handler is registered", async () => {
    const command = createPlatformCommand("servo.ping", "servo:22");
    const result = await executePlatformCommand(command, { handlers: {} });

    expect(result).toMatchObject({
      commandId: command.id,
      deviceId: "servo:22",
      status: "skipped"
    });
  });

  it("normalizes partial handler results", async () => {
    const command = createPlatformCommand("motor.stop", "motor:M1");
    const result = await executePlatformCommand(command, {
      handlers: {
        "motor.stop": async () => ({ response: { ok: true } })
      }
    });

    expect(result).toEqual({
      commandId: command.id,
      deviceId: "motor:M1",
      status: "sent",
      message: undefined,
      response: { ok: true }
    });
  });

  it("converts handler exceptions into failed results", async () => {
    const result = await executePlatformCommand(createPlatformCommand("motor.stop", "motor:M1"), {
      handlers: {
        "motor.stop": async () => {
          throw new Error("serial closed");
        }
      }
    });

    expect(result).toMatchObject({
      status: "failed",
      message: "serial closed"
    });
  });
});
