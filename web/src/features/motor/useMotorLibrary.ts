import type { FormEvent } from "react";
import { createPlatformCommand } from "../../platform/commands";
import { TB6618_MOTOR_DEBUGGER_INO_FILENAME, buildTb6618MotorDebuggerIno } from "../../lib/arduinoFirmware";
import { normalizeMotorChannel, type MotorProfile } from "../../lib/protocol";
import { validateMotorDraft, validateMotorMapping } from "../../lib/storage";
import type { MotorFeedbackMap, MotorMappingField } from "../../app/appModel";
import { nextMotorDraft } from "../../app/appModel";

interface UseMotorLibraryOptions {
  addSystemLog: (messageKey: string, level?: any, values?: any) => void;
  dispatchPlatformCommand: (command: any) => Promise<{ status: string }>;
  motorDraft: any;
  motors: MotorProfile[];
  selectedChannel: string;
  selectedMotor: MotorProfile | undefined;
  setMotorConfigError: (error: any) => void;
  setMotorDraft: (draft: any) => void;
  setMotorFeedback: (updater: (current: MotorFeedbackMap) => MotorFeedbackMap) => void;
  setMotorLibraryError: (error: any) => void;
  setMotors: (updater: MotorProfile[] | ((current: MotorProfile[]) => MotorProfile[])) => void;
  setSelectedChannel: (channel: string) => void;
}

export function useMotorLibrary({
  addSystemLog,
  dispatchPlatformCommand,
  motorDraft,
  motors,
  selectedChannel,
  selectedMotor,
  setMotorConfigError,
  setMotorDraft,
  setMotorFeedback,
  setMotorLibraryError,
  setMotors,
  setSelectedChannel
}: UseMotorLibraryOptions) {
  function addMotor(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const error = validateMotorDraft(motorDraft, motors);
    if (error) {
      setMotorLibraryError(error);
      return;
    }

    const motor = { channel: normalizeMotorChannel(motorDraft.channel), name: motorDraft.name.trim() };
    const nextMotors = [...motors, motor].sort((a, b) => a.channel.localeCompare(b.channel, undefined, { numeric: true }));
    setMotors(nextMotors);
    setSelectedChannel(motor.channel);
    setMotorDraft(nextMotorDraft(nextMotors));
    setMotorLibraryError(null);
  }

  function removeMotor(channel: string) {
    const normalized = normalizeMotorChannel(channel);
    setMotors((current) => current.filter((motor) => motor.channel !== normalized));
    setMotorFeedback((current) => {
      const next = { ...current };
      delete next[normalized];
      return next;
    });
    if (selectedChannel === normalized) {
      setSelectedChannel("");
    }
  }

  function updateSelectedMotorMapping(field: MotorMappingField, value: string) {
    if (!selectedMotor) {
      return;
    }
    setMotorConfigError(null);
    setMotors((current) => current.map((motor) => (motor.channel === selectedMotor.channel ? { ...motor, [field]: value } : motor)));
  }

  function saveMotorMapping() {
    if (!selectedMotor) {
      addSystemLog("logs.selectMotorFirst", "warn");
      return false;
    }

    const error = validateMotorMapping(selectedMotor);
    if (error) {
      setMotorConfigError(error);
      addSystemLog("logs.motorMappingInvalid", "error");
      return false;
    }

    setMotorConfigError(null);
    addSystemLog("logs.motorMappingSaved");
    return true;
  }

  function downloadArduinoFirmware() {
    const blob = new Blob([buildTb6618MotorDebuggerIno(motors)], { type: "text/x-arduino;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = TB6618_MOTOR_DEBUGGER_INO_FILENAME;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function sendMotorConfig() {
    if (!selectedMotor) {
      addSystemLog("logs.selectMotorFirst", "warn");
      return;
    }

    const error = validateMotorMapping(selectedMotor);
    if (error) {
      setMotorConfigError(error);
      addSystemLog("logs.motorMappingInvalid", "error");
      return;
    }

    try {
      const result = await dispatchPlatformCommand(
        createPlatformCommand("motor.configure", `motor:${selectedMotor.channel}`, {
          pwmPin: selectedMotor.pwmPin ?? "",
          in1Pin: selectedMotor.in1Pin ?? "",
          in2Pin: selectedMotor.in2Pin ?? "",
          enablePin: selectedMotor.enablePin,
          sensorPin: selectedMotor.sensorPin,
          encoderAPin: selectedMotor.encoderAPin,
          encoderBPin: selectedMotor.encoderBPin
        })
      );
      if (result.status === "sent") {
        setMotorConfigError(null);
        addSystemLog("logs.motorConfigSent");
      }
    } catch {
      setMotorConfigError("validation.invalidMotorPin");
      addSystemLog("logs.motorMappingInvalid", "error");
    }
  }

  return {
    addMotor,
    downloadArduinoFirmware,
    removeMotor,
    saveMotorMapping,
    sendMotorConfig,
    updateSelectedMotorMapping
  };
}
