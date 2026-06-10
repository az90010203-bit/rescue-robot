import type { ArmTeachTrack } from "@domains/arm/armTeach";
import { buildAsmgMdCanConfigCommand, buildAsmgMdGroupMoveCommand } from "@adapters/hardware/asmgMdCanServo";
import { buildMecanumTargetCommand, clamp, type MotorStopMode, type PcCommand, type ServoProfile } from "@adapters/hardware/protocol";
import type { ArmConfig, CameraConfig, CameraVideoSource } from "@adapters/persistence/storage";
import { armConfigFromCommandPayload, servoProfilesFromCommandPayload } from "@domains/arm/armCommandPayload";
import { cameraSourceForDevice } from "@domains/camera/cameraSources";
import { canServoGroupTargets, normalizeCanServoGroupConfig, validateCanServoGroupComponentConfig, type CanServoGroupPositionMap } from "@domains/can-servo/canServoGroupComponent";
import { normalizeMecanumDriveConfig } from "@domains/drive/mecanumComponent";
import type { PlatformCommand, PlatformCommandResult, PlatformCommandStatus } from "@platform/commands";
import type { ComponentDefinition, PluginInstance } from "@platform/architecture";
import type { ArmTeachStatus, PiRemoteForm } from "@app/appModel";

interface AppPlatformCommandBridgeOptions {
  activeCameraSource: CameraVideoSource;
  armConfig: ArmConfig;
  armTeachStatus: ArmTeachStatus;
  cameraConfig: CameraConfig;
  centerCamera: () => Promise<void>;
  checkFirmwareHelper: () => Promise<unknown>;
  checkAiVisionHelper: () => Promise<unknown>;
  analyzeAiVision: (source?: CameraVideoSource) => Promise<unknown>;
  captureAiVisionSample: (source?: CameraVideoSource, label?: string) => Promise<unknown>;
  checkRaspberryPiCamera: (source?: CameraVideoSource) => Promise<void>;
  compileArduinoFirmware: () => Promise<void>;
  components: ComponentDefinition[];
  dispatchPlatformCommand: (command: PlatformCommand) => Promise<PlatformCommandResult>;
  emitPlatformCommandResult: (command: PlatformCommand, result: PlatformCommandResult) => void;
  execRaspberryPiCommandWith: (command: string) => Promise<void>;
  firmwareBoard: string;
  firmwarePorts: unknown[];
  installRaspberryPiCameraTools: () => Promise<void>;
  nextSeq: () => number;
  pauseArm: () => Promise<void>;
  pauseArmForConfig: (config: ArmConfig, extraServos?: ServoProfile[]) => Promise<boolean>;
  piRemoteFile: File | null;
  piRemoteForm: PiRemoteForm;
  playArmTeachTrack: () => Promise<void>;
  pluginInstances: PluginInstance[];
  refreshFirmwarePorts: () => Promise<void>;
  resetCameraSourceRuntime: (sourceId: string) => void;
  selectedArmTeachTrack: ArmTeachTrack | null;
  selectedFirmwarePort: string;
  sendArmPoseForConfig: (config: ArmConfig, live?: boolean, extraServos?: ServoProfile[]) => Promise<unknown>;
  sendCameraGimbalMove: (panAngleDeg: number, tiltAngleDeg: number) => Promise<void>;
  sendMotorCommandBatch: (commands: PcCommand[], options?: { log?: boolean; shouldRun?: () => boolean }) => Promise<unknown>;
  servos: ServoProfile[];
  setSelectedFirmwarePort: (port: string) => void;
  setupRaspberryPiWorkspace: () => Promise<void>;
  startArmTeachRecording: () => Promise<void>;
  startRaspberryPiCameraStream: (source?: CameraVideoSource) => Promise<void>;
  stopArmTeachRecording: () => Promise<void>;
  stopMode: MotorStopMode;
  stopRaspberryPiCameraStream: (source?: CameraVideoSource) => Promise<void>;
  t: (key: string) => string;
  testRaspberryPiConnection: () => Promise<void>;
  uploadAndExecRaspberryPiFileWith: (file: File, command: string) => Promise<void>;
  uploadCompiledArduinoFirmware: (portOverride?: string) => Promise<void>;
  uploadRaspberryPiFileWith: (file: File) => Promise<void>;
}

