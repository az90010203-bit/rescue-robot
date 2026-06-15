import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
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
  "actions.solveIk",
  "actions.probeArmTuning",
  "actions.applyTuning",
  "actions.checkFirmwareHelper",
  "actions.refreshFirmwarePorts",
  "actions.compileFirmware",
  "actions.uploadFirmware",
  "actions.calibrateImu",
  "actions.configureCan",
  "actions.asmgMove",
  "actions.asmgReadPositionCurrent",
  "actions.asmgSetId",
  "actions.asmgFactoryReset",
  "actions.addMotorLinkageGroup",
  "actions.sendMotorLinkage",
  "actions.sendLinkage",
  "actions.pause",
  "actions.pauseGroup",
  "actions.clockwise",
  "actions.counterclockwise",
  "database.saved",
  "database.error",
  "dashboard.status.loading",
  "dashboard.status.saving",
  "dashboard.status.saved",
  "dashboard.status.offline",
  "dashboard.status.error",
  "dashboard.targets.mainArm",
  "dashboard.actions.addPanel",
  "dashboard.actions.editLayout",
  "dashboard.actions.doneEditing",
  "dashboard.actions.resetLayout",
  "dashboard.actions.addSelected",
  "dashboard.actions.movePanel",
  "dashboard.actions.resizePanel",
  "dashboard.actions.removePanel",
  "dashboard.actions.configurePanelMetrics",
  "dashboard.actions.recommendedMetrics",
  "dashboard.actions.selectAllMetrics",
  "dashboard.fields.panelType",
  "dashboard.fields.robotConsole",
  "dashboard.fields.target",
  "dashboard.fields.visibleMetrics",
  "dashboard.fields.hiddenMetrics",
  "dashboard.robot.projectDefault",
  "dashboard.robot.noRobots",
  "dashboard.panelTypes.console.camera-feed",
  "dashboard.panelTypes.console.arm-svg",
  "dashboard.panelTypes.console.telemetry",
  "dashboard.panelTypes.console.attitude",
  "dashboard.panelTypes.console.joystick",
  "dashboard.panelTypes.console.event-log",
  "dashboard.missingTarget",
  "dashboard.noTargets",
  "module.camera",
  "module.arm",
  "module.armValue",
  "console.attitude",
  "status.stale",
  "imu.calibrating",
  "imu.calibrated",
  "imu.uncalibrated",
  "metrics.roll",
  "metrics.pitch",
  "metrics.yaw",
  "metrics.imuStatus",
  "metrics.imuCalibration",
  "metrics.rawMag",
  "metrics.gyroDps",
  "metrics.mpuWhoAmI",
  "metrics.istWhoAmI",
  "metrics.canHostId",
  "metrics.canTx",
  "metrics.canRxFrame",
  "metrics.parsedFrame",
  "metrics.canFeedback",
  "canServo.bridge",
  "canServo.motion",
  "canServo.config",
  "canServo.danger",
  "canServo.errors.dangerConfirm",
  "canServo.errors.liveUnavailable",
  "canServo.live.ready",
  "canServo.parsed.positionCurrent",
  "canServo.speedFast",
  "canServo.speedSlow",
  "aria.cameraSource",
  "aria.cameraVideoLayout",
  "aria.armSimulator",
  "aria.arm3dSimulator",
  "panels.cameraView",
  "panels.armJoints",
  "panels.armControl",
  "panels.armKinematics",
  "panels.arm3dSimulation",
  "panels.servoLinkage",
  "panels.motorLinkage",
  "panels.firmwareUpload",
  "panels.canServo",
  "panels.machineClaw",
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
  "fields.targetX",
  "fields.targetY",
  "fields.board",
  "fields.serialPort",
  "fields.canServoId",
  "fields.canBitrate",
  "fields.asmgPosition",
  "fields.asmgPositionSlider",
  "fields.asmgSpeed",
  "fields.asmgSpeedSlider",
  "fields.asmgLiveDrag",
  "fields.asmgAngleLive",
  "fields.canAutoConfigure",
  "fields.singleServoConfirm",
  "fields.dangerConfirm",
  "metrics.asmgAngle",
  "metrics.safety",
  "metrics.activeMode",
  "metrics.relativeAngle",
  "metrics.globalAngle",
  "metrics.ikError",
  "metrics.suggestions",
  "metrics.turnProgress",
  "metrics.members",
  "metrics.mode",
  "metrics.activeDirection",
  "metrics.uiDebug",
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
  "logs.armTuningProbeComplete",
  "logs.motorLinkageCommandSent",
  "logs.aBoardBridgeRequired",
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
  "arm.tuningStatus.warning",
  "arm.tuningReasons.positionLag",
  "arm.directBusHint",
  "arm3d.meta",
  "arm3d.orbitHint",
  "arm3d.jointControls",
  "testTabs.arm3d",
  "testTabs.machineClaw",
  "machineClaw.actions.emergencyStop",
  "machineClaw.fields.rotationClawSpeed",
  "machineClaw.metrics.progress",
  "machineClaw.errors.feedbackRequired",
  "robotAssembly.assets",
  "robotAssembly.groups.components",
  "robotAssembly.groups.plugins",
  "robotAssembly.groups.hardware",
  "robotAssembly.saveState.saved",
  "robotAssembly.warningCount",
  "robotAssembly.dragHint",
  "robotAssembly.inspector.title",
  "robotAssembly.inspector.nodesWires",
  "robotAssembly.selectHint",
  "robotAssembly.schematicCheck",
  "robotAssembly.actionButtons",
  "robotAssembly.runState.idle",
  "robotAssembly.warnings.shareGround"
];

