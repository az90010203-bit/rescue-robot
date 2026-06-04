import { PlatformCommand, PlatformCommandResult, PlatformCommandType, validatePlatformCommand } from "./commands";

export type PlatformCommandHandler = (command: PlatformCommand) => Promise<Partial<PlatformCommandResult> | PlatformCommandResult | null | undefined>;

export type PlatformCommandHandlerMap = Partial<Record<PlatformCommandType, PlatformCommandHandler>>;

export interface PlatformCommandExecutorOptions {
  handlers: PlatformCommandHandlerMap;
  fallback?: PlatformCommandHandler;
}

export async function executePlatformCommand(command: PlatformCommand, options: PlatformCommandExecutorOptions): Promise<PlatformCommandResult> {
  const validationError = validatePlatformCommand(command);
  if (validationError) {
    return {
      commandId: command.id,
      deviceId: command.targetDeviceId,
      status: "failed",
      message: validationError
    };
  }

  const handler = options.handlers[command.type] ?? options.fallback;
  if (!handler) {
    return skippedResult(command);
  }

  try {
    const handled = await handler(command);
    if (!handled) {
      return skippedResult(command);
    }
    return {
      commandId: handled.commandId ?? command.id,
      deviceId: handled.deviceId ?? command.targetDeviceId,
      status: handled.status ?? "sent",
      message: handled.message,
      response: handled.response
    };
  } catch (error) {
    return {
      commandId: command.id,
      deviceId: command.targetDeviceId,
      status: "failed",
      message: error instanceof Error && error.message ? error.message : "platform command failed"
    };
  }
}

function skippedResult(command: PlatformCommand): PlatformCommandResult {
  return {
    commandId: command.id,
    deviceId: command.targetDeviceId,
    status: "skipped",
    message: "platform command was not handled"
  };
}
