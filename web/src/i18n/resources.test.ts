import { describe, expect, it } from "vitest";
import { supportedLanguages } from "./languages";
import { resources } from "./resources";

const requiredKeys = [
  "app.title",
  "language.select",
  "actions.connectSerial",
  "actions.saveCamera",
  "actions.addLinkageGroup",
  "actions.addArmJoint",
  "actions.sendArmPose",
  "actions.pauseArm",
  "actions.moveUp",
  "actions.moveDown",
  "actions.downloadArduinoFirmware",
  "actions.checkFirmwareHelper",
  "actions.refreshFirmwarePorts",
  "actions.compileFirmware",
  "actions.uploadFirmware",
  "actions.addMotorLinkageGroup",
  "actions.sendMotorLinkage",
  "actions.sendLinkage",
  "actions.pause",
  "actions.pauseGroup",
  "actions.clockwise",
  "actions.counterclockwise",
  "database.saved",
  "database.error",
  "module.camera",
  "module.arm",
  "module.armValue",
  "aria.cameraSource",
  "aria.cameraVideoLayout",
  "aria.armSimulator",
  "panels.cameraView",
  "panels.armJoints",
  "panels.armControl",
  "panels.servoLinkage",
  "panels.motorLinkage",
  "panels.firmwareUpload",
  "panels.eventLog",
  "fields.streamUrl",
  "fields.activeVideoSource",
  "fields.videoLayout",
  "fields.sourceDevicePath",
  "fields.sourcePort",
  "fields.sourceStreamUrl",
  "fields.webrtcOfferUrl",
  "fields.cameraStreamMode",
  "fields.latencyProfile",
  "fields.masterPercent",
  "fields.masterSpeedPercent",
  "fields.weightPercent",
  "fields.linkageMode",
  "fields.positionMode",
  "fields.wheelMode",
  "fields.temporaryReverse",
  "fields.memberDirection",
  "fields.forwardRotation",
  "fields.reverseRotation",
  "fields.limitTurns",
  "fields.turnsTarget",
  "fields.feedbackProtection",
  "fields.safetyPreset",
  "fields.clockwiseTurns",
  "fields.counterclockwiseTurns",
  "fields.neutralDeg",
  "fields.segmentLength",
  "fields.liveDrag",
  "fields.board",
  "fields.serialPort",
  "metrics.safety",
  "metrics.activeMode",
  "metrics.relativeAngle",
  "metrics.globalAngle",
  "metrics.turnProgress",
  "metrics.members",
  "metrics.mode",
  "metrics.activeDirection",
  "metrics.uiDebug",
  "metrics.arduinoDebug",
  "metrics.lastError",
  "metrics.firmwareHelper",
  "metrics.firmware",
  "metrics.hexSize",
  "metrics.serialPort",
  "metrics.streamMode",
  "metrics.latencyProfile",
  "status.syncing",
  "status.unknown",
  "status.noError",
  "placeholders.addServoToGroup",
  "placeholders.addMotorToGroup",
  "empty.noFeedback",
  "empty.noArmJoints",
  "empty.noLinkageGroups",
  "empty.noMotorLinkageGroups",
  "empty.noMotorLinkageMembers",
  "empty.noCameraStream",
  "empty.noFirmwarePorts",
  "logs.serialDisconnected",
  "logs.linkageCommandSent",
  "logs.armNoTargets",
  "logs.armNoAvailableServo",
  "logs.armCommandSent",
  "logs.armPaused",
  "logs.motorLinkageCommandSent",
  "logs.motorDebugAutoRecover",
  "logs.motorDebugRetryFailed",
  "logs.motorDirectionDeadtime",
  "logs.motorCommandTimeout",
  "logs.servoPaused",
  "logs.servoSafetyStopped",
  "logs.wheelTurnsComplete",
  "logs.firmwareHelperReady",
  "logs.firmwareUploadComplete",
  "firmware.status.compiled",
  "firmware.errors.helperUnavailable",
  "safety.reasons.stall",
  "safety.reasons.load",
  "logs.cameraConfigInvalid",
  "serial.errors.unsupportedWebSerial",
  "validation.servoIdRange",
  "validation.linkagePercent",
  "validation.cameraServoIds",
  "camera.gimbalReady",
  "camera.streamModes.mjpeg",
  "camera.streamModes.webrtc",
  "camera.streamModes.mjpegFallback",
  "camera.latencyProfiles.lowLatency",
  "camera.latencyProfiles.balanced",
  "camera.latencyProfiles.sharp",
  "camera.videoLayout.single",
  "camera.videoLayout.dual",
  "camera.webrtcFallback",
  "arm.preview",
  "arm.live",
  "arm.directBusHint"
];

function hasNestedKey(value: unknown, key: string) {
  return key.split(".").every((segment) => {
    if (!value || typeof value !== "object" || !(segment in value)) {
      return false;
    }
    value = (value as Record<string, unknown>)[segment];
    return true;
  });
}

describe("i18n resources", () => {
  it("provides resources for every supported language", () => {
    for (const language of supportedLanguages) {
      expect(resources[language.code]).toBeDefined();
    }
  });

  it("includes the core UI, log, serial, and validation keys in each language", () => {
    for (const language of supportedLanguages) {
      for (const key of requiredKeys) {
        expect(hasNestedKey(resources[language.code].translation, key), `${language.code} should include ${key}`).toBe(true);
      }
    }
  });
});
