import {
  asmgMdLogicalAngleToPositionRaw,
  buildAsmgMdGroupMoveCommand,
  normalizeAsmgMdServoProfile,
  type AsmgMdServoProfile
} from "@adapters/hardware/asmgMdCanServo";
import {
  buildMecanumTargetCommand,
  buildMotorConfigCommand,
  buildMotorSetCommand,
  buildMotorStopCommand,
  buildMotorTargetCommand,
  clamp,
  servoLogicalSpan,
  type MotorProfile,
  type MotorStopMode,
  type PcCommand
} from "@adapters/hardware/protocol";
import type { LiteCanJogProfile, LiteDriveProfile } from "../robotProfile";

export type LiteCanJogGroup = "front" | "rear";
export type LiteCanJogDirection = -1 | 0 | 1;

export interface LiteDpadInput {
  up: boolean;
  down: boolean;
  left: boolean;
  right: boolean;
}

export interface LiteTrackedInput {
  forward: number;
  turn: number;
}

export interface LiteArmJoystickInput {
  forward: number;
  lift: number;
}

export type LiteGamepadControlMode = "arm" | "drive";

export interface LiteFourAxisArmJoystickInput {
  claw: LiteCanJogDirection;
  toolPitch: number;
  wristRoll: number;
  x: number;
  z: number;
}

export interface LiteGamepadState {
  dpadUp: boolean;
  dpadDown: boolean;
  dpadLeft: boolean;
  dpadRight: boolean;
  leftX: number;
  leftY: number;
  rightX: number;
  rightY: number;
  lb: boolean;
  lt: boolean;
  rb: boolean;
  rt: boolean;
  stop: boolean;
  y: boolean;
}

export type OperatorGamepadDiagramTone = "neutral" | "online" | "warning";
export type OperatorGamepadDiagramControlGroup = "dpad" | "face" | "shoulder" | "stick";
export type OperatorGamepadDiagramControlId =
  | "a"
  | "dpadDown"
  | "dpadLeft"
  | "dpadRight"
  | "dpadUp"
  | "lb"
  | "leftStick"
  | "lt"
  | "rb"
  | "rightStick"
  | "rt"
  | "y";

export interface OperatorGamepadDiagramControl {
  actionKey: string;
  active: boolean;
  group: OperatorGamepadDiagramControlGroup;
  id: OperatorGamepadDiagramControlId;
  labelKey: string;
  shortLabel: string;
  value: string;
  x?: number;
  y?: number;
}

export interface OperatorGamepadDiagramState {
  active: boolean;
  activeCount: number;
  activityFresh: boolean;
  connected: boolean;
  controls: OperatorGamepadDiagramControl[];
  enabled: boolean;
  mode: LiteGamepadControlMode;
  statusKey: string;
  tone: OperatorGamepadDiagramTone;
}

export interface ManualControlSnapshot {
  mecanum: {
    forward: number;
    strafe: number;
    turn: number;
  };
  tracked: LiteTrackedInput;
  arm: LiteArmJoystickInput;
  armPose: LiteFourAxisArmJoystickInput;
  canJog: {
    front: LiteCanJogDirection;
    rear: LiteCanJogDirection;
  };
  modeToggle: boolean;
  stop: boolean;
}

export const ZERO_LITE_GAMEPAD_STATE: LiteGamepadState = {
  dpadUp: false,
  dpadDown: false,
  dpadLeft: false,
  dpadRight: false,
  leftX: 0,
  leftY: 0,
  rightX: 0,
  rightY: 0,
  lb: false,
  lt: false,
  rb: false,
  rt: false,
  stop: false,
  y: false
};

