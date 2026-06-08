import type { FirmwarePort } from "@adapters/firmware/firmwareUpload";
import type { InboundMessage } from "@adapters/hardware/protocol";
import { normalizeMotorChannel } from "@adapters/hardware/protocol";
import type { DeviceCatalogItem, DeviceConfig, PluginInstance } from "@platform/architecture";
import type { CapabilityId, DeviceCapability } from "@platform/types";
import type { LocalCameraDevice } from "@domains/camera/localCamera";
import { ASMG_MD_DEFAULT_BITRATE_KBPS, parseAsmgMdCanFrame } from "@adapters/hardware/asmgMdCanServo";

export type DetectionCandidateSource =
  | "serial-port"
  | "feetech-servo"
  | "motor-controller"
  | "can-servo"
  | "local-camera"
  | "gamepad"
  | "raspberry-pi";

export type DetectedPluginConfidence = "high" | "medium" | "low";
export type DetectedPluginCandidateStatus = "candidate" | "created" | "skipped" | "failed";

export interface DetectedPluginCandidate {
  id: string;
  name: string;
  type: CapabilityId;
  catalogItemId: string | null;
  brand: string;
  model: string;
  driverId: string;
  transportId: string;
  capabilities: DeviceCapability[];
  config: DeviceConfig;
  tags: string[];
  confidence: DetectedPluginConfidence;
  source: DetectionCandidateSource;
  status: DetectedPluginCandidateStatus;
  message?: string;
}

export interface DetectionRunResult {
  created: PluginInstance[];
  skipped: DetectedPluginCandidate[];
  failed: DetectedPluginCandidate[];
  candidates: DetectedPluginCandidate[];
  logs: string[];
}

export interface PluginAutoAddDependencies {
  createPluginInstance: (projectId: string, pluginInstance: Partial<PluginInstance>) => Promise<PluginInstance>;
  updatePluginInstance: (projectId: string, pluginInstanceId: string, pluginInstance: Partial<PluginInstance>) => Promise<PluginInstance>;
}

export interface PluginAutoAddOptions {
  nowMs?: number;
  shouldContinue?: () => boolean;
}

export interface GamepadDetectionSummary {
  index: number;
  id: string;
  axes: number;
  buttons: number;
  mapping: string;
}

export interface PiDetectionProfile {
  host: string;
  username: string;
  workspaceDir: string;
}

export const DETECTED_DEVICE_ID_CONFIG_KEY = "detectedDeviceId";

const CATALOG_FEETECH_SERVO = "catalog.feetech.sts3215";
const CATALOG_ASME_CAN_SERVO = "catalog.asme.asme-se-can-servo";
const CATALOG_TB6618_MOTOR = "catalog.toshiba.tb6618-motor";
const CATALOG_BROWSER_CAMERA = "catalog.browser.local-camera";
const CATALOG_BROWSER_GAMEPAD = "catalog.browser.gamepad";

export function detectedDeviceIdFromParts(prefix: string, parts: Array<string | number | boolean | null | undefined>): string {
  return [stableToken(prefix), ...parts.map(stableToken).filter(Boolean)].join(":");
}

export function candidatesFromFirmwarePorts(ports: FirmwarePort[], nowMs = Date.now()): DetectedPluginCandidate[] {
  return ports.map((port, index) => {
    const profile = classifyFirmwarePort(port);
    const fingerprint = port.hwid.trim() || `${port.path}:${port.description || "serial"}`;
    return createCandidate({
      name: `${profile.model} ${port.path}`,
      type: "firmware",
      catalogItemId: null,
      brand: profile.brand,
      model: profile.model,
      driverId: "driver.local-firmware-helper",
      transportId: "transport.local-helper",
      capabilities: [{ id: "firmware", features: ["serial_port_scan", "firmware_upload"] }],
      config: {
        detectedDeviceId: detectedDeviceIdFromParts("serial", [fingerprint]),
        detectedAt: nowMs,
        detectedSource: "serial-port",
        scanSignature: portSignature(port),
        portPath: port.path,
        portDescription: port.description,
        portHwid: port.hwid,
        baudRate: 115200
      },
      tags: uniqueStrings(["auto-detected", "serial", "firmware", ...profile.tags]),
      confidence: profile.confidence,
      source: "serial-port",
      message: port.description || port.hwid || `Serial port ${index + 1}`
    });
  });
}

