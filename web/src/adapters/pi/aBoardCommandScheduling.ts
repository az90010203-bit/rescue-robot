import type { PcCommand } from "@adapters/hardware/protocol";

export function isLatestWinsAboardCommand(command: PcCommand): boolean {
  return command.type === "motor.target" || command.type === "mecanum.target" || command.type === "can_servo.move" || command.type === "can_servo.group_move";
}

export function isLatestWinsAboardBatch(commands: PcCommand[]): boolean {
  return commands.length > 0 && commands.every(isLatestWinsAboardCommand);
}

export function shouldClearPendingAboardMotion(command: PcCommand): boolean {
  return !isLatestWinsAboardCommand(command);
}