export function buildOperatorGamepadDiagramState(
  state: LiteGamepadState,
  options: { activityFresh?: boolean; connected: boolean; enabled: boolean; mode?: LiteGamepadControlMode }
): OperatorGamepadDiagramState {
  const connected = Boolean(options.connected);
  const enabled = Boolean(options.enabled);
  const activityFresh = Boolean(options.activityFresh);
  const mode = options.mode ?? "drive";
  const canShowInput = connected && enabled;
  const readActive = (active: boolean) => canShowInput && active;
  const readAxis = (value: number) => canShowInput ? value : 0;
  const driveMode = mode === "drive";
  const armMode = mode === "arm";
  const leftX = readAxis(state.leftX);
  const leftY = readAxis(state.leftY);
  const rightX = readAxis(state.rightX);
  const rightY = readAxis(state.rightY);
  const controls: OperatorGamepadDiagramControl[] = [
    {
      actionKey: driveMode ? "operator.gamepadDiagram.actions.mecanumForward" : "operator.gamepadDiagram.actions.driveLocked",
      active: driveMode && readActive(state.dpadUp),
      group: "dpad",
      id: "dpadUp",
      labelKey: "operator.gamepadDiagram.keys.dpadUp",
      shortLabel: "UP",
      value: driveMode && readActive(state.dpadUp) ? "1" : "0"
    },
    {
      actionKey: driveMode ? "operator.gamepadDiagram.actions.mecanumLeft" : "operator.gamepadDiagram.actions.driveLocked",
      active: driveMode && readActive(state.dpadLeft),
      group: "dpad",
      id: "dpadLeft",
      labelKey: "operator.gamepadDiagram.keys.dpadLeft",
      shortLabel: "L",
      value: driveMode && readActive(state.dpadLeft) ? "1" : "0"
    },
    {
      actionKey: driveMode ? "operator.gamepadDiagram.actions.mecanumRight" : "operator.gamepadDiagram.actions.driveLocked",
      active: driveMode && readActive(state.dpadRight),
      group: "dpad",
      id: "dpadRight",
      labelKey: "operator.gamepadDiagram.keys.dpadRight",
      shortLabel: "R",
      value: driveMode && readActive(state.dpadRight) ? "1" : "0"
    },
    {
      actionKey: driveMode ? "operator.gamepadDiagram.actions.mecanumBackward" : "operator.gamepadDiagram.actions.driveLocked",
      active: driveMode && readActive(state.dpadDown),
      group: "dpad",
      id: "dpadDown",
      labelKey: "operator.gamepadDiagram.keys.dpadDown",
      shortLabel: "DN",
      value: driveMode && readActive(state.dpadDown) ? "1" : "0"
    },
    {
      actionKey: driveMode ? "operator.gamepadDiagram.actions.frontCanPlus" : "operator.gamepadDiagram.actions.armModeReserved",
      active: driveMode && readActive(state.lb),
      group: "shoulder",
      id: "lb",
      labelKey: "operator.gamepadDiagram.keys.lb",
      shortLabel: "LB",
      value: driveMode && readActive(state.lb) ? "1" : "0"
    },
    {
      actionKey: armMode ? "operator.gamepadDiagram.actions.clawClose" : "operator.gamepadDiagram.actions.frontCanMinus",
      active: readActive(state.lt),
      group: "shoulder",
      id: "lt",
      labelKey: "operator.gamepadDiagram.keys.lt",
      shortLabel: "LT",
      value: readActive(state.lt) ? "1" : "0"
    },
    {
      actionKey: driveMode ? "operator.gamepadDiagram.actions.rearCanPlus" : "operator.gamepadDiagram.actions.armModeReserved",
      active: driveMode && readActive(state.rb),
      group: "shoulder",
      id: "rb",
      labelKey: "operator.gamepadDiagram.keys.rb",
      shortLabel: "RB",
      value: driveMode && readActive(state.rb) ? "1" : "0"
    },
    {
      actionKey: armMode ? "operator.gamepadDiagram.actions.clawOpen" : "operator.gamepadDiagram.actions.rearCanMinus",
      active: readActive(state.rt),
      group: "shoulder",
      id: "rt",
      labelKey: "operator.gamepadDiagram.keys.rt",
      shortLabel: "RT",
      value: readActive(state.rt) ? "1" : "0"
    },
    {
      actionKey: armMode ? "operator.gamepadDiagram.actions.poseAdjust" : "operator.gamepadDiagram.actions.trackedDrive",
      active: Math.abs(leftX) > 0 || Math.abs(leftY) > 0,
      group: "stick",
      id: "leftStick",
      labelKey: "operator.gamepadDiagram.keys.leftStick",
      shortLabel: "L",
      value: canShowInput ? `${leftX.toFixed(2)} / ${leftY.toFixed(2)}` : "--",
      x: leftX,
      y: leftY
    },
    {
      actionKey: armMode ? "operator.gamepadDiagram.actions.planeMove" : "operator.gamepadDiagram.actions.armModeStandby",
      active: armMode && (Math.abs(rightX) > 0 || Math.abs(rightY) > 0),
      group: "stick",
      id: "rightStick",
      labelKey: "operator.gamepadDiagram.keys.rightStick",
      shortLabel: "R",
      value: canShowInput ? `${rightX.toFixed(2)} / ${rightY.toFixed(2)}` : "--",
      x: rightX,
      y: rightY
    },
    {
      actionKey: "operator.gamepadDiagram.actions.stopManual",
      active: readActive(state.stop),
      group: "face",
      id: "a",
      labelKey: "operator.gamepadDiagram.keys.a",
      shortLabel: "A",
      value: readActive(state.stop) ? "1" : "0"
    },
    {
      actionKey: armMode ? "operator.gamepadDiagram.actions.exitArmMode" : "operator.gamepadDiagram.actions.enterArmMode",
      active: canShowInput && (state.y || armMode),
      group: "face",
      id: "y",
      labelKey: "operator.gamepadDiagram.keys.y",
      shortLabel: "Y",
      value: canShowInput && (state.y || armMode) ? "1" : "0"
    }
  ];
  const activeCount = controls.filter((control) => control.active).length;
  return {
    active: activeCount > 0,
    activeCount,
    activityFresh,
    connected,
    controls,
    enabled,
    mode,
    statusKey: connected
      ? enabled
        ? activityFresh
          ? "operator.gamepadDiagram.statusActive"
          : "operator.gamepadDiagram.statusReady"
        : "operator.gamepadDiagram.statusDisabled"
      : "operator.gamepadDiagram.statusNoGamepad",
    tone: connected ? enabled ? activeCount > 0 || activityFresh ? "online" : "neutral" : "warning" : "warning"
  };
}