export function createAppPlatformCommandDispatcher(options: AppPlatformCommandBridgeOptions) {
  function completePlatformCommand(
    command: PlatformCommand,
    status: PlatformCommandStatus,
    response?: unknown,
    message?: string
  ): PlatformCommandResult {
    const result: PlatformCommandResult = {
      commandId: command.id,
      deviceId: command.targetDeviceId,
      status,
      ...(message ? { message } : {}),
      ...(response === undefined ? {} : { response })
    };
    options.emitPlatformCommandResult(command, result);
    return result;
  }

  function piTargetLabel() {
    return `${options.piRemoteForm.username.trim() || "robot1"}@${options.piRemoteForm.host.trim() || "rescue-pi.local"}`;
  }

  return async function dispatchAppPlatformCommand(command: PlatformCommand): Promise<PlatformCommandResult> {
    const baseResult = await options.dispatchPlatformCommand(command);
    if (baseResult.status !== "skipped" || baseResult.message !== "platform command was not handled") {
      return baseResult;
    }
    try {
      if (command.type === "camera.set_gimbal") {
        if (command.targetDeviceId !== "camera:main") {
          return completePlatformCommand(command, "failed", undefined, "secondary camera does not support gimbal control");
        }
        await options.sendCameraGimbalMove(Number(command.payload.panAngleDeg), Number(command.payload.tiltAngleDeg));
        return completePlatformCommand(command, "sent", { panAngleDeg: command.payload.panAngleDeg, tiltAngleDeg: command.payload.tiltAngleDeg });
      }
      if (command.type === "camera.center_gimbal") {
        if (command.targetDeviceId !== "camera:main") {
          return completePlatformCommand(command, "failed", undefined, "secondary camera does not support gimbal control");
        }
        await options.centerCamera();
        return completePlatformCommand(command, "sent", { centered: true });
      }
      if (command.type === "camera.stream.start") {
        const source = cameraSourceForDevice(options.cameraConfig, command.targetDeviceId);
        if (!source.streamUrl.trim()) {
          return completePlatformCommand(command, "skipped", undefined, "camera stream URL is not configured");
        }
        await options.startRaspberryPiCameraStream(source);
        return completePlatformCommand(command, "sent", { streamUrl: source.streamUrl, sourceId: source.id });
      }
      if (command.type === "camera.stream.stop") {
        const source = cameraSourceForDevice(options.cameraConfig, command.targetDeviceId);
        await options.stopRaspberryPiCameraStream(source);
        options.resetCameraSourceRuntime(source.id);
        return completePlatformCommand(command, "sent", { streamUrl: source.streamUrl || null, sourceId: source.id });
      }
      if (command.type === "robot-arm.set_pose") {
        const commandServos = servoProfilesFromCommandPayload(command.payload);
        const commandArmConfig = Array.isArray(command.payload.joints)
          ? armConfigFromCommandPayload(command.payload, options.servos, commandServos)
          : options.armConfig;
        const sent = await options.sendArmPoseForConfig(commandArmConfig, command.payload.live === true, commandServos);
        return completePlatformCommand(command, sent ? "sent" : "failed", { jointCount: commandArmConfig.joints.length }, sent ? undefined : "robot arm command was not sent");
      }
      if (command.type === "robot-arm.pause") {
        if (Array.isArray(command.payload.joints)) {
          const commandServos = servoProfilesFromCommandPayload(command.payload);
          const commandArmConfig = armConfigFromCommandPayload(command.payload, options.servos, commandServos);
          const paused = await options.pauseArmForConfig(commandArmConfig, commandServos);
          return completePlatformCommand(command, paused ? "sent" : "failed", { jointCount: commandArmConfig.joints.length }, paused ? undefined : "robot arm pause was not sent");
        }
        await options.pauseArm();
        return completePlatformCommand(command, "sent", { jointCount: options.armConfig.joints.length });
      }
      if (command.type === "robot-arm.teach.start") {
        await options.startArmTeachRecording();
        return completePlatformCommand(command, "sent", { status: options.armTeachStatus });
      }
      if (command.type === "robot-arm.teach.stop") {
        await options.stopArmTeachRecording();
        return completePlatformCommand(command, "sent", { status: options.armTeachStatus });
      }
      if (command.type === "robot-arm.teach.play") {
        await options.playArmTeachTrack();
        return completePlatformCommand(command, "sent", { trackId: options.selectedArmTeachTrack?.id ?? null });
      }
      if (command.type === "mecanum-drive.set_velocity") {
        const result = await sendMecanumDriveVelocity(command, options);
        return completePlatformCommand(command, result.sent ? "sent" : "failed", result.response, result.sent ? undefined : result.message);
      }
      if (command.type === "mecanum-drive.stop") {
        const result = await stopMecanumDrive(command, options);
        return completePlatformCommand(command, result.sent ? "sent" : "failed", result.response, result.sent ? undefined : result.message);
      }
      if (command.type === "can-servo-group.set_positions") {
        const result = await sendCanServoGroupPositions(command, options);
        return completePlatformCommand(command, result.sent ? "sent" : "failed", result.response, result.sent ? undefined : result.message);
      }
      if (command.type === "pi.check") {
        await options.testRaspberryPiConnection();
        return completePlatformCommand(command, "sent", { target: piTargetLabel() });
      }
      if (command.type === "pi.setup") {
        await options.setupRaspberryPiWorkspace();
        return completePlatformCommand(command, "sent", { target: piTargetLabel() });
      }
      if (command.type === "pi.upload_file") {
        const file = command.payload.file instanceof File ? command.payload.file : options.piRemoteFile;
        if (!file) {
          return completePlatformCommand(command, "failed", undefined, options.t("piRemote.errors.selectFile"));
        }
        await options.uploadRaspberryPiFileWith(file);
        return completePlatformCommand(command, "sent", { fileName: file.name });
      }
      if (command.type === "pi.exec") {
        const runCommand = String(command.payload.command ?? options.piRemoteForm.command).trim();
        if (!runCommand) {
          return completePlatformCommand(command, "failed", undefined, options.t("piRemote.errors.commandRequired"));
        }
        await options.execRaspberryPiCommandWith(runCommand);
        return completePlatformCommand(command, "sent", { command: runCommand });
      }
      if (command.type === "pi.upload_and_exec") {
        const file = command.payload.file instanceof File ? command.payload.file : options.piRemoteFile;
        const runCommand = String(command.payload.command ?? options.piRemoteForm.command).trim();
        if (!file) {
          return completePlatformCommand(command, "failed", undefined, options.t("piRemote.errors.selectFile"));
        }
        if (!runCommand) {
          return completePlatformCommand(command, "failed", undefined, options.t("piRemote.errors.commandRequired"));
        }
        await options.uploadAndExecRaspberryPiFileWith(file, runCommand);
        return completePlatformCommand(command, "sent", { fileName: file.name, command: runCommand });
      }
      if (command.type === "pi.camera.check") {
        await options.checkRaspberryPiCamera(options.activeCameraSource);
        return completePlatformCommand(command, "sent", { target: piTargetLabel() });
      }
      if (command.type === "pi.camera.start") {
        await options.startRaspberryPiCameraStream(options.activeCameraSource);
        return completePlatformCommand(command, "sent", { target: piTargetLabel() });
      }
      if (command.type === "pi.camera.stop") {
        await options.stopRaspberryPiCameraStream(options.activeCameraSource);
        return completePlatformCommand(command, "sent", { target: piTargetLabel() });
      }
      if (command.type === "pi.camera.install_tools") {
        await options.installRaspberryPiCameraTools();
        return completePlatformCommand(command, "sent", { target: piTargetLabel() });
      }
      if (command.type === "firmware.helper.check") {
        const health = await options.checkFirmwareHelper();
        return completePlatformCommand(command, health ? "sent" : "failed", health ?? undefined);
      }
      if (command.type === "firmware.ports.refresh") {
        await options.refreshFirmwarePorts();
        return completePlatformCommand(command, "sent", { count: options.firmwarePorts.length });
      }
      if (command.type === "firmware.compile") {
        await options.compileArduinoFirmware();
        return completePlatformCommand(command, "sent", { board: options.firmwareBoard });
      }
      if (command.type === "firmware.upload") {
        const port = String(command.payload.port || options.selectedFirmwarePort).trim();
        if (!port) {
          return completePlatformCommand(command, "failed", undefined, options.t("firmware.errors.selectPort"));
        }
        options.setSelectedFirmwarePort(port);
        await options.uploadCompiledArduinoFirmware(port);
        return completePlatformCommand(command, "sent", { port });
      }
      if (command.type === "ai-vision.helper.check") {
        const health = await options.checkAiVisionHelper();
        return completePlatformCommand(command, health ? "sent" : "failed", health ?? undefined);
      }
      if (command.type === "ai-vision.analyze") {
        const source = aiVisionSourceForCommand(options.cameraConfig, options.activeCameraSource, command);
        const result = await options.analyzeAiVision(source);
        return completePlatformCommand(command, result ? "sent" : "failed", result ?? undefined, result ? undefined : "AI vision analysis failed");
      }
      if (command.type === "ai-vision.samples.capture") {
        const source = aiVisionSourceForCommand(options.cameraConfig, options.activeCameraSource, command);
        const result = await options.captureAiVisionSample(source, String(command.payload.label ?? "competition_mannequin"));
        return completePlatformCommand(command, result ? "sent" : "failed", result ?? undefined, result ? undefined : "AI vision sample capture failed");
      }
    } catch (error) {
      return completePlatformCommand(command, "failed", undefined, error instanceof Error && error.message ? error.message : "platform command failed");
    }
    return baseResult;
  };
}

