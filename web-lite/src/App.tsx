import { Activity, Cable, Camera, Cpu, DatabaseZap, Gamepad2, Gauge, Home, Network, Radar, RotateCw, Save, Send, Settings2, Shield, SlidersHorizontal, Video, Wrench } from "lucide-react";
import type { TFunction } from "i18next";
import { useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { DEFAULT_INPUT_MAPPING, GAMEPAD_PRESETS, normalizeGamepadMapping, type GamepadMapping, type GamepadPresetId } from "@domains/drive/inputMapping";
import {
  ASMG_MD_CENTER_RATIO_MAX,
  ASMG_MD_SPEED_MAX,
  asmgMdLogicalAngleToPositionRaw,
  buildAsmgMdCanConfigCommand,
  buildAsmgMdCanReadCommand,
  buildAsmgMdFactoryResetCommand,
  buildAsmgMdGroupMoveCommand,
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
  parseAsmgMdCanFrame,
  type AsmgMdBaudKbps,
  type AsmgMdParsedFrame,
  type AsmgMdServoProfile
} from "@adapters/hardware/asmgMdCanServo";
import type { PcCommand } from "@adapters/hardware/protocol";
import { LANGUAGE_LABELS, SUPPORTED_LANGUAGES, isLiteLanguage, type LiteLanguage } from "./i18n/languages";
import { A_BOARD_BRIDGE_PORT, CAMERA_PORTS, PI_SERVO_BRIDGE_PORT, ROBOT_PROFILE, type PwmServoProfile } from "./robotProfile";
import { bridgeBaseUrl, buildCommandEnvelope, checkAboardBridgeHealth, checkPiServoBridgeHealth, sendAboardCommand, sendPiServoBridgeCommand, type AboardCommandResult, type BridgeHealth, type PiServoCommandResult } from "./runtime/bridgeClient";
import { discoverPiHosts, normalizeHost, recommendedPiResult, type PiDiscoveryResult, type PiDiscoverySource } from "./runtime/piDiscoveryLite";
import { DEFAULT_PRIORITY_SETTINGS, PRIORITY_FIELDS, loadPrioritySettings, normalizePrioritySettings, savePrioritySettings, type PrioritySettings } from "./runtime/priority";

type Tone = "danger" | "neutral" | "online" | "warning";
type ViewId = "control" | "can" | "feetech" | "pwm" | "gamepad" | "settings";
type GamepadAxisKey = keyof GamepadMapping["axes"];
type GamepadButtonKey = keyof GamepadMapping["buttons"];

interface LogEntry {
  id: number;
  direction: "rx" | "tx" | "system";
  level?: "info" | "warn" | "error";
  text: string;
}

interface CanExchange {
  label: string;
  command: PcCommand;
  result: AboardCommandResult;
  parsed: AsmgMdParsedFrame[];
  at: number;
}

interface FeetechExchange {
  label: string;
  command: PcCommand;
  result: PiServoCommandResult;
  at: number;
}

interface GamepadSummary {
  index: number;
  id: string;
  axes: number;
  buttons: number;
  mapping: string;
  axesValues: number[];
  pressedButtons: number[];
}

interface GamepadLiveInput {
  forward: number;
  strafe: number;
  turn: number;
  cameraPan: number;
  cameraTilt: number;
  stop: boolean;
}

const PI_HOST_STORAGE_KEY = "rescue-robot-lite.piHost.v1";
const CAN_CONFIG_STORAGE_KEY = "rescue-robot-lite.canConfig.v1";
const CAN_GROUP_STORAGE_KEY = "rescue-robot-lite.canGroupAngles.v1";
const GAMEPAD_STORAGE_KEY = "rescue-robot-lite.gamepad.v1";

const baudOptions: AsmgMdBaudKbps[] = [250, 500, 1000];
const gamepadPresetOptions: Array<Exclude<GamepadPresetId, "auto">> = ["xinput", "playstation", "switchPro", "generic"];

export default function App() {
  const { i18n, t } = useTranslation();
  const [activeView, setActiveView] = useState<ViewId>("control");
  const [piHost, setPiHost] = useState(() => readStoredString(PI_HOST_STORAGE_KEY, ROBOT_PROFILE.defaultPiHost));
  const [manualHost, setManualHost] = useState(piHost);
  const [prioritySettings, setPrioritySettings] = useState<PrioritySettings>(() => loadPrioritySettings());
  const [aBoardHealth, setABoardHealth] = useState<BridgeHealth | null>(null);
  const [piServoHealth, setPiServoHealth] = useState<BridgeHealth | null>(null);
  const [aBoardError, setABoardError] = useState<string | null>(null);
  const [piServoError, setPiServoError] = useState<string | null>(null);
  const [healthBusy, setHealthBusy] = useState(false);
  const [discoveryBusy, setDiscoveryBusy] = useState(false);
  const [discoveryResults, setDiscoveryResults] = useState<PiDiscoveryResult[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [autoConfigureCan, setAutoConfigureCan] = useState(true);
  const [canBusy, setCanBusy] = useState<string | null>(null);
  const [canError, setCanError] = useState<string | null>(null);
  const [lastCanExchange, setLastCanExchange] = useState<CanExchange | null>(null);
  const [canConfig, setCanConfig] = useState(() => readCanConfig());
  const [canGroupAngles, setCanGroupAngles] = useState(() => readCanGroupAngles());
  const [feetechBusy, setFeetechBusy] = useState<string | null>(null);
  const [feetechError, setFeetechError] = useState<string | null>(null);
  const [lastFeetechExchange, setLastFeetechExchange] = useState<FeetechExchange | null>(null);
  const [feetechConfig, setFeetechConfig] = useState(() => ({
    targetId: String(ROBOT_PROFILE.feetech.servos[0]?.id ?? 22),
    angleDeg: "180",
    speedRaw: "300",
    acc: "30",
    torqueEnabled: true
  }));
  const [selectedPwmServoId, setSelectedPwmServoId] = useState(ROBOT_PROFILE.pwmServos[0]?.id ?? "");
  const [pwmPulseUs, setPwmPulseUs] = useState("1500");
  const [gamepadMapping, setGamepadMapping] = useState<GamepadMapping>(() => readGamepadMapping());
  const [gamepadPreset, setGamepadPreset] = useState<Exclude<GamepadPresetId, "auto">>("xinput");
  const [activeGamepadIndex, setActiveGamepadIndex] = useState<number | null>(null);
  const [gamepads, setGamepads] = useState<GamepadSummary[]>([]);
  const [gamepadInput, setGamepadInput] = useState<GamepadLiveInput>(() => zeroGamepadInput());
  const seqRef = useRef(1);

  const currentLanguage = useMemo<LiteLanguage>(() => {
    const resolved = i18n.resolvedLanguage ?? i18n.language;
    return isLiteLanguage(resolved) ? resolved : "zh-CN";
  }, [i18n.language, i18n.resolvedLanguage]);
  const recommended = recommendedPiResult(discoveryResults);
  const aBoardTone = bridgeTone(aBoardHealth, aBoardError);
  const piServoTone = bridgeTone(piServoHealth, piServoError);
  const mainCameraUrl = `http://${piHost}:${CAMERA_PORTS.main}/stream`;
  const secondaryCameraUrl = `http://${piHost}:${CAMERA_PORTS.secondary}/stream`;
  const selectedCanServo = ROBOT_PROFILE.can.servos.find((servo) => servo.id === readTargetId(canConfig.targetId)) ?? ROBOT_PROFILE.can.servos[0];
  const selectedCanProfile = useMemo(() => canServoProfileFromConfig(selectedCanServo, canConfig), [canConfig, selectedCanServo]);
  const selectedPwmServo = ROBOT_PROFILE.pwmServos.find((servo) => servo.id === selectedPwmServoId) ?? ROBOT_PROFILE.pwmServos[0];
  const latestParsed = lastCanExchange?.parsed[lastCanExchange.parsed.length - 1] ?? null;
  const activeGamepad = gamepads.find((gamepad) => gamepad.index === activeGamepadIndex) ?? gamepads[0] ?? null;

  useEffect(() => {
    document.title = t("app.title");
  }, [t]);

  useEffect(() => {
    window.localStorage.setItem(PI_HOST_STORAGE_KEY, piHost);
    setManualHost(piHost);
    void refreshHealth(piHost);
  }, [piHost]);

  useEffect(() => {
    window.localStorage.setItem(CAN_CONFIG_STORAGE_KEY, JSON.stringify(canConfig));
  }, [canConfig]);

  useEffect(() => {
    window.localStorage.setItem(CAN_GROUP_STORAGE_KEY, JSON.stringify(canGroupAngles));
  }, [canGroupAngles]);

  useEffect(() => {
    savePrioritySettings(prioritySettings);
  }, [prioritySettings]);

  useEffect(() => {
    window.localStorage.setItem(GAMEPAD_STORAGE_KEY, JSON.stringify(gamepadMapping));
  }, [gamepadMapping]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!navigator.getGamepads) {
        setGamepads([]);
        setGamepadInput(zeroGamepadInput());
        return;
      }
      const pads = Array.from(navigator.getGamepads()).filter((gamepad): gamepad is Gamepad => Boolean(gamepad));
      const summaries = pads.map((gamepad) => ({
        index: gamepad.index,
        id: gamepad.id,
        axes: gamepad.axes.length,
        buttons: gamepad.buttons.length,
        mapping: gamepad.mapping || "unknown",
        axesValues: gamepad.axes.map((axis) => Number(axis.toFixed(2))),
        pressedButtons: gamepad.buttons.map((button, index) => button.pressed ? index : -1).filter((index) => index >= 0)
      }));
      setGamepads(summaries);
      const selected = activeGamepadIndex === null
        ? pads[0] ?? null
        : pads.find((gamepad) => gamepad.index === activeGamepadIndex) ?? pads[0] ?? null;
      setGamepadInput(readGamepadInput(selected, gamepadMapping));
    }, 160);
    return () => window.clearInterval(timer);
  }, [activeGamepadIndex, gamepadMapping]);

  function addLog(direction: LogEntry["direction"], text: string, level: LogEntry["level"] = "info") {
    setLogs((current) => [{ id: Date.now() + Math.random(), direction, text, level }, ...current].slice(0, 140));
  }

  function nextSeq() {
    const seq = seqRef.current;
    seqRef.current += 1;
    return seq;
  }

  async function refreshHealth(host = piHost) {
    const targetHost = normalizeHost(host);
    setHealthBusy(true);
    setABoardError(null);
    setPiServoError(null);
    try {
      const [aBoard, piServo] = await Promise.allSettled([
        checkAboardBridgeHealth(targetHost),
        checkPiServoBridgeHealth(targetHost)
      ]);
      if (aBoard.status === "fulfilled") {
        setABoardHealth(aBoard.value);
      } else {
        setABoardHealth(null);
        setABoardError(errorMessage(aBoard.reason, t));
      }
      if (piServo.status === "fulfilled") {
        setPiServoHealth(piServo.value);
      } else {
        setPiServoHealth(null);
        setPiServoError(errorMessage(piServo.reason, t));
      }
      addLog("system", t("logs.healthComplete", { host: targetHost }), "info");
    } finally {
      setHealthBusy(false);
    }
  }

  async function scanPiHosts() {
    setDiscoveryBusy(true);
    try {
      const results = await discoverPiHosts(piHost);
      setDiscoveryResults(results);
      const best = recommendedPiResult(results);
      addLog("system", best ? t("logs.piCandidateFound", { host: best.candidate.host }) : t("logs.noPiCandidate"), best ? "info" : "warn");
    } catch (error) {
      addLog("system", t("logs.piSearchFailed", { message: errorMessage(error, t) }), "error");
    } finally {
      setDiscoveryBusy(false);
    }
  }

  function applyHost(host: string) {
    const next = normalizeHost(host);
    if (!next) {
      return;
    }
    setPiHost(next);
    addLog("system", t("logs.hostApplied", { host: next }), "info");
  }

  function changeLanguage(value: string) {
    if (isLiteLanguage(value)) {
      void i18n.changeLanguage(value);
    }
  }

  function updatePriority(key: keyof PrioritySettings, value: string) {
    setPrioritySettings((current) => normalizePrioritySettings({ ...current, [key]: value }));
  }

  function resetPriorities() {
    setPrioritySettings(DEFAULT_PRIORITY_SETTINGS);
    addLog("system", t("logs.priorityReset"), "info");
  }

  async function runCanExchange(label: string, commandFactory: () => PcCommand, options: { configureFirst?: boolean; dangerous?: boolean; timeoutMs?: number } = {}) {
    if (options.dangerous && canConfig.dangerConfirm.trim() !== canConfig.targetId.trim()) {
      setCanError(t("errors.dangerConfirm"));
      return;
    }
    setCanBusy(label);
    setCanError(null);
    const factories = options.configureFirst && autoConfigureCan
      ? [() => buildAsmgMdCanConfigCommand(nextSeq(), canConfig.bitrateKbps), commandFactory]
      : [commandFactory];
    try {
      for (const factory of factories) {
        const command = factory();
        const envelope = buildCommandEnvelope(command, prioritySettings, { timeoutMs: options.timeoutMs ?? 1200 });
        addLog("tx", JSON.stringify(envelope.command), "info");
        const result = await sendAboardCommand(piHost, command, prioritySettings, { timeoutMs: options.timeoutMs ?? 1200 });
        addLog("rx", JSON.stringify({ ok: result.ok, busy: result.busy, accepted: result.accepted, messages: result.messages }), result.ok ? "info" : "warn");
        const parsed = result.messages.map((message) => parseAsmgMdCanFrame(message)).filter(Boolean) as AsmgMdParsedFrame[];
        setLastCanExchange({ label, command: envelope.command, result, parsed, at: Date.now() });
        if (result.messages.some((message) => message.type === "error") || result.ok === false) {
          throw new Error(result.error ?? t("errors.canRejected"));
        }
      }
      await refreshHealth(piHost);
    } catch (error) {
      const message = errorMessage(error, t);
      setCanError(message);
      addLog("system", t("logs.canFailed", { message }), "error");
    } finally {
      setCanBusy(null);
    }
  }

  async function runFeetechExchange(label: string, commandFactory: () => PcCommand) {
    setFeetechBusy(label);
    setFeetechError(null);
    try {
      const command = commandFactory();
      addLog("tx", JSON.stringify(command), "info");
      const result = await sendPiServoBridgeCommand(piHost, command, { waitMs: 650, timeoutMs: 1200 });
      addLog("rx", JSON.stringify({ ok: result.ok, protocol: result.protocol, messages: result.messages }), result.ok ? "info" : "warn");
      setLastFeetechExchange({ label, command, result, at: Date.now() });
      if (result.ok === false) {
        throw new Error(result.error ?? t("errors.feetechRejected"));
      }
      await refreshHealth(piHost);
    } catch (error) {
      const message = errorMessage(error, t);
      setFeetechError(message);
      addLog("system", t("logs.feetechFailed", { message }), "error");
    } finally {
      setFeetechBusy(null);
    }
  }

  function selectedMoveCommand(): PcCommand {
    return buildAsmgMdMoveCommand(nextSeq(), {
      id: selectedCanProfile.id,
      position: asmgMdLogicalAngleToPositionRaw(selectedCanProfile, numberFromText(canConfig.positionDeg, 0)),
      speed: integerFromText(canConfig.speedRaw, ASMG_MD_SPEED_MAX)
    });
  }

  function groupMoveCommand(): PcCommand {
    const speed = integerFromText(canConfig.speedRaw, ASMG_MD_SPEED_MAX);
    return buildAsmgMdGroupMoveCommand(
      nextSeq(),
      ROBOT_PROFILE.can.servos.map((servo) => {
        const profile = normalizeAsmgMdServoProfile({ ...servo, bitrateKbps: canConfig.bitrateKbps });
        const angle = numberFromText(canGroupAngles[String(servo.id)], servoLogicalCenter(servo));
        return { id: profile.id, position: asmgMdLogicalAngleToPositionRaw(profile, angle) };
      }),
      speed
    );
  }

  function updateCanConfig<K extends keyof ReturnType<typeof readCanConfig>>(key: K, value: ReturnType<typeof readCanConfig>[K]) {
    setCanConfig((current) => ({ ...current, [key]: value }));
  }

  function selectCanServo(id: number) {
    const servo = ROBOT_PROFILE.can.servos.find((item) => item.id === id) ?? ROBOT_PROFILE.can.servos[0];
    setCanConfig((current) => ({
      ...current,
      targetId: String(servo.id),
      minDeg: String(servo.minDeg ?? 0),
      maxDeg: String(servo.maxDeg ?? 360),
      direction: servo.direction === -1 ? -1 : 1,
      bitrateKbps: servo.bitrateKbps ?? ROBOT_PROFILE.can.bitrateKbps
    }));
  }

  function updateCanGroupAngle(id: number, value: string) {
    setCanGroupAngles((current) => ({ ...current, [String(id)]: value }));
  }

  function updateGamepadAxis(axis: GamepadAxisKey, field: "index" | "invert", value: string | boolean) {
    setGamepadMapping((current) => normalizeGamepadMapping({
      ...current,
      axes: {
        ...current.axes,
        [axis]: {
          ...current.axes[axis],
          [field]: field === "invert" ? Boolean(value) : integerFromText(String(value), current.axes[axis].index)
        }
      }
    }));
  }

  function updateGamepadButton(button: GamepadButtonKey, value: string) {
    setGamepadMapping((current) => normalizeGamepadMapping({
      ...current,
      buttons: {
        ...current.buttons,
        [button]: integerFromText(value, current.buttons[button])
      }
    }));
  }

  function applyGamepadPreset(preset: Exclude<GamepadPresetId, "auto">) {
    setGamepadPreset(preset);
    setGamepadMapping(GAMEPAD_PRESETS[preset].mapping);
  }

  function renderControlView() {
    return (
      <section className="view-grid control-view">
        <section className="panel control-camera-panel">
          <PanelTitle icon={<Video size={18} />} title={t("master.cameraFeeds")} meta={piHost} />
          <div className="camera-feed-grid">
            <CameraFeed label={t("camera.main")} url={mainCameraUrl} />
            <CameraFeed label={t("camera.secondary")} url={secondaryCameraUrl} />
          </div>
        </section>

        <section className="panel realtime-panel">
          <PanelTitle icon={<Gauge size={18} />} title={t("master.realtime")} meta={aBoardHealth?.uptimeSec ? `${Math.round(aBoardHealth.uptimeSec)}s` : "--"} />
          <div className="metric-grid">
            <Metric label={t("metrics.queueDepth")} value={aBoardHealth?.queueDepth} />
            <Metric label={t("metrics.activeCommand")} value={aBoardHealth?.activeCommand ?? "--"} code />
            <Metric label={t("metrics.requestCount")} value={aBoardHealth?.requestCount} />
            <Metric label={t("metrics.motionPending")} value={String(Boolean(aBoardHealth?.motionPending))} />
            <Metric label={t("metrics.droppedMotion")} value={aBoardHealth?.droppedMotionCount} />
            <Metric label={t("metrics.lastError")} value={aBoardHealth?.lastError ?? aBoardError ?? "--"} tone={aBoardHealth?.lastError || aBoardError ? "danger" : "neutral"} code />
          </div>
        </section>

        <section className="panel device-panel">
          <PanelTitle icon={<Network size={18} />} title={t("master.deviceStatus")} meta={`${A_BOARD_BRIDGE_PORT} / ${PI_SERVO_BRIDGE_PORT}`} />
          <div className="device-status-grid">
            <ArchitectureNode icon={<Activity size={18} />} label={t("nodes.pcWebLite")} status="127.0.0.1:5174" tone="online" />
            <ArchitectureNode icon={<Radar size={18} />} label={t("nodes.raspberryPi")} status={piHost} tone={aBoardTone === "online" || piServoTone === "online" ? "online" : "warning"} />
            <ArchitectureNode icon={<Cable size={18} />} label={t("nodes.aBoardBridge")} status={bridgeStatusText(aBoardHealth, aBoardError, t)} tone={aBoardTone} />
            <ArchitectureNode icon={<Cpu size={18} />} label={t("nodes.mcuUart")} status={aBoardHealth?.serialPort ?? "/dev/ttyAMA5"} tone={aBoardHealth?.serialOpen ? "online" : "neutral"} />
            <ArchitectureNode icon={<DatabaseZap size={18} />} label={t("nodes.canBus")} status={aBoardHealth?.canServoReady === false ? t("status.notReady") : t("status.ready")} tone={aBoardHealth?.canServoReady === false ? "warning" : "online"} />
            <ArchitectureNode icon={<Wrench size={18} />} label={t("nodes.feetechBus")} status={piServoHealth?.serialPort ?? "/dev/serial0"} tone={piServoTone} />
          </div>
        </section>

        <section className="panel log-panel">
          <PanelTitle icon={<Activity size={18} />} title={t("panels.eventLog")} meta={`${logs.length}`} />
          <LogList logs={logs} t={t} />
        </section>
      </section>
    );
  }

  function renderCanView() {
    return (
      <section className="view-grid can-view">
        <section className="panel can-group-panel">
          <PanelTitle icon={<Settings2 size={18} />} title={t("can.settingsTitle")} meta={t("can.priorityMeta", { bus: ROBOT_PROFILE.can.bus, priority: prioritySettings.canServo })} />
          <div className="servo-card-grid">
            {ROBOT_PROFILE.can.servos.map((servo) => (
              <ServoInfoCard
                active={servo.id === selectedCanServo.id}
                key={servo.id}
                title={servo.name}
                subtitle={`ID ${servo.id} · ${servo.canBus}`}
                onClick={() => selectCanServo(servo.id)}
                rows={[
                  [t("fields.minDeg"), `${servo.minDeg ?? 0}`],
                  [t("fields.maxDeg"), `${servo.maxDeg ?? 360}`],
                  [t("fields.direction"), directionLabel(servo.direction, t)],
                  [t("fields.bitrate"), `${servo.bitrateKbps ?? ROBOT_PROFILE.can.bitrateKbps} kbps`]
                ]}
              />
            ))}
          </div>
          <div className="group-angle-grid">
            {ROBOT_PROFILE.can.servos.map((servo) => (
              <label key={servo.id}>
                <span>{servo.name}</span>
                <input value={canGroupAngles[String(servo.id)] ?? String(servoLogicalCenter(servo))} onChange={(event) => updateCanGroupAngle(servo.id, event.target.value)} />
              </label>
            ))}
          </div>
          <div className="toolbar-row">
            <button className="icon-button primary" disabled={Boolean(canBusy)} onClick={() => void runCanExchange(t("actions.groupMove"), groupMoveCommand, { configureFirst: true, timeoutMs: 1600 })} type="button">
              <Network size={17} /><span>{t("actions.groupMove")}</span>
            </button>
            <button className="icon-button" disabled={Boolean(canBusy)} onClick={() => void runCanExchange(t("actions.configureCan"), () => buildAsmgMdCanConfigCommand(nextSeq(), canConfig.bitrateKbps))} type="button">
              <Send size={17} /><span>{t("actions.configureCan")}</span>
            </button>
          </div>
        </section>

        <section className="panel can-single-panel">
          <PanelTitle icon={<Shield size={18} />} title={t("can.singleTitle")} meta={selectedCanServo.name} />
          <div className="form-grid">
            <label>{t("fields.targetId")}<select value={selectedCanServo.id} onChange={(event) => selectCanServo(Number(event.target.value))}>{ROBOT_PROFILE.can.servos.map((servo) => <option key={servo.id} value={servo.id}>{servo.name} / ID{servo.id}</option>)}</select></label>
            <label>{t("fields.bitrate")}<select value={canConfig.bitrateKbps} onChange={(event) => updateCanConfig("bitrateKbps", Number(event.target.value) as AsmgMdBaudKbps)}>{baudOptions.map((baud) => <option key={baud} value={baud}>{baud} kbps</option>)}</select></label>
            <label>{t("fields.minDeg")}<input value={canConfig.minDeg} onChange={(event) => updateCanConfig("minDeg", event.target.value)} /></label>
            <label>{t("fields.maxDeg")}<input value={canConfig.maxDeg} onChange={(event) => updateCanConfig("maxDeg", event.target.value)} /></label>
            <label>{t("fields.direction")}<select value={canConfig.direction} onChange={(event) => updateCanConfig("direction", Number(event.target.value) === -1 ? -1 : 1)}><option value={1}>{t("fields.directionForward")}</option><option value={-1}>{t("fields.directionReverse")}</option></select></label>
            <label>{t("fields.positionDeg")}<input value={canConfig.positionDeg} onChange={(event) => updateCanConfig("positionDeg", event.target.value)} /></label>
            <label>{t("fields.speedRaw")}<input value={canConfig.speedRaw} onChange={(event) => updateCanConfig("speedRaw", event.target.value)} /></label>
            <label>{t("fields.currentRaw")}<input value={canConfig.currentRaw} onChange={(event) => updateCanConfig("currentRaw", event.target.value)} /></label>
            <label>{t("fields.pidP")}<input value={canConfig.pidP} onChange={(event) => updateCanConfig("pidP", event.target.value)} /></label>
            <label>{t("fields.pidI")}<input value={canConfig.pidI} onChange={(event) => updateCanConfig("pidI", event.target.value)} /></label>
            <label>{t("fields.pidD")}<input value={canConfig.pidD} onChange={(event) => updateCanConfig("pidD", event.target.value)} /></label>
            <label>{t("fields.newId")}<input value={canConfig.newId} onChange={(event) => updateCanConfig("newId", event.target.value)} /></label>
          </div>
          <div className="can-actions">
            <label className="check-row"><input checked={autoConfigureCan} onChange={(event) => setAutoConfigureCan(event.target.checked)} type="checkbox" />{t("can.autoConfigure")}</label>
            <button className="icon-button primary" disabled={Boolean(canBusy)} onClick={() => void runCanExchange(t("actions.move"), selectedMoveCommand, { configureFirst: true, timeoutMs: 1400 })} type="button"><Gauge size={17} /><span>{t("actions.move")}</span></button>
            <button className="icon-button" disabled={Boolean(canBusy)} onClick={() => void runCanExchange(t("actions.readPositionCurrent"), () => buildAsmgMdReadPositionCurrentCommand(nextSeq(), selectedCanServo.id), { configureFirst: true })} type="button"><Activity size={17} /><span>{t("actions.readPositionCurrent")}</span></button>
            <button className="icon-button" disabled={Boolean(canBusy)} onClick={() => void runCanExchange(t("actions.readPosition"), () => buildAsmgMdReadPositionCommand(nextSeq(), selectedCanServo.id), { configureFirst: true })} type="button"><Activity size={17} /><span>{t("actions.readPosition")}</span></button>
            <button className="icon-button" disabled={Boolean(canBusy)} onClick={() => void runCanExchange(t("actions.readCurrent"), () => buildAsmgMdReadCurrentCommand(nextSeq(), selectedCanServo.id), { configureFirst: true })} type="button"><Activity size={17} /><span>{t("actions.readCurrent")}</span></button>
            <button className="icon-button" disabled={Boolean(canBusy)} onClick={() => void runCanExchange(t("actions.readRawFrames"), () => buildAsmgMdCanReadCommand(nextSeq()))} type="button"><Activity size={17} /><span>{t("actions.readRawFrames")}</span></button>
            <button className="icon-button" disabled={Boolean(canBusy)} onClick={() => void runCanExchange(t("actions.setCurrent"), () => buildAsmgMdSetCurrentCommand(nextSeq(), { id: selectedCanServo.id, current: integerFromText(canConfig.currentRaw, 0) }), { configureFirst: true })} type="button"><Send size={17} /><span>{t("actions.setCurrent")}</span></button>
            <button className="icon-button" disabled={Boolean(canBusy)} onClick={() => void runCanExchange(t("actions.setPid"), () => buildAsmgMdSetPidCommand(nextSeq(), { id: selectedCanServo.id, p: integerFromText(canConfig.pidP, 16), i: integerFromText(canConfig.pidI, 0), d: integerFromText(canConfig.pidD, 0) }), { configureFirst: true })} type="button"><Send size={17} /><span>{t("actions.setPid")}</span></button>
            <button className="icon-button" disabled={Boolean(canBusy)} onClick={() => void runCanExchange(t("actions.readPid"), () => buildAsmgMdReadPidCommand(nextSeq(), selectedCanServo.id), { configureFirst: true })} type="button"><Activity size={17} /><span>{t("actions.readPid")}</span></button>
            <button className="icon-button" disabled={Boolean(canBusy)} onClick={() => void runCanExchange(t("actions.readId"), () => buildAsmgMdReadIdCommand(nextSeq()), { configureFirst: true })} type="button"><Activity size={17} /><span>{t("actions.readId")}</span></button>
            <button className="icon-button" disabled={Boolean(canBusy)} onClick={() => void runCanExchange(t("actions.setBaud"), () => buildAsmgMdSetBaudCommand(nextSeq(), { id: selectedCanServo.id, baudKbps: canConfig.bitrateKbps }), { configureFirst: true, dangerous: true })} type="button"><Shield size={17} /><span>{t("actions.writeBitrate")}</span></button>
            <button className="icon-button danger" disabled={Boolean(canBusy)} onClick={() => void runCanExchange(t("actions.setId"), () => buildAsmgMdSetIdCommand(nextSeq(), integerFromText(canConfig.newId, selectedCanServo.id)), { configureFirst: true, dangerous: true })} type="button"><Shield size={17} /><span>{t("actions.writeId")}</span></button>
            <button className="icon-button danger" disabled={Boolean(canBusy)} onClick={() => void runCanExchange(t("actions.saveCenter"), () => buildAsmgMdSaveCenterCommand(nextSeq(), { id: selectedCanServo.id, ratio: centerPercentToRatio(canConfig.centerPercent) }), { configureFirst: true, dangerous: true })} type="button"><Shield size={17} /><span>{t("actions.saveCenter")}</span></button>
            <button className="icon-button danger" disabled={Boolean(canBusy)} onClick={() => void runCanExchange(t("actions.factoryReset"), () => buildAsmgMdFactoryResetCommand(nextSeq(), selectedCanServo.id), { configureFirst: true, dangerous: true })} type="button"><Shield size={17} /><span>{t("actions.factoryReset")}</span></button>
            <label className="danger-confirm">{t("fields.dangerConfirm")}<input value={canConfig.dangerConfirm} onChange={(event) => updateCanConfig("dangerConfirm", event.target.value)} placeholder={t("placeholders.dangerConfirm", { id: canConfig.targetId })} /></label>
            <label>{t("fields.centerPercent")}<input value={canConfig.centerPercent} onChange={(event) => updateCanConfig("centerPercent", event.target.value)} /></label>
          </div>
          {canBusy && <p className="inline-status"><Send size={14} /><span>{t("can.busy", { action: canBusy })}</span></p>}
          {canError && <p className="form-error">{canError}</p>}
        </section>

        <section className="panel can-result-panel">
          <PanelTitle icon={<Activity size={18} />} title={t("can.resultTitle")} meta={lastCanExchange?.label ?? "--"} />
          <div className="metric-grid">
            <Metric label={t("can.lastCommand")} value={lastCanExchange?.label ?? "--"} />
            <Metric label={t("metrics.ok")} value={lastCanExchange ? String(lastCanExchange.result.ok !== false) : "--"} tone={lastCanExchange?.result.ok === false ? "danger" : "neutral"} />
            <Metric label={t("metrics.parsedKind")} value={latestParsed?.kind ?? "--"} />
            <Metric label={t("metrics.servoId")} value={latestParsed?.servoId ?? "--"} />
            <Metric label={t("metrics.positionRaw")} value={latestParsed?.position ?? latestParsed?.currentPosition ?? "--"} />
            <Metric label={t("metrics.currentRaw")} value={latestParsed?.current ?? latestParsed?.currentTorque ?? "--"} />
          </div>
        </section>
      </section>
    );
  }

  function renderFeetechView() {
    const selectedId = readTargetId(feetechConfig.targetId);
    return (
      <section className="view-grid feetech-view">
        <section className="panel">
          <PanelTitle icon={<Wrench size={18} />} title={t("feetech.title")} meta={`${ROBOT_PROFILE.feetech.busBaudRate} baud`} />
          <div className="servo-card-grid">
            {ROBOT_PROFILE.feetech.servos.map((servo) => (
              <ServoInfoCard
                active={servo.id === selectedId}
                key={servo.id}
                title={servo.name}
                subtitle={`ID ${servo.id} · Feetech`}
                onClick={() => setFeetechConfig((current) => ({ ...current, targetId: String(servo.id) }))}
                rows={[
                  [t("fields.minDeg"), `${servo.minDeg ?? 0}`],
                  [t("fields.maxDeg"), `${servo.maxDeg ?? 360}`],
                  [t("fields.direction"), directionLabel(servo.direction, t)],
                  [t("feetech.bridgeBaud"), `${ROBOT_PROFILE.feetech.bridgeBaudRate}`]
                ]}
              />
            ))}
          </div>
        </section>
        <section className="panel">
          <PanelTitle icon={<Send size={18} />} title={t("feetech.commandTitle")} meta={bridgeBaseUrl(piHost, PI_SERVO_BRIDGE_PORT)} />
          <div className="form-grid">
            <label>{t("fields.targetId")}<input value={feetechConfig.targetId} onChange={(event) => setFeetechConfig((current) => ({ ...current, targetId: event.target.value }))} /></label>
            <label>{t("fields.positionDeg")}<input value={feetechConfig.angleDeg} onChange={(event) => setFeetechConfig((current) => ({ ...current, angleDeg: event.target.value }))} /></label>
            <label>{t("fields.speedRaw")}<input value={feetechConfig.speedRaw} onChange={(event) => setFeetechConfig((current) => ({ ...current, speedRaw: event.target.value }))} /></label>
            <label>{t("fields.acc")}<input value={feetechConfig.acc} onChange={(event) => setFeetechConfig((current) => ({ ...current, acc: event.target.value }))} /></label>
            <label className="check-row"><input checked={feetechConfig.torqueEnabled} onChange={(event) => setFeetechConfig((current) => ({ ...current, torqueEnabled: event.target.checked }))} type="checkbox" />{t("fields.torqueEnabled")}</label>
          </div>
          <div className="toolbar-row">
            <button className="icon-button" disabled={Boolean(feetechBusy)} onClick={() => void runFeetechExchange(t("actions.ping"), () => ({ type: "servo.ping", seq: nextSeq(), id: selectedId }))} type="button"><Radar size={17} /><span>{t("actions.ping")}</span></button>
            <button className="icon-button" disabled={Boolean(feetechBusy)} onClick={() => void runFeetechExchange(t("actions.readFeedback"), () => ({ type: "servo.read", seq: nextSeq(), id: selectedId }))} type="button"><Activity size={17} /><span>{t("actions.readFeedback")}</span></button>
            <button className="icon-button" disabled={Boolean(feetechBusy)} onClick={() => void runFeetechExchange(t("actions.torque"), () => ({ type: "servo.torque", seq: nextSeq(), id: selectedId, enabled: feetechConfig.torqueEnabled }))} type="button"><Shield size={17} /><span>{t("actions.torque")}</span></button>
            <button className="icon-button primary" disabled={Boolean(feetechBusy)} onClick={() => void runFeetechExchange(t("actions.move"), () => ({
              type: "servo.move",
              seq: nextSeq(),
              targets: [{ id: selectedId, angleDeg: numberFromText(feetechConfig.angleDeg, 0), speedRaw: integerFromText(feetechConfig.speedRaw, 300), acc: integerFromText(feetechConfig.acc, 30) }]
            }))} type="button"><Gauge size={17} /><span>{t("actions.move")}</span></button>
          </div>
          {feetechBusy && <p className="inline-status"><Send size={14} /><span>{t("can.busy", { action: feetechBusy })}</span></p>}
          {feetechError && <p className="form-error">{feetechError}</p>}
        </section>
        <section className="panel">
          <PanelTitle icon={<Activity size={18} />} title={t("feetech.resultTitle")} meta={lastFeetechExchange?.label ?? "--"} />
          <div className="metric-grid">
            <Metric label={t("can.lastCommand")} value={lastFeetechExchange?.label ?? "--"} />
            <Metric label={t("metrics.ok")} value={lastFeetechExchange ? String(lastFeetechExchange.result.ok !== false) : "--"} tone={lastFeetechExchange?.result.ok === false ? "danger" : "neutral"} />
            <Metric label={t("metrics.protocol")} value={lastFeetechExchange?.result.protocol ?? "--"} />
            <Metric label={t("metrics.messageCount")} value={lastFeetechExchange?.result.messages.length ?? "--"} />
            <Metric label={t("metrics.serialPort")} value={lastFeetechExchange?.result.serialPort ?? "--"} code />
            <Metric label={t("metrics.baudRate")} value={lastFeetechExchange?.result.baudRate ?? "--"} />
          </div>
        </section>
      </section>
    );
  }

  function renderPwmView() {
    return (
      <section className="view-grid pwm-view">
        <section className="panel">
          <PanelTitle icon={<SlidersHorizontal size={18} />} title={t("pwm.title")} meta="S / T / U / V" />
          <div className="servo-card-grid">
            {ROBOT_PROFILE.pwmServos.map((servo) => (
              <ServoInfoCard
                active={servo.id === selectedPwmServo?.id}
                key={servo.id}
                title={servo.name}
                subtitle={`${servo.silk} · ${servo.pin}`}
                onClick={() => {
                  setSelectedPwmServoId(servo.id);
                  setPwmPulseUs(String(servo.centerPulseUs));
                }}
                rows={[
                  [t("fields.frequency"), `${servo.frequencyHz} Hz`],
                  [t("fields.minPulse"), `${servo.minPulseUs} us`],
                  [t("fields.centerPulse"), `${servo.centerPulseUs} us`],
                  [t("fields.maxPulse"), `${servo.maxPulseUs} us`]
                ]}
              />
            ))}
          </div>
        </section>
        <section className="panel">
          <PanelTitle icon={<Settings2 size={18} />} title={t("pwm.commandTitle")} meta={selectedPwmServo?.pin ?? "--"} />
          <div className="form-grid">
            <label>{t("fields.pwmServo")}<select value={selectedPwmServo?.id ?? ""} onChange={(event) => setSelectedPwmServoId(event.target.value)}>{ROBOT_PROFILE.pwmServos.map((servo) => <option key={servo.id} value={servo.id}>{servo.name}</option>)}</select></label>
            <label>{t("fields.pulseUs")}<input value={pwmPulseUs} onChange={(event) => setPwmPulseUs(event.target.value)} /></label>
            <label>{t("fields.frequency")}<input readOnly value={selectedPwmServo?.frequencyHz ?? "--"} /></label>
            <label>{t("fields.pin")}<input readOnly value={selectedPwmServo ? `${selectedPwmServo.silk} / ${selectedPwmServo.pin}` : "--"} /></label>
          </div>
          <p className="inline-note">{t("pwm.note")}</p>
        </section>
        <section className="panel">
          <PanelTitle icon={<Gauge size={18} />} title={t("pwm.motorStatusTitle")} meta="M1-M4" />
          <div className="compact-table">
            {ROBOT_PROFILE.motors.map((motor) => (
              <div className="compact-row" key={motor.channel}>
                <strong>{motor.channel}</strong>
                <span>{motor.name}</span>
                <code>{motor.pwmPin ?? "--"} / {motor.in1Pin ?? "--"} / {motor.in2Pin ?? "--"}</code>
              </div>
            ))}
          </div>
        </section>
      </section>
    );
  }

  function renderGamepadView() {
    return (
      <section className="view-grid gamepad-view">
        <section className="panel">
          <PanelTitle icon={<Gamepad2 size={18} />} title={t("gamepad.title")} meta={activeGamepad ? `#${activeGamepad.index}` : t("gamepad.noGamepad")} />
          <div className="form-grid">
            <label>{t("fields.gamepad")}<select value={activeGamepadIndex ?? ""} onChange={(event) => setActiveGamepadIndex(event.target.value === "" ? null : Number(event.target.value))}>
              <option value="">{t("gamepad.auto")}</option>
              {gamepads.map((gamepad) => <option key={gamepad.index} value={gamepad.index}>#{gamepad.index} {gamepad.id}</option>)}
            </select></label>
            <label>{t("fields.gamepadPreset")}<select value={gamepadPreset} onChange={(event) => applyGamepadPreset(event.target.value as Exclude<GamepadPresetId, "auto">)}>{gamepadPresetOptions.map((preset) => <option key={preset} value={preset}>{t(`gamepad.presets.${preset}`)}</option>)}</select></label>
            <label>{t("fields.deadzone")}<input min={0} max={0.9} step={0.01} type="range" value={gamepadMapping.deadzone} onChange={(event) => setGamepadMapping((current) => normalizeGamepadMapping({ ...current, deadzone: Number(event.target.value) }))} /></label>
          </div>
          <div className="metric-grid">
            <Metric label={t("metrics.connected")} value={String(Boolean(activeGamepad))} tone={activeGamepad ? "online" : "warning"} />
            <Metric label={t("metrics.axes")} value={activeGamepad?.axes ?? "--"} />
            <Metric label={t("metrics.buttons")} value={activeGamepad?.buttons ?? "--"} />
            <Metric label={t("metrics.mapping")} value={activeGamepad?.mapping ?? "--"} />
          </div>
          <div className="gamepad-live-grid">
            {(["forward", "strafe", "turn", "cameraPan", "cameraTilt"] as const).map((key) => <AxisBar key={key} label={t(`gamepad.input.${key}`)} value={gamepadInput[key]} />)}
            <Metric label={t("gamepad.input.stop")} value={String(gamepadInput.stop)} tone={gamepadInput.stop ? "danger" : "neutral"} />
          </div>
        </section>
        <section className="panel">
          <PanelTitle icon={<SlidersHorizontal size={18} />} title={t("gamepad.axisMapping")} />
          <div className="mapping-grid">
            {(["forward", "strafe", "turn"] as GamepadAxisKey[]).map((axis) => (
              <label className="mapping-row" key={axis}>
                <span>{t(`gamepad.input.${axis}`)}</span>
                <input min={0} max={31} type="number" value={gamepadMapping.axes[axis].index} onChange={(event) => updateGamepadAxis(axis, "index", event.target.value)} />
                <label className="check-row"><input checked={gamepadMapping.axes[axis].invert} onChange={(event) => updateGamepadAxis(axis, "invert", event.target.checked)} type="checkbox" />{t("fields.invert")}</label>
              </label>
            ))}
          </div>
        </section>
        <section className="panel">
          <PanelTitle icon={<Gamepad2 size={18} />} title={t("gamepad.buttonMapping")} />
          <div className="mapping-grid button-mapping-grid">
            {(Object.keys(gamepadMapping.buttons) as GamepadButtonKey[]).map((button) => (
              <label className="mapping-row" key={button}>
                <span>{t(`gamepad.input.${button}`)}</span>
                <input min={0} max={31} type="number" value={gamepadMapping.buttons[button]} onChange={(event) => updateGamepadButton(button, event.target.value)} />
              </label>
            ))}
          </div>
        </section>
      </section>
    );
  }

  function renderSettingsView() {
    return (
      <section className="view-grid settings-view">
        <section className="panel">
          <PanelTitle icon={<Radar size={18} />} title={t("panels.piDiscovery")} meta={recommended?.candidate.host ?? t("common.manual")} />
          <div className="host-row">
            <input value={manualHost} onChange={(event) => setManualHost(event.target.value)} placeholder={t("placeholders.piHost")} />
            <button className="icon-button primary" onClick={() => applyHost(manualHost)} type="button"><Save size={17} /><span>{t("actions.apply")}</span></button>
            <button className="icon-button" disabled={discoveryBusy} onClick={() => void scanPiHosts()} type="button"><Radar size={17} /><span>{discoveryBusy ? t("actions.searchBusy") : t("actions.search")}</span></button>
            <button className="icon-button" disabled={healthBusy} onClick={() => void refreshHealth()} type="button"><RotateCw size={17} /><span>{healthBusy ? t("common.checking") : t("actions.check")}</span></button>
          </div>
          <div className="discovery-list">
            {discoveryResults.length === 0 ? (
              <p className="empty-state">{t("empty.noDiscovery")}</p>
            ) : discoveryResults.map((result) => (
              <div className="discovery-row" data-status={result.status} key={`${result.candidate.source}:${result.candidate.host}`}>
                <div>
                  <strong>{result.candidate.host}</strong>
                  <span>{candidateSourceLabel(result.candidate.source, t)} · {t("common.score")} {result.score}</span>
                </div>
                <div className="service-strip">
                  {result.services.map((service) => <span data-status={service.status} key={service.id} title={serviceLabel(service.id, t)}>{service.port}</span>)}
                </div>
                <button className="icon-button" disabled={result.status === "offline"} onClick={() => applyHost(result.candidate.host)} type="button"><Save size={15} /><span>{t("actions.use")}</span></button>
              </div>
            ))}
          </div>
        </section>
        <section className="panel">
          <PanelTitle icon={<SlidersHorizontal size={18} />} title={t("priority.title")} meta={t("priority.meta")} />
          <div className="priority-list">
            {PRIORITY_FIELDS.map((field) => (
              <label className="priority-row" key={field.key}>
                <span><strong>{t(field.labelKey)}</strong><small>{t(field.detailKey)}</small></span>
                <input type="number" min={0} max={1000} value={prioritySettings[field.key]} onChange={(event) => updatePriority(field.key, event.target.value)} />
              </label>
            ))}
          </div>
          <button className="icon-button" onClick={resetPriorities} type="button"><RotateCw size={17} /><span>{t("actions.restoreDefaults")}</span></button>
        </section>
        <section className="panel">
          <PanelTitle icon={<Cable size={18} />} title={t("bridge.title")} meta={bridgeBaseUrl(piHost, A_BOARD_BRIDGE_PORT)} />
          <div className="metric-grid">
            <Metric label={t("metrics.aBoardSerial")} value={aBoardHealth?.serialOpen ? t("status.open") : t("status.closed")} tone={aBoardTone} />
            <Metric label={t("metrics.aBoardPort")} value={aBoardHealth?.serialPort ?? "/dev/ttyAMA5"} code />
            <Metric label={t("bridge.serialProtocol")} value={aBoardHealth?.serialProtocolActive ?? "--"} />
            <Metric label={t("metrics.piServoSerial")} value={piServoHealth?.serialOpen ? t("status.open") : t("status.closed")} tone={piServoTone} />
            <Metric label={t("metrics.piServoPort")} value={piServoHealth?.serialPort ?? "/dev/serial0"} code />
            <Metric label={t("metrics.binaryReady")} value={String(Boolean(aBoardHealth?.binaryProtocolReady || piServoHealth?.binaryProtocolReady))} />
          </div>
        </section>
        <section className="panel">
          <PanelTitle icon={<Settings2 size={18} />} title={t("settings.fixedProfile")} meta={ROBOT_PROFILE.name} />
          <div className="compact-table">
            <div className="compact-row"><strong>PC</strong><span>Web-Lite</span><code>5174</code></div>
            <div className="compact-row"><strong>Pi</strong><span>{piHost}</span><code>{A_BOARD_BRIDGE_PORT} / {PI_SERVO_BRIDGE_PORT}</code></div>
            <div className="compact-row"><strong>CAN</strong><span>{ROBOT_PROFILE.can.servos.length} ASMG-MD</span><code>{ROBOT_PROFILE.can.bus} / {ROBOT_PROFILE.can.bitrateKbps}</code></div>
            <div className="compact-row"><strong>Feetech</strong><span>{ROBOT_PROFILE.feetech.servos.map((servo) => `ID${servo.id}`).join(", ")}</span><code>{ROBOT_PROFILE.feetech.busBaudRate}</code></div>
          </div>
        </section>
      </section>
    );
  }

  const navItems: Array<{ id: ViewId; label: string; icon: ReactNode }> = [
    { id: "control", label: t("nav.control"), icon: <Home size={16} /> },
    { id: "can", label: t("nav.can"), icon: <DatabaseZap size={16} /> },
    { id: "feetech", label: t("nav.feetech"), icon: <Wrench size={16} /> },
    { id: "pwm", label: t("nav.pwm"), icon: <SlidersHorizontal size={16} /> },
    { id: "gamepad", label: t("nav.gamepad"), icon: <Gamepad2 size={16} /> },
    { id: "settings", label: t("nav.settings"), icon: <Settings2 size={16} /> }
  ];

  return (
    <main className="app-shell">
      <header className="topbar glass-surface">
        <div className="brand-block">
          <div className="brand-mark">RR</div>
          <div className="brand-copy">
            <p className="eyebrow">{t("app.eyebrow")}</p>
            <h1>{t("app.title")}</h1>
            <p className="system-line">{t("app.subtitle")}</p>
          </div>
        </div>
        <div className="topbar-status-area">
          <StatusPill label="Pi" value={piHost} tone={aBoardTone === "online" || piServoTone === "online" ? "online" : "warning"} />
          <StatusPill label="A-board" value={aBoardHealth?.serialOpen ? t("status.bridgeOnline") : aBoardError ?? t("common.checking")} tone={aBoardTone} />
          <StatusPill label="Pi servo" value={piServoHealth?.serialOpen ? t("status.bridgeOnline") : piServoError ?? t("status.standby")} tone={piServoTone} />
          <label className="language-control">
            <span>{t("language.label")}</span>
            <select aria-label={t("language.label")} value={currentLanguage} onChange={(event) => changeLanguage(event.target.value)}>
              {SUPPORTED_LANGUAGES.map((language) => <option key={language} value={language}>{LANGUAGE_LABELS[language]}</option>)}
            </select>
          </label>
        </div>
      </header>

      <nav className="view-tabs" aria-label={t("nav.label")}>
        {navItems.map((item) => (
          <button className={item.id === activeView ? "active" : ""} key={item.id} onClick={() => setActiveView(item.id)} type="button">
            {item.icon}<span>{item.label}</span>
          </button>
        ))}
      </nav>

      {activeView === "control" && renderControlView()}
      {activeView === "can" && renderCanView()}
      {activeView === "feetech" && renderFeetechView()}
      {activeView === "pwm" && renderPwmView()}
      {activeView === "gamepad" && renderGamepadView()}
      {activeView === "settings" && renderSettingsView()}
    </main>
  );
}

function PanelTitle({ icon, meta, title }: { icon: ReactNode; meta?: string; title: string }) {
  return (
    <div className="panel-title">
      <div className="panel-title-main">{icon}<h2>{title}</h2></div>
      {meta && <span className="panel-meta">{meta}</span>}
    </div>
  );
}

function StatusPill({ label, tone, value }: { label: string; tone: Tone; value: string }) {
  return (
    <div className={`status-pill ${tone}`}>
      <span className="status-led" />
      <small>{label}</small>
      <strong>{value}</strong>
    </div>
  );
}

function ArchitectureNode({ icon, label, status, tone }: { icon: ReactNode; label: string; status: string; tone: Tone }) {
  return (
    <div className={`architecture-node ${tone}`}>
      {icon}
      <span>{label}</span>
      <strong>{status}</strong>
    </div>
  );
}

function Metric({ code = false, label, tone = "neutral", value }: { code?: boolean; label: string; tone?: Tone; value: unknown }) {
  const display = value === undefined || value === null || value === "" ? "--" : String(value);
  return (
    <div className={`metric ${tone}`}>
      <span>{label}</span>
      {code ? <code>{display}</code> : <strong>{display}</strong>}
    </div>
  );
}

function CameraFeed({ label, url }: { label: string; url: string }) {
  return (
    <div className="camera-feed">
      <img alt={label} src={url} />
      <div>
        <strong>{label}</strong>
        <code>{url}</code>
      </div>
    </div>
  );
}

function ServoInfoCard({ active, onClick, rows, subtitle, title }: { active?: boolean; onClick?: () => void; rows: Array<[string, string]>; subtitle: string; title: string }) {
  return (
    <button className={`servo-info-card ${active ? "active" : ""}`} onClick={onClick} type="button">
      <span>
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </span>
      <div>
        {rows.map(([label, value]) => (
          <span key={label}><small>{label}</small><code>{value}</code></span>
        ))}
      </div>
    </button>
  );
}

function AxisBar({ label, value }: { label: string; value: number }) {
  const percent = Math.max(0, Math.min(100, 50 + value * 50));
  return (
    <div className="axis-bar">
      <span>{label}</span>
      <div><i style={{ left: `${percent}%` }} /></div>
      <strong>{value.toFixed(2)}</strong>
    </div>
  );
}

function LogList({ logs, t }: { logs: LogEntry[]; t: TFunction }) {
  return (
    <div className="log-list">
      {logs.length === 0 ? <div className="empty-state">{t("empty.noLogs")}</div> : logs.map((log) => (
        <div className={`log-entry ${log.direction} ${log.level ?? "info"}`} key={log.id}>
          <span>{log.direction.toUpperCase()}</span>
          <code>{log.text}</code>
        </div>
      ))}
    </div>
  );
}

function readCanConfig() {
  const firstServo = ROBOT_PROFILE.can.servos[0];
  const fallback = {
    targetId: String(firstServo?.id ?? 1),
    bitrateKbps: ROBOT_PROFILE.can.bitrateKbps,
    minDeg: String(firstServo?.minDeg ?? 0),
    maxDeg: String(firstServo?.maxDeg ?? 360),
    direction: (firstServo?.direction === -1 ? -1 : 1) as 1 | -1,
    positionDeg: "90",
    speedRaw: String(ASMG_MD_SPEED_MAX),
    currentRaw: "50",
    pidP: "16",
    pidI: "0",
    pidD: "0",
    newId: String(firstServo?.id ?? 1),
    centerPercent: "100",
    dangerConfirm: ""
  };
  try {
    const raw = window.localStorage.getItem(CAN_CONFIG_STORAGE_KEY);
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw) as Partial<typeof fallback>;
    return {
      ...fallback,
      ...parsed,
      bitrateKbps: baudOptions.includes(Number(parsed.bitrateKbps) as AsmgMdBaudKbps) ? Number(parsed.bitrateKbps) as AsmgMdBaudKbps : fallback.bitrateKbps,
      direction: parsed.direction === -1 ? -1 : 1
    };
  } catch {
    window.localStorage.removeItem(CAN_CONFIG_STORAGE_KEY);
    return fallback;
  }
}