export function liteGamepadStateFromGamepad(gamepad: Gamepad | null | undefined, deadzone = 0.12): LiteGamepadState {
  if (!gamepad) {
    return ZERO_LITE_GAMEPAD_STATE;
  }
  const dpad = readDpad(gamepad);
  return {
    dpadUp: dpad.up,
    dpadDown: dpad.down,
    dpadLeft: dpad.left,
    dpadRight: dpad.right,
    leftX: readGamepadAxis(gamepad, 0, false, deadzone),
    leftY: readGamepadAxis(gamepad, 1, true, deadzone),
    rightX: readGamepadAxis(gamepad, 2, false, deadzone),
    rightY: readGamepadAxis(gamepad, 3, true, deadzone),
    lb: gamepadButtonPressed(gamepad, 4),
    lt: gamepadButtonPressed(gamepad, 6) || gamepadAxisPressed(gamepad, 4),
    rb: gamepadButtonPressed(gamepad, 5),
    rt: gamepadButtonPressed(gamepad, 7) || gamepadAxisPressed(gamepad, 5),
    stop: gamepadButtonPressed(gamepad, 0),
    y: gamepadButtonPressed(gamepad, 3)
  };
}

export function snapshotFromLiteGamepad(state: LiteGamepadState): ManualControlSnapshot {
  const mecanum = mecanumInputFromDpad({
    up: state.dpadUp,
    down: state.dpadDown,
    left: state.dpadLeft,
    right: state.dpadRight
  });
  const tracked = trackedInputFromStick(state.leftX, state.leftY);
  return {
    mecanum,
    tracked,
    arm: armInputFromRightStick(state.rightX, state.rightY),
    armPose: fourAxisArmInputFromGamepad(state),
    canJog: {
      front: canJogDirectionFromButtons(state.lb, state.lt),
      rear: canJogDirectionFromButtons(state.rb, state.rt)
    },
    modeToggle: state.y,
    stop: state.stop
  };
}

