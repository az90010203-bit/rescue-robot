import { WebSerialClient } from "../lib/serial";
import { isServoBusModule, type ActiveModule, type ConnectionMode } from "./appModel";

interface UseSerialConnectionRuntimeOptions {
  activeModule: ActiveModule;
  addErrorLog: (error: unknown, fallbackKey: string) => void;
  addLog: (source: "rx" | "tx" | "system", message: string, level?: any) => void;
  addSystemLog: (messageKey: string, level?: any, values?: any) => void;
  cancelArmLiveMove: () => void;
  cancelLiveAngleMove: () => void;
  cancelLiveWheelMove: () => void;
  cancelServoMotion: () => void;
  cancelServoSafetyMonitor: () => void;
  debugEnabled: boolean;
  handleMessage: (message: any) => void;
  lastServoWheelSpeedRef: { current: Record<number, number> };
  livePositionModeServoRef: { current: Set<number> };
  platformEventBusRef: { current: { emit: (event: any) => void } };
  resetMotorDebugHandshake: () => void;
  serialRef: { current: WebSerialClient | null };
  servoSerialQueueRef: { current: Promise<void> };
  setConnected: (connected: boolean) => void;
  setConnectionMode: (mode: ConnectionMode | null) => void;
  stopAllMotors: (quiet?: boolean) => Promise<unknown>;
  webSerialAvailable: boolean;
  writeDebugSetToClient: (client: WebSerialClient, activeModule: ActiveModule, debugEnabled: boolean) => Promise<unknown>;
}

export function useSerialConnectionRuntime({
  activeModule,
  addErrorLog,
  addLog,
  addSystemLog,
  cancelArmLiveMove,
  cancelLiveAngleMove,
  cancelLiveWheelMove,
  cancelServoMotion,
  cancelServoSafetyMonitor,
  debugEnabled,
  handleMessage,
  lastServoWheelSpeedRef,
  livePositionModeServoRef,
  platformEventBusRef,
  resetMotorDebugHandshake,
  serialRef,
  servoSerialQueueRef,
  setConnected,
  setConnectionMode,
  stopAllMotors,
  webSerialAvailable,
  writeDebugSetToClient
}: UseSerialConnectionRuntimeOptions) {
  async function connectSerial() {
    if (!webSerialAvailable) {
      addSystemLog("serial.errors.unsupportedWebSerial", "error");
      return;
    }

    try {
      const mode: ConnectionMode = isServoBusModule(activeModule) ? "servo-bus" : "controller";
      const client = new WebSerialClient(handleMessage);
      await client.connect(mode === "servo-bus" ? 1000000 : 115200, mode === "servo-bus" ? "binary" : "json");
      serialRef.current = client;
      setConnectionMode(mode);
      setConnected(true);
      resetMotorDebugHandshake();
      platformEventBusRef.current.emit({
        type: "serial.connected",
        level: "info",
        source: mode === "servo-bus" ? "transport.web-serial" : "transport.controller-json",
        payload: { mode, baudRate: mode === "servo-bus" ? 1000000 : 115200 }
      });
      addLog("system", mode === "servo-bus" ? "Servo bus connected: 1000000 baud" : "Controller serial connected: 115200 baud");
      if (mode === "controller") {
        await writeDebugSetToClient(client, activeModule, debugEnabled);
      }
    } catch (error) {
      addErrorLog(error, "logs.serialConnectFailed");
    }
  }

  async function disconnectSerial() {
    await stopAllMotors(true);
    await serialRef.current?.disconnect();
    serialRef.current = null;
    cancelLiveAngleMove();
    cancelLiveWheelMove();
    cancelArmLiveMove();
    livePositionModeServoRef.current.clear();
    cancelServoMotion();
    cancelServoSafetyMonitor();
    lastServoWheelSpeedRef.current = {};
    servoSerialQueueRef.current = Promise.resolve();
    setConnectionMode(null);
    setConnected(false);
    resetMotorDebugHandshake();
    platformEventBusRef.current.emit({
      type: "serial.disconnected",
      level: "warn",
      source: "transport.web-serial",
      payload: {}
    });
    addSystemLog("logs.serialClosed");
  }

  return { connectSerial, disconnectSerial };
}
