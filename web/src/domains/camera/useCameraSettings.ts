import type { FormEvent } from "react";
import {
  buildCameraOfferUrl,
  MAIN_CAMERA_SOURCE_ID,
  type CameraConfig,
  type CameraLatencyProfile,
  type CameraStreamMode,
  type CameraVideoLayout,
  validateCameraConfig
} from "@adapters/persistence/storage";
import type { CameraNumberField } from "@app/appModel";
import { cameraSourceById, updateCameraSource } from "@domains/camera/cameraSources";

interface UseCameraSettingsOptions {
  addSystemLog: (messageKey: string, level?: any, values?: any) => void;
  cameraConfig: CameraConfig;
  setCameraConfig: (updater: CameraConfig | ((current: CameraConfig) => CameraConfig)) => void;
  setCameraConfigError: (error: any) => void;
}

export function useCameraSettings({ addSystemLog, cameraConfig, setCameraConfig, setCameraConfigError }: UseCameraSettingsOptions) {
  function updateCameraText(field: "streamUrl" | "webrtcOfferUrl", value: string) {
    setCameraConfig((current) => ({
      ...current,
      [field]: value,
      ...(field === "streamUrl"
        ? {
            webrtcOfferUrl: buildCameraOfferUrl(value),
            videoSources: updateCameraSource(current.videoSources, MAIN_CAMERA_SOURCE_ID, { streamUrl: value })
          }
        : {})
    }));
    setCameraConfigError(null);
  }

  function updateCameraActiveSource(sourceId: string) {
    setCameraConfig((current) => ({
      ...current,
      activeVideoSourceId: current.videoSources.some((source) => source.id === sourceId) ? sourceId : MAIN_CAMERA_SOURCE_ID,
      videoLayout: "single"
    }));
  }

  function updateCameraVideoLayout(layout: CameraVideoLayout) {
    setCameraConfig((current) => ({ ...current, videoLayout: layout }));
  }

  function updateCameraSourceText(sourceId: string, field: "label" | "devicePath" | "streamUrl", value: string) {
    setCameraConfig((current) => {
      const videoSources = updateCameraSource(current.videoSources, sourceId, { [field]: value });
      const mainSource = videoSources.find((source) => source.id === MAIN_CAMERA_SOURCE_ID);
      return {
        ...current,
        videoSources,
        ...(sourceId === MAIN_CAMERA_SOURCE_ID
          ? {
              streamUrl: mainSource?.streamUrl ?? value,
              webrtcOfferUrl: field === "streamUrl" ? buildCameraOfferUrl(value) : current.webrtcOfferUrl
            }
          : {})
      };
    });
    setCameraConfigError(null);
  }

  function updateCameraSourcePort(sourceId: string, value: string) {
    const port = Number(value);
    setCameraConfig((current) => ({
      ...current,
      videoSources: updateCameraSource(current.videoSources, sourceId, {
        port: Number.isInteger(port) ? Math.max(1, Math.min(65535, port)) : cameraSourceById(current, sourceId).port
      })
    }));
    setCameraConfigError(null);
  }

  function updateCameraStreamMode(mode: CameraStreamMode) {
    setCameraConfig((current) => ({ ...current, streamMode: mode }));
    setCameraConfigError(null);
  }

  function updateCameraLatencyProfile(profile: CameraLatencyProfile) {
    setCameraConfig((current) => ({ ...current, latencyProfile: profile }));
    setCameraConfigError(null);
  }

  function updateCameraNumber(field: CameraNumberField, value: string) {
    const numericValue = Number(value);
    setCameraConfig((current) => ({ ...current, [field]: Number.isFinite(numericValue) ? numericValue : 0 }));
    setCameraConfigError(null);
  }

  function saveCameraSettings(event?: FormEvent<HTMLFormElement>) {
    event?.preventDefault();
    const error = validateCameraConfig(cameraConfig);
    if (error) {
      setCameraConfigError(error);
      addSystemLog("logs.cameraConfigInvalid", "error");
      return;
    }

    setCameraConfigError(null);
    addSystemLog("logs.cameraConfigSaved");
  }

  return {
    saveCameraSettings,
    updateCameraActiveSource,
    updateCameraLatencyProfile,
    updateCameraNumber,
    updateCameraSourcePort,
    updateCameraSourceText,
    updateCameraStreamMode,
    updateCameraText,
    updateCameraVideoLayout
  };
}
