import { PlatformCommand, PlatformCommandResult } from "./commands";
import { PlatformEvent } from "./types";

export type WorkflowNodeKind = "event" | "condition" | "command" | "delay" | "log" | "noop";
export type WorkflowRunStatus = "completed" | "skipped" | "failed";

export interface WorkflowNode {
  id: string;
  kind: WorkflowNodeKind;
  label?: string;
  config?: Record<string, unknown>;
}

export interface WorkflowEdge {
  from: string;
  to: string;
  when?: "true" | "false" | "always";
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
}

export interface WorkflowRuntimeContext {
  event?: PlatformEvent;
  state?: Record<string, unknown>;
  dispatchCommand?: (command: PlatformCommand) => Promise<PlatformCommandResult>;
  wait?: (ms: number) => Promise<void>;
  log?: (message: string) => void;
  shouldAbort?: () => boolean;
  stopOnCommandFailure?: boolean;
}

export interface WorkflowRunResult {
  status: WorkflowRunStatus;
  visitedNodeIds: string[];
  commandResults: PlatformCommandResult[];
  message?: string;
}

export async function runWorkflow(definition: WorkflowDefinition, context: WorkflowRuntimeContext = {}): Promise<WorkflowRunResult> {
  const validationError = validateWorkflow(definition);
  if (validationError) {
    return { status: "failed", visitedNodeIds: [], commandResults: [], message: validationError };
  }

  const nodeById = new Map(definition.nodes.map((node) => [node.id, node]));
  const start = definition.nodes.find((node) => node.kind === "event") ?? definition.nodes[0];
  const visitedNodeIds: string[] = [];
  const commandResults: PlatformCommandResult[] = [];
  let current: WorkflowNode | undefined = start;
  let lastCondition = true;
  let guard = 0;

  while (current) {
    if (context.shouldAbort?.()) {
      return { status: "failed", visitedNodeIds, commandResults, message: "workflow aborted" };
    }
    guard += 1;
    if (guard > definition.nodes.length + definition.edges.length + 1) {
      return { status: "failed", visitedNodeIds, commandResults, message: "workflow cycle detected" };
    }

    visitedNodeIds.push(current.id);
    if (current.kind === "condition") {
      lastCondition = evaluateWorkflowCondition(current, context);
    } else if (current.kind === "command") {
      const command = current.config?.command as PlatformCommand | undefined;
      if (!command || !context.dispatchCommand) {
        return { status: "failed", visitedNodeIds, commandResults, message: "workflow command node requires command and dispatcher" };
      }
      const result = await context.dispatchCommand(command);
      commandResults.push(result);
      if (context.stopOnCommandFailure && (result.status === "failed" || result.status === "timeout")) {
        return { status: "failed", visitedNodeIds, commandResults, message: result.message ?? `workflow command ${result.status}` };
      }
    } else if (current.kind === "delay") {
      const ms = Number(current.config?.ms ?? 0);
      if (context.wait && Number.isFinite(ms) && ms > 0) {
        await context.wait(ms);
      }
      if (context.shouldAbort?.()) {
        return { status: "failed", visitedNodeIds, commandResults, message: "workflow aborted" };
      }
    } else if (current.kind === "log") {
      const message = typeof current.config?.message === "string" ? current.config.message : current.label ?? current.id;
      context.log?.(message);
    }

    const edge = nextWorkflowEdge(definition.edges, current.id, lastCondition);
    current = edge ? nodeById.get(edge.to) : undefined;
  }

  return { status: "completed", visitedNodeIds, commandResults };
}

export function validateWorkflow(definition: WorkflowDefinition): string | null {
  if (!definition.id.trim() || !definition.name.trim()) {
    return "workflow requires id and name";
  }
  if (definition.nodes.length === 0) {
    return "workflow requires at least one node";
  }
  const nodeIds = new Set<string>();
  for (const node of definition.nodes) {
    if (!node.id.trim()) {
      return "workflow node requires id";
    }
    if (nodeIds.has(node.id)) {
      return `duplicate workflow node: ${node.id}`;
    }
    nodeIds.add(node.id);
  }
  for (const edge of definition.edges) {
    if (!nodeIds.has(edge.from) || !nodeIds.has(edge.to)) {
      return `workflow edge references missing node: ${edge.from}->${edge.to}`;
    }
  }
  return null;
}

export function evaluateWorkflowCondition(node: WorkflowNode, context: WorkflowRuntimeContext): boolean {
  const field = typeof node.config?.field === "string" ? node.config.field : "";
  const equals = node.config?.equals;
  const source = workflowConditionSource(node, context);
  if (!field || !source || typeof source !== "object") {
    return false;
  }
  return (source as Record<string, unknown>)[field] === equals;
}

function workflowConditionSource(node: WorkflowNode, context: WorkflowRuntimeContext): Record<string, unknown> | undefined {
  if (node.config?.source === "event") {
    return context.event?.payload;
  }
  const deviceId = typeof node.config?.deviceId === "string" ? node.config.deviceId : "";
  if (!deviceId) {
    return context.state;
  }
  const device = context.state?.[deviceId];
  if (!device || typeof device !== "object") {
    return undefined;
  }
  const snapshot = device as { status?: unknown; values?: unknown };
  return {
    ...(snapshot.values && typeof snapshot.values === "object" ? snapshot.values as Record<string, unknown> : {}),
    status: snapshot.status
  };
}

function nextWorkflowEdge(edges: WorkflowEdge[], from: string, lastCondition: boolean): WorkflowEdge | undefined {
  return edges.find((edge) => {
    if (edge.from !== from) {
      return false;
    }
    if (!edge.when || edge.when === "always") {
      return true;
    }
    return edge.when === String(lastCondition);
  });
}