export function stepLiteGamepadControlMode(
  current: LiteGamepadControlMode,
  state: Pick<LiteGamepadState, "y">,
  previousYPressed: boolean
): { mode: LiteGamepadControlMode; previousYPressed: boolean; toggled: boolean } {
  const yPressed = Boolean(state.y);
  const toggled = yPressed && !previousYPressed;
  return {
    mode: toggled ? current === "arm" ? "drive" : "arm" : current,
    previousYPressed: yPressed,
    toggled
  };
}

export function mecanumInputFromDpad(input: LiteDpadInput): ManualControlSnapshot["mecanum"] {
  const forward = buttonAxis(input.up, input.down);
  const strafe = buttonAxis(input.right, input.left);
  const magnitude = Math.hypot(forward, strafe);
  const scale = magnitude > 1 ? 1 / magnitude : 1;
  return {
    forward: roundUnit(forward * scale),
    strafe: roundUnit(strafe * scale),
    turn: 0
  };
}

export function trackedInputFromStick(leftX: number, leftY: number): LiteTrackedInput {
  return {
    forward: clampUnit(leftY),
    turn: clampUnit(leftX)
  };
}

export function armInputFromRightStick(rightX: number, rightY: number): LiteArmJoystickInput {
  return {
    forward: clampUnit(rightY),
    lift: clampUnit(rightX)
  };
}

export function fourAxisArmInputFromGamepad(state: Pick<LiteGamepadState, "leftX" | "leftY" | "lt" | "rightX" | "rightY" | "rt">): LiteFourAxisArmJoystickInput {
  return {
    claw: canJogDirectionFromButtons(state.rt, state.lt),
    toolPitch: clampUnit(state.leftY),
    wristRoll: clampUnit(state.leftX),
    x: clampUnit(state.rightY),
    z: clampUnit(state.rightX)
  };
}

export function canJogDirectionFromButtons(positive: boolean, negative: boolean): LiteCanJogDirection {
  return (positive === negative ? 0 : positive ? 1 : -1) as LiteCanJogDirection;
}

export function hasMecanumMotion(input: Pick<ManualControlSnapshot["mecanum"], "forward" | "strafe" | "turn">): boolean {
  return Math.abs(input.forward) > 0 || Math.abs(input.strafe) > 0 || Math.abs(input.turn) > 0;
}

export function hasTrackedMotion(input: LiteTrackedInput): boolean {
  return Math.abs(input.forward) > 0 || Math.abs(input.turn) > 0;
}

export function buildLiteMecanumTargetCommand(seq: number, input: ManualControlSnapshot["mecanum"], profile: LiteDriveProfile): PcCommand {
  return buildMecanumTargetCommand(seq, {
    forward: input.forward,
    strafe: input.strafe,
    turn: input.turn,
    speedLimitPercent: profile.speedLimitPercent,
    stopMode: profile.stopMode
  });
}

export function buildLiteMecanumStopCommand(seq: number, profile: LiteDriveProfile): PcCommand {
  return {
    type: "mecanum.stop",
    seq,
    stopMode: profile.stopMode
  };
}

export function buildLiteTrackedTargetCommands(seqStart: number, input: LiteTrackedInput, profile: LiteDriveProfile): PcCommand[] {
  const speeds = mixTrackedSpeeds(input, profile.speedLimitPercent);
  return [
    buildMotorTargetCommand(seqStart, {
      channel: profile.tracked.left,
      speedPercent: speeds.left,
      stopMode: profile.stopMode
    }),
    buildMotorTargetCommand(seqStart + 1, {
      channel: profile.tracked.right,
      speedPercent: speeds.right,
      stopMode: profile.stopMode
    })
  ];
}

export function buildLiteTrackedStopCommands(seqStart: number, profile: LiteDriveProfile): PcCommand[] {
  return [
    buildMotorStopCommand(seqStart, { channel: profile.tracked.left, stopMode: profile.stopMode }),
    buildMotorStopCommand(seqStart + 1, { channel: profile.tracked.right, stopMode: profile.stopMode })
  ];
}

