import { Play } from "lucide-react";
import type { TFunction } from "i18next";
import type { ServoProfile, MotorDirection, MotorProfile } from "@adapters/hardware/protocol";
import type { ArmJointConfig, CameraConfig } from "@adapters/persistence/storage";
import { formatServoAngle, type ActiveModule, type GamepadSummary, type MotorFeedbackMap, type ServoFeedbackMap } from "@app/appModel";
import { Metric, PanelTitle } from "@shared/ui/AppChrome";

interface FeedbackPanelProps {
  activeGamepad?: GamepadSummary | null;
  activeModule: ActiveModule;
  cameraCanCommand: boolean;
  cameraConfig: CameraConfig;
  cameraStreamFailed: boolean;
  cameraStreamLoaded: boolean;
  cameraStreamUrl: string;
  cameraValidationError: string | null;
  connected: boolean;
  driveCanCommand: boolean;
  driveInput: {
    cameraPan: number;
    cameraTilt: number;
    forward: number;
    strafe: number;
    turn: number;
  };
  formatDirectionLabel: (direction: MotorDirection | string) => string;
  metricNumber: (value: number | undefined, digits?: number) => string | undefined;
  motorFeedback: MotorFeedbackMap;
  selectedArmFeedback: ServoFeedbackMap[number] | undefined;
  selectedArmJoint: ArmJointConfig | null;
  selectedMotor: MotorProfile | undefined;
  selectedServo: ServoProfile | undefined;
  servoFeedback: ServoFeedbackMap;
  t: TFunction;
}