export function candidatesFromLocalCameras(devices: LocalCameraDevice[], nowMs = Date.now()): DetectedPluginCandidate[] {
  return devices.map((device, index) => createCandidate({
    name: device.label || `USB Camera ${index + 1}`,
    type: "camera",
    catalogItemId: CATALOG_BROWSER_CAMERA,
    brand: "Browser",
    model: "Local Camera",
    driverId: "driver.browser-camera",
    transportId: "transport.browser-media",
    capabilities: [{ id: "camera", features: ["local_media_stream", "browser_camera"] }],
    config: {
      detectedDeviceId: detectedDeviceIdFromParts("camera", [device.deviceId || device.label || index]),
      detectedAt: nowMs,
      detectedSource: "local-camera",
      scanSignature: stableToken(`${device.deviceId}:${device.label}`),
      preferredDeviceId: device.deviceId,
      width: 640,
      height: 480,
      fps: 30
    },
    tags: ["auto-detected", "camera", "browser", "local", "usb", "webcam"],
    confidence: device.deviceId ? "high" : "medium",
    source: "local-camera",
    message: device.deviceId || "Browser did not expose a stable camera id"
  }));
}

export function candidatesFromGamepads(gamepads: GamepadDetectionSummary[], nowMs = Date.now()): DetectedPluginCandidate[] {
  return gamepads.map((gamepad) => createCandidate({
    name: gamepad.id ? `Gamepad ${gamepad.id}` : `Gamepad ${gamepad.index}`,
    type: "gamepad",
    catalogItemId: CATALOG_BROWSER_GAMEPAD,
    brand: "Browser",
    model: "Gamepad API",
    driverId: "driver.browser-gamepad",
    transportId: "transport.browser-gamepad-api",
    capabilities: [{ id: "gamepad", features: ["drive_input", "camera_gimbal_input", "button_mapping", "live_axes"] }],
    config: {
      detectedDeviceId: detectedDeviceIdFromParts("gamepad", [gamepad.index, gamepad.id || "unknown"]),
      detectedAt: nowMs,
      detectedSource: "gamepad",
      scanSignature: stableToken(`${gamepad.index}:${gamepad.id}:${gamepad.mapping}:${gamepad.axes}:${gamepad.buttons}`),
      preferredIndex: gamepad.index,
      preset: "auto",
      gamepadId: gamepad.id,
      mapping: gamepad.mapping || "unknown"
    },
    tags: ["auto-detected", "gamepad", "browser", "input"],
    confidence: gamepad.id ? "high" : "medium",
    source: "gamepad",
    message: `${gamepad.axes} axes / ${gamepad.buttons} buttons`
  }));
}

export function candidatesFromServoFeedback(feedbackById: Record<string | number, { id?: number }>, nowMs = Date.now()): DetectedPluginCandidate[] {
  return Object.entries(feedbackById)
    .map(([key, feedback]) => {
      const servoId = numberOrNull(feedback?.id) ?? numberOrNull(key);
      if (servoId === null || servoId < 0 || servoId > 253) {
        return null;
      }
      return createCandidate({
        name: `Servo ID ${servoId}`,
        type: "servo",
        catalogItemId: CATALOG_FEETECH_SERVO,
        brand: "Feetech",
        model: "STS3215",
        driverId: "driver.feetech-servo",
        transportId: "transport.web-serial",
        capabilities: [{ id: "servo", features: ["position_control", "wheel_speed_control", "torque_control", "feedback"] }],
        config: {
          detectedDeviceId: detectedDeviceIdFromParts("feetech", ["feedback", "id", servoId]),
          detectedAt: nowMs,
          detectedSource: "feetech-servo",
          scanSignature: `servo:${servoId}`,
          servoId,
          minDeg: 0,
          maxDeg: 360,
          direction: 1,
          busKind: "web-serial"
        },
        tags: ["auto-detected", "servo", "ttl", "feetech"],
        confidence: "high",
        source: "feetech-servo",
        message: "Seen in live servo feedback"
      });
    })
    .filter((candidate): candidate is DetectedPluginCandidate => Boolean(candidate));
}

