import { Dispatch, MutableRefObject, SetStateAction, useRef, useState } from "react";
import { PersistedLogEntry } from "../lib/appDatabase";
import { DataTelemetryEntry, appendEvents, appendTelemetry } from "../lib/dataService";
import { LogEntry, LogValues } from "./appModel";

interface UseAppLogsOptions {
  currentSessionIdRef: MutableRefObject<string | null>;
  onDatabaseError: (error: unknown) => void;
}

export interface AppLogsRuntime {
  addLog: (direction: LogEntry["direction"], text: string, level?: LogEntry["level"]) => void;
  addSystemLog: (messageKey: string, level?: LogEntry["level"], values?: LogValues) => void;
  clearFlushTimers: () => void;
  flushEventQueue: () => void;
  flushTelemetryQueue: () => void;
  logs: LogEntry[];
  persistLogEntry: (entry: LogEntry) => PersistedLogEntry;
  queueTelemetry: (item: DataTelemetryEntry) => void;
  restoreLogEntries: (entries: PersistedLogEntry[]) => LogEntry[];
  setLogs: Dispatch<SetStateAction<LogEntry[]>>;
}

export function useAppLogs({ currentSessionIdRef, onDatabaseError }: UseAppLogsOptions): AppLogsRuntime {
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const logIdRef = useRef(1);
  const eventQueueRef = useRef<PersistedLogEntry[]>([]);
  const telemetryQueueRef = useRef<DataTelemetryEntry[]>([]);
  const eventFlushTimerRef = useRef<number | undefined>(undefined);
  const telemetryFlushTimerRef = useRef<number | undefined>(undefined);

  function persistLogEntry(entry: LogEntry): PersistedLogEntry {
    return {
      direction: entry.direction,
      level: entry.level,
      messageKey: entry.messageKey,
      text: entry.text,
      values: entry.values,
      createdAt: Date.now()
    };
  }

  function restoreLogEntries(entries: PersistedLogEntry[]): LogEntry[] {
    return entries.slice(0, 120).map((entry) => {
      const id = logIdRef.current++;
      return {
        id,
        direction: entry.direction,
        level: entry.level,
        messageKey: entry.messageKey,
        text: entry.text,
        values: entry.values
      };
    });
  }

  function flushEventQueue() {
    const sessionId = currentSessionIdRef.current;
    if (!sessionId || eventQueueRef.current.length === 0) {
      return;
    }
    const events = eventQueueRef.current.splice(0, eventQueueRef.current.length);
    void appendEvents(sessionId, events).catch((error) => {
      eventQueueRef.current.unshift(...events.slice(-200));
      onDatabaseError(error);
    });
  }

  function flushTelemetryQueue() {
    const sessionId = currentSessionIdRef.current;
    if (!sessionId || telemetryQueueRef.current.length === 0) {
      return;
    }
    const telemetry = telemetryQueueRef.current.splice(0, telemetryQueueRef.current.length);
    void appendTelemetry(sessionId, telemetry).catch((error) => {
      telemetryQueueRef.current.unshift(...telemetry.slice(-300));
      onDatabaseError(error);
    });
  }

  function scheduleEventFlush() {
    if (eventFlushTimerRef.current !== undefined) {
      return;
    }
    eventFlushTimerRef.current = window.setTimeout(() => {
      eventFlushTimerRef.current = undefined;
      flushEventQueue();
    }, 700);
  }

  function scheduleTelemetryFlush() {
    if (telemetryFlushTimerRef.current !== undefined) {
      return;
    }
    telemetryFlushTimerRef.current = window.setTimeout(() => {
      telemetryFlushTimerRef.current = undefined;
      flushTelemetryQueue();
    }, 900);
  }

  function clearFlushTimers() {
    if (eventFlushTimerRef.current !== undefined) {
      window.clearTimeout(eventFlushTimerRef.current);
      eventFlushTimerRef.current = undefined;
    }
    if (telemetryFlushTimerRef.current !== undefined) {
      window.clearTimeout(telemetryFlushTimerRef.current);
      telemetryFlushTimerRef.current = undefined;
    }
  }

  function queueEventLog(entry: LogEntry) {
    if (!currentSessionIdRef.current) {
      return;
    }
    eventQueueRef.current.push({ ...persistLogEntry(entry), createdAt: Date.now() });
    scheduleEventFlush();
  }

  function queueTelemetry(item: DataTelemetryEntry) {
    if (!currentSessionIdRef.current) {
      return;
    }
    telemetryQueueRef.current.push({ ...item, createdAt: item.createdAt ?? Date.now() });
    scheduleTelemetryFlush();
  }

  function addLog(direction: LogEntry["direction"], text: string, level: LogEntry["level"] = "info") {
    const entry: LogEntry = { id: logIdRef.current++, direction, text, level };
    setLogs((current) => [entry, ...current].slice(0, 120));
    queueEventLog(entry);
  }

  function addSystemLog(messageKey: string, level: LogEntry["level"] = "info", values?: LogValues) {
    const entry: LogEntry = { id: logIdRef.current++, direction: "system", messageKey, level, values };
    setLogs((current) => [entry, ...current].slice(0, 120));
    queueEventLog(entry);
  }

  return {
    addLog,
    addSystemLog,
    clearFlushTimers,
    flushEventQueue,
    flushTelemetryQueue,
    logs,
    persistLogEntry,
    queueTelemetry,
    restoreLogEntries,
    setLogs
  };
}