async function sendMecanumDriveVelocity(command: PlatformCommand, options: AppPlatformCommandBridgeOptions): Promise<{ sent: boolean; response?: unknown; message?: string }> {
  const component = mecanumComponentForCommand(command, options.components);
  if (!component) {
    return { sent: false, message: "mecanum drive component was not found" };
  }
  const config = normalizeMecanumDriveConfig(command.payload.config ?? component.config, options.pluginInstances);
  const stopMode = command.payload.stopMode === "brake" || command.payload.stopMode === "coast" ? command.payload.stopMode : options.stopMode;
  const target = {
    forward: numberInRange(command.payload.forward, -1, 1, 0),
    strafe: numberInRange(command.payload.strafe, -1, 1, 0),
    turn: numberInRange(command.payload.turn, -1, 1, 0),
    speedLimitPercent: numberInRange(command.payload.speedLimitPercent, 0, 100, 100),
    closedLoop: config.closedLoop,
    maxRpm: config.maxRpm,
    encoderTicksPerRev: config.encoderTicksPerRev,
    stopMode
  };
  const sent = await options.sendMotorCommandBatch([buildMecanumTargetCommand(options.nextSeq(), target)], { log: true });
  return { sent: Boolean(sent), response: { componentId: component.id, target } };
}

async function stopMecanumDrive(command: PlatformCommand, options: AppPlatformCommandBridgeOptions): Promise<{ sent: boolean; response?: unknown; message?: string }> {
  const component = mecanumComponentForCommand(command, options.components);
  if (!component) {
    return { sent: false, message: "mecanum drive component was not found" };
  }
  const stopMode = command.payload.stopMode === "brake" || command.payload.stopMode === "coast" ? command.payload.stopMode : options.stopMode;
  const commandToSend: PcCommand = { type: "mecanum.stop", seq: options.nextSeq(), stopMode };
  const sent = await options.sendMotorCommandBatch([commandToSend], { log: true });
  return { sent: Boolean(sent), response: { componentId: component.id, stopMode } };
}

