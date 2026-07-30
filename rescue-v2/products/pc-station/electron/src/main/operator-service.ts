import type { AgentTransport } from "../core/control-runtime";
import { ControlRuntime } from "../core/control-runtime";
import {
  capabilityInvocationSchema,
  motionIntentSchema,
  speedLimitsSchema,
  stopReasonSchema
} from "../shared/contracts";

/**
 * Validates every renderer request before it can reach the Control Agent.
 *
 * This class is independent from Electron IPC so validation and route mapping
 * remain deterministic and directly testable.
 */
export class OperatorService {
  private readonly runtime: ControlRuntime;

  /**
   * Creates an operator service over a loopback Agent transport.
   *
   * @param transport - Agent transport unavailable to the renderer
   */
  public constructor(private readonly transport: AgentTransport) {
    this.runtime = new ControlRuntime(transport);
  }

  /** Validates and stores the newest renderer motion state. */
  public setMotion(input: unknown): void {
    this.runtime.setMotion(motionIntentSchema.parse(input));
  }

  /** Clears motion without sending a stop; lifecycle callers choose the reason. */
  public clearMotion(): void {
    this.runtime.clearMotion();
  }

  /** Sends one coalesced UI heartbeat. */
  public heartbeatTick(): Promise<void> {
    return this.runtime.heartbeatTick();
  }

  /** Sends the latest non-neutral UI motion. */
  public motionTick(): Promise<void> {
    return this.runtime.motionTick();
  }

  /** Clears motion and immediately requests a whole-robot stop. */
  public deactivate(reason: unknown): Promise<void> {
    return this.runtime.deactivate(stopReasonSchema.parse(reason));
  }

  /** Requests a fresh Agent/Pi control lease. */
  public arm(): Promise<void> {
    return this.transport.request({
      method: "POST",
      path: "/v2/control/arm",
      body: {}
    });
  }

  /** Validates and sends independent drive speed limits. */
  public setSpeedLimits(input: unknown): Promise<void> {
    const limits = speedLimitsSchema.parse(input);
    return this.transport.request({
      method: "POST",
      path: "/v2/control/speed-limits",
      body: limits
    });
  }

  /** Validates and invokes one fixed-route logical capability. */
  public invokeCapability(input: unknown): Promise<void> {
    const invocation = capabilityInvocationSchema.parse(input);
    return this.transport.request({
      method: "POST",
      path: `/v2/capability/${invocation.name}`,
      body: invocation.body
    });
  }
}