function readCanGroupAngles(): Record<string, string> {
  const fallback = Object.fromEntries(ROBOT_PROFILE.can.servos.map((servo) => [String(servo.id), String(servoLogicalCenter(servo))]));
  try {
    const raw = window.localStorage.getItem(CAN_GROUP_STORAGE_KEY);
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    return Object.fromEntries(ROBOT_PROFILE.can.servos.map((servo) => {
      const value = parsed[String(servo.id)];
      return [String(servo.id), typeof value === "string" && value.trim() ? value : fallback[String(servo.id)]];
    }));
  } catch {
    window.localStorage.removeItem(CAN_GROUP_STORAGE_KEY);
    return fallback;
  }
}

function readGamepadMapping(): GamepadMapping {
  try {
    const raw = window.localStorage.getItem(GAMEPAD_STORAGE_KEY);
    return raw ? normalizeGamepadMapping(JSON.parse(raw)) : normalizeGamepadMapping(DEFAULT_INPUT_MAPPING.gamepad);
  } catch {
    window.localStorage.removeItem(GAMEPAD_STORAGE_KEY);
    return normalizeGamepadMapping(DEFAULT_INPUT_MAPPING.gamepad);
  }
}

function readStoredString(key: string, fallback: string): string {
  try {
    const value = window.localStorage.getItem(key);
    return value?.trim() || fallback;
  } catch {
    return fallback;
  }
}

