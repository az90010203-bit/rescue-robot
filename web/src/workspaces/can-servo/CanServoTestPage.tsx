import { AlertTriangle, CircuitBoard, Gauge, RotateCw, Save, Send, Settings, ShieldCheck, Square, Usb } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import type { TFunction } from "i18next";
import type { AboardBridgeCommandResult } from "@adapters/pi/piAboardBridge";
import { clamp, servoLogicalSpan, type InboundMessage, type PcCommand } from "@adapters/hardware/protocol";
import {
  ASMG_MD_DEFAULT_BITRATE_KBPS,
  ASMG_MD_DEFAULT_SERVO_ID,
  ASMG_MD_HOST_EXTENDED_ID,
  ASMG_MD_POSITION_MAX,
  ASMG_MD_POSITION_MIN,
  ASMG_MD_SPEED_MAX,
  ASMG_MD_SPEED_MIN,
  asmgMdLogicalAngleToPositionRaw,
  type AsmgMdBaudKbps,
  type AsmgMdParsedFrame,
  asmgMdPositionRawToLogicalDegrees,
  asmgMdPositionRawToDegrees,
  buildAsmgMdCanConfigCommand,
  buildAsmgMdCanReadCommand,
  buildAsmgMdFactoryResetCommand,
  buildAsmgMdMoveCommand,
  buildAsmgMdReadCurrentCommand,
  buildAsmgMdReadIdCommand,
  buildAsmgMdReadPidCommand,
  buildAsmgMdReadPositionCommand,
  buildAsmgMdReadPositionCurrentCommand,
  buildAsmgMdSaveCenterCommand,
  buildAsmgMdSetBaudCommand,
  buildAsmgMdSetCurrentCommand,
  buildAsmgMdSetIdCommand,
  buildAsmgMdSetPidCommand,
  normalizeAsmgMdServoProfile,
  parseAsmgMdCanFrame
} from "@adapters/hardware/asmgMdCanServo";
import { Metric, PanelTitle, type Tone } from "@shared/ui/AppChrome";
import {
  CAN_SERVO_LIVE_FEEDBACK_MAX_AGE_MS,
  CAN_SERVO_STALL_CHECK_INTERVAL_MS,
  CAN_SERVO_STALL_CURRENT_RAW,
  assessCanServoLiveStop,
  buildCanServoLivePrimeCommands,
  findLatestCanServoPositionCurrentFeedback,
  isCanServoLiveFeedbackFresh,
  normalizeCanServoStallCurrentThreshold,
  type CanServoLiveFeedback,
  type CanServoLiveStopReason,
  type CanServoLiveTarget
} from "./canServoLiveSafety";

export interface CanServoConfigPatch {
  bitrateKbps?: AsmgMdBaudKbps;
  servoId?: number;
  minDeg?: number;
  maxDeg?: number;
  direction?: 1 | -1;
}

interface CanServoTestPageProps {
  aBoardBridge: PiAboardBridgeControls;
  host: string;
  initialBitrateKbps?: AsmgMdBaudKbps;
  initialDirection?: 1 | -1;
  initialMaxDeg?: number;
  initialMinDeg?: number;
  initialTargetId?: number;
  nextCommandSeq: () => number;
  onServoConfigChange?: (patch: CanServoConfigPatch) => void | Promise<void>;
  sendAboardBridgeCanServoCommand: (command: PcCommand, options?: { log?: boolean }) => Promise<AboardBridgeCommandResult | null>;
  t: TFunction;
}

export interface PiAboardBridgeControls {
  busy: boolean;
  connected: boolean;
  detail: string;
  error: string | null;
  label: string;
  tone: Tone;
  check: () => Promise<unknown>;
  disconnect: () => void;
  start: () => Promise<unknown>;
}

type CanFrameMessage = Extract<InboundMessage, { type: "can.frame" }> | Extract<InboundMessage, { type: "can_servo.feedback" }>;
type CanFeedbackMessage = Extract<InboundMessage, { type: "can.feedback" }> | Extract<InboundMessage, { type: "can_servo.feedback" }>;
type LiveDragStatus = "off" | "priming" | "ready" | "configuring" | "sending" | "stalled" | "error";

interface CanServoExchange {
  label: string;
  ok: boolean;
  atMs: number;
  commands: PcCommand[];
  messages: InboundMessage[];
  frames: CanFrameMessage[];
  feedback: CanFeedbackMessage[];
  parsed: AsmgMdParsedFrame[];
}

const baudOptions: AsmgMdBaudKbps[] = [250, 500, 1000];
const LIVE_DRAG_INTERVAL_MS = 120;
const ANGLE_POLL_INTERVAL_MS = 300;
const ASMG_MD_DEG_MIN = 0;
const ASMG_MD_DEG_MAX = 360;
const SPEED_PERCENT_MIN = 0;
const SPEED_PERCENT_MAX = 100;
const CENTER_PERCENT_MIN = 0;
const CENTER_PERCENT_MAX = 100;

