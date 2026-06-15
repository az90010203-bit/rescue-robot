import type { AboardBridgeStatus, ActiveModule, AppSection, PiServoBridgeStatus, TestPanel } from "@app/appModel";

interface AboardBridgeAutoCheckState {
  activeSection: AppSection;
  activeTest: TestPanel;
  alreadyCheckedHost: string;
  host: string;
  manualDisconnect: boolean;
  status: AboardBridgeStatus;
}

export function shouldAutoCheckAboardBridge(state: AboardBridgeAutoCheckState): boolean {
  const host = state.host.trim();
  if (!host || state.manualDisconnect) {
    return false;
  }
  if (state.status === "connected" || state.status === "checking" || state.status === "starting") {
    return false;
  }
  if (state.alreadyCheckedHost === host) {
    return false;
  }
  return (
    state.activeSection === "console" ||
    (state.activeSection === "tests" && state.activeTest === "canServo") ||
    (state.activeSection === "tests" && state.activeTest === "motor")
  );
}

interface BridgeAutoRecoverState {
  host: string;
  manualDisconnect: boolean;
  status: AboardBridgeStatus | PiServoBridgeStatus;
}

export function shouldAutoRecoverBridge(state: BridgeAutoRecoverState): boolean {
  return Boolean(state.host.trim()) && !state.manualDisconnect && state.status === "error";
}

interface PiServoBridgeAutoCheckState {
  activeModule: ActiveModule;
  activeSection: AppSection;
  activeTest: TestPanel;
}

export function shouldAutoCheckPiServoBridgeContext(state: PiServoBridgeAutoCheckState): boolean {
  return (
    state.activeModule === "servo" ||
    state.activeModule === "arm" ||
    (state.activeSection === "tests" && (state.activeTest === "servo" || state.activeTest === "arm" || state.activeTest === "arm3d" || state.activeTest === "machineClaw"))
  );
}