export function buildLitePwmMotorConfigCommand(seq: number, motor: MotorProfile): PcCommand {
  if (!motor.pwmPin || !motor.in1Pin || !motor.in2Pin) {
    throw new RangeError(`PWM motor ${motor.channel} requires pwmPin, in1Pin and in2Pin`);
  }
  return buildMotorConfigCommand(seq, {
    channel: motor.channel,
    pwmPin: motor.pwmPin,
    in1Pin: motor.in1Pin,
    in2Pin: motor.in2Pin,
    enablePin: motor.enablePin,
    sensorPin: motor.sensorPin,
    encoderAPin: motor.encoderAPin,
    encoderBPin: motor.encoderBPin,
    driver: "tb6618",
    closedLoop: false
  });
}

export function buildLitePwmMotorSetCommand(seq: number, channel: string, speedPercent: number, stopMode: MotorStopMode): PcCommand {
  return buildMotorSetCommand(seq, {
    channel,
    closedLoop: false,
    speedPercent: roundSpeed(clamp(Number.isFinite(speedPercent) ? speedPercent : 0, -100, 100)),
    stopMode
  });
}

export function buildLitePwmMotorStopCommand(seq: number, channel: string, stopMode: MotorStopMode): PcCommand {
  return buildMotorStopCommand(seq, { channel, stopMode });
}

export function buildLitePwmMotorStopAllCommand(seq: number, stopMode: MotorStopMode): PcCommand {
  return buildMotorStopCommand(seq, { all: true, stopMode });
}

export function createCanJogAngles(servos: AsmgMdServoProfile[]): Record<string, number> {
  return Object.fromEntries(servos.map((servo) => [String(servo.id), servoLogicalCenter(servo)]));
}

export function buildLiteCanJogCommand(
  seq: number,
  currentAngles: Record<string, number>,
  group: LiteCanJogGroup,
  direction: Exclude<LiteCanJogDirection, 0>,
  profile: LiteCanJogProfile,
  servos: AsmgMdServoProfile[]
): { command: PcCommand; angles: Record<string, number> } {
  const ids = group === "front" ? profile.frontIds : profile.rearIds;
  const byId = new Map(servos.map((servo) => [servo.id, normalizeAsmgMdServoProfile(servo)]));
  const angles = { ...currentAngles };
  const members = ids.map((id) => {
    const servo = byId.get(id);
    if (!servo) {
      throw new RangeError(`CAN servo ID ${id} is not in the fixed profile`);
    }
    const currentAngle = clampCanLogicalAngle(servo, angles[String(id)] ?? servoLogicalCenter(servo));
    const requestedDelta = direction * profile.stepDeg;
    return { currentAngle, id, requestedDelta, servo };
  });
  const sharedStep = members.reduce((step, member) => {
    const remaining = member.requestedDelta > 0
      ? servoLogicalSpan(member.servo) - member.currentAngle
      : member.currentAngle;
    return Math.min(step, Math.max(0, remaining));
  }, profile.stepDeg);
  const targets = members.map((member) => {
    const delta = Math.sign(member.requestedDelta) * sharedStep;
    const nextAngle = clampCanLogicalAngle(member.servo, member.currentAngle + delta);
    angles[String(member.id)] = nextAngle;
    return {
      id: member.servo.id,
      position: asmgMdLogicalAngleToPositionRaw(member.servo, nextAngle)
    };
  });
  return {
    command: buildAsmgMdGroupMoveCommand(seq, targets, profile.speedRaw),
    angles
  };
}

export function canJogGroupLabel(group: LiteCanJogGroup, profile: LiteCanJogProfile): string {
  const ids = group === "front" ? profile.frontIds : profile.rearIds;
  return ids.map((id) => `ID${id}`).join(" / ");
}