const robotAssemblyDynamicKeys = [
  "robotAssembly.runState.idle",
  "robotAssembly.runState.preview",
  "robotAssembly.runState.running",
  "robotAssembly.runState.done",
  "robotAssembly.runState.error",
  "robotAssembly.runState.aborted",
  "robotAssembly.warnings.missingEndpoint",
  "robotAssembly.warnings.loopback",
  "robotAssembly.warnings.uartTxRx",
  "robotAssembly.warnings.uartSerial",
  "robotAssembly.warnings.uartBaud",
  "robotAssembly.warnings.groundMismatch",
  "robotAssembly.warnings.voltageMismatch",
  "robotAssembly.warnings.powerVoltage",
  "robotAssembly.warnings.pwmEndpoint",
  "robotAssembly.warnings.canEndpoint",
  "robotAssembly.warnings.shareGround"
];

const robotAssemblyWorkspaceSources = [
  "../domains/robot-assembly/RobotAssemblyWorkspace.tsx",
  "../domains/robot-assembly/RobotProgramPanel.tsx"
].map((path) => readFileSync(resolve(dirname(fileURLToPath(import.meta.url)), path), "utf8"));

function hasNestedKey(value: unknown, key: string) {
  return key.split(".").every((segment) => {
    if (!value || typeof value !== "object" || !(segment in value)) {
      return false;
    }
    value = (value as Record<string, unknown>)[segment];
    return true;
  });
}

function nestedValue(value: unknown, key: string) {
  for (const segment of key.split(".")) {
    if (!value || typeof value !== "object" || !(segment in value)) {
      return undefined;
    }
    value = (value as Record<string, unknown>)[segment];
  }
  return value;
}

function flattenKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return prefix ? [prefix] : [];
  }

  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => {
    const nextPrefix = prefix ? `${prefix}.${key}` : key;
    return flattenKeys(child, nextPrefix);
  });
}

function robotAssemblyKeysUsedByWorkspace() {
  const keys = new Set(robotAssemblyDynamicKeys);
  for (const source of robotAssemblyWorkspaceSources) {
    for (const match of source.matchAll(/(?:robotText|programText)\("([^"`]+)"/g)) {
      keys.add(`robotAssembly.${match[1]}`);
    }
  }
  return [...keys].sort();
}

describe("i18n resources", () => {
  it("provides resources for every supported language", () => {
    for (const language of supportedLanguages) {
      expect(resources[language.code]).toBeDefined();
    }
  });

  it("keeps the full translation key set identical across languages", () => {
    const [baseLanguage] = supportedLanguages;
    const baseKeys = flattenKeys(resources[baseLanguage.code].translation).sort();

    for (const language of supportedLanguages.slice(1)) {
      const keys = flattenKeys(resources[language.code].translation).sort();
      expect(keys, `${language.code} keys should match ${baseLanguage.code}`).toEqual(baseKeys);
    }
  });

  it("includes the core UI, log, serial, and validation keys in each language", () => {
    for (const language of supportedLanguages) {
      for (const key of requiredKeys) {
        expect(hasNestedKey(resources[language.code].translation, key), `${language.code} should include ${key}`).toBe(true);
      }
    }
  });

  it("covers every robot assembly workspace text key in each language", () => {
    const keys = robotAssemblyKeysUsedByWorkspace();
    expect(keys.length).toBeGreaterThan(robotAssemblyDynamicKeys.length);

    for (const language of supportedLanguages) {
      for (const key of keys) {
        expect(hasNestedKey(resources[language.code].translation, key), `${language.code} should include ${key}`).toBe(true);
      }
    }
  });

  it("does not expose raw robot assembly keys as visible copy", () => {
    for (const language of supportedLanguages) {
      for (const key of robotAssemblyKeysUsedByWorkspace()) {
        const value = nestedValue(resources[language.code].translation, key);
        if (typeof value === "string") {
          expect(value, `${language.code} ${key} should not render as a key`).not.toMatch(/^(robotAssembly|architecture)\./);
        }
      }
    }
  });
});
