export interface LocalCameraDevice {
  deviceId: string;
  label: string;
}

export interface LocalCameraSettings {
  deviceId?: string | null;
  width?: number | string | null;
  height?: number | string | null;
  fps?: number | string | null;
}

export type LocalCameraMediaDevices = Pick<MediaDevices, "enumerateDevices" | "getUserMedia">;

export function browserMediaDevices(): LocalCameraMediaDevices | null {
  if (typeof navigator === "undefined" || !navigator.mediaDevices) {
    return null;
  }
  return navigator.mediaDevices;
}

export function isLocalCameraSupported(mediaDevices: LocalCameraMediaDevices | null = browserMediaDevices()): boolean {
  return Boolean(mediaDevices?.enumerateDevices && mediaDevices.getUserMedia);
}

export async function enumerateLocalCameraDevices(mediaDevices: LocalCameraMediaDevices | null = browserMediaDevices()): Promise<LocalCameraDevice[]> {
  if (!isLocalCameraSupported(mediaDevices)) {
    throw new Error("Browser camera API is not available");
  }
  const devices = await mediaDevices!.enumerateDevices();
  let index = 1;
  return devices
    .filter((device) => device.kind === "videoinput")
    .map((device) => ({
      deviceId: device.deviceId,
      label: device.label || `Camera ${index++}`
    }));
}

export function localCameraConstraints(settings: LocalCameraSettings = {}): MediaStreamConstraints {
  const width = positiveInteger(settings.width);
  const height = positiveInteger(settings.height);
  const fps = positiveInteger(settings.fps);
  const deviceId = typeof settings.deviceId === "string" ? settings.deviceId.trim() : "";
  const video: MediaTrackConstraints = {};

  if (deviceId) {
    video.deviceId = { exact: deviceId };
  }
  if (width) {
    video.width = { ideal: width };
  }
  if (height) {
    video.height = { ideal: height };
  }
  if (fps) {
    video.frameRate = { ideal: fps };
  }

  return { video };
}

export async function startLocalCameraStream(
  settings: LocalCameraSettings = {},
  mediaDevices: LocalCameraMediaDevices | null = browserMediaDevices()
): Promise<MediaStream> {
  if (!isLocalCameraSupported(mediaDevices)) {
    throw new Error("Browser camera API is not available");
  }
  return mediaDevices!.getUserMedia(localCameraConstraints(settings));
}

export function stopLocalCameraStream(stream: MediaStream | null | undefined): void {
  for (const track of stream?.getTracks() ?? []) {
    track.stop();
  }
}

export function mediaErrorMessage(error: unknown): string {
  if (error instanceof DOMException) {
    if (error.name === "NotAllowedError" || error.name === "PermissionDeniedError") {
      return "Camera permission was denied. Allow camera access in the browser, then try again.";
    }
    if (error.name === "NotFoundError" || error.name === "DevicesNotFoundError") {
      return "No local camera was detected.";
    }
    if (error.name === "OverconstrainedError") {
      return "The saved camera is unavailable. Using the default camera may still work.";
    }
  }
  return error instanceof Error && error.message ? error.message : "Local camera request failed.";
}

function positiveInteger(value: number | string | null | undefined): number | null {
  const parsed = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : NaN;
  return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
}
