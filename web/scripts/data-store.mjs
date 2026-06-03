import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export const DATA_SERVICE_SCHEMA_VERSION = 1;
export const DEFAULT_PROJECT_NAME = "Default Robot";

export function defaultDatabasePath() {
  return process.env.RESCUE_ROBOT_DB_PATH || path.join(homedir(), ".rescue-robot", "rescue-robot.sqlite");
}

export async function ensureDatabaseDirectory(dbPath) {
  if (!dbPath || dbPath === ":memory:") {
    return;
  }
  await mkdir(path.dirname(dbPath), { recursive: true });
}

export async function openDataStore(dbPath = defaultDatabasePath()) {
  await ensureDatabaseDirectory(dbPath);
  const store = await createDataStore(dbPath);
  store.initialize();
  return store;
}

export async function createDataStore(dbPath = ":memory:") {
  const { DatabaseSync } = await importNodeBuiltin("node:sqlite");
  const db = new DatabaseSync(dbPath);
  db.exec("PRAGMA foreign_keys = ON");
  db.exec("PRAGMA journal_mode = WAL");

  function initialize() {
    db.exec(`
      CREATE TABLE IF NOT EXISTS schema_meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        is_current INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_projects_current
        ON projects(is_current)
        WHERE is_current = 1;

      CREATE TABLE IF NOT EXISTS project_state (
        project_id TEXT PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
        snapshot_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        started_at INTEGER NOT NULL,
        ended_at INTEGER
      );

      CREATE TABLE IF NOT EXISTS event_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        direction TEXT NOT NULL,
        level TEXT NOT NULL DEFAULT 'info',
        message_key TEXT,
        text TEXT,
        values_json TEXT,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_event_log_project_created
        ON event_log(project_id, created_at DESC, id DESC);

      CREATE TABLE IF NOT EXISTS telemetry_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        category TEXT NOT NULL,
        target_id TEXT NOT NULL,
        payload_json TEXT NOT NULL,
        created_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_telemetry_log_project_target
        ON telemetry_log(project_id, category, target_id, created_at DESC, id DESC);
    `);

    db.prepare(`
      INSERT INTO schema_meta (key, value)
      VALUES ('schema_version', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(String(DATA_SERVICE_SCHEMA_VERSION));

    ensureDefaultProject();
  }

  function ensureDefaultProject() {
    const existing = db.prepare("SELECT id FROM projects LIMIT 1").get();
    if (existing) {
      const current = db.prepare("SELECT id FROM projects WHERE is_current = 1 LIMIT 1").get();
      if (!current) {
        db.prepare("UPDATE projects SET is_current = 1 WHERE id = ?").run(existing.id);
      }
      return;
    }
    createProject(DEFAULT_PROJECT_NAME);
  }

  function listProjects() {
    return db
      .prepare("SELECT id, name, is_current AS isCurrent, created_at AS createdAt, updated_at AS updatedAt FROM projects ORDER BY is_current DESC, updated_at DESC")
      .all()
      .map(projectRow);
  }

  function getProject(projectId) {
    const row = db
      .prepare("SELECT id, name, is_current AS isCurrent, created_at AS createdAt, updated_at AS updatedAt FROM projects WHERE id = ?")
      .get(projectId);
    return row ? projectRow(row) : null;
  }

  function getCurrentProject() {
    const row = db
      .prepare("SELECT id, name, is_current AS isCurrent, created_at AS createdAt, updated_at AS updatedAt FROM projects WHERE is_current = 1 LIMIT 1")
      .get();
    if (row) {
      return projectRow(row);
    }
    ensureDefaultProject();
    return getCurrentProject();
  }

  function createProject(name = DEFAULT_PROJECT_NAME) {
    const now = Date.now();
    const id = randomUUID();
    const cleanName = cleanProjectName(name);
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("UPDATE projects SET is_current = 0").run();
      db.prepare("INSERT INTO projects (id, name, is_current, created_at, updated_at) VALUES (?, ?, 1, ?, ?)").run(id, cleanName, now, now);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return getProject(id);
  }

  function setCurrentProject(projectId) {
    const project = getProject(projectId);
    if (!project) {
      throw notFoundError("project not found");
    }
    db.exec("BEGIN IMMEDIATE");
    try {
      db.prepare("UPDATE projects SET is_current = 0").run();
      db.prepare("UPDATE projects SET is_current = 1, updated_at = ? WHERE id = ?").run(Date.now(), projectId);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return getProject(projectId);
  }

  function getProjectState(projectId) {
    const row = db.prepare("SELECT snapshot_json AS snapshotJson, updated_at AS updatedAt FROM project_state WHERE project_id = ?").get(projectId);
    if (!row) {
      return null;
    }
    return {
      snapshot: parseJson(row.snapshotJson, null),
      updatedAt: row.updatedAt
    };
  }

  function saveProjectState(projectId, snapshot) {
    if (!getProject(projectId)) {
      throw notFoundError("project not found");
    }
    const now = Date.now();
    const serialized = JSON.stringify(snapshot ?? {});
    db.prepare(`
      INSERT INTO project_state (project_id, snapshot_json, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(project_id) DO UPDATE SET
        snapshot_json = excluded.snapshot_json,
        updated_at = excluded.updated_at
    `).run(projectId, serialized, now);
    db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(now, projectId);
    return { updatedAt: now };
  }

  function startSession(projectId) {
    if (!getProject(projectId)) {
      throw notFoundError("project not found");
    }
    const now = Date.now();
    const id = randomUUID();
    db.prepare("INSERT INTO sessions (id, project_id, started_at) VALUES (?, ?, ?)").run(id, projectId, now);
    return { id, projectId, startedAt: now, endedAt: null };
  }

  function endSession(sessionId) {
    const now = Date.now();
    const result = db.prepare("UPDATE sessions SET ended_at = ? WHERE id = ?").run(now, sessionId);
    if (result.changes === 0) {
      throw notFoundError("session not found");
    }
    return getSession(sessionId);
  }

  function getSession(sessionId) {
    const row = db.prepare("SELECT id, project_id AS projectId, started_at AS startedAt, ended_at AS endedAt FROM sessions WHERE id = ?").get(sessionId);
    return row ?? null;
  }

  function appendEvents(sessionId, events) {
    const session = getSession(sessionId);
    if (!session) {
      throw notFoundError("session not found");
    }
    const insert = db.prepare(`
      INSERT INTO event_log (session_id, project_id, direction, level, message_key, text, values_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const rows = normalizeEventBatch(events);
    const now = Date.now();
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const [index, event] of rows.entries()) {
        insert.run(
          session.id,
          session.projectId,
          event.direction,
          event.level,
          event.messageKey ?? null,
          event.text ?? null,
          event.values === undefined ? null : JSON.stringify(event.values),
          event.createdAt ?? now + index
        );
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return { inserted: rows.length };
  }

  function appendTelemetry(sessionId, telemetry) {
    const session = getSession(sessionId);
    if (!session) {
      throw notFoundError("session not found");
    }
    const rows = normalizeTelemetryBatch(telemetry);
    const insert = db.prepare(`
      INSERT INTO telemetry_log (session_id, project_id, category, target_id, payload_json, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const now = Date.now();
    db.exec("BEGIN IMMEDIATE");
    try {
      for (const [index, item] of rows.entries()) {
        insert.run(session.id, session.projectId, item.category, item.targetId, JSON.stringify(item.payload), item.createdAt ?? now + index);
      }
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    return { inserted: rows.length };
  }

  function listRecentEvents(projectId, limit = 120) {
    return db
      .prepare(`
        SELECT id, direction, level, message_key AS messageKey, text, values_json AS valuesJson, created_at AS createdAt
        FROM event_log
        WHERE project_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT ?
      `)
      .all(projectId, clampLimit(limit))
      .map((row) => ({
        id: row.id,
        direction: row.direction,
        level: row.level,
        messageKey: row.messageKey ?? undefined,
        text: row.text ?? undefined,
        values: row.valuesJson ? parseJson(row.valuesJson, undefined) : undefined,
        createdAt: row.createdAt
      }));
  }

  function listLatestTelemetry(projectId, limit = 240) {
    const rows = db
      .prepare(`
        SELECT category, target_id AS targetId, payload_json AS payloadJson, MAX(created_at) AS createdAt
        FROM telemetry_log
        WHERE project_id = ?
        GROUP BY category, target_id
        ORDER BY createdAt DESC
        LIMIT ?
      `)
      .all(projectId, clampLimit(limit));
    return rows.map((row) => ({
      category: row.category,
      targetId: row.targetId,
      payload: parseJson(row.payloadJson, {}),
      createdAt: row.createdAt
    }));
  }

  function close() {
    db.close();
  }

  return {
    appendEvents,
    appendTelemetry,
    close,
    createProject,
    db,
    getCurrentProject,
    getProject,
    getProjectState,
    getSession,
    initialize,
    listLatestTelemetry,
    listProjects,
    listRecentEvents,
    saveProjectState,
    setCurrentProject,
    startSession,
    endSession
  };
}

function importNodeBuiltin(specifier) {
  return Function("specifier", "return import(specifier)")(specifier);
}

function projectRow(row) {
  return {
    id: row.id,
    name: row.name,
    isCurrent: Boolean(row.isCurrent),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

function cleanProjectName(name) {
  return typeof name === "string" && name.trim() ? name.trim().slice(0, 120) : DEFAULT_PROJECT_NAME;
}

function normalizeEventBatch(events) {
  if (!Array.isArray(events)) {
    throw badRequestError("events must be an array");
  }
  return events.map((event) => ({
    direction: event?.direction === "tx" || event?.direction === "rx" || event?.direction === "system" ? event.direction : "system",
    level: event?.level === "warn" || event?.level === "error" || event?.level === "info" ? event.level : "info",
    messageKey: typeof event?.messageKey === "string" ? event.messageKey : undefined,
    text: typeof event?.text === "string" ? event.text : undefined,
    values: event?.values && typeof event.values === "object" ? event.values : undefined,
    createdAt: finiteTimestamp(event?.createdAt)
  }));
}

function normalizeTelemetryBatch(telemetry) {
  if (!Array.isArray(telemetry)) {
    throw badRequestError("telemetry must be an array");
  }
  return telemetry.map((item) => {
    if (!item || typeof item !== "object") {
      throw badRequestError("telemetry entries must be objects");
    }
    const category = typeof item.category === "string" && item.category.trim() ? item.category.trim().slice(0, 48) : "unknown";
    const targetId = typeof item.targetId === "string" && item.targetId.trim() ? item.targetId.trim().slice(0, 96) : "unknown";
    return {
      category,
      targetId,
      payload: item.payload && typeof item.payload === "object" ? item.payload : {},
      createdAt: finiteTimestamp(item.createdAt)
    };
  });
}

function clampLimit(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number <= 1000 ? number : 120;
}

function finiteTimestamp(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

function badRequestError(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

function notFoundError(message) {
  return Object.assign(new Error(message), { statusCode: 404 });
}
