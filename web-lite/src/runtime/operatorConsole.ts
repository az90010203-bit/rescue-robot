import type { BridgeHealth } from "./bridgeClient";

export type LiteConsoleMode = "operator" | "engineering";
export type LiteConsoleViewId = "control" | "can" | "feetech" | "pwm" | "gamepad" | "settings";
export type OperatorDeviceTone = "danger" | "neutral" | "online" | "warning";

export const OPERATOR_VISIBLE_VIEWS: readonly LiteConsoleViewId[] = ["control"];
export const ENGINEERING_VISIBLE_VIEWS: readonly LiteConsoleViewId[] = ["control", "can", "feetech", "pwm", "gamepad", "settings"];
export const WHOLE_ROBOT_STOP_TARGETS = {
  motors: ["mecanum", "tracked", "pwm"],
  servos: ["arm", "machine-claw"],
  can: ["jog"]
} as const;

export interface OperatorDeviceMatrixInput {
  aBoardError?: string | null;
  aBoardHealth?: BridgeHealth | null;
  cameraHost: string;
  gamepadConnected: boolean;
  imuDetail?: string | null;
  imuError?: string | null;
  imuReady?: boolean | null;
  piServoError?: string | null;
  piServoHealth?: BridgeHealth | null;
}

export interface OperatorDeviceMatrixItem {
  id: "aBoard" | "piServo" | "camera" | "gamepad" | "imu";
  detail: string;
  required: boolean;
  tone: OperatorDeviceTone;
}

export function visibleConsoleViews(mode: LiteConsoleMode): readonly LiteConsoleViewId[] {
  return mode === "engineering" ? ENGINEERING_VISIBLE_VIEWS : OPERATOR_VISIBLE_VIEWS;
}

export function isConsoleViewVisible(mode: LiteConsoleMode, view: LiteConsoleViewId): boolean {
  return visibleConsoleViews(mode).includes(view);
}

export function resolveConsoleViewForMode(mode: LiteConsoleMode, current: LiteConsoleViewId): LiteConsoleViewId {
  return isConsoleViewVisible(mode, current) ? current : "control";
}

export function buildOperatorDeviceMatrix(input: OperatorDeviceMatrixInput): OperatorDeviceMatrixItem[] {
  const aBoardOnline = input.aBoardHealth?.ok === true && input.aBoardHealth.serialOpen !== false;
  const piServoOnline = input.piServoHealth?.ok === true && input.piServoHealth.serialOpen !== false;
  return [
    {
      id: "aBoard",
      detail: input.aBoardError ?? serialDetail(input.aBoardHealth, "/dev/ttyAMA5"),
      required: true,
      tone: input.aBoardError ? "danger" : aBoardOnline ? "online" : input.aBoardHealth ? "warning" : "neutral"
    },
    {
      id: "piServo",
      detail: input.piServoError ?? serialDetail(input.piServoHealth, "/dev/serial0"),
      required: true,
      tone: input.piServoError ? "danger" : piServoOnline ? "online" : input.piServoHealth ? "warning" : "neutral"
    },
    {
      id: "camera",
      detail: input.cameraHost,
      required: true,
      tone: input.cameraHost.trim() ? "online" : "warning"
    },
    {
      id: "imu",
      detail: input.imuError ?? input.imuDetail ?? "not checked",
      required: true,
      tone: input.imuError ? "danger" : input.imuReady === true ? "online" : input.imuReady === false ? "warning" : "neutral"
    },
    {
      id: "gamepad",
      detail: input.gamepadConnected ? "connected" : "not connected",
      required: false,
      tone: input.gamepadConnected ? "online" : "warning"
    }
  ];
}

function serialDetail(health: BridgeHealth | null | undefined, fallbackPort: string): string {
  if (!health) {
    return "not checked";
  }
  const port = health.serialPort ?? fallbackPort;
  const protocol = health.serialProtocolActive ? ` / ${health.serialProtocolActive}` : "";
  return `${port}${protocol}`;
}
