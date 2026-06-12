import type { FormEvent } from "react";
import { createPlatformCommand } from "@platform/commands";
import { normalizeMotorChannel, normalizeMotorPin, type MotorProfile } from "@adapters/hardware/protocol";
import { validateMotorDraft, validateMotorMapping } from "@adapters/persistence/storage";
import type { MotorFeedbackMap, MotorMappingField } from "@app/appModel";
import { nextMotorDraft } from "@app/appModel";

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

    const normalizedMotor = normalizeMotorProfilePins(selectedMotor);
    setMotors((current) => current.map((motor) => (motor.channel === selectedMotor.channel ? normalizedMotor : motor)));
    setMotorConfigError(null);
    addSystemLog("logs.motorMappingSaved");
    return true;
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
      const normalizedMotor = normalizeMotorProfilePins(selectedMotor);
      setMotors((current) => current.map((motor) => (motor.channel === selectedMotor.channel ? normalizedMotor : motor)));
      const result = await dispatchPlatformCommand(
        createPlatformCommand("motor.configure", `motor:${normalizedMotor.channel}`, {
          pwmPin: normalizedMotor.pwmPin ?? "",
          in1Pin: normalizedMotor.in1Pin ?? "",
          in2Pin: normalizedMotor.in2Pin ?? "",
          enablePin: normalizedMotor.enablePin,
          sensorPin: normalizedMotor.sensorPin,
          encoderAPin: normalizedMotor.encoderAPin,
          encoderBPin: normalizedMotor.encoderBPin
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
    removeMotor,
    saveMotorMapping,
    sendMotorConfig,
    updateSelectedMotorMapping
  };
}

function normalizeMotorProfilePins(motor: MotorProfile): MotorProfile {
  const channel = normalizeMotorChannel(motor.channel);
  return {
    ...motor,
    channel,
    pwmPin: normalizeMotorPin(motor.pwmPin, "pwmPin", channel),
    in1Pin: normalizeMotorPin(motor.in1Pin, "in1Pin", channel),
    in2Pin: normalizeMotorPin(motor.in2Pin, "in2Pin", channel),
    enablePin: normalizeMotorPin(motor.enablePin, "enablePin", channel),
    sensorPin: normalizeMotorPin(motor.sensorPin, "sensorPin", channel),
    encoderAPin: normalizeMotorPin(motor.encoderAPin, "encoderAPin", channel),
    encoderBPin: normalizeMotorPin(motor.encoderBPin, "encoderBPin", channel)
  };
}
