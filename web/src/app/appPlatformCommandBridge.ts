import type { ArmTeachTrack } from "../lib/armTeach";
import type { ServoProfile } from "../lib/protocol";
import type { ArmConfig, CameraConfig, CameraVideoSource } from "../lib/storage";
import { armConfigFromCommandPayload, servoProfilesFromCommandPayload } from "../features/arm/armCommandPayload";
import { cameraSourceForDevice } from "../features/drive/cameraSources";
import type { PlatformCommand, PlatformCommandResult, PlatformCommandStatus } from "../platform/commands";
import type { ArmTeachStatus, PiRemoteForm } from "./appModel";

interface AppPlatformCommandBridgeOptions {
  activeCameraSource: CameraVideoSource;
  armConfig: ArmConfig;
  armTeachStatus: ArmTeachStatus;
  cameraConfig: CameraConfig;
  centerCamera: () => Promise<void>;
  checkFirmwareHelper: () => Promise<unknown>;
  checkRaspberryPiCamera: (source?: CameraVideoSource) => Promise<void>;
  compileArduinoFirmware: () => Promise<void>;
  dispatchPlatformCommand: (command: PlatformCommand) => Promise<PlatformCommandResult>;
  emitPlatformCommandResult: (command: PlatformCommand, result: PlatformCommandResult) => void;
  execRaspberryPiCommandWith: (command: string) => Promise<void>;
  firmwareBoard: string;
  firmwarePorts: unknown[];
  installRaspberryPiCameraTools: () => Promise<void>;
  pauseArm: () => Promise<void>;
  pauseArmForConfig: (config: ArmConfig, extraServos?: ServoProfile[]) => Promise<boolean>;
  piRemoteFile: File | null;
  piRemoteForm: PiRemoteForm;
  playArmTeachTrack: () => Promise<void>;
  refreshFirmwarePorts: () => Promise<void>;
  resetCameraSourceRuntime: (sourceId: string) => void;
  selectedArmTeachTrack: ArmTeachTrack | null;
  selectedFirmwarePort: string;
  sendArmPoseForConfig: (config: ArmConfig, live?: boolean, extraServos?: ServoProfile[]) => Promise<unknown>;
  sendCameraGimbalMove: (panAngleDeg: number, tiltAngleDeg: number) => Promise<void>;
  servos: ServoProfile[];
  setSelectedFirmwarePort: (port: string) => void;
  setupRaspberryPiWorkspace: () => Promise<void>;
  startArmTeachRecording: () => Promise<void>;
  startRaspberryPiCameraStream: (source?: CameraVideoSource) => Promise<void>;
  stopArmTeachRecording: () => Promise<void>;
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
    } catch (error) {
      return completePlatformCommand(command, "failed", undefined, error instanceof Error && error.message ? error.message : "platform command failed");
    }
    return baseResult;
  };
}
