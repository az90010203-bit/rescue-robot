import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, HandHelping, Play, RefreshCw, RotateCcw, RotateCw, ShieldAlert, Square } from "lucide-react";
import type { TFunction } from "i18next";
import { Metric, PanelTitle, type Tone } from "@shared/ui/AppChrome";
import type { InboundMessage, PcCommand } from "@adapters/hardware/protocol";
import type { ServoFrameSendOptions } from "@adapters/web-serial/useServoSerialTransport";
import {
  MACHINE_CLAW_SERVO_IDS,
  buildMachineClawClawCommand,
  buildMachineClawPitchCommands,
  buildMachineClawReadCommand,
  buildMachineClawRotationCommands,
  buildMachineClawStopCommands,
  machineClawActionKey,
  machineClawClawActionKey,
  machineClawFeedbackPositionRaw,
  machineClawTargetTurns,
  nextMachineClawTurnProgress,
  type MachineClawClawDirection,
  type MachineClawConfigPatch,
  type MachineClawDirection,
  type MachineClawRunAction,
  type MachineClawTestConfig,
  type MachineClawTurnProgress
} from "@domains/machine-claw/machineClaw";

interface PiServoBridgeControls {
  busy: boolean;
  connected: boolean;
  detail: string;
  error: string | null;
  label: string;
  tone: Tone;
  check: () => void | Promise<boolean>;
  disconnect: () => void;
  start: () => void | Promise<boolean>;
}

interface MachineClawTestPageProps {
  config: MachineClawTestConfig;
  nextCommandSeq: () => number;
  onConfigChange: (patch: MachineClawConfigPatch) => void;
  piServoBridge: PiServoBridgeControls;
  sendPiServoBridgeCommand: (command: PcCommand, waitMs: number, options?: ServoFrameSendOptions) => Promise<InboundMessage | null>;
  t: TFunction;
}

interface MachineClawMonitorRuntime {
  completedTurns: number;
  generation: number;
  polling: boolean;
  previousRaw: number;
  speedRaw: number;
  targetTurns: number;
}

const ACTION_I18N_KEYS: Record<MachineClawRunAction, string> = {
  idle: "machineClaw.status.idle",
  "pitch-positive": "machineClaw.status.pitchPositive",
  "pitch-negative": "machineClaw.status.pitchNegative",
  "rotation-positive": "machineClaw.status.rotationPositive",
  "rotation-negative": "machineClaw.status.rotationNegative",
  "claw-open": "machineClaw.status.clawOpen",
  "claw-close": "machineClaw.status.clawClose",
  stopping: "machineClaw.status.stopping",
  error: "machineClaw.status.error"
};

const EMPTY_PROGRESS: MachineClawTurnProgress = {
  completedTurns: 0,
  targetTurns: 0,
  running: false
};

