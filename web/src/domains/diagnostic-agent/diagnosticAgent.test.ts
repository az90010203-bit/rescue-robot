import { describe, expect, it } from "vitest";
import { createPlatformCommand } from "@platform/commands";
import { DEFAULT_CAMERA_CONFIG, createDefaultArmConfig } from "@adapters/persistence/storage";
import { createPlatformStateSnapshot } from "@platform/stateStore";
import {
  analyzeDiagnosticContext,
  canAutoRunDiagnosticAction,
  classifyDiagnosticActionRisk,
  createDiagnosticAgentResponse,
  detectDiagnosticIntent,
  type DiagnosticAgentContext
} from "@domains/diagnostic-agent/diagnosticAgent";

describe("diagnostic agent", () => {
  it("recognizes common Chinese diagnostic intents", () => {
    expect(detectDiagnosticIntent("帮我检查一下")).toBe("general_check");
    expect(detectDiagnosticIntent("摄像头怎么了")).toBe("camera");
    expect(detectDiagnosticIntent("舵机没反馈")).toBe("servo_feedback");
    expect(detectDiagnosticIntent("为什么不能运行")).toBe("program_run");
  });

  it("summarizes offline serial, Pi helper, AI vision, camera URL, and servo feedback", () => {
    const context = contextWithState({
      connected: false,
      piHelperReady: false,
      aiVisionHelperReady: true,
      aiVisionDetectionCount: 0,
      cameraConfig: {
        ...DEFAULT_CAMERA_CONFIG,
        streamUrl: "",
        videoSources: DEFAULT_CAMERA_CONFIG.videoSources.map((source) =>
          source.id === "main" ? { ...source, streamUrl: "" } : source
        )
      },
      servos: [{ id: 22, name: "Arm Servo" }]
    });
    const issues = analyzeDiagnosticContext(context, "general_check");
    const ids = issues.map((issue) => issue.id);

    expect(ids).toEqual(expect.arrayContaining([
      "serial.offline",
      "pi.helper.offline",
      "camera.stream-url.missing",
      "ai-vision.no-detections",
      "servo.feedback-missing.22"
    ]));
  });

  it("keeps auto-run limited to the low-risk command whitelist", () => {
    const lowRisk = createPlatformCommand("servo.read_feedback", "servo:22");
    const confirmOnly = createPlatformCommand("motor.set_speed", "motor:M1", { speedPercent: 30 });
    const blocked = createPlatformCommand("pi.exec", "pi:main", { command: "sudo reboot" });

    expect(classifyDiagnosticActionRisk(lowRisk)).toBe("low");
    expect(classifyDiagnosticActionRisk(confirmOnly)).toBe("confirm");
    expect(classifyDiagnosticActionRisk(blocked)).toBe("blocked");
    expect(canAutoRunDiagnosticAction({
      id: "low",
      label: "Read",
      description: "Read feedback",
      risk: classifyDiagnosticActionRisk(lowRisk),
      command: lowRisk
    })).toBe(true);
    expect(canAutoRunDiagnosticAction({
      id: "move",
      label: "Move",
      description: "Move motor",
      risk: classifyDiagnosticActionRisk(confirmOnly),
      command: confirmOnly
    })).toBe(false);
  });

  it("creates low-risk next steps for camera and servo diagnostics", () => {
    const context = contextWithState({
      connected: true,
      piHelperReady: true,
      piConnectionReady: true,
      cameraReady: false,
      servos: [{ id: 22, name: "Arm Servo" }]
    });
    const response = createDiagnosticAgentResponse("摄像头怎么了，顺便看舵机反馈", context);
    const commandTypes = response.actions.map((action) => action.command?.type);

    expect(response.intent).toBe("camera");
    expect(commandTypes).toContain("pi.camera.check");
    expect(commandTypes).toContain("servo.read_feedback");
    expect(response.actions.filter(canAutoRunDiagnosticAction).length).toBeGreaterThanOrEqual(2);
  });
});

function contextWithState(options: {
  aiVisionDetectionCount?: number;
  aiVisionHelperReady?: boolean;
  cameraConfig?: typeof DEFAULT_CAMERA_CONFIG;
  cameraReady?: boolean;
  connected?: boolean;
  piConnectionReady?: boolean;
  piHelperReady?: boolean;
  servos?: Array<{ id: number; name: string }>;
}): DiagnosticAgentContext {
  const cameraConfig = options.cameraConfig ?? DEFAULT_CAMERA_CONFIG;
  return {
    activeCameraSource: cameraConfig.videoSources[0],
    activeModule: "camera",
    logs: [],
    platformState: createPlatformStateSnapshot({
      servoFeedback: {},
      motorFeedback: {},
      cameraConfig,
      armConfig: createDefaultArmConfig([]),
      connected: options.connected ?? true,
      connectionMode: options.connected === false ? null : "controller",
      cameraReady: options.cameraReady ?? false,
      piHelperReady: options.piHelperReady ?? true,
      piConnectionReady: options.piConnectionReady ?? false,
      aiVisionHelperReady: options.aiVisionHelperReady ?? false,
      aiVisionDetectionCount: options.aiVisionDetectionCount ?? null,
      aiVisionSourceId: "main",
      updatedAt: 100
    }),
    servos: options.servos ?? []
  };
}
