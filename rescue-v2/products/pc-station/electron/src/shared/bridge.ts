import type {
  AgentHealth,
  CapabilityInvocation,
  MotionIntentPayload,
  SpeedLimitsPayload,
  StopReason
} from "./contracts";

/** Fixed camera endpoints exposed read-only to the isolated renderer. */
export interface CameraConfiguration {
  readonly healthUrl: string;
  readonly videoWebSocketUrl: string;
  readonly audioOfferUrl: string;
  readonly codec: string;
}

/** One operator-facing result emitted by the Electron main process. */
export interface OperationNotice {
  readonly level: "error" | "info" | "warning";
  readonly message: string;
}

/** Cleanup function returned by a renderer subscription. */
export type Unsubscribe = () => void;

/**
 * Minimal desktop API exposed through Electron contextBridge.
 *
 * No Node.js, shell, filesystem or arbitrary URL primitive is exposed.
 */
export interface RescueBridge {
  /** Returns the most recent validated Agent health, if available. */
  getHealth(): Promise<AgentHealth | null>;

  /** Subscribes to validated Agent health snapshots. */
  onHealth(listener: (health: AgentHealth) => void): Unsubscribe;

  /** Subscribes to operator-facing command and connection notices. */
  onOperation(listener: (notice: OperationNotice) => void): Unsubscribe;

  /** Replaces the main-process-owned UI motion intent. */
  setMotion(motion: MotionIntentPayload): Promise<void>;

  /** Clears UI motion and immediately releases the current control lease. */
  clearMotion(): Promise<void>;

  /** Updates independent mecanum and tracked speed limits. */
  setSpeedLimits(limits: SpeedLimitsPayload): Promise<void>;

  /** Requests a fresh control lease. */
  arm(): Promise<void>;

  /** Requests a high-priority whole-robot stop. */
  stop(reason: StopReason): Promise<void>;

  /** Invokes one validated logical capability. */
  invokeCapability(invocation: CapabilityInvocation): Promise<void>;

  /** Safely stops and restarts the PC Agent and Electron UI. */
  restartSoftware(): Promise<void>;

  /** Fixed single-camera connection details. */
  readonly camera: CameraConfiguration;
}

declare global {
  interface Window {
    readonly rescue: RescueBridge;
  }
}
