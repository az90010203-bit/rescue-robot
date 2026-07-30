import { z } from "zod";

const unitMilliSchema = z.number().int().min(-1000).max(1000);
const directionSchema = z.union([z.literal(-1), z.literal(1)]);

/** Validated mecanum or tracked motion accepted from the renderer. */
export const motionIntentSchema = z.discriminatedUnion("mode", [
  z
    .object({
      mode: z.literal("mecanum"),
      forwardMilli: unitMilliSchema,
      strafeMilli: unitMilliSchema,
      turnMilli: unitMilliSchema,
      speedLimitPercent: z.number().int().min(30).max(70)
    })
    .strict(),
  z
    .object({
      mode: z.literal("tracked"),
      leftMilli: unitMilliSchema,
      rightMilli: unitMilliSchema,
      speedLimitPercent: z.number().int().min(30).max(100)
    })
    .strict()
]);

/** Renderer motion intent after runtime validation. */
export type MotionIntentPayload = z.infer<typeof motionIntentSchema>;

/** Validated independent speed limits shared with the ESP32PLUS controller. */
export const speedLimitsSchema = z
  .object({
    mecanumPercent: z.number().int().min(30).max(70),
    trackedPercent: z.number().int().min(30).max(100)
  })
  .strict();

/** Independent mecanum and tracked speed limits. */
export type SpeedLimitsPayload = z.infer<typeof speedLimitsSchema>;

const armInvocationSchema = z.object({
  name: z.literal("arm"),
  body: z
    .object({
      axis: z.enum(["x", "z", "stop"]),
      value: z.union([z.literal(-1), z.literal(0), z.literal(1)])
    })
    .strict()
});

const clawInvocationSchema = z.object({
  name: z.literal("claw"),
  body: z
    .object({
      axis: z.literal("grip"),
      value: z.union([z.literal(-1), z.literal(0), z.literal(1)])
    })
    .strict()
});

const wristInvocationSchema = z.object({
  name: z.literal("wrist"),
  body: z
    .object({
      action: z.literal("rotate-step"),
      direction: directionSchema
    })
    .strict()
});

const wristCenterInvocationSchema = z.object({
  name: z.literal("wrist-center"),
  body: z.object({}).strict()
});

const gimbalInvocationSchema = z.object({
  name: z.literal("gimbal"),
  body: z.discriminatedUnion("action", [
    z.object({ action: z.literal("center") }).strict(),
    z
      .object({
        action: z.literal("jog"),
        axis: z.enum(["pan", "tilt"]),
        direction: directionSchema,
        stepDeg: z.number().int().min(1).max(15)
      })
      .strict()
  ])
});

const canInvocationSchema = z.object({
  name: z.literal("can"),
  body: z.discriminatedUnion("action", [
    z
      .object({
        action: z.literal("read"),
        group: z.enum(["front_left", "front_right", "rear_left", "rear_right"])
      })
      .strict(),
    z
      .object({
        action: z.literal("jog"),
        group: z.enum(["front_left", "front_right", "rear_left", "rear_right"]),
        direction: directionSchema,
        stepDeg: z.number().int().min(1).max(20),
        speedRaw: z.number().int().min(0).max(1280)
      })
      .strict()
  ])
});

const telemetryInvocationSchema = z.union([
  z.object({
    name: z.literal("imu"),
    body: z.object({ action: z.literal("read") }).strict()
  }),
  z.object({
    name: z.literal("feetech"),
    body: z.object({ action: z.literal("read") }).strict()
  })
]);

/** Closed set of logical capabilities exposed by the preload bridge. */
export const capabilityInvocationSchema = z.discriminatedUnion("name", [
  armInvocationSchema,
  clawInvocationSchema,
  wristInvocationSchema,
  wristCenterInvocationSchema,
  gimbalInvocationSchema,
  canInvocationSchema,
  ...telemetryInvocationSchema.options
]);

/** Validated logical capability invocation. */
export type CapabilityInvocation = z.infer<typeof capabilityInvocationSchema>;

/** Stable reason recorded when the Electron UI requests a stop. */
export const stopReasonSchema = z.string().trim().min(1).max(96);

/** Validated stop reason. */
export type StopReason = z.infer<typeof stopReasonSchema>;

const controllerFrameSchema = z
  .object({
    mode: z.enum(["mecanum", "tracked"]).optional(),
    speedLevel: z.number().int().optional(),
    speedMode: z.string().optional(),
    speedLimitPercent: z.number().optional(),
    activeMask: z.number().int().optional(),
    forward: z.number().optional(),
    strafe: z.number().optional(),
    turn: z.number().optional()
  })
  .nullable()
  .optional();

const controllerHealthSchema = z
  .object({
    port: z.string().optional(),
    connected: z.boolean(),
    frameAgeMs: z.number().nullable().optional(),
    fresh: z.boolean().optional(),
    lastFrame: controllerFrameSchema,
    lastError: z.string().nullable().optional()
  })
  .nullable();

const servoFeedbackSchema = z.object({
  positionRaw: z.number().int().optional(),
  speedRaw: z.number().int().optional(),
  loadRaw: z.number().int().optional(),
  voltageRaw: z.number().int().optional(),
  temperatureC: z.number().optional(),
  moving: z.boolean().optional(),
  currentRaw: z.number().int().optional()
});

const piHealthSchema = z
  .object({
    ok: z.boolean().optional(),
    service: z.string().optional(),
    version: z.string().optional(),
    serialOpen: z.boolean().optional(),
    armed: z.boolean().optional(),
    timedOut: z.boolean().optional(),
    lastStopReason: z.string().nullable().optional(),
    acceptedCommands: z.number().int().optional(),
    rejectedCommands: z.number().int().optional(),
    lastTelemetry: z
      .object({
        type: z.string().optional(),
        rx: z.number().optional(),
        stop: z.number().optional(),
        jitterUs: z.number().optional(),
        duty: z.array(z.number()).optional()
      })
      .nullable()
      .optional(),
    feetech: z
      .object({
        serialOpen: z.boolean().optional(),
        feedback: z.record(z.string(), servoFeedbackSchema).optional(),
        lastError: z.string().nullable().optional()
      })
      .optional()
  })
  .nullable();

/** Runtime-validated health payload published by the local Control Agent. */
export const agentHealthSchema = z.object({
  ok: z.boolean(),
  service: z.string(),
  version: z.string(),
  armed: z.boolean(),
  qtHeartbeatAgeMs: z.number().nullable().optional(),
  qtHeartbeatFresh: z.boolean(),
  lastStopReason: z.string().nullable(),
  stopCount: z.number().int(),
  speedLimits: z.object({
    mecanum: z.number().int(),
    tracked: z.number().int()
  }),
  lastError: z.string().nullable(),
  controller: controllerHealthSchema,
  pi: piHealthSchema
});

/** Agent health snapshot sent from Electron main to the renderer. */
export type AgentHealth = z.infer<typeof agentHealthSchema>;

/** Runtime-validated health payload published by the camera service. */
export const cameraHealthSchema = z.object({
  ok: z.boolean(),
  format: z.string(),
  codec: z.string().optional(),
  width: z.number().int(),
  height: z.number().int(),
  actualFps: z.number(),
  actualBitrateKbps: z.number().optional(),
  frameAgeMs: z.number().nullable(),
  reconnectCount: z.number().int(),
  degraded: z.boolean(),
  powerWarning: z.boolean(),
  audioAvailable: z.boolean(),
  lastError: z.string().nullable()
});

/** Camera health snapshot displayed in the operator console. */
export type CameraHealth = z.infer<typeof cameraHealthSchema>;
