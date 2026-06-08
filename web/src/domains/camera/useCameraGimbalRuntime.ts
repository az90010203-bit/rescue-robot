import { buildServoMoveCommand, clamp } from "@adapters/hardware/protocol";
import { validateCameraConfig, type CameraConfig, type ValidationErrorKey } from "@adapters/persistence/storage";

interface UseCameraGimbalRuntimeOptions {
  addSystemLog: (messageKey: string, level?: any, values?: any) => void;
  cameraConfig: CameraConfig;
  nextSeq: () => number;
  send: (command: unknown) => Promise<boolean>;
  setCameraConfig: (config: CameraConfig) => void;
  setCameraConfigError: (error: ValidationErrorKey | null) => void;
}

export function useCameraGimbalRuntime({
  addSystemLog,
  cameraConfig,
  nextSeq,
  send,
  setCameraConfig,
  setCameraConfigError
}: UseCameraGimbalRuntimeOptions) {
  async function nudgeCamera(deltaPan: number, deltaTilt: number) {
    await sendCameraGimbalMove(cameraConfig.panAngleDeg + deltaPan, cameraConfig.tiltAngleDeg + deltaTilt);
  }

  async function centerCamera() {
    await sendCameraGimbalMove((cameraConfig.panMinDeg + cameraConfig.panMaxDeg) / 2, (cameraConfig.tiltMinDeg + cameraConfig.tiltMaxDeg) / 2);
  }

  async function sendCameraGimbalMove(panAngleDeg: number, tiltAngleDeg: number) {
    const error = validateCameraConfig(cameraConfig);
    if (error) {
      setCameraConfigError(error);
      addSystemLog("logs.cameraConfigInvalid", "error");
      return;
    }

    const nextConfig = {
      ...cameraConfig,
      panAngleDeg: clamp(panAngleDeg, cameraConfig.panMinDeg, cameraConfig.panMaxDeg),
      tiltAngleDeg: clamp(tiltAngleDeg, cameraConfig.tiltMinDeg, cameraConfig.tiltMaxDeg)
    };

    setCameraConfig(nextConfig);
    try {
      const sent = await send(
        buildServoMoveCommand(
          nextSeq(),
          [
            {
              id: nextConfig.panServoId,
              name: "Camera Pan",
              angleDeg: nextConfig.panAngleDeg,
              speedRaw: nextConfig.speedRaw,
              acc: nextConfig.acc
            },
            {
              id: nextConfig.tiltServoId,
              name: "Camera Tilt",
              angleDeg: nextConfig.tiltAngleDeg,
              speedRaw: nextConfig.speedRaw,
              acc: nextConfig.acc
            }
          ],
          true
        )
      );
      if (sent) {
        setCameraConfig(nextConfig);
      }
    } catch {
      addSystemLog("logs.cameraCommandInvalid", "error");
    }
  }

  return { centerCamera, nudgeCamera, sendCameraGimbalMove };
}