export function CanServoTestPage({
  aBoardBridge,
  host,
  initialBitrateKbps,
  initialDirection,
  initialMaxDeg,
  initialMinDeg,
  initialTargetId,
  nextCommandSeq,
  onServoConfigChange,
  sendAboardBridgeCanServoCommand,
  t
}: CanServoTestPageProps) {
  const [targetId, setTargetId] = useState(String(initialTargetId ?? ASMG_MD_DEFAULT_SERVO_ID));
  const [bitrateKbps, setBitrateKbps] = useState<AsmgMdBaudKbps>(initialBitrateKbps ?? ASMG_MD_DEFAULT_BITRATE_KBPS);
  const [minDeg, setMinDeg] = useState(String(initialMinDeg ?? ASMG_MD_DEG_MIN));
  const [maxDeg, setMaxDeg] = useState(String(initialMaxDeg ?? ASMG_MD_DEG_MAX));
  const [direction, setDirection] = useState<1 | -1>(initialDirection === -1 ? -1 : 1);
  const [autoConfigure, setAutoConfigure] = useState(true);
  const [positionDeg, setPositionDeg] = useState("360");
  const [speedPercent, setSpeedPercent] = useState("100");
  const [currentRaw, setCurrentRaw] = useState("50");
  const [pidP, setPidP] = useState("16");
  const [pidI, setPidI] = useState("0");
  const [pidD, setPidD] = useState("0");
  const [centerPercent, setCenterPercent] = useState("100");
  const [newId, setNewId] = useState(String(initialTargetId ?? ASMG_MD_DEFAULT_SERVO_ID));
  const [newBaudKbps, setNewBaudKbps] = useState<AsmgMdBaudKbps>(initialBitrateKbps ?? ASMG_MD_DEFAULT_BITRATE_KBPS);
  const [singleServoConfirmed, setSingleServoConfirmed] = useState(false);
  const [dangerConfirm, setDangerConfirm] = useState("");
  const [liveDragEnabled, setLiveDragEnabled] = useState(false);
  const [stallProtectionEnabled, setStallProtectionEnabled] = useState(true);
  const [stallCurrentThreshold, setStallCurrentThreshold] = useState(String(CAN_SERVO_STALL_CURRENT_RAW));
  const [autoReadAngle, setAutoReadAngle] = useState(true);
  const [liveDragStatus, setLiveDragStatus] = useState<LiveDragStatus>("off");
  const [lastLiveFeedback, setLastLiveFeedback] = useState<CanServoLiveFeedback | null>(null);
  const [busyLabel, setBusyLabel] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [lastExchange, setLastExchange] = useState<CanServoExchange | null>(null);
  const liveDragEnabledRef = useRef(false);
  const liveDragStatusRef = useRef<LiveDragStatus>("off");
  const liveMoveInFlightRef = useRef(false);
  const liveFeedbackReadInFlightRef = useRef(false);
  const liveSafetyStopInFlightRef = useRef(false);
  const liveMoveTimerRef = useRef<number | null>(null);
  const angleReadInFlightRef = useRef(false);
  const pendingLivePositionRef = useRef<number | null>(null);
  const lastLiveFeedbackRef = useRef<CanServoLiveFeedback | null>(null);
  const liveTargetRef = useRef<CanServoLiveTarget | null>(null);
  const liveFeedbackLossCountRef = useRef(0);
  const liveMoveStateRef = useRef({
    bitrateKbps,
    connected: aBoardBridge.connected,
    direction,
    maxDeg,
    minDeg,
    stallCurrentThreshold,
    stallProtectionEnabled,
    speedPercent,
    targetId,
    targetIdIsValid: true
  });
  const runtimeRef = useRef({ nextCommandSeq, sendAboardBridgeCanServoCommand, t });

  const parsedTargetId = parseDecimal(targetId);
  const targetIdIsValid = Number.isInteger(parsedTargetId) && parsedTargetId >= 0 && parsedTargetId <= 253;
  const canServoProfile = normalizeAsmgMdServoProfile({
    id: targetIdIsValid ? parsedTargetId : ASMG_MD_DEFAULT_SERVO_ID,
    name: `ID ${targetIdIsValid ? parsedTargetId : ASMG_MD_DEFAULT_SERVO_ID}`,
    minDeg: parseDecimalForSlider(minDeg, ASMG_MD_DEG_MIN, ASMG_MD_DEG_MAX),
    maxDeg: parseDecimalForSlider(maxDeg, ASMG_MD_DEG_MIN, ASMG_MD_DEG_MAX),
    direction,
    bitrateKbps
  });
  const positionLogicalMax = servoLogicalSpan(canServoProfile);
  const dangerousReady = targetIdIsValid && singleServoConfirmed && dangerConfirm.trim() === String(parsedTargetId);
  const commandDisabled = Boolean(busyLabel) || !aBoardBridge.connected;
  const latestFrame = lastExchange?.frames[lastExchange.frames.length - 1];
  const latestParsed = lastExchange?.parsed[lastExchange.parsed.length - 1];
  const positionSliderValue = parseDecimalForSlider(positionDeg, 0, positionLogicalMax);
  const positionSliderLabel = formatDegrees(positionSliderValue);
  const speedSliderValue = parseDecimalForSlider(speedPercent, SPEED_PERCENT_MIN, SPEED_PERCENT_MAX);
  const speedSliderLabel = formatPercent(speedSliderValue);
  const stallCurrentThresholdValue = normalizeCanServoStallCurrentThreshold(parseDecimal(stallCurrentThreshold));
  const liveDragStatusLabel = t(`canServo.live.${liveDragStatus}`);
  const latestAngleLabel = formatParsedAngle(latestParsed);
  const liveFeedbackPositionLabel = lastLiveFeedback ? formatPositionValue(lastLiveFeedback.position) : "--";
  const liveFeedbackCurrentLabel = lastLiveFeedback ? formatRawNumber(lastLiveFeedback.current ?? undefined) : "--";
  const liveFeedbackAgeLabel = lastLiveFeedback ? `${Math.max(0, Math.round(Date.now() - lastLiveFeedback.atMs))} ms` : "--";
  const lastPosition = useMemo(() => {
    if (!lastExchange) {
      return null;
    }
    for (let index = lastExchange.parsed.length - 1; index >= 0; index -= 1) {
      const parsed = lastExchange.parsed[index];
      if (typeof parsed.currentPosition === "number") {
        return parsed.currentPosition;
      }
      if (typeof parsed.position === "number") {
        return parsed.position;
      }
    }
    return null;
  }, [lastExchange]);

  useEffect(() => {
    liveDragEnabledRef.current = liveDragEnabled;
  }, [liveDragEnabled]);

  useEffect(() => {
    liveDragStatusRef.current = liveDragStatus;
  }, [liveDragStatus]);

  useEffect(() => {
    runtimeRef.current = { nextCommandSeq, sendAboardBridgeCanServoCommand, t };
  }, [nextCommandSeq, sendAboardBridgeCanServoCommand, t]);

  useEffect(() => {
    const nextId = String(initialTargetId ?? ASMG_MD_DEFAULT_SERVO_ID);
    setTargetId(nextId);
    setNewId(nextId);
  }, [initialTargetId]);

  useEffect(() => {
    const nextBitrate = initialBitrateKbps ?? ASMG_MD_DEFAULT_BITRATE_KBPS;
    setBitrateKbps(nextBitrate);
    setNewBaudKbps(nextBitrate);
  }, [initialBitrateKbps]);

  useEffect(() => {
    setMinDeg(String(initialMinDeg ?? ASMG_MD_DEG_MIN));
  }, [initialMinDeg]);

  useEffect(() => {
    setMaxDeg(String(initialMaxDeg ?? ASMG_MD_DEG_MAX));
  }, [initialMaxDeg]);

  useEffect(() => {
    setDirection(initialDirection === -1 ? -1 : 1);
  }, [initialDirection]);

  useEffect(() => {
    setPositionDeg((current) => formatNumber(parseDecimalForSlider(current, 0, positionLogicalMax)));
  }, [positionLogicalMax]);

  useEffect(() => {
    liveMoveStateRef.current = {
      bitrateKbps,
      connected: aBoardBridge.connected,
      direction,
      maxDeg,
      minDeg,
      stallCurrentThreshold,
      stallProtectionEnabled,
      speedPercent,
      targetId,
      targetIdIsValid
    };
  }, [aBoardBridge.connected, bitrateKbps, direction, maxDeg, minDeg, speedPercent, stallCurrentThreshold, stallProtectionEnabled, targetId, targetIdIsValid]);

  useEffect(() => {
    if (liveDragEnabled && (!aBoardBridge.connected || !targetIdIsValid)) {
      stopLiveDrag();
    }
  }, [aBoardBridge.connected, liveDragEnabled, targetIdIsValid]);

  useEffect(() => {
    return () => {
      if (liveMoveTimerRef.current !== null) {
        window.clearTimeout(liveMoveTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!autoReadAngle || !aBoardBridge.connected || !targetIdIsValid) {
      angleReadInFlightRef.current = false;
      return;
    }
    let cancelled = false;
    async function pollAngle() {
      if (cancelled || angleReadInFlightRef.current || liveMoveInFlightRef.current || pendingLivePositionRef.current !== null) {
        return;
      }
      angleReadInFlightRef.current = true;
      try {
        const id = parseDecimal(liveMoveStateRef.current.targetId);
        const command = buildAsmgMdReadPositionCurrentCommand(runtimeRef.current.nextCommandSeq(), id);
        const result = await runtimeRef.current.sendAboardBridgeCanServoCommand(command, { log: false });
        if (cancelled || !result) {
          return;
        }
        updateExchangeFromMessages(runtimeRef.current.t("fields.asmgAngleLive"), [command], result.ok, result.messages);
      } catch (error) {
        if (!cancelled) {
          setLocalError(error instanceof Error && error.message ? error.message : runtimeRef.current.t("canServo.errors.commandFailed"));
        }
      } finally {
        angleReadInFlightRef.current = false;
      }
    }
    void pollAngle();
    const timer = window.setInterval(() => {
      void pollAngle();
    }, ANGLE_POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [aBoardBridge.connected, autoReadAngle, targetIdIsValid]);

  useEffect(() => {
    if (!liveDragEnabled || !stallProtectionEnabled || !aBoardBridge.connected || !targetIdIsValid) {
      liveFeedbackReadInFlightRef.current = false;
      return;
    }
    const timer = window.setInterval(() => {
      void pollLiveSafetyFeedback();
    }, CAN_SERVO_STALL_CHECK_INTERVAL_MS);
    return () => {
      window.clearInterval(timer);
    };
  }, [aBoardBridge.connected, liveDragEnabled, stallProtectionEnabled, targetIdIsValid]);

  async function runExchange(label: string, commandFactory: () => PcCommand, options: { configureFirst?: boolean; dangerous?: boolean } = {}): Promise<boolean> {
    if (options.dangerous && !dangerousReady) {
      setLocalError(t("canServo.errors.dangerConfirm"));
      return false;
    }
    setBusyLabel(label);
    setLocalError(null);
    const commands: PcCommand[] = [];
    const messages: InboundMessage[] = [];
    let ok = true;
    try {
      const commandFactories = options.configureFirst ? [() => buildAsmgMdCanConfigCommand(nextCommandSeq(), bitrateKbps), commandFactory] : [commandFactory];
      for (const factory of commandFactories) {
        const command = factory();
        commands.push(command);
        const result = await sendAboardBridgeCanServoCommand(command);
        if (!result) {
          ok = false;
          break;
        }
        messages.push(...result.messages);
        if (!result.ok || result.messages.some((message) => message.type === "error")) {
          ok = false;
        }
      }
      const frames = messages.filter(isCanServoFrameMessage);
      const feedback = messages.filter(isCanServoFeedbackMessage);
      const parsed = frames.map(parseAsmgMdCanFrame).filter((frame): frame is AsmgMdParsedFrame => frame !== null);
      setLastExchange({ label, ok, atMs: Date.now(), commands, messages, frames, feedback, parsed });
      const errorMessage = messages.find((message): message is Extract<InboundMessage, { type: "error" }> => message.type === "error")?.message;
      if (errorMessage) {
        setLocalError(errorMessage);
      } else if (!ok) {
        setLocalError(t("canServo.errors.commandFailed"));
      }
      return ok;
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : t("canServo.errors.commandFailed");
      setLocalError(message);
      setLastExchange((current) => current ?? null);
      return false;
    } finally {
      setBusyLabel(null);
    }
  }

  async function runSetIdExchange() {
    const nextId = readNewId();
    const ok = await runExchange(t("actions.asmgSetId"), () => buildAsmgMdSetIdCommand(nextCommandSeq(), nextId), { configureFirst: autoConfigure, dangerous: true });
    if (!ok) {
      return;
    }
    setTargetId(String(nextId));
    setDangerConfirm("");
    await onServoConfigChange?.({ servoId: nextId });
  }

  async function runSetBaudExchange() {
    const ok = await runExchange(t("actions.asmgSetBaud"), () => buildAsmgMdSetBaudCommand(nextCommandSeq(), { id: readTargetId(), baudKbps: newBaudKbps }), { configureFirst: autoConfigure, dangerous: true });
    if (!ok) {
      return;
    }
    setBitrateKbps(newBaudKbps);
    await onServoConfigChange?.({ bitrateKbps: newBaudKbps });
  }

  async function saveLogicalAngleConfig() {
    setBusyLabel(t("architecture.actions.saveLimits"));
    setLocalError(null);
    try {
      const nextMinDeg = readDecimalRange(minDeg, ASMG_MD_DEG_MIN, ASMG_MD_DEG_MAX, t("fields.minAngle"));
      const nextMaxDeg = readDecimalRange(maxDeg, ASMG_MD_DEG_MIN, ASMG_MD_DEG_MAX, t("fields.maxAngle"));
      if (nextMinDeg >= nextMaxDeg) {
        setLocalError("Min angle must be smaller than max angle.");
        return;
      }
      await onServoConfigChange?.({
        minDeg: nextMinDeg,
        maxDeg: nextMaxDeg,
        direction
      });
      setMinDeg(String(nextMinDeg));
      setMaxDeg(String(nextMaxDeg));
    } catch (error) {
      setLocalError(error instanceof Error && error.message ? error.message : t("canServo.errors.commandFailed"));
    } finally {
      setBusyLabel(null);
    }
  }

  function readTargetId() {
    const id = parseDecimal(targetId);
    if (!Number.isInteger(id) || id < 0 || id > 253) {
      throw new RangeError(t("canServo.errors.servoId"));
    }
    return id;
  }

  function readNewId() {
    const id = parseDecimal(newId);
    if (!Number.isInteger(id) || id < 0 || id > 253) {
      throw new RangeError(t("canServo.errors.newId"));
    }
    return id;
  }

  function updateExchangeFromMessages(label: string, commands: PcCommand[], ok: boolean, messages: InboundMessage[]) {
    const frames = messages.filter(isCanServoFrameMessage);
    const feedback = messages.filter(isCanServoFeedbackMessage);
    const parsed = frames.map(parseAsmgMdCanFrame).filter((frame): frame is AsmgMdParsedFrame => frame !== null);
    const atMs = Date.now();
    setLastExchange({ label, ok, atMs, commands, messages, frames, feedback, parsed });
    const id = parseDecimal(liveMoveStateRef.current.targetId);
    if (Number.isInteger(id)) {
      const liveFeedback = findLatestCanServoPositionCurrentFeedback(parsed, id, atMs);
      if (liveFeedback) {
        syncLiveFeedback(liveFeedback);
      }
    }
  }

  function setLiveStatus(status: LiveDragStatus) {
    liveDragStatusRef.current = status;
    setLiveDragStatus(status);
  }

  function syncLiveFeedback(feedback: CanServoLiveFeedback) {
    lastLiveFeedbackRef.current = feedback;
    setLastLiveFeedback(feedback);
  }

  function failLiveDrag(message: string) {
    setLiveDragEnabled(false);
    liveDragEnabledRef.current = false;
    pendingLivePositionRef.current = null;
    liveTargetRef.current = null;
    liveFeedbackLossCountRef.current = 0;
    if (liveMoveTimerRef.current !== null) {
      window.clearTimeout(liveMoveTimerRef.current);
      liveMoveTimerRef.current = null;
    }
    setLiveStatus("error");
    setLocalError(message);
  }

  async function pollLiveSafetyFeedback() {
    if (
      !liveDragEnabledRef.current ||
      !liveMoveStateRef.current.connected ||
      !liveMoveStateRef.current.targetIdIsValid ||
      liveFeedbackReadInFlightRef.current ||
      liveSafetyStopInFlightRef.current ||
      liveTargetRef.current === null
    ) {
      return;
    }
    const state = liveMoveStateRef.current;
    const id = parseDecimal(state.targetId);
    if (!Number.isInteger(id)) {
      return;
    }
    liveFeedbackReadInFlightRef.current = true;
    const command = buildAsmgMdReadPositionCurrentCommand(nextCommandSeq(), id);
    try {
      const result = await sendAboardBridgeCanServoCommand(command, { log: false });
      const messages = result?.messages ?? [];
      const ok = Boolean(result?.ok) && !messages.some((message) => message.type === "error");
      updateExchangeFromMessages(t("fields.asmgLiveFeedback"), [command], ok, messages);
      const frames = messages.filter(isCanServoFrameMessage);
      const parsed = frames.map(parseAsmgMdCanFrame).filter((frame): frame is AsmgMdParsedFrame => frame !== null);
      const feedback = ok ? findLatestCanServoPositionCurrentFeedback(parsed, id, Date.now()) : null;
      if (!feedback) {
        liveFeedbackLossCountRef.current += 1;
        await stopIfLiveProtectionTriggered(null);
        return;
      }
      syncLiveFeedback(feedback);
      liveFeedbackLossCountRef.current = 0;
      await stopIfLiveProtectionTriggered(feedback);
    } catch {
      liveFeedbackLossCountRef.current += 1;
      await stopIfLiveProtectionTriggered(null);
    } finally {
      liveFeedbackReadInFlightRef.current = false;
    }
  }

  async function stopIfLiveProtectionTriggered(feedback: CanServoLiveFeedback | null) {
    const state = liveMoveStateRef.current;
    const assessment = assessCanServoLiveStop({
      protectionEnabled: state.stallProtectionEnabled,
      target: liveTargetRef.current,
      latestFeedback: feedback,
      lostFeedbackCount: liveFeedbackLossCountRef.current,
      nowMs: Date.now(),
      currentThreshold: normalizeCanServoStallCurrentThreshold(parseDecimal(state.stallCurrentThreshold))
    });
    if (!assessment.shouldStop || assessment.reason === "none") {
      return;
    }
    await stopLiveForSafety(assessment.reason);
  }

  async function stopLiveForSafety(reason: Exclude<CanServoLiveStopReason, "none">) {
    if (liveSafetyStopInFlightRef.current) {
      return;
    }
    liveSafetyStopInFlightRef.current = true;
    const feedback = lastLiveFeedbackRef.current;
    pendingLivePositionRef.current = null;
    liveTargetRef.current = null;
    liveFeedbackLossCountRef.current = 0;
    if (liveMoveTimerRef.current !== null) {
      window.clearTimeout(liveMoveTimerRef.current);
      liveMoveTimerRef.current = null;
    }
    setLiveDragEnabled(false);
    liveDragEnabledRef.current = false;
    setLiveStatus("stalled");
    setLocalError(reason === "feedback-lost" ? t("canServo.errors.liveFeedbackLost") : t("canServo.errors.liveStalled"));
    try {
      if (feedback) {
        const command = buildAsmgMdMoveCommand(nextCommandSeq(), { id: feedback.servoId, position: feedback.position, speed: 0 });
        const result = await sendAboardBridgeCanServoCommand(command, { log: false });
        updateExchangeFromMessages(t("actions.asmgHoldPosition"), [command], Boolean(result?.ok), result?.messages ?? []);
      }
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : t("canServo.errors.commandFailed");
      setLocalError(message);
    } finally {
      liveSafetyStopInFlightRef.current = false;
    }
  }

  async function updateLiveDragEnabled(checked: boolean) {
    if (!checked) {
      stopLiveDrag();
      return;
    }
    if (!aBoardBridge.connected || !targetIdIsValid) {
      setLocalError(t("canServo.errors.liveUnavailable"));
      setLiveDragStatus("error");
      return;
    }
    const id = readTargetId();
    setLiveDragEnabled(true);
    liveDragEnabledRef.current = true;
    liveFeedbackLossCountRef.current = 0;
    liveTargetRef.current = null;
    pendingLivePositionRef.current = null;
    setLiveStatus(autoConfigure ? "configuring" : "priming");
    setLocalError(null);
    liveMoveInFlightRef.current = true;
    const commands = buildCanServoLivePrimeCommands(nextCommandSeq, { autoConfigure, bitrateKbps, servoId: id });
    const messages: InboundMessage[] = [];
    let ok = true;
    try {
      for (const command of commands) {
        if (!liveDragEnabledRef.current) {
          return;
        }
        if (command.type === "can_servo.read") {
          setLiveStatus("priming");
        }
        const result = await sendAboardBridgeCanServoCommand(command, { log: false });
        if (!result) {
          ok = false;
          break;
        }
        messages.push(...result.messages);
        if (!result.ok || result.messages.some((message) => message.type === "error")) {
          ok = false;
        }
      }
      const atMs = Date.now();
      const frames = messages.filter(isCanServoFrameMessage);
      const feedback = messages.filter(isCanServoFeedbackMessage);
      const parsed = frames.map(parseAsmgMdCanFrame).filter((frame): frame is AsmgMdParsedFrame => frame !== null);
      setLastExchange({ label: t("fields.asmgLivePrime"), ok, atMs, commands, messages, frames, feedback, parsed });
      const liveFeedback = findLatestCanServoPositionCurrentFeedback(parsed, id, atMs);
      if (!ok || !liveFeedback) {
        failLiveDrag(t("canServo.errors.livePrimeFailed"));
        return;
      }
      syncLiveFeedback(liveFeedback);
      setPositionDeg(formatNumber(asmgMdPositionRawToLogicalDegrees(canServoProfile, liveFeedback.position)));
      setLiveStatus("ready");
      if (pendingLivePositionRef.current !== null) {
        scheduleLiveDragFlush();
      }
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : t("canServo.errors.livePrimeFailed");
      failLiveDrag(message);
    } finally {
      liveMoveInFlightRef.current = false;
    }
  }

  function stopLiveDrag() {
    setLiveDragEnabled(false);
    liveDragEnabledRef.current = false;
    pendingLivePositionRef.current = null;
    liveTargetRef.current = null;
    liveFeedbackLossCountRef.current = 0;
    if (liveMoveTimerRef.current !== null) {
      window.clearTimeout(liveMoveTimerRef.current);
      liveMoveTimerRef.current = null;
    }
    setLiveStatus("off");
    setLocalError(null);
  }

  function updatePositionFromSlider(value: number) {
    setPositionDeg(formatNumber(value));
    if (liveDragEnabledRef.current) {
      pendingLivePositionRef.current = asmgMdLogicalAngleToPositionRaw(canServoProfile, value);
      if (liveDragStatusRef.current === "ready") {
        scheduleLiveDragFlush();
      }
    }
  }

  function updateSpeedFromSlider(value: number) {
    setSpeedPercent(formatNumber(value));
  }

  function scheduleLiveDragFlush() {
    if (liveMoveTimerRef.current !== null) {
      return;
    }
    liveMoveTimerRef.current = window.setTimeout(() => {
      liveMoveTimerRef.current = null;
      void flushLiveDragMove();
    }, LIVE_DRAG_INTERVAL_MS);
  }

  async function flushLiveDragMove() {
    if (!liveDragEnabledRef.current) {
      return;
    }
    if (liveMoveInFlightRef.current) {
      scheduleLiveDragFlush();
      return;
    }
    if (liveDragStatusRef.current !== "ready") {
      pendingLivePositionRef.current = null;
      return;
    }
    const position = pendingLivePositionRef.current;
    pendingLivePositionRef.current = null;
    if (position === null) {
      return;
    }
    const state = liveMoveStateRef.current;
    if (!state.connected || !state.targetIdIsValid) {
      setLiveStatus("error");
      setLocalError(t("canServo.errors.liveUnavailable"));
      return;
    }
    const id = parseDecimal(state.targetId);
    if (!Number.isInteger(id)) {
      failLiveDrag(t("canServo.errors.liveUnavailable"));
      return;
    }
    const nowMs = Date.now();
    const baseline = lastLiveFeedbackRef.current;
    if (!baseline || baseline.servoId !== id || !isCanServoLiveFeedbackFresh(baseline, nowMs, CAN_SERVO_LIVE_FEEDBACK_MAX_AGE_MS)) {
      failLiveDrag(t("canServo.errors.liveFeedbackStale"));
      return;
    }
    liveMoveInFlightRef.current = true;
    setLiveStatus("sending");
    setLocalError(null);
    try {
      const speed = speedPercentToRaw(readDecimalRange(state.speedPercent, SPEED_PERCENT_MIN, SPEED_PERCENT_MAX, t("fields.asmgSpeed")));
      const command = buildAsmgMdMoveCommand(nextCommandSeq(), { id, position, speed });
      const result = await sendAboardBridgeCanServoCommand(command, { log: false });
      const messages = result?.messages ?? [];
      const frames = messages.filter(isCanServoFrameMessage);
      const feedback = messages.filter(isCanServoFeedbackMessage);
      const parsed = frames.map(parseAsmgMdCanFrame).filter((frame): frame is AsmgMdParsedFrame => frame !== null);
      const ok = Boolean(result?.ok) && !messages.some((message) => message.type === "error");
      setLastExchange({ label: t("fields.asmgLiveDrag"), ok, atMs: Date.now(), commands: [command], messages, frames, feedback, parsed });
      const commandError = messages.find((message): message is Extract<InboundMessage, { type: "error" }> => message.type === "error");
      if (commandError) {
        setLocalError(commandError.message);
      }
      if (ok && baseline) {
        liveTargetRef.current = {
          targetPosition: position,
          commandAtMs: Date.now(),
          baselinePosition: baseline.position
        };
        liveFeedbackLossCountRef.current = 0;
      }
      setLiveStatus(ok ? "ready" : "error");
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : t("canServo.errors.commandFailed");
      setLocalError(message);
      setLiveStatus("error");
    } finally {
      liveMoveInFlightRef.current = false;
      if (liveDragEnabledRef.current && pendingLivePositionRef.current !== null) {
        scheduleLiveDragFlush();
      }
    }
  }

  const canHoldPosition = lastPosition !== null && targetIdIsValid && !commandDisabled;
  const lastCommandHex = lastExchange?.commands.map(formatPcCommand).join(" | ") ?? "--";
  const lastRawFrame = latestFrame ? formatCanServoFrame(latestFrame) : "--";
  const lastParsedLabel = latestParsed ? describeParsedFrame(latestParsed, t) : "--";
  const lastUpdateLabel = lastExchange ? new Date(lastExchange.atMs).toLocaleTimeString() : "--";
  const frameCount = lastExchange ? `${lastExchange.frames.length} / ${lastExchange.messages.length}` : "--";
  const feedbackLabel = lastExchange?.feedback.length ? JSON.stringify(lastExchange.feedback[lastExchange.feedback.length - 1]) : "--";

  return (
    <section className="panel can-servo-panel" aria-labelledby="can-servo-title">
      <PanelTitle
        icon={<CircuitBoard size={18} />}
        id="can-servo-title"
        meta={`${host || "rescue-pi.local"} / CAN1 / ${bitrateKbps} kbit/s`}
        title={t("panels.canServo")}
      />

      <div className="can-servo-grid">
        <div className="can-servo-stack">
          <div className="can-servo-section">
            <div className="port-config-title">
              <Usb size={17} />
              <span>{t("canServo.bridge")}</span>
            </div>
            <div className="preview-grid can-servo-status-grid">
              <Metric label={t("metrics.aBoardBridge")} value={aBoardBridge.label} tone={aBoardBridge.tone} />
              <Metric className="frame-preview" code label={t("metrics.aBoardBridgeDetail")} value={aBoardBridge.detail || "--"} />
              <Metric code label={t("metrics.canHostId")} value={formatCanId(ASMG_MD_HOST_EXTENDED_ID)} />
              <Metric label={t("metrics.canBitrate")} value={`${bitrateKbps} kbit/s`} />
            </div>
            <div className="action-grid port-config-actions">
              <button className="icon-button" disabled={aBoardBridge.busy || Boolean(busyLabel)} onClick={() => void aBoardBridge.check()} type="button">
                <RotateCw size={18} />
                <span>{t("actions.checkAboardBridge")}</span>
              </button>
              <button className="icon-button primary" disabled={aBoardBridge.busy || Boolean(busyLabel)} onClick={() => void aBoardBridge.start()} type="button">
                <Settings size={18} />
                <span>{t("actions.startAboardBridge")}</span>
              </button>
              <button className="icon-button" disabled={!aBoardBridge.connected || Boolean(busyLabel)} onClick={aBoardBridge.disconnect} type="button">
                <Square size={18} />
                <span>{t("actions.disconnectAboardBridge")}</span>
              </button>
            </div>
            {aBoardBridge.error && <p className="form-error">{aBoardBridge.error}</p>}
          </div>

          <div className="can-servo-section">
            <div className="port-config-title">
              <Gauge size={17} />
              <span>{t("canServo.motion")}</span>
            </div>
            <div className="can-servo-form-grid">
              <label>
                <span>{t("fields.canServoId")}</span>
                <input value={targetId} onChange={(event) => setTargetId(event.target.value)} inputMode="numeric" />
              </label>
              <label>
                <span>{t("fields.canBitrate")}</span>
                <select value={bitrateKbps} onChange={(event) => setBitrateKbps(Number(event.target.value) as AsmgMdBaudKbps)}>
                  {baudOptions.map((option) => (
                    <option key={option} value={option}>
                      {option} kbit/s
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span>{t("fields.minAngle")}</span>
                <input value={minDeg} onChange={(event) => setMinDeg(event.target.value)} inputMode="decimal" />
              </label>
              <label>
                <span>{t("fields.maxAngle")}</span>
                <input value={maxDeg} onChange={(event) => setMaxDeg(event.target.value)} inputMode="decimal" />
              </label>
              <label>
                <span>{t("fields.reverseRotation")}</span>
                <select value={direction} onChange={(event) => setDirection(Number(event.target.value) === -1 ? -1 : 1)}>
                  <option value={1}>Normal</option>
                  <option value={-1}>Reverse</option>
                </select>
              </label>
              <label>
                <span>{t("fields.asmgPosition")}</span>
                <input value={positionDeg} onChange={(event) => setPositionDeg(event.target.value)} inputMode="decimal" />
              </label>
              <label>
                <span>{t("fields.asmgSpeed")}</span>
                <input value={speedPercent} onChange={(event) => setSpeedPercent(event.target.value)} inputMode="decimal" />
              </label>
              <label className="can-servo-checkbox">
                <input type="checkbox" checked={autoConfigure} onChange={(event) => setAutoConfigure(event.target.checked)} />
                <span>{t("fields.canAutoConfigure")}</span>
              </label>
              <label className="can-servo-checkbox">
                <input
                  type="checkbox"
                  checked={liveDragEnabled}
                  disabled={!aBoardBridge.connected || !targetIdIsValid || liveDragStatus === "configuring" || liveDragStatus === "priming" || liveDragStatus === "sending"}
                  onChange={(event) => void updateLiveDragEnabled(event.target.checked)}
                />
                <span>{t("fields.asmgLiveDrag")}</span>
              </label>
              <label className="can-servo-checkbox">
                <input
                  type="checkbox"
                  checked={autoReadAngle}
                  disabled={!aBoardBridge.connected || !targetIdIsValid}
                  onChange={(event) => setAutoReadAngle(event.target.checked)}
                />
                <span>{t("fields.asmgAngleLive")}</span>
              </label>
              <label className="can-servo-checkbox">
                <input type="checkbox" checked={stallProtectionEnabled} onChange={(event) => setStallProtectionEnabled(event.target.checked)} />
                <span>{t("fields.asmgStallProtection")}</span>
              </label>
              <label>
                <span>{t("fields.asmgStallCurrent")}</span>
                <input
                  value={stallCurrentThreshold}
                  onChange={(event) => setStallCurrentThreshold(event.target.value)}
                  onBlur={() => setStallCurrentThreshold(String(stallCurrentThresholdValue))}
                  inputMode="numeric"
                />
              </label>
            </div>
            <div className="can-servo-slider-card">
              <div className="can-servo-slider-head">
                <span>{t("fields.asmgPositionSlider")}</span>
                <code>{positionSliderLabel}</code>
                <small className={`can-servo-live-status ${liveDragStatus}`}>{liveDragStatusLabel}</small>
              </div>
              <input
                aria-label={t("fields.asmgPositionSlider")}
                max={positionLogicalMax}
                min={0}
                onChange={(event) => updatePositionFromSlider(Number(event.target.value))}
                step={0.1}
                type="range"
                value={positionSliderValue}
              />
              <div className="can-servo-slider-scale">
                <span>{formatDegrees(0)}</span>
                <span>{formatDegrees(positionLogicalMax)}</span>
              </div>
              <div className="can-servo-live-feedback">
                <span><strong>{t("fields.asmgLivePosition")}</strong><code>{liveFeedbackPositionLabel}</code></span>
                <span><strong>{t("fields.asmgLiveCurrent")}</strong><code>{liveFeedbackCurrentLabel}</code></span>
                <span><strong>{t("fields.asmgLiveFeedbackAge")}</strong><code>{liveFeedbackAgeLabel}</code></span>
              </div>
            </div>
            <div className="can-servo-slider-card">
              <div className="can-servo-slider-head">
                <span>{t("fields.asmgSpeedSlider")}</span>
                <code>{speedSliderLabel}</code>
              </div>
              <input
                aria-label={t("fields.asmgSpeedSlider")}
                max={SPEED_PERCENT_MAX}
                min={SPEED_PERCENT_MIN}
                onChange={(event) => updateSpeedFromSlider(Number(event.target.value))}
                step={1}
                type="range"
                value={speedSliderValue}
              />
              <div className="can-servo-slider-scale">
                <span>{t("canServo.speedSlow", { value: formatPercent(SPEED_PERCENT_MIN) })}</span>
                <span>{t("canServo.speedFast", { value: formatPercent(SPEED_PERCENT_MAX) })}</span>
              </div>
            </div>
            <div className="action-grid port-config-actions">
              <button className="icon-button" disabled={Boolean(busyLabel)} onClick={() => void saveLogicalAngleConfig()} type="button">
                <Save size={18} />
                <span>{t("architecture.actions.saveLimits")}</span>
              </button>
              <button className="icon-button" disabled={commandDisabled} onClick={() => void runExchange(t("actions.configureCan"), () => buildAsmgMdCanConfigCommand(nextCommandSeq(), bitrateKbps))} type="button">
                <Settings size={18} />
                <span>{t("actions.configureCan")}</span>
              </button>
              <button
                className="icon-button primary"
                disabled={commandDisabled || !targetIdIsValid}
                onClick={() =>
                  void runExchange(
                    t("actions.asmgMove"),
                    () =>
                      buildAsmgMdMoveCommand(nextCommandSeq(), {
                        id: readTargetId(),
                        position: asmgMdLogicalAngleToPositionRaw(canServoProfile, readDecimalRange(positionDeg, 0, positionLogicalMax, t("fields.asmgPosition"))),
                        speed: speedPercentToRaw(readDecimalRange(speedPercent, SPEED_PERCENT_MIN, SPEED_PERCENT_MAX, t("fields.asmgSpeed")))
                      }),
                    { configureFirst: autoConfigure }
                  )
                }
                type="button"
              >
                <Send size={18} />
                <span>{t("actions.asmgMove")}</span>
              </button>
              <button disabled={commandDisabled || !targetIdIsValid} className="icon-button" onClick={() => void runExchange(t("actions.asmgReadPosition"), () => buildAsmgMdReadPositionCommand(nextCommandSeq(), readTargetId()), { configureFirst: autoConfigure })} type="button">
                <RotateCw size={18} />
                <span>{t("actions.asmgReadPosition")}</span>
              </button>
              <button disabled={commandDisabled || !targetIdIsValid} className="icon-button" onClick={() => void runExchange(t("actions.asmgReadPositionCurrent"), () => buildAsmgMdReadPositionCurrentCommand(nextCommandSeq(), readTargetId()), { configureFirst: autoConfigure })} type="button">
                <RotateCw size={18} />
                <span>{t("actions.asmgReadPositionCurrent")}</span>
              </button>
              <button
                disabled={!canHoldPosition}
                className="icon-button"
                onClick={() => {
                  if (lastPosition === null) {
                    return;
                  }
                  void runExchange(t("actions.asmgHoldPosition"), () => buildAsmgMdMoveCommand(nextCommandSeq(), { id: readTargetId(), position: lastPosition, speed: 0 }), { configureFirst: autoConfigure });
                }}
                type="button"
              >
                <Square size={18} />
                <span>{t("actions.asmgHoldPosition")}</span>
              </button>
              <button className="icon-button" disabled={commandDisabled} onClick={() => void runExchange(t("actions.readCanFrames"), () => buildAsmgMdCanReadCommand(nextCommandSeq()))} type="button">
                <RotateCw size={18} />
                <span>{t("actions.readCanFrames")}</span>
              </button>
            </div>
          </div>

          <div className="can-servo-section">
            <div className="port-config-title">
              <Settings size={17} />
              <span>{t("canServo.config")}</span>
            </div>
            <div className="can-servo-form-grid">
              <label>
                <span>{t("fields.asmgCurrent")}</span>
                <input value={currentRaw} onChange={(event) => setCurrentRaw(event.target.value)} inputMode="numeric" />
              </label>
              <label>
                <span>{t("fields.asmgP")}</span>
                <input value={pidP} onChange={(event) => setPidP(event.target.value)} inputMode="numeric" placeholder="0-65535" />
              </label>
              <label>
                <span>{t("fields.asmgI")}</span>
                <input value={pidI} onChange={(event) => setPidI(event.target.value)} inputMode="numeric" placeholder="0-65535" />
              </label>
              <label>
                <span>{t("fields.asmgD")}</span>
                <input value={pidD} onChange={(event) => setPidD(event.target.value)} inputMode="numeric" placeholder="0-65535" />
              </label>
            </div>
            <div className="action-grid port-config-actions">
              <button disabled={commandDisabled || !targetIdIsValid} className="icon-button" onClick={() => void runExchange(t("actions.asmgSetCurrent"), () => buildAsmgMdSetCurrentCommand(nextCommandSeq(), { id: readTargetId(), current: readDecimalRange(currentRaw, 0x0000, 0xffff, t("fields.asmgCurrent")) }), { configureFirst: autoConfigure })} type="button">
                <Send size={18} />
                <span>{t("actions.asmgSetCurrent")}</span>
              </button>
              <button disabled={commandDisabled || !targetIdIsValid} className="icon-button" onClick={() => void runExchange(t("actions.asmgReadCurrent"), () => buildAsmgMdReadCurrentCommand(nextCommandSeq(), readTargetId()), { configureFirst: autoConfigure })} type="button">
                <RotateCw size={18} />
                <span>{t("actions.asmgReadCurrent")}</span>
              </button>
              <button disabled={commandDisabled || !targetIdIsValid} className="icon-button" onClick={() => void runExchange(t("actions.asmgSetPid"), () => buildAsmgMdSetPidCommand(nextCommandSeq(), { id: readTargetId(), p: readDecimalRange(pidP, 0x0000, 0xffff, t("fields.asmgP")), i: readDecimalRange(pidI, 0x0000, 0xffff, t("fields.asmgI")), d: readDecimalRange(pidD, 0x0000, 0xffff, t("fields.asmgD")) }), { configureFirst: autoConfigure })} type="button">
                <Send size={18} />
                <span>{t("actions.asmgSetPid")}</span>
              </button>
              <button disabled={commandDisabled || !targetIdIsValid} className="icon-button" onClick={() => void runExchange(t("actions.asmgReadPid"), () => buildAsmgMdReadPidCommand(nextCommandSeq(), readTargetId()), { configureFirst: autoConfigure })} type="button">
                <RotateCw size={18} />
                <span>{t("actions.asmgReadPid")}</span>
              </button>
              <button className="icon-button" disabled={commandDisabled} onClick={() => void runExchange(t("actions.asmgReadId"), () => buildAsmgMdReadIdCommand(nextCommandSeq()), { configureFirst: autoConfigure })} type="button">
                <RotateCw size={18} />
                <span>{t("actions.asmgReadId")}</span>
              </button>
            </div>
          </div>

          <div className="can-servo-section can-servo-danger">
            <div className="port-config-title">
              <AlertTriangle size={17} />
              <span>{t("canServo.danger")}</span>
            </div>
            <div className="can-servo-form-grid">
              <label>
                <span>{t("fields.asmgCenterRatio")}</span>
                <input value={centerPercent} onChange={(event) => setCenterPercent(event.target.value)} inputMode="decimal" />
              </label>
              <label>
                <span>{t("fields.asmgNewId")}</span>
                <input value={newId} onChange={(event) => setNewId(event.target.value)} inputMode="numeric" />
              </label>
              <label>
                <span>{t("fields.asmgNewBaud")}</span>
                <select value={newBaudKbps} onChange={(event) => setNewBaudKbps(Number(event.target.value) as AsmgMdBaudKbps)}>
                  {baudOptions.map((option) => (
                    <option key={option} value={option}>
                      {option} kbit/s
                    </option>
                  ))}
                </select>
              </label>
              <label className="can-servo-checkbox">
                <input type="checkbox" checked={singleServoConfirmed} onChange={(event) => setSingleServoConfirmed(event.target.checked)} />
                <span>{t("fields.singleServoConfirm")}</span>
              </label>
              <label>
                <span>{t("fields.dangerConfirm")}</span>
                <input value={dangerConfirm} onChange={(event) => setDangerConfirm(event.target.value)} placeholder={targetIdIsValid ? t("canServo.dangerConfirmPlaceholder", { id: parsedTargetId }) : "ID"} />
              </label>
            </div>
            <p className="can-servo-danger-note">
              <ShieldCheck size={16} />
              <span>{t("canServo.dangerHint", { id: targetIdIsValid ? parsedTargetId : "--" })}</span>
            </p>
            <div className="action-grid port-config-actions">
              <button disabled={commandDisabled || !targetIdIsValid || !dangerousReady} className="icon-button danger" onClick={() => void runExchange(t("actions.asmgSaveCenter"), () => buildAsmgMdSaveCenterCommand(nextCommandSeq(), { id: readTargetId(), ratio: centerPercentToRatio(readDecimalRange(centerPercent, CENTER_PERCENT_MIN, CENTER_PERCENT_MAX, t("fields.asmgCenterRatio"))) }), { configureFirst: autoConfigure, dangerous: true })} type="button">
                <Save size={18} />
                <span>{t("actions.asmgSaveCenter")}</span>
              </button>
              <button disabled={commandDisabled || !targetIdIsValid || !dangerousReady} className="icon-button danger" onClick={() => void runSetIdExchange()} type="button">
                <Send size={18} />
                <span>{t("actions.asmgSetId")}</span>
              </button>
              <button disabled={commandDisabled || !targetIdIsValid || !dangerousReady} className="icon-button danger" onClick={() => void runSetBaudExchange()} type="button">
                <Settings size={18} />
                <span>{t("actions.asmgSetBaud")}</span>
              </button>
              <button disabled={commandDisabled || !targetIdIsValid || !dangerousReady} className="icon-button danger" onClick={() => void runExchange(t("actions.asmgFactoryReset"), () => buildAsmgMdFactoryResetCommand(nextCommandSeq(), readTargetId()), { configureFirst: autoConfigure, dangerous: true })} type="button">
                <AlertTriangle size={18} />
                <span>{t("actions.asmgFactoryReset")}</span>
              </button>
            </div>
          </div>
        </div>

        <aside className="can-servo-output">
          <div className="port-config-title">
            <CircuitBoard size={17} />
            <span>{t("canServo.result")}</span>
          </div>
          <div className="preview-grid can-servo-status-grid">
            <Metric label={t("metrics.canTx")} value={lastCommandHex} className="frame-preview" code />
            <Metric label={t("metrics.canRxFrame")} value={lastRawFrame} className="frame-preview" code />
            <Metric label={t("metrics.parsedFrame")} value={lastParsedLabel} className="frame-preview" code />
            <Metric label={t("metrics.asmgAngle")} value={latestAngleLabel} />
            <Metric label={t("metrics.lastFeedback")} value={lastUpdateLabel} tone={lastExchange?.ok ? "online" : lastExchange ? "danger" : "neutral"} />
            <Metric label={t("metrics.canFrames")} value={frameCount} />
            <Metric label={t("metrics.canFeedback")} value={feedbackLabel} className="frame-preview" code />
          </div>
          {busyLabel && <p className="form-hint">{t("canServo.running", { action: busyLabel })}</p>}
          {(localError || aBoardBridge.error) && <p className="form-error">{localError ?? aBoardBridge.error}</p>}
          <div className="pi-output-block">
            <span>{t("canServo.rawMessages")}</span>
            <pre>{lastExchange ? JSON.stringify(lastExchange.messages, null, 2) : "--"}</pre>
          </div>
        </aside>
      </div>
    </section>
  );
}

function parseDecimal(value: string): number {
  const trimmed = value.trim();
  if (!trimmed) {
    return Number.NaN;
  }
  return Number(trimmed);
}

function readDecimalRange(value: string, min: number, max: number, label: string): number {
  const parsed = parseDecimal(value);
  if (!Number.isFinite(parsed) || parsed < min || parsed > max) {
    throw new RangeError(`${label} must be ${formatNumber(min)}..${formatNumber(max)}`);
  }
  return parsed;
}

function parseDecimalForSlider(value: string, min: number, max: number): number {
  const parsed = parseDecimal(value);
  if (!Number.isFinite(parsed)) {
    return min;
  }
  return Math.min(max, Math.max(min, parsed));
}

function speedPercentToRaw(percent: number): number {
  const bounded = Math.min(SPEED_PERCENT_MAX, Math.max(SPEED_PERCENT_MIN, percent));
  const raw = Math.round(((SPEED_PERCENT_MAX - bounded) / SPEED_PERCENT_MAX) * ASMG_MD_SPEED_MAX);
  return Math.min(ASMG_MD_SPEED_MAX, Math.max(ASMG_MD_SPEED_MIN, raw));
}

function speedRawToPercent(raw: number): number {
  const bounded = Math.min(ASMG_MD_SPEED_MAX, Math.max(ASMG_MD_SPEED_MIN, raw));
  return SPEED_PERCENT_MAX - (bounded / ASMG_MD_SPEED_MAX) * SPEED_PERCENT_MAX;
}

function centerPercentToRatio(percent: number): number {
  const bounded = Math.min(CENTER_PERCENT_MAX, Math.max(CENTER_PERCENT_MIN, percent));
  return Math.round(bounded * 10);
}

function formatNumber(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1);
}

function formatDegrees(value: number): string {
  return `${formatNumber(value)}°`;
}

function formatPercent(value: number): string {
  return `${formatNumber(value)}%`;
}

function isCanServoFrameMessage(message: InboundMessage): message is CanFrameMessage {
  return message.type === "can.frame" || message.type === "can_servo.feedback";
}

function isCanServoFeedbackMessage(message: InboundMessage): message is CanFeedbackMessage {
  return message.type === "can.feedback" || message.type === "can_servo.feedback";
}

function formatCanServoFrame(frame: CanFrameMessage): string {
  if (frame.type === "can_servo.feedback") {
    return `${formatCanId(ASMG_MD_HOST_EXTENDED_ID)} ${frame.rawDataHex ?? frame.dataHex ?? "--"}`;
  }
  return `${formatCanId(frame.id)} ${frame.dataHex ?? "--"}`;
}

function formatCanId(id: number): string {
  return `0x${id.toString(16).toUpperCase().padStart(8, "0")}`;
}

function formatHexWord(value: number): string {
  return `0x${value.toString(16).toUpperCase().padStart(4, "0")}`;
}

function formatPcCommand(command: PcCommand): string {
  return JSON.stringify(command);
}

function describeParsedFrame(frame: AsmgMdParsedFrame, t: TFunction): string {
  const id = frame.servoId === undefined ? "--" : frame.servoId;
  if (frame.kind === "positionCommand") {
    return t("canServo.parsed.positionCommand", { id, current: formatPositionValue(frame.currentPosition), command: formatPositionValue(frame.commandPosition) });
  }
  if (frame.kind === "currentSetting") {
    return t("canServo.parsed.currentSetting", { id, torque: formatRawNumber(frame.currentTorque), current: formatRawNumber(frame.setCurrent) });
  }
  if (frame.kind === "pid") {
    return t("canServo.parsed.pid", { id, p: formatRawNumber(frame.p), i: formatRawNumber(frame.i), d: formatRawNumber(frame.d) });
  }
  if (frame.kind === "positionCurrent") {
    return t("canServo.parsed.positionCurrent", { id, position: formatPositionValue(frame.currentPosition), current: formatRawNumber(frame.current) });
  }
  if (frame.kind === "readId") {
    return t("canServo.parsed.readId", { id });
  }
  if (frame.kind === "setId") {
    return t("canServo.parsed.setId", { id: frame.newId ?? id });
  }
  if (frame.kind === "baudEcho") {
    return t("canServo.parsed.baud", { id, baud: frame.baudKbps ? `${frame.baudKbps} kbit/s` : frame.baudCode ?? "--" });
  }
  if (frame.kind === "factoryReset") {
    return t("canServo.parsed.factoryReset", { id });
  }
  if (frame.kind === "moveEcho") {
    return t("canServo.parsed.move", { id, position: formatPositionValue(frame.position), speed: formatSpeedValue(frame.speed) });
  }
  return t("canServo.parsed.unknown", { data: frame.rawDataHex || "--" });
}

function formatParsedAngle(frame: AsmgMdParsedFrame | undefined): string {
  if (!frame) {
    return "--";
  }
  if (typeof frame.currentPosition === "number") {
    return formatPositionValue(frame.currentPosition);
  }
  if (typeof frame.position === "number") {
    return formatPositionValue(frame.position);
  }
  if (typeof frame.commandPosition === "number") {
    return formatPositionValue(frame.commandPosition);
  }
  return "--";
}

function formatPositionValue(value: number | undefined): string {
  if (typeof value !== "number") {
    return "--";
  }
  return `${formatDegrees(asmgMdPositionRawToDegrees(value))} (${formatHexWord(value)})`;
}

function formatSpeedValue(value: number | undefined): string {
  if (typeof value !== "number") {
    return "--";
  }
  return `${formatPercent(speedRawToPercent(value))} (${formatHexWord(value)})`;
}

function formatRawNumber(value: number | undefined): string {
  if (typeof value !== "number") {
    return "--";
  }
  return `${value} (${formatHexWord(value)})`;
}