export function MachineClawTestPage({
  config,
  nextCommandSeq,
  onConfigChange,
  piServoBridge,
  sendPiServoBridgeCommand,
  t
}: MachineClawTestPageProps) {
  const [activeAction, setActiveAction] = useState<MachineClawRunAction>("idle");
  const [commandBusy, setCommandBusy] = useState(false);
  const [lastResponse, setLastResponse] = useState<InboundMessage | null>(null);
  const [pageError, setPageError] = useState("");
  const [turnProgress, setTurnProgress] = useState<MachineClawTurnProgress>(EMPTY_PROGRESS);

  const activeActionRef = useRef(activeAction);
  const configRef = useRef(config);
  const mountedRef = useRef(false);
  const monitorRef = useRef<MachineClawMonitorRuntime | null>(null);
  const monitorTimerRef = useRef<number | undefined>(undefined);
  const nextCommandSeqRef = useRef(nextCommandSeq);
  const sendCommandRef = useRef(sendPiServoBridgeCommand);
  const monitorGenerationRef = useRef(0);

  useEffect(() => {
    activeActionRef.current = activeAction;
  }, [activeAction]);

  useEffect(() => {
    configRef.current = config;
  }, [config]);

  useEffect(() => {
    nextCommandSeqRef.current = nextCommandSeq;
  }, [nextCommandSeq]);

  useEffect(() => {
    sendCommandRef.current = sendPiServoBridgeCommand;
  }, [sendPiServoBridgeCommand]);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearMonitorTimer();
      monitorRef.current = null;
      const commands = buildMachineClawStopCommands(() => nextCommandSeqRef.current());
      void Promise.all(commands.map((command) => sendCommandRef.current(command, 120, stopCommandOptions(command))));
    };
  }, []);

  const controlsDisabled = !piServoBridge.connected || commandBusy;
  const bridgeDetail = piServoBridge.detail || t("machineClaw.status.noBridgeDetail");
  const displayedError = pageError || piServoBridge.error || "";
  const progressLabel = formatProgress(turnProgress);
  const activeActionLabel = t(ACTION_I18N_KEYS[activeAction]);
  const lastResponseLabel = useMemo(() => formatResponse(lastResponse, t), [lastResponse, t]);

  async function sendCommand(command: PcCommand, waitMs = 160, options?: ServoFrameSendOptions) {
    const response = await sendCommandRef.current(command, waitMs, options);
    if (!mountedRef.current) {
      return response;
    }
    setLastResponse(response);
    if (!response) {
      setPageError(t("machineClaw.errors.commandFailed"));
      return null;
    }
    if (response.type === "error") {
      setPageError(response.message || t("machineClaw.errors.commandFailed"));
      return null;
    }
    return response;
  }

  async function runCommandList(commands: PcCommand[], waitMs = 160) {
    for (const command of commands) {
      const response = await sendCommand(command, waitMs, commandOptions(command));
      if (!response) {
        return false;
      }
    }
    return true;
  }

  async function sendStopCommandsQuiet(ids?: readonly number[]) {
    const commands = buildMachineClawStopCommands(() => nextCommandSeqRef.current(), ids);
    for (const command of commands) {
      await sendCommandRef.current(command, 120, stopCommandOptions(command));
    }
  }

  async function stopIds(ids: readonly number[]) {
    if (!piServoBridge.connected) {
      setPageError(t("machineClaw.errors.bridgeRequired"));
      return;
    }
    clearMonitor(true);
    setCommandBusy(true);
    setPageError("");
    setActiveAction("stopping");
    await sendStopCommandsQuiet(ids);
    if (mountedRef.current) {
      setCommandBusy(false);
      setActiveAction("idle");
    }
  }

  async function emergencyStop() {
    if (!piServoBridge.connected) {
      setPageError(t("machineClaw.errors.bridgeRequired"));
      return;
    }
    clearMonitor(true);
    setCommandBusy(true);
    setPageError("");
    setActiveAction("stopping");
    await sendStopCommandsQuiet();
    if (mountedRef.current) {
      setTurnProgress((current) => ({ ...current, running: false }));
      setCommandBusy(false);
      setActiveAction("idle");
    }
  }

  async function startPitch(direction: MachineClawDirection) {
    if (!piServoBridge.connected) {
      setPageError(t("machineClaw.errors.bridgeRequired"));
      return;
    }
    setCommandBusy(true);
    setPageError("");
    clearMonitor(true);
    await sendStopCommandsQuiet();
    const commands = buildMachineClawPitchCommands(configRef.current, direction, () => nextCommandSeqRef.current());
    const sent = await runCommandList(commands);
    if (mountedRef.current) {
      setCommandBusy(false);
      setActiveAction(sent ? machineClawActionKey("pitch", direction) : "error");
    }
  }

  async function startRotation(direction: MachineClawDirection) {
    if (!piServoBridge.connected) {
      setPageError(t("machineClaw.errors.bridgeRequired"));
      return;
    }
    setCommandBusy(true);
    setPageError("");
    clearMonitor(true);
    await sendStopCommandsQuiet();
    const commands = buildMachineClawRotationCommands(configRef.current, direction, () => nextCommandSeqRef.current());
    const sent = await runCommandList(commands);
    if (mountedRef.current) {
      setCommandBusy(false);
      setActiveAction(sent ? machineClawActionKey("rotation", direction) : "error");
    }
  }

  async function startClaw(direction: MachineClawClawDirection) {
    if (!piServoBridge.connected) {
      setPageError(t("machineClaw.errors.bridgeRequired"));
      return;
    }

    setCommandBusy(true);
    setPageError("");
    clearMonitor(true);
    await sendStopCommandsQuiet();

    const readResponse = await sendCommand(buildMachineClawReadCommand(nextCommandSeqRef.current()), 180, {
      coalesceKey: "machine-claw-feedback"
    });
    const positionRaw = machineClawFeedbackPositionRaw(readResponse);
    if (positionRaw === null) {
      await sendStopCommandsQuiet([MACHINE_CLAW_SERVO_IDS.claw]);
      if (mountedRef.current) {
        setPageError(t("machineClaw.errors.feedbackRequired"));
        setCommandBusy(false);
        setActiveAction("error");
      }
      return;
    }

    const configAtStart = configRef.current;
    const command = buildMachineClawClawCommand(configAtStart, direction, () => nextCommandSeqRef.current());
    const speedRaw = commandSpeedRaw(command);
    const targetTurns = machineClawTargetTurns(configAtStart, direction);
    const progress = {
      completedTurns: 0,
      targetTurns,
      running: true
    };

    if (mountedRef.current) {
      setTurnProgress(progress);
    }

    const response = await sendCommand(command, 180, commandOptions(command));
    if (!response || speedRaw === 0) {
      await sendStopCommandsQuiet([MACHINE_CLAW_SERVO_IDS.claw]);
      if (mountedRef.current) {
        setCommandBusy(false);
        setActiveAction("error");
      }
      return;
    }

    const generation = monitorGenerationRef.current + 1;
    monitorGenerationRef.current = generation;
    monitorRef.current = {
      completedTurns: 0,
      generation,
      polling: false,
      previousRaw: positionRaw,
      speedRaw,
      targetTurns
    };
    startMonitorTimer(generation);
    if (mountedRef.current) {
      setCommandBusy(false);
      setActiveAction(machineClawClawActionKey(direction));
    }
  }

  async function pollClawProgress(generation: number) {
    const runtime = monitorRef.current;
    if (!runtime || runtime.generation !== generation || runtime.polling) {
      return;
    }
    runtime.polling = true;
    try {
      const response = await sendCommand(buildMachineClawReadCommand(nextCommandSeqRef.current()), 130, {
        coalesceKey: "machine-claw-feedback",
        minIntervalMs: 120,
        policy: "latest"
      });
      const positionRaw = machineClawFeedbackPositionRaw(response);
      if (positionRaw === null) {
        clearMonitor(true);
        await sendStopCommandsQuiet([MACHINE_CLAW_SERVO_IDS.claw]);
        if (mountedRef.current) {
          setPageError(t("machineClaw.errors.feedbackRequired"));
          setActiveAction("error");
        }
        return;
      }

      const nextProgress = nextMachineClawTurnProgress(runtime.previousRaw, positionRaw, runtime.speedRaw, {
        completedTurns: runtime.completedTurns,
        targetTurns: runtime.targetTurns,
        running: true
      });
      runtime.previousRaw = positionRaw;
      runtime.completedTurns = nextProgress.completedTurns;
      if (mountedRef.current) {
        setTurnProgress(nextProgress);
      }

      if (!nextProgress.running) {
        clearMonitor(false);
        await sendStopCommandsQuiet([MACHINE_CLAW_SERVO_IDS.claw]);
        if (mountedRef.current) {
          setTurnProgress({ ...nextProgress, running: false });
          setActiveAction("idle");
        }
      }
    } finally {
      if (monitorRef.current === runtime) {
        runtime.polling = false;
      }
    }
  }

  function startMonitorTimer(generation: number) {
    clearMonitorTimer();
    monitorTimerRef.current = window.setInterval(() => {
      void pollClawProgress(generation);
    }, 180);
  }

  function clearMonitorTimer() {
    if (monitorTimerRef.current !== undefined) {
      window.clearInterval(monitorTimerRef.current);
      monitorTimerRef.current = undefined;
    }
  }

  function clearMonitor(updateProgress: boolean) {
    clearMonitorTimer();
    monitorRef.current = null;
    monitorGenerationRef.current += 1;
    if (updateProgress && mountedRef.current) {
      setTurnProgress((current) => ({ ...current, running: false }));
    }
  }

  function updateConfigNumber(field: keyof MachineClawConfigPatch, value: string) {
    onConfigChange({ [field]: Number(value) } as MachineClawConfigPatch);
  }

  return (
    <section className="panel machine-claw-panel" aria-labelledby="machine-claw-title">
      <PanelTitle icon={<HandHelping size={18} />} id="machine-claw-title" meta="ID21 / ID22 / ID23" title={t("panels.machineClaw")} />

      <div className="machine-claw-topbar">
        <div className="machine-claw-status-grid">
          <Metric label={t("machineClaw.metrics.bridge")} value={piServoBridge.label} tone={piServoBridge.tone} />
          <Metric className="frame-preview" code label={t("machineClaw.metrics.bridgeDetail")} value={bridgeDetail} />
          <Metric label={t("machineClaw.metrics.activeAction")} value={activeActionLabel} tone={actionTone(activeAction)} />
          <Metric label={t("machineClaw.metrics.progress")} value={progressLabel} tone={turnProgress.running ? "warning" : "neutral"} />
          <Metric className="frame-preview" code label={t("machineClaw.metrics.lastResponse")} value={lastResponseLabel} tone={lastResponse?.type === "error" ? "danger" : "neutral"} />
        </div>
        <div className="machine-claw-toolbar">
          <button className="icon-button" disabled={piServoBridge.busy} onClick={() => void piServoBridge.check()} type="button">
            <RefreshCw size={16} />
            <span>{t("machineClaw.actions.checkBridge")}</span>
          </button>
          <button className="icon-button primary" disabled={piServoBridge.busy} onClick={() => void piServoBridge.start()} type="button">
            <Play size={16} />
            <span>{t("machineClaw.actions.startBridge")}</span>
          </button>
          <button className="icon-button danger" disabled={!piServoBridge.connected} onClick={() => void emergencyStop()} type="button">
            <ShieldAlert size={16} />
            <span>{t("machineClaw.actions.emergencyStop")}</span>
          </button>
        </div>
      </div>

      {displayedError && <p className="form-error">{displayedError}</p>}

      <div className="machine-claw-grid">
        <section className="machine-claw-card">
          <CardTitle title={t("machineClaw.pitch.title")} meta="ID21 + ID23" />
          <div className="machine-claw-field-grid">
            <RangeNumberField
              disabled={commandBusy}
              label={t("machineClaw.fields.pitchSpeed")}
              max={1000}
              min={0}
              onChange={(value) => updateConfigNumber("pitchSpeedRaw", value)}
              value={config.pitchSpeedRaw}
            />
            <RangeNumberField
              disabled={commandBusy}
              label={t("machineClaw.fields.acc")}
              max={254}
              min={0}
              onChange={(value) => updateConfigNumber("acc", value)}
              value={config.acc}
            />
            <ToggleField checked={config.pitchReverse} disabled={commandBusy} label={t("machineClaw.fields.pitchReverse")} onChange={(checked) => onConfigChange({ pitchReverse: checked })} />
          </div>
          <div className="machine-claw-button-row">
            <button className="icon-button primary" disabled={controlsDisabled} onClick={() => void startPitch("positive")} type="button">
              <ArrowUp size={16} />
              <span>{t("machineClaw.actions.pitchPositive")}</span>
            </button>
            <button className="icon-button" disabled={controlsDisabled} onClick={() => void startPitch("negative")} type="button">
              <ArrowDown size={16} />
              <span>{t("machineClaw.actions.pitchNegative")}</span>
            </button>
            <button className="icon-button" disabled={!piServoBridge.connected || commandBusy} onClick={() => void stopIds([MACHINE_CLAW_SERVO_IDS.pitchLeft, MACHINE_CLAW_SERVO_IDS.pitchRight])} type="button">
              <Square size={15} />
              <span>{t("machineClaw.actions.stopPitch")}</span>
            </button>
          </div>
        </section>

        <section className="machine-claw-card">
          <CardTitle title={t("machineClaw.rotation.title")} meta="ID21 / ID23 / ID22" />
          <div className="machine-claw-field-grid">
            <RangeNumberField
              disabled={commandBusy}
              label={t("machineClaw.fields.rotationSpeed")}
              max={1000}
              min={0}
              onChange={(value) => updateConfigNumber("rotationSpeedRaw", value)}
              value={config.rotationSpeedRaw}
            />
            <RangeNumberField
              disabled={commandBusy}
              label={t("machineClaw.fields.rotationClawSpeed")}
              max={1000}
              min={0}
              onChange={(value) => updateConfigNumber("rotationClawSpeedRaw", value)}
              value={config.rotationClawSpeedRaw}
            />
            <ToggleField checked={config.rotationReverse} disabled={commandBusy} label={t("machineClaw.fields.rotationReverse")} onChange={(checked) => onConfigChange({ rotationReverse: checked })} />
            <ToggleField checked={config.rotationClawReverse} disabled={commandBusy} label={t("machineClaw.fields.rotationClawReverse")} onChange={(checked) => onConfigChange({ rotationClawReverse: checked })} />
          </div>
          <div className="machine-claw-button-row">
            <button className="icon-button primary" disabled={controlsDisabled} onClick={() => void startRotation("positive")} type="button">
              <RotateCw size={16} />
              <span>{t("machineClaw.actions.rotatePositive")}</span>
            </button>
            <button className="icon-button" disabled={controlsDisabled} onClick={() => void startRotation("negative")} type="button">
              <RotateCcw size={16} />
              <span>{t("machineClaw.actions.rotateNegative")}</span>
            </button>
            <button className="icon-button" disabled={!piServoBridge.connected || commandBusy} onClick={() => void stopIds([MACHINE_CLAW_SERVO_IDS.pitchLeft, MACHINE_CLAW_SERVO_IDS.claw, MACHINE_CLAW_SERVO_IDS.pitchRight])} type="button">
              <Square size={15} />
              <span>{t("machineClaw.actions.stopRotation")}</span>
            </button>
          </div>
        </section>

        <section className="machine-claw-card">
          <CardTitle title={t("machineClaw.claw.title")} meta="ID22" />
          <div className="machine-claw-field-grid">
            <RangeNumberField
              disabled={commandBusy}
              label={t("machineClaw.fields.clawSpeed")}
              max={1000}
              min={0}
              onChange={(value) => updateConfigNumber("clawSpeedRaw", value)}
              value={config.clawSpeedRaw}
            />
            <NumberField disabled={commandBusy} label={t("machineClaw.fields.openTurns")} min={0.01} onChange={(value) => updateConfigNumber("openTurns", value)} step={0.01} value={config.openTurns} />
            <NumberField disabled={commandBusy} label={t("machineClaw.fields.closeTurns")} min={0.01} onChange={(value) => updateConfigNumber("closeTurns", value)} step={0.01} value={config.closeTurns} />
            <ToggleField checked={config.clawReverse} disabled={commandBusy} label={t("machineClaw.fields.clawReverse")} onChange={(checked) => onConfigChange({ clawReverse: checked })} />
          </div>
          <div className="machine-claw-progress">
            <span>{t("machineClaw.metrics.progress")}</span>
            <strong>{progressLabel}</strong>
          </div>
          <div className="machine-claw-button-row">
            <button className="icon-button primary" disabled={controlsDisabled} onClick={() => void startClaw("open")} type="button">
              <ArrowUp size={16} />
              <span>{t("machineClaw.actions.open")}</span>
            </button>
            <button className="icon-button" disabled={controlsDisabled} onClick={() => void startClaw("close")} type="button">
              <ArrowDown size={16} />
              <span>{t("machineClaw.actions.close")}</span>
            </button>
            <button className="icon-button" disabled={!piServoBridge.connected || commandBusy} onClick={() => void stopIds([MACHINE_CLAW_SERVO_IDS.claw])} type="button">
              <Square size={15} />
              <span>{t("machineClaw.actions.stopClaw")}</span>
            </button>
          </div>
        </section>
      </div>
    </section>
  );
}