function readTargetId(value: string): number {
  const id = integerFromText(value, 1);
  return Math.max(0, Math.min(253, id));
}

function integerFromText(value: string, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number) : fallback;
}

function numberFromText(value: string, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function centerPercentToRatio(value: string): number {
  const percent = Math.max(0, Math.min(100, numberFromText(value, 100)));
  return Math.round((percent / 100) * ASMG_MD_CENTER_RATIO_MAX);
}

function servoLogicalCenter(servo: AsmgMdServoProfile): number {
  return ((servo.maxDeg ?? 360) - (servo.minDeg ?? 0)) / 2;
}

function canServoProfileFromConfig(servo: AsmgMdServoProfile, config: ReturnType<typeof readCanConfig>): AsmgMdServoProfile {
  return normalizeAsmgMdServoProfile({
    ...servo,
    id: readTargetId(config.targetId),
    name: servo.name,
    minDeg: numberFromText(config.minDeg, servo.minDeg ?? 0),
    maxDeg: numberFromText(config.maxDeg, servo.maxDeg ?? 360),
    direction: config.direction === -1 ? -1 : 1,
    bitrateKbps: config.bitrateKbps,
    canBus: ROBOT_PROFILE.can.bus
  });
}

function bridgeTone(health: BridgeHealth | null, error: string | null): Tone {
  if (error) return "danger";
  if (health?.ok && health.serialOpen !== false) return "online";
  if (health) return "warning";
  return "neutral";
}

function bridgeStatusText(health: BridgeHealth | null, error: string | null, t: TFunction): string {
  if (error) return error;
  if (!health) return t("status.notChecked");
  if (health.ok && health.serialOpen !== false) return t("status.online");
  return t("status.reachableSerialClosed");
}

function candidateSourceLabel(source: PiDiscoverySource, t: TFunction): string {
  const keyBySource: Record<PiDiscoverySource, string> = {
    "manual-usb-fallback": "sources.manualUsbFallback",
    "mdns": "sources.mdns",
    "saved": "sources.saved",
    "usb-gadget-fallback": "sources.usbGadgetFallback",
    "usb-gadget-hostname": "sources.usbGadgetHostname"
  };
  return t(keyBySource[source]);
}

function serviceLabel(id: string, t: TFunction): string {
  const keyByService: Record<string, string> = {
    aBoardBridge: "services.aBoardBridge",
    mainCamera: "services.mainCamera",
    piServoBridge: "services.piServoBridge",
    secondaryCamera: "services.secondaryCamera"
  };
  return t(keyByService[id] ?? id);
}

function directionLabel(direction: number | undefined, t: TFunction): string {
  return direction === -1 ? t("fields.directionReverse") : t("fields.directionForward");
}

function zeroGamepadInput(): GamepadLiveInput {
  return { forward: 0, strafe: 0, turn: 0, cameraPan: 0, cameraTilt: 0, stop: false };
}

function readGamepadInput(gamepad: Gamepad | null, mapping: GamepadMapping): GamepadLiveInput {
  if (!gamepad) {
    return zeroGamepadInput();
  }
  return {
    forward: readMappedAxis(gamepad, mapping.axes.forward, mapping.deadzone),
    strafe: readMappedAxis(gamepad, mapping.axes.strafe, mapping.deadzone),
    turn: readMappedAxis(gamepad, mapping.axes.turn, mapping.deadzone),
    cameraPan: readButtonAxis(gamepad, mapping.buttons.cameraRight, mapping.buttons.cameraLeft),
    cameraTilt: readButtonAxis(gamepad, mapping.buttons.cameraUp, mapping.buttons.cameraDown),
    stop: Boolean(gamepad.buttons[mapping.buttons.stop]?.pressed)
  };
}

function readMappedAxis(gamepad: Gamepad, axis: GamepadMapping["axes"][GamepadAxisKey], deadzone: number): number {
  const raw = gamepad.axes[axis.index] ?? 0;
  const value = axis.invert ? -raw : raw;
  return Math.abs(value) < deadzone ? 0 : Number(value.toFixed(2));
}

function readButtonAxis(gamepad: Gamepad, positive: number, negative: number): number {
  return (gamepad.buttons[positive]?.pressed ? 1 : 0) - (gamepad.buttons[negative]?.pressed ? 1 : 0);
}

function errorMessage(error: unknown, t: TFunction): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return t("errors.unknown");
}
