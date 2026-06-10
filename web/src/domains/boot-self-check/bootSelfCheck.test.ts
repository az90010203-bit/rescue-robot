import { describe, expect, it } from "vitest";
import { createPlatformCommand } from "@platform/commands";
import {
  BOOT_SELF_CHECK_STEP_ORDER,
  blockedPlatformCommandResult,
  cancelBootSelfCheckRun,
  completeBootSelfCheckStep,
  createBootSelfCheckGateState,
  createBootSelfCheckSignature,
  createInitialBootSelfCheckRun,
  evaluateBootSelfCheckStep,
  pcCommandIsDangerous,
  planBootSelfCheckStepCommands,
  shouldBlockPlatformCommand,
  type BootSelfCheckInput
} from "@domains/boot-self-check/bootSelfCheck";

describe("boot self check", () => {
  it("plans the fixed startup sequence and stable repeat signature", () => {
    expect(BOOT_SELF_CHECK_STEP_ORDER).toEqual([
      "data-service",
      "pi-helper",
      "pi-ssh",
      "a-board-bridge",
      "pi-servo-bridge",
      "control-serial",
      "camera",
      "servo-feedback",
      "motor-feedback",
      "gamepad",
      "architecture"
    ]);

    expect(createBootSelfCheckSignature(baseInput())).toContain("project-1");
    expect(createBootSelfCheckSignature(baseInput({ piHost: "pi-a.local" }))).not.toBe(createBootSelfCheckSignature(baseInput({ piHost: "pi-b.local" })));
  });

  it("locks dangerous commands when a critical step fails but keeps checks and stops available", () => {
    let run = createInitialBootSelfCheckRun(baseInput(), 100);
    run = completeBootSelfCheckStep(run, "a-board-bridge", evaluateBootSelfCheckStep("a-board-bridge", baseInput({ aBoardBridgeStatus: "error" })), 120);
    const gate = createBootSelfCheckGateState(run);

    expect(gate.locked).toBe(true);
    expect(gate.blockedStepIds).toContain("a-board-bridge");
    expect(shouldBlockPlatformCommand(createPlatformCommand("motor.set_speed", "motor:M1", { speedPercent: 10 }), gate)).toBe(true);
    expect(shouldBlockPlatformCommand(createPlatformCommand("motor.stop", "motor:M1", { stopMode: "brake" }), gate)).toBe(false);
    expect(shouldBlockPlatformCommand(createPlatformCommand("servo.read_feedback", "servo:7"), gate)).toBe(false);
    expect(blockedPlatformCommandResult(createPlatformCommand("robot-arm.set_pose", "robot-arm:main", { joints: [] }), gate).status).toBe("failed");
  });

  it("builds confirm-only repair actions for bridge failures", () => {
    const aBoard = evaluateBootSelfCheckStep("a-board-bridge", baseInput({ aBoardBridgeStatus: "idle" }));
    const piServo = evaluateBootSelfCheckStep("pi-servo-bridge", baseInput({ piServoBridgeStatus: "idle" }));

    expect(aBoard.status).toBe("failed");
    expect(aBoard.repairActions.map((action) => action.localAction)).toEqual(["check-a-board-bridge", "start-a-board-bridge"]);
    expect(piServo.status).toBe("failed");
    expect(piServo.repairActions.map((action) => action.localAction)).toEqual(["check-pi-servo-bridge", "start-pi-servo-bridge"]);
  });

  it("runs only read/check commands during self check planning", () => {
    const input = baseInput({
      activeCameraSource: { id: "main", label: "Main", streamUrl: "http://pi.local:8080/?action=stream" },
      motors: [{ id: "M1", name: "Left" }],
      servos: [{ id: 7, name: "Elbow" }]
    });

    expect(planBootSelfCheckStepCommands("pi-helper", input).commands.map((command) => command.type)).toEqual(["pi.check"]);
    expect(planBootSelfCheckStepCommands("camera", input).commands.map((command) => command.type)).toEqual(["pi.camera.check"]);
    expect(planBootSelfCheckStepCommands("servo-feedback", input).commands.map((command) => command.type)).toEqual(["servo.read_feedback"]);
    expect(planBootSelfCheckStepCommands("motor-feedback", input).commands.map((command) => command.type)).toEqual(["motor.read_feedback"]);
  });

  it("marks configured feedback missing as critical until a read succeeds", () => {
    const input = baseInput({ servos: [{ id: 7, name: "Elbow" }] });
    const missing = evaluateBootSelfCheckStep("servo-feedback", input);
    const passed = evaluateBootSelfCheckStep("servo-feedback", input, [{
      commandId: "cmd",
      deviceId: "servo:7",
      status: "sent"
    }]);

    expect(missing.status).toBe("failed");
    expect(missing.repairActions[0].command?.type).toBe("servo.read_feedback");
    expect(passed.status).toBe("passed");
  });

  it("cancels pending and running steps without fabricating success", () => {
    const run = cancelBootSelfCheckRun(createInitialBootSelfCheckRun(baseInput(), 100), 150);

    expect(run.status).toBe("cancelled");
    expect(run.steps.every((step) => step.status === "cancelled")).toBe(true);
  });

  it("identifies raw hardware movement commands for non-platform paths", () => {
    expect(pcCommandIsDangerous({ type: "motor.set" })).toBe(true);
    expect(pcCommandIsDangerous({ type: "mecanum.target" })).toBe(true);
    expect(pcCommandIsDangerous({ type: "motor.stop" })).toBe(false);
    expect(pcCommandIsDangerous({ type: "motor.read" })).toBe(false);
  });
});

function baseInput(overrides: Partial<BootSelfCheckInput> = {}): BootSelfCheckInput {
  return {
    aBoardBridgeStatus: "connected",
    connected: true,
    connectionMode: "controller",
    databaseStatus: "saved",
    gamepads: [],
    motors: [],
    piHost: "pi.local",
    piServoBridgeStatus: "connected",
    platformState: {
      "connection:serial": {
        deviceId: "connection:serial",
        status: "online",
        values: { connected: true, mode: "controller" }
      },
      "pi:main": {
        deviceId: "pi:main",
        status: "online",
        values: { helperReady: true, connectionReady: true }
      }
    },
    pluginInstanceCount: 2,
    projectId: "project-1",
    projectName: "Default Robot",
    servos: [],
    ...overrides
  };
}