export function candidatesFromMotorFeedback(feedbackByChannel: Record<string, { channel?: string }>, nowMs = Date.now()): DetectedPluginCandidate[] {
  return Object.entries(feedbackByChannel)
    .map(([key, feedback]) => {
      const channel = normalizeMotorChannel(String(feedback?.channel || key || ""));
      if (!/^M[1-8]$/.test(channel)) {
        return null;
      }
      return createCandidate({
        name: `Motor ${channel}`,
        type: "motor",
        catalogItemId: CATALOG_TB6618_MOTOR,
        brand: "Toshiba",
        model: "TB6618 Motor Channel",
        driverId: "driver.tb6618-motor",
        transportId: "transport.controller-json",
        capabilities: [{ id: "motor", features: ["pwm_control", "direction_control", "open_loop"] }],
        config: {
          detectedDeviceId: detectedDeviceIdFromParts("motor", ["feedback", channel]),
          detectedAt: nowMs,
          detectedSource: "motor-controller",
          scanSignature: `motor:${channel}`,
          channel,
          controllerPortPath: "",
          controllerHwid: "",
          pwmPin: "",
          in1Pin: "",
          in2Pin: "",
          enablePin: "",
          sensorPin: "",
          encoderAPin: "PA0",
          encoderBPin: "PA1"
        },
        tags: ["auto-detected", "motor", "pwm", "h-bridge"],
        confidence: "high",
        source: "motor-controller",
        message: "Seen in live motor feedback"
      });
    })
    .filter((candidate): candidate is DetectedPluginCandidate => Boolean(candidate));
}

export function candidatesFromMotorMessages(messages: InboundMessage[], nowMs = Date.now()): DetectedPluginCandidate[] {
  const feedbackByChannel: Record<string, { channel: string }> = {};
  for (const message of messages) {
    if (message.type !== "motor.feedback") {
      continue;
    }
    const channel = normalizeMotorChannel(message.channel);
    if (/^M[1-8]$/.test(channel)) {
      feedbackByChannel[channel] = { channel };
    }
  }
  return candidatesFromMotorFeedback(feedbackByChannel, nowMs);
}

export function candidateFromPiProfile(profile: PiDetectionProfile | null | undefined, nowMs = Date.now()): DetectedPluginCandidate | null {
  const host = profile?.host?.trim();
  if (!host) {
    return null;
  }
  const username = profile?.username?.trim() || "robot1";
  const workspaceDir = profile?.workspaceDir?.trim() || "~/rescue-robot";
  return createCandidate({
    name: `Raspberry Pi ${host}`,
    type: "raspberry-pi",
    catalogItemId: null,
    brand: "Raspberry Pi",
    model: "Remote Host",
    driverId: "driver.raspberry-pi-remote",
    transportId: "transport.ssh",
    capabilities: [{ id: "raspberry-pi", features: ["ssh_exec", "file_upload", "camera_stream", "bridge_health"] }],
    config: {
      detectedDeviceId: detectedDeviceIdFromParts("raspberry-pi", [username, host]),
      detectedAt: nowMs,
      detectedSource: "raspberry-pi",
      scanSignature: stableToken(`${username}@${host}:${workspaceDir}`),
      host,
      username,
      workspaceDir
    },
    tags: ["auto-detected", "raspberry-pi", "ssh", "remote"],
    confidence: "medium",
    source: "raspberry-pi",
    message: `${username}@${host}`
  });
}

export function candidatesFromCanMessages(messages: InboundMessage[], nowMs = Date.now()): DetectedPluginCandidate[] {
  const byServoId = new Map<number, string>();
  for (const message of messages) {
    const parsed = parseAsmgMdCanFrame(message);
    if (!parsed?.servoId || parsed.servoId < 0 || parsed.servoId > 253) {
      continue;
    }
    if (parsed.kind === "readId" || parsed.kind === "positionCurrent" || parsed.kind === "positionCommand") {
      byServoId.set(parsed.servoId, parsed.kind);
    }
  }
  return Array.from(byServoId.entries()).map(([servoId, kind]) => createCandidate({
    name: `CAN Servo ID ${servoId}`,
    type: "servo",
    catalogItemId: CATALOG_ASME_CAN_SERVO,
    brand: "ASME",
    model: "ASME-SE",
    driverId: "driver.asme-can-servo",
    transportId: "transport.a-board-can1",
    capabilities: [{ id: "servo", features: ["position_control", "feedback", "current_config", "pid_config", "id_config", "can1"] }],
    config: {
      detectedDeviceId: detectedDeviceIdFromParts("asme-can", ["can1", "id", servoId]),
      detectedAt: nowMs,
      detectedSource: "can-servo",
      scanSignature: `asme-can:${servoId}:${kind}`,
      servoId,
      busKind: "can",
      canBus: "CAN1",
      bitrateKbps: ASMG_MD_DEFAULT_BITRATE_KBPS
    },
    tags: ["auto-detected", "servo", "can", "asme", "asmg-md", "robomaster-a"],
    confidence: "high",
    source: "can-servo",
    message: `A board CAN1 ${kind}`
  }));
}

