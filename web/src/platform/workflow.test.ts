import { describe, expect, it } from "vitest";
import { createPlatformCommand } from "./commands";
import { runWorkflow, validateWorkflow } from "./workflow";

describe("workflow runtime", () => {
  it("validates basic workflow structure", () => {
    expect(validateWorkflow({ id: "", name: "Bad", nodes: [], edges: [] })).toBe("workflow requires id and name");
    expect(
      validateWorkflow({
        id: "w",
        name: "Workflow",
        nodes: [{ id: "a", kind: "event" }],
        edges: [{ from: "a", to: "missing" }]
      })
    ).toBe("workflow edge references missing node: a->missing");
  });

  it("runs condition, command, and log nodes", async () => {
    const command = createPlatformCommand("motor.stop", "motor:M1");
    const logs: string[] = [];
    const result = await runWorkflow(
      {
        id: "limit-stop",
        name: "Limit stop",
        nodes: [
          { id: "event", kind: "event" },
          { id: "check", kind: "condition", config: { source: "event", field: "pressed", equals: true } },
          { id: "stop", kind: "command", config: { command } },
          { id: "log", kind: "log", config: { message: "stopped" } }
        ],
        edges: [
          { from: "event", to: "check" },
          { from: "check", to: "stop", when: "true" },
          { from: "stop", to: "log" }
        ]
      },
      {
        event: { id: 1, type: "limit_switch", level: "info", source: "sensor", payload: { pressed: true }, createdAt: 1 },
        dispatchCommand: async (item) => ({ commandId: item.id, deviceId: item.targetDeviceId, status: "sent" }),
        log: (message) => logs.push(message)
      }
    );

    expect(result.status).toBe("completed");
    expect(result.visitedNodeIds).toEqual(["event", "check", "stop", "log"]);
    expect(result.commandResults[0]).toMatchObject({ status: "sent", deviceId: "motor:M1" });
    expect(logs).toEqual(["stopped"]);
  });

  it("skips false condition branches", async () => {
    const result = await runWorkflow(
      {
        id: "conditional",
        name: "Conditional",
        nodes: [
          { id: "event", kind: "event" },
          { id: "check", kind: "condition", config: { source: "event", field: "pressed", equals: true } },
          { id: "log", kind: "log" }
        ],
        edges: [
          { from: "event", to: "check" },
          { from: "check", to: "log", when: "true" }
        ]
      },
      { event: { id: 1, type: "limit_switch", level: "info", source: "sensor", payload: { pressed: false }, createdAt: 1 } }
    );

    expect(result.visitedNodeIds).toEqual(["event", "check"]);
  });
});
