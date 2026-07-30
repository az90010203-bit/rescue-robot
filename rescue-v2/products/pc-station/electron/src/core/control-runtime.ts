/** JSON scalar accepted by the local Control Agent. */
export type JsonScalar = boolean | number | string | null;

/** JSON value accepted by the local Control Agent. */
export type JsonValue =
  | JsonScalar
  | readonly JsonValue[]
  | { readonly [key: string]: JsonValue };

/** One request sent to the loopback Control Agent. */
export interface AgentRequest {
  readonly method: "GET" | "POST";
  readonly path: string;
  readonly body?: { readonly [key: string]: JsonValue };
}

/** Transport boundary used by the Electron main process. */
export interface AgentTransport {
  /**
   * Sends one validated request to the loopback Agent.
   *
   * @param request - Method, fixed route and JSON body
   */
  request(request: AgentRequest): Promise<void>;
}

/** Active mecanum intent owned by the Electron main process. */
export interface MecanumMotionIntent {
  readonly mode: "mecanum";
  readonly forwardMilli: number;
  readonly strafeMilli: number;
  readonly turnMilli: number;
  readonly speedLimitPercent: number;
}

/** Active tracked-drive intent owned by the Electron main process. */
export interface TrackedMotionIntent {
  readonly mode: "tracked";
  readonly leftMilli: number;
  readonly rightMilli: number;
  readonly speedLimitPercent: number;
}

/** Motion state accepted from the isolated renderer. */
export type MotionIntent = MecanumMotionIntent | TrackedMotionIntent;

/**
 * Owns safety-critical UI heartbeat and periodic manual motion scheduling.
 *
 * The class is timer-agnostic so the Electron lifecycle layer can stop timers
 * before deactivating a window, while tests can exercise each tick deterministically.
 */
export class ControlRuntime {
  private heartbeatPending: Promise<void> | null = null;
  private motionPending: Promise<void> | null = null;
  private motion: MotionIntent | null = null;

  /**
   * Creates the safety runtime.
   *
   * @param transport - Loopback-only Agent transport
   */
  public constructor(private readonly transport: AgentTransport) {}

  /**
   * Replaces the latest normalized motion state.
   *
   * @param motion - Fully normalized mecanum or tracked intent
   */
  public setMotion(motion: MotionIntent): void {
    this.motion = motion;
  }

  /** Clears the current motion state without sending a command. */
  public clearMotion(): void {
    this.motion = null;
  }

  /**
   * Sends one heartbeat unless a prior heartbeat is still pending.
   *
   * @returns The active heartbeat promise so concurrent ticks can coalesce
   */
  public heartbeatTick(): Promise<void> {
    if (this.heartbeatPending !== null) {
      return this.heartbeatPending;
    }
    const pending = this.transport
      .request({ method: "POST", path: "/v2/ui/heartbeat", body: {} })
      .finally(() => {
        this.heartbeatPending = null;
      });
    this.heartbeatPending = pending;
    return pending;
  }

  /**
   * Sends the latest non-neutral UI motion to the Agent.
   *
   * @returns A promise settled after the Agent request, or immediately when neutral
   */
  public motionTick(): Promise<void> {
    if (this.motionPending !== null) {
      return this.motionPending;
    }
    const motion = this.motion;
    if (motion === null || isNeutral(motion)) {
      return Promise.resolve();
    }
    const request =
      motion.mode === "tracked"
        ? this.transport.request({
            method: "POST",
            path: "/v2/capability/tracked",
            body: {
              leftMilli: motion.leftMilli,
              rightMilli: motion.rightMilli,
              speedLimitPercent: motion.speedLimitPercent
            }
          })
        : this.transport.request({
            method: "POST",
            path: "/v2/control/drive",
            body: {
              forwardMilli: motion.forwardMilli,
              strafeMilli: motion.strafeMilli,
              turnMilli: motion.turnMilli,
              speedLimitPercent: motion.speedLimitPercent,
              deadman: true
            }
          });
    const pending = request.finally(() => {
      this.motionPending = null;
    });
    this.motionPending = pending;
    return pending;
  }

  /**
   * Clears all motion and requests an immediate whole-robot stop.
   *
   * @param reason - Stable diagnostic reason recorded by the Agent
   */
  public async deactivate(reason: string): Promise<void> {
    this.clearMotion();
    await this.transport.request({
      method: "POST",
      path: "/v2/control/stop",
      body: { reason }
    });
  }
}

function isNeutral(motion: MotionIntent): boolean {
  if (motion.mode === "tracked") {
    return Math.abs(motion.leftMilli) + Math.abs(motion.rightMilli) === 0;
  }
  return (
    Math.abs(motion.forwardMilli) +
      Math.abs(motion.strafeMilli) +
      Math.abs(motion.turnMilli) ===
    0
  );
}