export function dedupeDetectedCandidates(candidates: DetectedPluginCandidate[]): DetectedPluginCandidate[] {
  const seen = new Set<string>();
  const unique: DetectedPluginCandidate[] = [];
  for (const candidate of candidates) {
    const detectedDeviceId = candidateDetectedDeviceId(candidate);
    const key = detectedDeviceId || candidate.id;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    unique.push(candidate);
  }
  return unique;
}

export function findMatchingPluginInstance(candidate: DetectedPluginCandidate, instances: PluginInstance[]): PluginInstance | null {
  const detectedDeviceId = candidateDetectedDeviceId(candidate);
  if (detectedDeviceId) {
    const direct = instances.find((instance) => String(instance.config.detectedDeviceId ?? "").trim() === detectedDeviceId);
    if (direct) {
      return direct;
    }
  }

  if (candidate.type === "servo") {
    const servoId = numberOrNull(candidate.config.servoId);
    if (servoId !== null) {
      const match = instances.find((instance) => (
        instance.type === "servo" &&
        instance.driverId === candidate.driverId &&
        instance.transportId === candidate.transportId &&
        numberOrNull(instance.config.servoId) === servoId
      ));
      if (match) {
        return match;
      }
    }
  }

  if (candidate.type === "motor") {
    const channel = normalizeMotorChannel(String(candidate.config.channel ?? ""));
    const match = instances.find((instance) => instance.type === "motor" && normalizeMotorChannel(String(instance.config.channel ?? "")) === channel);
    if (match) {
      return match;
    }
  }

  if (candidate.type === "camera" && candidate.driverId === "driver.browser-camera") {
    const deviceId = String(candidate.config.preferredDeviceId ?? "").trim();
    const match = instances.find((instance) => instance.driverId === "driver.browser-camera" && String(instance.config.preferredDeviceId ?? "").trim() === deviceId);
    if (deviceId && match) {
      return match;
    }
  }

  if (candidate.type === "gamepad") {
    const gamepadId = String(candidate.config.gamepadId ?? "").trim();
    const preferredIndex = numberOrNull(candidate.config.preferredIndex);
    const match = instances.find((instance) => (
      instance.type === "gamepad" &&
      ((gamepadId && String(instance.config.gamepadId ?? "").trim() === gamepadId) ||
        (preferredIndex !== null && numberOrNull(instance.config.preferredIndex) === preferredIndex))
    ));
    if (match) {
      return match;
    }
  }

  if (candidate.type === "firmware") {
    const portPath = String(candidate.config.portPath ?? "").trim();
    const portHwid = String(candidate.config.portHwid ?? "").trim();
    const match = instances.find((instance) => (
      instance.type === "firmware" &&
      ((portHwid && String(instance.config.portHwid ?? "").trim() === portHwid) ||
        (portPath && String(instance.config.portPath ?? "").trim() === portPath))
    ));
    if (match) {
      return match;
    }
  }

  if (candidate.type === "raspberry-pi") {
    const host = String(candidate.config.host ?? "").trim();
    const username = String(candidate.config.username ?? "").trim();
    const match = instances.find((instance) => (
      instance.type === "raspberry-pi" &&
      String(instance.config.host ?? "").trim() === host &&
      String(instance.config.username ?? "").trim() === username
    ));
    if (host && match) {
      return match;
    }
  }

  return null;
}

export function candidateToPluginPayload(candidate: DetectedPluginCandidate, existing: PluginInstance[]): Partial<PluginInstance> {
  return {
    name: uniquePluginName(candidate.name, existing),
    type: candidate.type,
    catalogItemId: candidate.catalogItemId,
    brand: candidate.brand || candidateBrand(candidate),
    model: candidate.model || candidateModel(candidate),
    driverId: candidate.driverId,
    transportId: candidate.transportId,
    capabilities: candidate.capabilities,
    config: candidate.config,
    tags: uniqueStrings([...candidate.tags, "auto-detected"])
  };
}

