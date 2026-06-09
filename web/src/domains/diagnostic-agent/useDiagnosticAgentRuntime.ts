import { useCallback, useEffect, useMemo, useState } from "react";
import type { TFunction } from "i18next";
import type { PlatformCommandResult } from "@platform/commands";
import {
  canAutoRunDiagnosticAction,
  createDiagnosticAgentResponse,
  type DiagnosticAgentAction,
  type DiagnosticAgentContext,
  type DiagnosticAgentMessage,
  type DiagnosticAgentResponse,
  type DiagnosticTextResolver
} from "@domains/diagnostic-agent/diagnosticAgent";
import type { PlatformCommand } from "@platform/commands";

interface UseDiagnosticAgentRuntimeOptions {
  context: DiagnosticAgentContext;
  dispatchPlatformCommand: (command: PlatformCommand) => Promise<PlatformCommandResult>;
  t: TFunction;
}

export function useDiagnosticAgentRuntime({ context, dispatchPlatformCommand, t }: UseDiagnosticAgentRuntimeOptions) {
  const diagnosticText = useCallback<DiagnosticTextResolver>(
    (key, values) => t(`diagnosticAgent.${key}`, values),
    [t]
  );
  const [draft, setDraft] = useState("");
  const [messages, setMessages] = useState<DiagnosticAgentMessage[]>(() => [initialAssistantMessage(diagnosticText)]);
  const [busyActionIds, setBusyActionIds] = useState<string[]>([]);

  const latestResponse = useMemo(
    () => createDiagnosticAgentResponse("check current status", context, diagnosticText),
    [context, diagnosticText]
  );
  const busy = busyActionIds.length > 0;

  useEffect(() => {
    setMessages((current) =>
      current.length === 1 && current[0]?.role === "assistant" && !current[0].issues
        ? [initialAssistantMessage(diagnosticText)]
        : current
    );
  }, [diagnosticText]);

  async function sendDraft() {
    const text = draft.trim();
    if (!text) {
      return;
    }
    setDraft("");
    await runDiagnosis(text, { includeUserMessage: true, autoRunLowRisk: true });
  }

  async function runQuickDiagnosis() {
    await runDiagnosis("check current status", { includeUserMessage: false, autoRunLowRisk: true });
  }

  async function runDiagnosis(
    input: string,
    options: { includeUserMessage: boolean; autoRunLowRisk: boolean }
  ) {
    const response = createDiagnosticAgentResponse(input, context, diagnosticText);
    const nextMessages: DiagnosticAgentMessage[] = [];
    if (options.includeUserMessage) {
      nextMessages.push({
        id: nextId("user"),
        role: "user",
        text: input,
        createdAt: Date.now()
      });
    }
    nextMessages.push(messageFromResponse(response));
    setMessages((current) => [...current, ...nextMessages].slice(-14));

    if (options.autoRunLowRisk) {
      const runnable = response.actions.filter(canAutoRunDiagnosticAction).slice(0, 4);
      if (runnable.length > 0) {
        const results: Array<{ action: DiagnosticAgentAction; result: PlatformCommandResult }> = [];
        for (const action of runnable) {
          const result = await runAction(action, { appendMessage: false });
          if (result) {
            results.push({ action, result });
          }
        }
        if (results.length > 0) {
          setMessages((current) => [
            ...current,
            {
            id: nextId("assistant"),
            role: "assistant" as const,
            text: summarizeActionResults(results, diagnosticText),
            createdAt: Date.now()
          }
          ].slice(-14));
        }
      }
    }
  }

  async function runAction(action: DiagnosticAgentAction, options: { appendMessage?: boolean } = {}): Promise<PlatformCommandResult | null> {
    if (!canAutoRunDiagnosticAction(action) || !action.command) {
      if (options.appendMessage !== false) {
        setMessages((current) => [
          ...current,
          {
            id: nextId("assistant"),
            role: "assistant" as const,
            text: diagnosticText(action.risk === "confirm" ? "messages.actionNeedsConfirm" : "messages.actionCannotAutoRun", { label: action.label }),
            createdAt: Date.now()
          }
        ].slice(-14));
      }
      return null;
    }

    setBusyActionIds((current) => [...current, action.id]);
    try {
      const result = await dispatchPlatformCommand(action.command);
      if (options.appendMessage !== false) {
        setMessages((current) => [
          ...current,
          {
            id: nextId("assistant"),
            role: "assistant" as const,
            text: diagnosticText("messages.actionResult", {
              label: action.label,
              message: result.message ? `: ${result.message}` : "",
              status: result.status
            }),
            createdAt: Date.now()
          }
        ].slice(-14));
      }
      return result;
    } finally {
      setBusyActionIds((current) => current.filter((id) => id !== action.id));
    }
  }

  function clearMessages() {
    setMessages([initialAssistantMessage(diagnosticText)]);
  }

  return {
    busy,
    busyActionIds,
    clearMessages,
    draft,
    latestResponse,
    messages,
    runAction,
    runQuickDiagnosis,
    sendDraft,
    setDraft
  };
}

export type DiagnosticAgentRuntime = ReturnType<typeof useDiagnosticAgentRuntime>;

function initialAssistantMessage(text: DiagnosticTextResolver): DiagnosticAgentMessage {
  return {
    id: nextId("assistant"),
    role: "assistant",
    text: text("messages.initial"),
    createdAt: Date.now()
  };
}

function messageFromResponse(response: DiagnosticAgentResponse): DiagnosticAgentMessage {
  return {
    id: nextId("assistant"),
    role: "assistant",
    text: response.summary,
    intent: response.intent,
    issues: response.issues,
    actions: response.actions,
    createdAt: Date.now()
  };
}

function summarizeActionResults(results: Array<{ action: DiagnosticAgentAction; result: PlatformCommandResult }>, text: DiagnosticTextResolver): string {
  const lines = results.map(({ action, result }) => `${action.label}: ${result.status}${result.message ? ` (${result.message})` : ""}`);
  return text("messages.lowRiskComplete", { results: lines.join("; ") });
}

function nextId(prefix: string): string {
  return `${prefix}:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
}