function mecanumComponentForCommand(command: PlatformCommand, components: ComponentDefinition[]): ComponentDefinition | null {
  const componentId = command.targetDeviceId.replace("mecanum-drive:", "");
  return components.find((component) => component.id === componentId && component.kind === "mecanum-drive") ?? null;
}

async function sendCanServoGroupPositions(command: PlatformCommand, options: AppPlatformCommandBridgeOptions): Promise<{ sent: boolean; response?: unknown; message?: string }> {
  const component = canServoGroupComponentForCommand(command, options.components);
  if (!component) {
    return { sent: false, message: "CAN servo group component was not found" };
  }
  const config = normalizeCanServoGroupConfig(command.payload.config ?? component.config, options.pluginInstances);
  const validation = validateCanServoGroupComponentConfig({ ...component, kind: "can-servo-group", pluginInstanceIds: Object.values(config.servos).filter(Boolean), config }, options.pluginInstances);
  if (validation) {
    return { sent: false, message: validation };
  }
  const targets = canServoGroupTargets(config, options.pluginInstances, payloadPositions(command.payload.positions), numberInRange(command.payload.speedRaw, 0, 4095, 300));
  if (targets.length === 0) {
    return { sent: false, message: "CAN servo group has no valid targets" };
  }
  const first = targets[0];
  const commands: PcCommand[] = [
    buildAsmgMdCanConfigCommand(options.nextSeq(), first.bitrateKbps),
    buildAsmgMdGroupMoveCommand(
      options.nextSeq(),
      targets.map((target) => ({ id: target.id, position: target.position })),
      first.speed
    )
  ];
  const sent = await options.sendMotorCommandBatch(commands, { log: true });
  return {
    sent: Boolean(sent),
    response: {
      componentId: component.id,
      canBus: first.canBus,
      bitrateKbps: first.bitrateKbps,
      targets
    }
  };
}

function canServoGroupComponentForCommand(command: PlatformCommand, components: ComponentDefinition[]): ComponentDefinition | null {
  const componentId = command.targetDeviceId.replace("can-servo-group:", "");
  return components.find((component) => component.id === componentId && component.kind === "can-servo-group") ?? null;
}

function payloadPositions(value: unknown): CanServoGroupPositionMap {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value as CanServoGroupPositionMap;
}

function aiVisionSourceForCommand(cameraConfig: CameraConfig, activeSource: CameraVideoSource, command: PlatformCommand): CameraVideoSource {
  const sourceId = String(command.payload.sourceId ?? activeSource.id).trim();
  const streamUrl = String(command.payload.streamUrl ?? "").trim();
  const source = cameraConfig.videoSources.find((item) => item.id === sourceId) ?? activeSource;
  return streamUrl ? { ...source, streamUrl } : source;
}

function numberInRange(value: unknown, min: number, max: number, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? clamp(value, min, max) : fallback;
}