export async function autoAddDetectedPlugins(
  projectId: string,
  candidates: DetectedPluginCandidate[],
  existing: PluginInstance[],
  dependencies: PluginAutoAddDependencies,
  options: PluginAutoAddOptions = {}
): Promise<DetectionRunResult> {
  const logs: string[] = [];
  const created: PluginInstance[] = [];
  const skipped: DetectedPluginCandidate[] = [];
  const failed: DetectedPluginCandidate[] = [];
  const working = [...existing];
  const nowMs = options.nowMs ?? Date.now();

  for (const candidate of dedupeDetectedCandidates(candidates)) {
    if (options.shouldContinue && !options.shouldContinue()) {
      logs.push("Detection canceled before all candidates were added.");
      break;
    }

    const match = findMatchingPluginInstance(candidate, working);
    if (match) {
      const patch = safeDetectionConfigPatch(match, candidate, nowMs);
      try {
        if (Object.keys(patch).length > 0) {
          const updated = await dependencies.updatePluginInstance(projectId, match.id, { config: { ...match.config, ...patch } });
          const index = working.findIndex((item) => item.id === updated.id);
          if (index >= 0) {
            working[index] = updated;
          }
        }
        skipped.push({ ...candidate, status: "skipped", message: `Already exists: ${match.name}` });
        logs.push(`Skipped ${candidate.name}; already exists as ${match.name}.`);
      } catch (error) {
        failed.push({ ...candidate, status: "failed", message: errorMessage(error) });
        logs.push(`Failed to refresh ${candidate.name}: ${errorMessage(error)}`);
      }
      continue;
    }

    try {
      const plugin = await dependencies.createPluginInstance(projectId, candidateToPluginPayload(candidate, working));
      working.push(plugin);
      created.push(plugin);
      logs.push(`Created ${plugin.name}.`);
    } catch (error) {
      failed.push({ ...candidate, status: "failed", message: errorMessage(error) });
      logs.push(`Failed to create ${candidate.name}: ${errorMessage(error)}`);
    }
  }

  return {
    created,
    skipped,
    failed,
    candidates: [...created.map(pluginToCreatedCandidate), ...skipped, ...failed],
    logs
  };
}

export function detectionSummary(result: DetectionRunResult | null): string {
  if (!result) {
    return "No detection run yet.";
  }
  return `${result.created.length} created / ${result.skipped.length} skipped / ${result.failed.length} failed`;
}

function createCandidate(options: {
  name: string;
  type: CapabilityId;
  catalogItemId: string | null;
  brand: string;
  model: string;
  driverId: string;
  transportId: string;
  capabilities: DeviceCapability[];
  config: DeviceConfig;
  tags: string[];
  confidence: DetectedPluginConfidence;
  source: DetectionCandidateSource;
  message?: string;
}): DetectedPluginCandidate {
  const detectedDeviceId = String(options.config.detectedDeviceId ?? "").trim() || detectedDeviceIdFromParts(options.source, [options.name]);
  return {
    id: `candidate:${detectedDeviceId}`,
    name: options.name,
    type: options.type,
    catalogItemId: options.catalogItemId,
    brand: options.brand,
    model: options.model,
    driverId: options.driverId,
    transportId: options.transportId,
    capabilities: options.capabilities,
    config: { ...options.config, detectedDeviceId },
    tags: uniqueStrings(options.tags),
    confidence: options.confidence,
    source: options.source,
    status: "candidate",
    message: options.message
  };
}

function classifyFirmwarePort(port: FirmwarePort): { brand: string; model: string; tags: string[]; confidence: DetectedPluginConfidence } {
  const text = `${port.path} ${port.description} ${port.hwid}`.toLowerCase();
  if (text.includes("esp32") || text.includes("espressif") || text.includes("cp210") || text.includes("ch910") || text.includes("ch340")) {
    return { brand: "Espressif", model: "ESP32 Serial Controller", tags: ["esp32", "controller"], confidence: "medium" };
  }
  if (text.includes("robomaster") || text.includes("stm32") || text.includes("ttyama5") || text.includes("usart")) {
    return { brand: "RoboMaster", model: "A Board Serial Bridge", tags: ["robomaster-a", "uart"], confidence: "medium" };
  }
  if (text.includes("arduino") || text.includes("atmega") || text.includes("uno") || text.includes("nano")) {
    return { brand: "Arduino", model: "TB6618 Debug Controller", tags: ["arduino", "tb6618", "controller"], confidence: "medium" };
  }
  return { brand: "Generic", model: "Serial Controller", tags: ["serial", "controller"], confidence: port.hwid ? "medium" : "low" };
}