function CardTitle({ meta, title }: { meta: string; title: string }) {
  return (
    <div className="machine-claw-card-title">
      <strong>{title}</strong>
      <span>{meta}</span>
    </div>
  );
}

function RangeNumberField({
  disabled,
  label,
  max,
  min,
  onChange,
  value
}: {
  disabled: boolean;
  label: string;
  max: number;
  min: number;
  onChange: (value: string) => void;
  value: number;
}) {
  return (
    <label className="machine-claw-range-field">
      <span>{label}</span>
      <div>
        <input disabled={disabled} max={max} min={min} onChange={(event) => onChange(event.target.value)} type="range" value={value} />
        <input disabled={disabled} max={max} min={min} onChange={(event) => onChange(event.target.value)} type="number" value={value} />
      </div>
    </label>
  );
}

function NumberField({
  disabled,
  label,
  min,
  onChange,
  step,
  value
}: {
  disabled: boolean;
  label: string;
  min: number;
  onChange: (value: string) => void;
  step: number;
  value: number;
}) {
  return (
    <label className="machine-claw-number-field">
      <span>{label}</span>
      <input disabled={disabled} min={min} onChange={(event) => onChange(event.target.value)} step={step} type="number" value={value} />
    </label>
  );
}

function ToggleField({ checked, disabled, label, onChange }: { checked: boolean; disabled: boolean; label: string; onChange: (checked: boolean) => void }) {
  return (
    <label className="machine-claw-toggle">
      <input checked={checked} disabled={disabled} onChange={(event) => onChange(event.target.checked)} type="checkbox" />
      <span>{label}</span>
    </label>
  );
}

