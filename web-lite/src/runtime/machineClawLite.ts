import type { InboundMessage } from "@adapters/hardware/protocol";
import {
  DEFAULT_MACHINE_CLAW_TEST_CONFIG,
  machineClawFeedbackPositionRaw,
  normalizeMachineClawTestConfig,
  type MachineClawTestConfig
} from "@domains/machine-claw/machineClaw";
import type { PiServoCommandResult } from "./bridgeClient";

export const MACHINE_CLAW_STORAGE_KEY = "rescue-robot-lite.machineClaw.v1";

export function readMachineClawConfig(storage: Pick<Storage, "getItem" | "removeItem"> | undefined = globalThis.localStorage): MachineClawTestConfig {
  if (!storage) {
    return DEFAULT_MACHINE_CLAW_TEST_CONFIG;
  }
  try {
    const raw = storage.getItem(MACHINE_CLAW_STORAGE_KEY);
    return normalizeMachineClawTestConfig(raw ? JSON.parse(raw) : DEFAULT_MACHINE_CLAW_TEST_CONFIG);
  } catch {
    storage.removeItem(MACHINE_CLAW_STORAGE_KEY);
    return DEFAULT_MACHINE_CLAW_TEST_CONFIG;
  }
}

export function saveMachineClawConfig(config: MachineClawTestConfig, storage: Pick<Storage, "setItem"> | undefined = globalThis.localStorage): void {
  storage?.setItem(MACHINE_CLAW_STORAGE_KEY, JSON.stringify(normalizeMachineClawTestConfig(config)));
}

export function machineClawResponseFromResult(result: PiServoCommandResult | null | undefined): InboundMessage | null {
  if (!result) {
    return null;
  }
  return result.response ?? result.messages[result.messages.length - 1] ?? null;
}

export function machineClawFeedbackFromResult(result: PiServoCommandResult | null | undefined): InboundMessage | null {
  const response = machineClawResponseFromResult(result);
  if (machineClawFeedbackPositionRaw(response) !== null) {
    return response;
  }
  if (!result) {
    return null;
  }
  for (let index = result.messages.length - 1; index >= 0; index -= 1) {
    const message = result.messages[index];
    if (machineClawFeedbackPositionRaw(message) !== null) {
      return message;
    }
  }
  return null;
}

export function machineClawPositionRawFromResult(result: PiServoCommandResult | null | undefined): number | null {
  return machineClawFeedbackPositionRaw(machineClawFeedbackFromResult(result));
}