function mixTrackedSpeeds(input: LiteTrackedInput, speedLimitPercent: number): { left: number; right: number } {
  const raw = {
    left: clampUnit(input.forward) + clampUnit(input.turn),
    right: clampUnit(input.forward) - clampUnit(input.turn)
  };
  const maxMagnitude = Math.max(1, Math.abs(raw.left), Math.abs(raw.right));
  return {
    left: roundSpeed((raw.left / maxMagnitude) * speedLimitPercent),
    right: roundSpeed((raw.right / maxMagnitude) * speedLimitPercent)
  };
}

function gamepadButtonPressed(gamepad: Gamepad, index: number): boolean {
  const button = gamepad.buttons[index];
  return Boolean(button?.pressed || (button?.value ?? 0) > 0.15);
}

function readDpad(gamepad: Gamepad): LiteDpadInput {
  const buttonDpad = {
    up: gamepadButtonPressed(gamepad, 12),
    down: gamepadButtonPressed(gamepad, 13),
    left: gamepadButtonPressed(gamepad, 14),
    right: gamepadButtonPressed(gamepad, 15)
  };
  const axisDpad = {
    up: gamepadAxisNegative(gamepad, 7),
    down: gamepadAxisPositive(gamepad, 7),
    left: gamepadAxisNegative(gamepad, 6),
    right: gamepadAxisPositive(gamepad, 6)
  };
  const hatDpad = readHatAxisDpad(gamepad.axes[9]);
  return {
    up: buttonDpad.up || axisDpad.up || hatDpad.up,
    down: buttonDpad.down || axisDpad.down || hatDpad.down,
    left: buttonDpad.left || axisDpad.left || hatDpad.left,
    right: buttonDpad.right || axisDpad.right || hatDpad.right
  };
}

function readGamepadAxis(gamepad: Gamepad, index: number, invert: boolean, deadzone: number): number {
  const raw = gamepad.axes[index] ?? 0;
  const value = invert ? -raw : raw;
  return Math.abs(value) <= Math.max(0, deadzone) ? 0 : roundUnit(value);
}

function gamepadAxisPressed(gamepad: Gamepad, index: number): boolean {
  return gamepadAxisPositive(gamepad, index);
}

function gamepadAxisPositive(gamepad: Gamepad, index: number): boolean {
  const value = gamepad.axes[index];
  return Number.isFinite(value) && value > 0.5;
}

function gamepadAxisNegative(gamepad: Gamepad, index: number): boolean {
  const value = gamepad.axes[index];
  return Number.isFinite(value) && value < -0.5;
}

function readHatAxisDpad(value: number | undefined): LiteDpadInput {
  if (!Number.isFinite(value) || Math.abs(value!) > 1.05 || Math.abs(value!) < 0.05) {
    return { up: false, down: false, left: false, right: false };
  }
  const slot = Math.round(((clamp(value!, -1, 1) + 1) / 2) * 7);
  switch (slot) {
    case 0:
      return { up: true, down: false, left: false, right: false };
    case 1:
      return { up: true, down: false, left: false, right: true };
    case 2:
      return { up: false, down: false, left: false, right: true };
    case 3:
      return { up: false, down: true, left: false, right: true };
    case 4:
      return { up: false, down: true, left: false, right: false };
    case 5:
      return { up: false, down: true, left: true, right: false };
    case 6:
      return { up: false, down: false, left: true, right: false };
    case 7:
      return { up: true, down: false, left: true, right: false };
    default:
      return { up: false, down: false, left: false, right: false };
  }
}

function buttonAxis(positive: boolean, negative: boolean): number {
  return (positive ? 1 : 0) - (negative ? 1 : 0);
}

function clampUnit(value: number): number {
  return Number.isFinite(value) ? clamp(value, -1, 1) : 0;
}

function clampCanLogicalAngle(servo: AsmgMdServoProfile, value: number): number {
  return clamp(Number.isFinite(value) ? value : servoLogicalCenter(servo), 0, servoLogicalSpan(servo));
}

function servoLogicalCenter(servo: AsmgMdServoProfile): number {
  return servoLogicalSpan(servo) / 2;
}

function roundUnit(value: number): number {
  const rounded = Math.round(clampUnit(value) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function roundSpeed(value: number): number {
  const rounded = Math.round(value);
  return Object.is(rounded, -0) ? 0 : rounded;
}