function actionTone(action: MachineClawRunAction): Tone {
  if (action === "error") {
    return "danger";
  }
  if (action === "idle") {
    return "neutral";
  }
  if (action === "stopping") {
    return "warning";
  }
  return "online";
}

function commandOptions(command: PcCommand): ServoFrameSendOptions {
  return {
    coalesceKey: machineClawCommandCoalesceKey(command),
    minIntervalMs: 40,
    policy: "latest"
  };
}

function stopCommandOptions(command: PcCommand): ServoFrameSendOptions {
  return {
    coalesceKey: machineClawCommandCoalesceKey(command),
    minIntervalMs: 20,
    policy: "latest"
  };
}

function machineClawCommandCoalesceKey(command: PcCommand) {
  const target = Array.isArray(command.targets) ? command.targets[0] as { id?: number } | undefined : undefined;
  return `machine-claw:${command.type}:${target?.id ?? command.id ?? "read"}`;
}

function commandSpeedRaw(command: PcCommand) {
  const target = Array.isArray(command.targets) ? command.targets[0] as { speedRaw?: number } | undefined : undefined;
  return typeof target?.speedRaw === "number" ? target.speedRaw : 0;
}

function formatProgress(progress: MachineClawTurnProgress) {
  if (!progress.running && progress.targetTurns <= 0) {
    return "--";
  }
  return `${progress.completedTurns.toFixed(2)} / ${progress.targetTurns.toFixed(2)}`;
}

function formatResponse(response: InboundMessage | null, t: TFunction) {
  if (!response) {
    return t("machineClaw.status.noResponse");
  }
  if (response.type === "ack") {
    return `ack #${response.seq}`;
  }
  if (response.type === "error") {
    return `${response.code ?? "error"} #${response.seq}`;
  }
  if (response.type === "servo.feedback") {
    return `ID${response.id} raw ${response.positionRaw ?? "--"}`;
  }
  return `${response.type} #${response.seq ?? "--"}`;
}
