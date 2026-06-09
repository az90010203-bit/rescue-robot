import type { PcCommand } from "@adapters/hardware/protocol";

export function isLatestWinsAboardMotorCommand(command: PcCommand): boolean {
  return command.type === "motor.target" || command.type === "mecanum.target" || command.type === "can_servo.move";
}

export function isLatestWinsAboardMotorBatch(commands: PcCommand[]): boolean {
  return commands.length > 0 && commands.every(isLatestWinsAboardMotorCommand);
}

export function shouldClearPendingAboardMotion(command: PcCommand): boolean {
  return !isLatestWinsAboardMotorCommand(command);
}
