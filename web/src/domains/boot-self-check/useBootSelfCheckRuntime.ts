import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PlatformCommand, PlatformCommandResult } from "@platform/commands";
import {
  BOOT_SELF_CHECK_STEP_ORDER,
  cancelBootSelfCheckRun,
  completeBootSelfCheckStep,
  createBootSelfCheckGateState,
  createBootSelfCheckSignature,
  createInitialBootSelfCheckRun,
  evaluateBootSelfCheckStep,
  markBootSelfCheckStepRunning,
  planBootSelfCheckStepCommands,
  type BootSelfCheckGateState,
  type BootSelfCheckInput,
  type BootSelfCheckLocalAction,
  type BootSelfCheckNavigateTarget,
  type BootSelfCheckRepairAction,
  type BootSelfCheckRun
} from "@domains/boot-self-check/bootSelfCheck";

interface UseBootSelfCheckRuntimeOptions {
  activeSection: string;
  addLog: (direction: "system", text: string, level?: "info" | "warn" | "error") => void;
  checkAboardSerialBridge: () => Promise<unknown>;
  checkPiServoSerialBridge: () => Promise<unknown>;
  dispatchPlatformCommand: (command: PlatformCommand) => Promise<PlatformCommandResult>;
  input: BootSelfCheckInput;
  selectModule: (module: "servo" | "arm" | "motor" | "camera" | "mapping") => void;
  selectSection: (section: "console" | "plugins" | "components" | "robots" | "tests" | "settings") => void;
  startAboardSerialBridge: () => Promise<unknown>;
  startPiServoSerialBridge: () => Promise<unknown>;
}