function safeDetectionConfigPatch(instance: PluginInstance, candidate: DetectedPluginCandidate, nowMs: number): DeviceConfig {
  const patch: DeviceConfig = {};
  const detectedDeviceId = candidateDetectedDeviceId(candidate);
  if (detectedDeviceId && String(instance.config.detectedDeviceId ?? "").trim() !== detectedDeviceId) {
    patch.detectedDeviceId = detectedDeviceId;
  }
  patch.detectedAt = nowMs;
  patch.detectedSource = candidate.source;
  if (candidate.config.scanSignature !== undefined) {
    patch.scanSignature = candidate.config.scanSignature;
  }
  for (const key of ["portDescription", "portHwid"] as const) {
    if (candidate.config[key] !== undefined && instance.config[key] !== candidate.config[key]) {
      patch[key] = candidate.config[key];
    }
  }
  return Object.fromEntries(Object.entries(patch).filter(([, value]) => value !== undefined)) as DeviceConfig;
}

function pluginToCreatedCandidate(plugin: PluginInstance): DetectedPluginCandidate {
  return {
    id: `created:${plugin.id}`,
    name: plugin.name,
    type: plugin.type,
    catalogItemId: plugin.catalogItemId,
    brand: plugin.brand,
    model: plugin.model,
    driverId: plugin.driverId,
    transportId: plugin.transportId,
    capabilities: plugin.capabilities,
    config: plugin.config,
    tags: plugin.tags,
    confidence: "high",
    source: String(plugin.config.detectedSource ?? "serial-port") as DetectionCandidateSource,
    status: "created",
    message: "Created"
  };
}

function candidateDetectedDeviceId(candidate: DetectedPluginCandidate): string {
  return String(candidate.config.detectedDeviceId ?? "").trim();
}

function candidateBrand(candidate: DetectedPluginCandidate): string {
  if (candidate.catalogItemId === CATALOG_FEETECH_SERVO) return "Feetech";
  if (candidate.catalogItemId === CATALOG_ASME_CAN_SERVO) return "ASME";
  if (candidate.catalogItemId === CATALOG_TB6618_MOTOR) return "Toshiba";
  if (candidate.catalogItemId === CATALOG_BROWSER_CAMERA || candidate.catalogItemId === CATALOG_BROWSER_GAMEPAD) return "Browser";
  const tag = candidate.tags.find((item) => item !== "auto-detected");
  return tag ? titleCase(tag) : "Generic";
}

function candidateModel(candidate: DetectedPluginCandidate): string {
  if (candidate.catalogItemId === CATALOG_FEETECH_SERVO) return "STS3215";
  if (candidate.catalogItemId === CATALOG_ASME_CAN_SERVO) return "ASME-SE";
  if (candidate.catalogItemId === CATALOG_TB6618_MOTOR) return "TB6618 Motor Channel";
  if (candidate.catalogItemId === CATALOG_BROWSER_CAMERA) return "Local Camera";
  if (candidate.catalogItemId === CATALOG_BROWSER_GAMEPAD) return "Gamepad API";
  return candidate.name;
}

function uniquePluginName(name: string, existing: PluginInstance[]): string {
  const base = name.trim() || "Auto detected plugin";
  const used = new Set(existing.map((item) => item.name.trim().toLowerCase()));
  if (!used.has(base.toLowerCase())) {
    return base;
  }
  for (let index = 2; index < 1000; index += 1) {
    const next = `${base} ${index}`;
    if (!used.has(next.toLowerCase())) {
      return next;
    }
  }
  return `${base} ${Date.now().toString(36)}`;
}

function portSignature(port: FirmwarePort): string {
  return stableToken(`${port.path}:${port.description}:${port.hwid}`);
}

function stableToken(value: string | number | boolean | null | undefined): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._:-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function numberOrNull(value: unknown): number | null {
  const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isInteger(number) ? number : null;
}

function titleCase(value: string): string {
  return value
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((part) => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ") || "Generic";
}

function errorMessage(error: unknown): string {
  return error instanceof Error && error.message ? error.message : "unknown error";
}

export function catalogHasItem(catalog: DeviceCatalogItem[], id: string): boolean {
  return catalog.some((item) => item.id === id);
}