export function FeedbackPanel({
  activeGamepad,
  activeModule,
  cameraCanCommand,
  cameraConfig,
  cameraStreamFailed,
  cameraStreamLoaded,
  cameraStreamUrl,
  cameraValidationError,
  connected,
  driveCanCommand,
  driveInput,
  formatDirectionLabel,
  metricNumber,
  motorFeedback,
  selectedArmFeedback,
  selectedArmJoint,
  selectedMotor,
  selectedServo,
  servoFeedback,
  t
}: FeedbackPanelProps) {
  return (
    <section className="panel feedback-panel" aria-labelledby="feedback-title">
      <PanelTitle icon={<Play size={18} />} id="feedback-title" meta={feedbackMeta(activeModule, { activeGamepad, cameraStreamUrl, selectedArmJoint, selectedMotor, selectedServo, t })} title={activeModule === "mapping" ? t("panels.inputStatus") : t("panels.telemetry")} />
      {false ? (
        <div className="feedback-grid">
          <Metric
            label={t("metrics.stream")}
            value={cameraStreamUrl ? (cameraStreamFailed ? t("status.streamError") : cameraStreamLoaded ? t("status.streamOnline") : t("status.streamLoading")) : t("status.streamMissing")}
            tone={cameraStreamFailed ? "danger" : cameraStreamLoaded ? "online" : "neutral"}
          />
          <Metric label={t("metrics.serial")} value={connected ? t("status.online") : t("status.offline")} tone={connected ? "online" : "danger"} />
          <Metric label={t("metrics.panServo")} value={`ID ${cameraConfig.panServoId}`} />
          <Metric label={t("metrics.tiltServo")} value={`ID ${cameraConfig.tiltServoId}`} />
          <Metric label={t("metrics.step")} value={cameraConfig.stepDeg} suffix=" deg" />
          <Metric label={t("metrics.gimbal")} value={cameraValidationError ? t("status.configInvalid") : cameraCanCommand ? t("status.ready") : t("status.standby")} tone={cameraValidationError ? "danger" : cameraCanCommand ? "online" : "neutral"} />
          <Metric label={t("metrics.drive")} value={driveCanCommand ? t("status.ready") : t("status.standby")} tone={driveCanCommand ? "online" : "neutral"} />
        </div>
      ) : activeModule === "mapping" ? (
        <div className="feedback-grid">
          <Metric label={t("metrics.forward")} value={Math.round(driveInput.forward * 100)} suffix="%" />
          <Metric label={t("metrics.strafe")} value={Math.round(driveInput.strafe * 100)} suffix="%" />
          <Metric label={t("metrics.turn")} value={Math.round(driveInput.turn * 100)} suffix="%" />
          <Metric label={t("metrics.cameraPan")} value={Math.round(driveInput.cameraPan * 100)} suffix="%" />
          <Metric label={t("metrics.cameraTilt")} value={Math.round(driveInput.cameraTilt * 100)} suffix="%" />
          <Metric label={t("metrics.gamepad")} value={activeGamepad ? `#${activeGamepad.index}` : t("mapping.noGamepad")} tone={activeGamepad ? "online" : "neutral"} />
        </div>
      ) : activeModule === "arm" ? (
        selectedArmJoint && selectedArmFeedback ? (
          <div className="feedback-grid">
            <Metric label={t("metrics.position")} value={metricNumber(selectedArmFeedback.positionDeg)} suffix=" deg" />
            <Metric label={t("metrics.speed")} value={metricNumber(selectedArmFeedback.speedRpm, 2)} suffix=" rpm" />
            <Metric label={t("metrics.load")} value={metricNumber(selectedArmFeedback.loadPercent)} suffix="%" />
            <Metric label={t("metrics.voltage")} value={metricNumber(selectedArmFeedback.voltageV)} suffix=" V" />
            <Metric label={t("metrics.temp")} value={selectedArmFeedback.temperatureC} suffix="°C" />
            <Metric label={t("metrics.current")} value={metricNumber(selectedArmFeedback.currentMa)} suffix=" mA" />
            <Metric label={t("fields.angleDeg")} value={formatServoAngle(selectedArmJoint.angleDeg)} suffix=" deg" />
            <Metric label={t("metrics.moving")} value={selectedArmFeedback.moving ? t("common.yes") : t("common.no")} tone={selectedArmFeedback.moving ? "warning" : "neutral"} />
          </div>
        ) : (
          <div className="empty-state">{t("empty.noFeedback")}</div>
        )
      ) : activeModule === "servo" ? (
        selectedServo && servoFeedback[selectedServo.id] ? (
          <div className="feedback-grid">
            <Metric label={t("metrics.position")} value={metricNumber(servoFeedback[selectedServo.id].positionDeg)} suffix=" deg" />
            <Metric label={t("metrics.speed")} value={metricNumber(servoFeedback[selectedServo.id].speedRpm, 2)} suffix=" rpm" />
            <Metric label={t("metrics.load")} value={metricNumber(servoFeedback[selectedServo.id].loadPercent)} suffix="%" />
            <Metric label={t("metrics.voltage")} value={metricNumber(servoFeedback[selectedServo.id].voltageV)} suffix=" V" />
            <Metric label={t("metrics.temp")} value={servoFeedback[selectedServo.id].temperatureC} suffix="°C" />
            <Metric label={t("metrics.current")} value={metricNumber(servoFeedback[selectedServo.id].currentMa)} suffix=" mA" />
            <Metric label={t("metrics.moving")} value={servoFeedback[selectedServo.id].moving ? t("common.yes") : t("common.no")} tone={servoFeedback[selectedServo.id].moving ? "warning" : "neutral"} />
          </div>
        ) : (
          <div className="empty-state">{t("empty.noFeedback")}</div>
        )
      ) : selectedMotor && motorFeedback[selectedMotor.channel] ? (
        <div className="feedback-grid">
          <Metric label={t("metrics.command")} value={motorFeedback[selectedMotor.channel].commandedSpeedPercent} suffix="%" />
          <Metric label={t("metrics.duty")} value={motorFeedback[selectedMotor.channel].dutyPercent} suffix="%" />
          <Metric label={t("metrics.direction")} value={formatDirectionLabel(motorFeedback[selectedMotor.channel].direction ?? "stopped")} />
          <Metric label={t("metrics.rpm")} value={motorFeedback[selectedMotor.channel].speedRpm} />
          <Metric label={t("metrics.pulseHz")} value={motorFeedback[selectedMotor.channel].pulseHz} />
          <Metric label={t("metrics.ticks")} value={motorFeedback[selectedMotor.channel].encoderTicks} />
        </div>
      ) : (
        <div className="empty-state">{t("empty.noFeedback")}</div>
      )}
    </section>
  );
}

interface FeedbackMetaContext {
  activeGamepad?: GamepadSummary | null;
  cameraStreamUrl: string;
  selectedArmJoint: ArmJointConfig | null;
  selectedMotor: MotorProfile | undefined;
  selectedServo: ServoProfile | undefined;
  t: TFunction;
}

function feedbackMeta(activeModule: ActiveModule, { activeGamepad, cameraStreamUrl, selectedArmJoint, selectedMotor, selectedServo, t }: FeedbackMetaContext) {
  if (activeModule === "servo") {
    return selectedServo?.name ?? t("meta.noTarget");
  }
  if (activeModule === "arm") {
    return selectedArmJoint?.name ?? t("meta.noTarget");
  }
  if (activeModule === "motor") {
    return selectedMotor?.channel ?? t("meta.noTarget");
  }
  if (activeModule === "mapping") {
    return activeGamepad ? `#${activeGamepad.index}` : t("mapping.noGamepad");
  }
  return cameraStreamUrl ? t("meta.streamConfigured") : t("meta.noStream");
}