export function useBootSelfCheckRuntime({
  activeSection,
  addLog,
  checkAboardSerialBridge,
  checkPiServoSerialBridge,
  dispatchPlatformCommand,
  input,
  selectModule,
  selectSection,
  startAboardSerialBridge,
  startPiServoSerialBridge
}: UseBootSelfCheckRuntimeOptions) {
  const [run, setRun] = useState<BootSelfCheckRun | null>(null);
  const [overrideActive, setOverrideActive] = useState(false);
  const [busyRepairActionIds, setBusyRepairActionIds] = useState<string[]>([]);
  const inputRef = useRef(input);
  const callbacksRef = useRef({
    addLog,
    checkAboardSerialBridge,
    checkPiServoSerialBridge,
    dispatchPlatformCommand,
    selectModule,
    selectSection,
    startAboardSerialBridge,
    startPiServoSerialBridge
  });
  const generationRef = useRef(0);
  const autoRunSignaturesRef = useRef(new Set<string>());

  useEffect(() => {
    inputRef.current = input;
  }, [input]);

  useEffect(() => {
    callbacksRef.current = {
      addLog,
      checkAboardSerialBridge,
      checkPiServoSerialBridge,
      dispatchPlatformCommand,
      selectModule,
      selectSection,
      startAboardSerialBridge,
      startPiServoSerialBridge
    };
  }, [
    addLog,
    checkAboardSerialBridge,
    checkPiServoSerialBridge,
    dispatchPlatformCommand,
    selectModule,
    selectSection,
    startAboardSerialBridge,
    startPiServoSerialBridge
  ]);

  const signature = useMemo(() => createBootSelfCheckSignature(input), [input]);
  const gate = useMemo<BootSelfCheckGateState>(() => createBootSelfCheckGateState(run, overrideActive), [overrideActive, run]);

  const runSelfCheck = useCallback(async (options: { manual?: boolean } = {}) => {
    const manual = options.manual === true;
    const currentSignature = createBootSelfCheckSignature(inputRef.current);
    if (!manual && autoRunSignaturesRef.current.has(currentSignature)) {
      return;
    }
    autoRunSignaturesRef.current.add(currentSignature);
    setOverrideActive(false);
    const generation = generationRef.current + 1;
    generationRef.current = generation;
    let currentRun = createInitialBootSelfCheckRun(inputRef.current);
    currentRun = {
      ...currentRun,
      status: "running",
      summary: manual ? "手动重新运行开机自检。" : "进入主控台，开机自检启动。",
      auditLog: [manual ? "手动重新运行开机自检。" : "进入主控台，开机自检启动。"]
    };
    setRun(currentRun);
    callbacksRef.current.addLog("system", currentRun.summary);

    for (const stepId of BOOT_SELF_CHECK_STEP_ORDER) {
      if (generationRef.current !== generation) {
        currentRun = cancelBootSelfCheckRun(currentRun);
        setRun(currentRun);
        return;
      }
      currentRun = markBootSelfCheckStepRunning(currentRun, stepId);
      setRun(currentRun);
      const commandPlan = planBootSelfCheckStepCommands(stepId, inputRef.current);
      const results: PlatformCommandResult[] = [];
      for (const command of commandPlan.commands) {
        if (generationRef.current !== generation) {
          currentRun = cancelBootSelfCheckRun(currentRun);
          setRun(currentRun);
          return;
        }
        results.push(await callbacksRef.current.dispatchPlatformCommand(command));
      }
      const execution = evaluateBootSelfCheckStep(stepId, inputRef.current, results);
      currentRun = completeBootSelfCheckStep(currentRun, stepId, execution);
      currentRun = {
        ...currentRun,
        auditLog: [
          ...currentRun.auditLog,
          `${execution.status.toUpperCase()} ${stepTitle(currentRun, stepId)}: ${execution.message}`
        ]
      };
      setRun(currentRun);
      if (commandPlan.skipReason) {
        currentRun = {
          ...currentRun,
          auditLog: [...currentRun.auditLog, `SKIP ${stepTitle(currentRun, stepId)}: ${commandPlan.skipReason}`]
        };
        setRun(currentRun);
      }
    }

    currentRun = {
      ...currentRun,
      completedAt: Date.now(),
      activeStepId: undefined
    };
    setRun(currentRun);
    callbacksRef.current.addLog("system", currentRun.summary, currentRun.status === "failed" ? "warn" : "info");
  }, []);

  useEffect(() => {
    if (activeSection !== "console") {
      if (run?.status === "running") {
        generationRef.current += 1;
        setRun((current) => current ? cancelBootSelfCheckRun(current) : current);
      }
      return;
    }
    void runSelfCheck({ manual: false });
  }, [activeSection, run?.status, runSelfCheck, signature]);

  function cancelRun() {
    generationRef.current += 1;
    setRun((current) => current ? cancelBootSelfCheckRun(current) : current);
    callbacksRef.current.addLog("system", "开机自检已取消。", "warn");
  }

  function overrideGate() {
    setOverrideActive(true);
    callbacksRef.current.addLog("system", "操作员已临时解除开机自检门禁。", "warn");
  }

  async function runRepairAction(action: BootSelfCheckRepairAction) {
    setBusyRepairActionIds((current) => [...current, action.id]);
    setRepairActionStatus(action.id, "running");
    try {
      if (action.kind === "platform-command" && action.command) {
        const result = await callbacksRef.current.dispatchPlatformCommand(action.command);
        setRepairActionStatus(action.id, result.status === "sent" ? "done" : "failed", result.message ?? result.status);
        callbacksRef.current.addLog("system", `${action.label}: ${result.status}${result.message ? ` (${result.message})` : ""}`, result.status === "sent" ? "info" : "warn");
      } else if (action.kind === "local-action" && action.localAction) {
        await runLocalRepair(action.localAction);
        setRepairActionStatus(action.id, "done", "done");
        callbacksRef.current.addLog("system", `${action.label}: done`);
        await runSelfCheck({ manual: true });
      } else if (action.kind === "navigate" && action.navigateTo) {
        navigateForRepair(action.navigateTo);
        setRepairActionStatus(action.id, "done", "opened");
        callbacksRef.current.addLog("system", `${action.label}: opened`);
      }
    } catch (error) {
      const message = error instanceof Error && error.message ? error.message : "repair failed";
      setRepairActionStatus(action.id, "failed", message);
      callbacksRef.current.addLog("system", `${action.label}: ${message}`, "warn");
    } finally {
      setBusyRepairActionIds((current) => current.filter((id) => id !== action.id));
    }
  }

  function setRepairActionStatus(id: string, status: NonNullable<BootSelfCheckRepairAction["status"]>, result?: string) {
    setRun((current) => {
      if (!current) {
        return current;
      }
      const update = (action: BootSelfCheckRepairAction): BootSelfCheckRepairAction =>
        action.id === id ? { ...action, status, result } : action;
      return {
        ...current,
        repairActions: current.repairActions.map(update),
        steps: current.steps.map((step) => ({ ...step, repairActions: step.repairActions.map(update) }))
      };
    });
  }

  async function runLocalRepair(action: BootSelfCheckLocalAction) {
    if (action === "check-a-board-bridge") {
      await callbacksRef.current.checkAboardSerialBridge();
      return;
    }
    if (action === "start-a-board-bridge") {
      await callbacksRef.current.startAboardSerialBridge();
      return;
    }
    if (action === "check-pi-servo-bridge") {
      await callbacksRef.current.checkPiServoSerialBridge();
      return;
    }
    if (action === "start-pi-servo-bridge") {
      await callbacksRef.current.startPiServoSerialBridge();
    }
  }

  function navigateForRepair(target: BootSelfCheckNavigateTarget) {
    if (target === "plugins") {
      callbacksRef.current.selectSection("plugins");
      return;
    }
    callbacksRef.current.selectSection("tests");
    callbacksRef.current.selectModule(target === "mapping" ? "mapping" : "camera");
  }

  return {
    busyRepairActionIds,
    cancelRun,
    gate,
    overrideActive,
    overrideGate,
    run,
    runRepairAction,
    runSelfCheck
  };
}

export type BootSelfCheckRuntime = ReturnType<typeof useBootSelfCheckRuntime>;

function stepTitle(run: BootSelfCheckRun, stepId: string): string {
  return run.steps.find((step) => step.id === stepId)?.title ?? stepId;
}
