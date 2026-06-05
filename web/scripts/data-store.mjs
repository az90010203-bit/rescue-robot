import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

export const DATA_SERVICE_SCHEMA_VERSION = 4;
export const DEFAULT_PROJECT_NAME = "Default Robot";

import {
  BUILTIN_DEVICE_CATALOG_ITEMS,
  setActiveDb,
  importNodeBuiltin,
  projectRow,
  deviceCatalogRow,
  pluginInstanceRow,
  componentRow,
  robotRow,
  normalizeDeviceCatalogItem,
  normalizePluginInstance,
  validatePluginInstanceForProject,
  pluginInstancesForValidation,
  normalizeComponent,
  normalizeRobot,
  assertProject,
  getProjectFromDb,
  currentDb,
  touchProject,
  assertPluginIdsAvailable,
  assertComponentPluginTypes,
  assertComponentIdsAvailable,
  listPluginIds,
  listComponentIds,
  pluginInstanceOwners,
  robotsReferencingComponent,
  normalizePanelLayout,
  catalogDefaultsForType,
  normalizeCapabilities,
  normalizeConfigSchema,
  normalizeConfigForSchema,
  normalizePlainObject,
  cleanType,
  cleanName,
  cleanOptionalString,
  uniqueStrings,
  normalizeStringArray,
  normalizeMotorChannel,
  isValidMotorChannel,
  integerInRange,
  clampNumber,
  slug,
  cleanProjectName,
  normalizeEventBatch,
  normalizeTelemetryBatch,
  normalizeArmTeachTrack,
  cleanId,
  clampLimit,
  finiteTimestamp,
  parseJson,
  badRequestError,
  notFoundError
} from "./data-store-helpers.mjs";

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
  setActiveDb(db);
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

      CREATE TABLE IF NOT EXISTS arm_teach_tracks (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        track_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_arm_teach_tracks_project_updated
        ON arm_teach_tracks(project_id, updated_at DESC, created_at DESC);

      CREATE TABLE IF NOT EXISTS device_catalog (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        brand TEXT NOT NULL,
        model TEXT NOT NULL,
        display_name TEXT NOT NULL,
        driver_id TEXT NOT NULL,
        transport_id TEXT NOT NULL,
        capabilities_json TEXT NOT NULL,
        config_schema_json TEXT NOT NULL,
        default_config_json TEXT NOT NULL,
        tags_json TEXT NOT NULL,
        user_defined INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_device_catalog_type_brand
        ON device_catalog(type, brand, model);

      CREATE TABLE IF NOT EXISTS plugin_instances (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        type TEXT NOT NULL,
        catalog_item_id TEXT REFERENCES device_catalog(id) ON DELETE SET NULL,
        brand TEXT NOT NULL,
        model TEXT NOT NULL,
        driver_id TEXT NOT NULL,
        transport_id TEXT NOT NULL,
        capabilities_json TEXT NOT NULL,
        config_json TEXT NOT NULL,
        tags_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_plugin_instances_project
        ON plugin_instances(project_id, updated_at DESC, created_at DESC);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_plugin_instances_project_name
        ON plugin_instances(project_id, lower(name));

      CREATE TABLE IF NOT EXISTS components (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        kind TEXT NOT NULL DEFAULT 'custom',
        plugin_instance_ids_json TEXT NOT NULL,
        config_json TEXT NOT NULL DEFAULT '{}',
        tags_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_components_project
        ON components(project_id, updated_at DESC, created_at DESC);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_components_project_name
        ON components(project_id, lower(name));

      CREATE TABLE IF NOT EXISTS robots (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        component_ids_json TEXT NOT NULL,
        plugin_instance_ids_json TEXT NOT NULL,
        tags_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_robots_project
        ON robots(project_id, updated_at DESC, created_at DESC);

      CREATE UNIQUE INDEX IF NOT EXISTS idx_robots_project_name
        ON robots(project_id, lower(name));

      CREATE TABLE IF NOT EXISTS panel_layouts (
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        scope_id TEXT NOT NULL,
        layout_json TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (project_id, scope_id)
      );
    `);

    ensureColumn("components", "kind", "TEXT NOT NULL DEFAULT 'custom'");
    ensureColumn("components", "config_json", "TEXT NOT NULL DEFAULT '{}'");

    db.prepare(`
      INSERT INTO schema_meta (key, value)
      VALUES ('schema_version', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(String(DATA_SERVICE_SCHEMA_VERSION));

    ensureDefaultProject();
    seedBuiltinDeviceCatalog();
  }

  function ensureColumn(tableName, columnName, definition) {
    const columns = db.prepare(`PRAGMA table_info(${tableName})`).all();
    if (!columns.some((column) => column.name === columnName)) {
      db.exec(`ALTER TABLE ${tableName} ADD COLUMN ${columnName} ${definition}`);
    }
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

  function seedBuiltinDeviceCatalog() {
    const insert = db.prepare(`
      INSERT INTO device_catalog (
        id, type, brand, model, display_name, driver_id, transport_id,
        capabilities_json, config_schema_json, default_config_json, tags_json,
        user_defined, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        type = excluded.type,
        brand = excluded.brand,
        model = excluded.model,
        display_name = excluded.display_name,
        driver_id = excluded.driver_id,
        transport_id = excluded.transport_id,
        capabilities_json = excluded.capabilities_json,
        config_schema_json = excluded.config_schema_json,
        default_config_json = excluded.default_config_json,
        tags_json = excluded.tags_json,
        updated_at = excluded.updated_at
      WHERE device_catalog.user_defined = 0
    `);
    const now = Date.now();
    for (const item of BUILTIN_DEVICE_CATALOG_ITEMS) {
      insert.run(
        item.id,
        item.type,
        item.brand,
        item.model,
        item.displayName,
        item.driverId,
        item.transportId,
        JSON.stringify(item.capabilities),
        JSON.stringify(item.configSchema),
        JSON.stringify(item.defaultConfig),
        JSON.stringify(item.tags),
        now,
        now
      );
    }
  }

  function listDeviceCatalog(filter = {}) {
    let sql = `
      SELECT id, type, brand, model, display_name AS displayName, driver_id AS driverId, transport_id AS transportId,
        capabilities_json AS capabilitiesJson, config_schema_json AS configSchemaJson, default_config_json AS defaultConfigJson,
        tags_json AS tagsJson, user_defined AS userDefined, created_at AS createdAt, updated_at AS updatedAt
      FROM device_catalog
    `;
    const where = [];
    const params = [];
    if (typeof filter.type === "string" && filter.type.trim()) {
      where.push("type = ?");
      params.push(filter.type.trim());
    }
    if (typeof filter.brand === "string" && filter.brand.trim()) {
      where.push("lower(brand) = lower(?)");
      params.push(filter.brand.trim());
    }
    if (typeof filter.query === "string" && filter.query.trim()) {
      where.push("(lower(display_name) LIKE lower(?) OR lower(model) LIKE lower(?) OR lower(brand) LIKE lower(?) OR lower(tags_json) LIKE lower(?))");
      const query = `%${filter.query.trim()}%`;
      params.push(query, query, query, query);
    }
    if (where.length > 0) {
      sql += ` WHERE ${where.join(" AND ")}`;
    }
    sql += " ORDER BY type, brand, model";
    return db.prepare(sql).all(...params).map(deviceCatalogRow);
  }

  function getDeviceCatalogItem(itemId) {
    const row = db.prepare(`
      SELECT id, type, brand, model, display_name AS displayName, driver_id AS driverId, transport_id AS transportId,
        capabilities_json AS capabilitiesJson, config_schema_json AS configSchemaJson, default_config_json AS defaultConfigJson,
        tags_json AS tagsJson, user_defined AS userDefined, created_at AS createdAt, updated_at AS updatedAt
      FROM device_catalog
      WHERE id = ?
    `).get(itemId);
    return row ? deviceCatalogRow(row) : null;
  }

  function createDeviceCatalogItem(item) {
    const normalized = normalizeDeviceCatalogItem(item, true);
    const now = Date.now();
    db.prepare(`
      INSERT INTO device_catalog (
        id, type, brand, model, display_name, driver_id, transport_id,
        capabilities_json, config_schema_json, default_config_json, tags_json,
        user_defined, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?)
    `).run(
      normalized.id,
      normalized.type,
      normalized.brand,
      normalized.model,
      normalized.displayName,
      normalized.driverId,
      normalized.transportId,
      JSON.stringify(normalized.capabilities),
      JSON.stringify(normalized.configSchema),
      JSON.stringify(normalized.defaultConfig),
      JSON.stringify(normalized.tags),
      now,
      now
    );
    return getDeviceCatalogItem(normalized.id);
  }

  function listPluginInstances(projectId) {
    assertProject(projectId);
    return db
      .prepare(`
        SELECT id, name, type, catalog_item_id AS catalogItemId, brand, model, driver_id AS driverId, transport_id AS transportId,
          capabilities_json AS capabilitiesJson, config_json AS configJson, tags_json AS tagsJson, created_at AS createdAt, updated_at AS updatedAt
        FROM plugin_instances
        WHERE project_id = ?
        ORDER BY updated_at DESC, created_at DESC
      `)
      .all(projectId)
      .map(pluginInstanceRow);
  }

  function getPluginInstance(projectId, instanceId) {
    const row = db.prepare(`
      SELECT id, name, type, catalog_item_id AS catalogItemId, brand, model, driver_id AS driverId, transport_id AS transportId,
        capabilities_json AS capabilitiesJson, config_json AS configJson, tags_json AS tagsJson, created_at AS createdAt, updated_at AS updatedAt
      FROM plugin_instances
      WHERE project_id = ? AND id = ?
    `).get(projectId, instanceId);
    return row ? pluginInstanceRow(row) : null;
  }

  function createPluginInstance(projectId, value) {
    assertProject(projectId);
    const existing = listPluginInstances(projectId);
    const instance = normalizePluginInstance(value, getDeviceCatalogItem(value?.catalogItemId), existing);
    validatePluginInstanceForProject(projectId, instance, null);
    const now = Date.now();
    db.prepare(`
      INSERT INTO plugin_instances (
        id, project_id, name, type, catalog_item_id, brand, model, driver_id, transport_id,
        capabilities_json, config_json, tags_json, created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      instance.id,
      projectId,
      instance.name,
      instance.type,
      instance.catalogItemId,
      instance.brand,
      instance.model,
      instance.driverId,
      instance.transportId,
      JSON.stringify(instance.capabilities),
      JSON.stringify(instance.config),
      JSON.stringify(instance.tags),
      now,
      now
    );
    touchProject(projectId, now);
    return getPluginInstance(projectId, instance.id);
  }

  function updatePluginInstance(projectId, instanceId, patch) {
    assertProject(projectId);
    const current = getPluginInstance(projectId, instanceId);
    if (!current) {
      throw notFoundError("plugin instance not found");
    }
    const catalogItem = patch?.catalogItemId ? getDeviceCatalogItem(patch.catalogItemId) : current.catalogItemId ? getDeviceCatalogItem(current.catalogItemId) : null;
    const instance = normalizePluginInstance({ ...current, ...patch, id: current.id, config: { ...current.config, ...(patch?.config ?? {}) } }, catalogItem, listPluginInstances(projectId));
    validatePluginInstanceForProject(projectId, instance, instanceId);
    const now = Date.now();
    db.prepare(`
      UPDATE plugin_instances
      SET name = ?, type = ?, catalog_item_id = ?, brand = ?, model = ?, driver_id = ?, transport_id = ?,
        capabilities_json = ?, config_json = ?, tags_json = ?, updated_at = ?
      WHERE project_id = ? AND id = ?
    `).run(
      instance.name,
      instance.type,
      instance.catalogItemId,
      instance.brand,
      instance.model,
      instance.driverId,
      instance.transportId,
      JSON.stringify(instance.capabilities),
      JSON.stringify(instance.config),
      JSON.stringify(instance.tags),
      now,
      projectId,
      instanceId
    );
    touchProject(projectId, now);
    return getPluginInstance(projectId, instanceId);
  }

  function deletePluginInstance(projectId, instanceId) {
    assertProject(projectId);
    const owners = pluginInstanceOwners(projectId, instanceId);
    if (owners.length > 0) {
      throw badRequestError(`plugin instance is in use by ${owners[0].name}`);
    }
    const result = db.prepare("DELETE FROM plugin_instances WHERE project_id = ? AND id = ?").run(projectId, instanceId);
    touchProject(projectId);
    return { deleted: result.changes > 0 };
  }

  function listComponents(projectId) {
    assertProject(projectId);
    return db
      .prepare(`
        SELECT id, name, kind, plugin_instance_ids_json AS pluginInstanceIdsJson, config_json AS configJson,
          tags_json AS tagsJson, created_at AS createdAt, updated_at AS updatedAt
        FROM components
        WHERE project_id = ?
        ORDER BY updated_at DESC, created_at DESC
      `)
      .all(projectId)
      .map(componentRow);
  }

  function getComponent(projectId, componentId) {
    const row = db.prepare(`
      SELECT id, name, kind, plugin_instance_ids_json AS pluginInstanceIdsJson, config_json AS configJson,
        tags_json AS tagsJson, created_at AS createdAt, updated_at AS updatedAt
      FROM components
      WHERE project_id = ? AND id = ?
    `).get(projectId, componentId);
    return row ? componentRow(row) : null;
  }

  function createComponent(projectId, value) {
    assertProject(projectId);
    const component = normalizeComponent(value);
    assertPluginIdsAvailable(projectId, component.pluginInstanceIds, { componentId: component.id });
    assertComponentPluginTypes(projectId, component);
    const now = Date.now();
    db.prepare(`
      INSERT INTO components (id, project_id, name, kind, plugin_instance_ids_json, config_json, tags_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(component.id, projectId, component.name, component.kind, JSON.stringify(component.pluginInstanceIds), JSON.stringify(component.config), JSON.stringify(component.tags), now, now);
    touchProject(projectId, now);
    return getComponent(projectId, component.id);
  }

  function updateComponent(projectId, componentId, patch) {
    assertProject(projectId);
    const current = getComponent(projectId, componentId);
    if (!current) {
      throw notFoundError("component not found");
    }
    const component = normalizeComponent({ ...current, ...patch, id: current.id });
    assertPluginIdsAvailable(projectId, component.pluginInstanceIds, { componentId });
    assertComponentPluginTypes(projectId, component);
    const now = Date.now();
    db.prepare(`
      UPDATE components
      SET name = ?, kind = ?, plugin_instance_ids_json = ?, config_json = ?, tags_json = ?, updated_at = ?
      WHERE project_id = ? AND id = ?
    `).run(component.name, component.kind, JSON.stringify(component.pluginInstanceIds), JSON.stringify(component.config), JSON.stringify(component.tags), now, projectId, componentId);
    touchProject(projectId, now);
    return getComponent(projectId, componentId);
  }

  function deleteComponent(projectId, componentId) {
    assertProject(projectId);
    const owner = robotsReferencingComponent(projectId, componentId)[0];
    if (owner) {
      throw badRequestError(`component is in use by ${owner.name}`);
    }
    const result = db.prepare("DELETE FROM components WHERE project_id = ? AND id = ?").run(projectId, componentId);
    db.prepare("DELETE FROM panel_layouts WHERE project_id = ? AND scope_id = ?").run(projectId, `component:${componentId}`);
    touchProject(projectId);
    return { deleted: result.changes > 0 };
  }

  function listRobots(projectId) {
    assertProject(projectId);
    return db
      .prepare(`
        SELECT id, name, component_ids_json AS componentIdsJson, plugin_instance_ids_json AS pluginInstanceIdsJson,
          tags_json AS tagsJson, created_at AS createdAt, updated_at AS updatedAt
        FROM robots
        WHERE project_id = ?
        ORDER BY updated_at DESC, created_at DESC
      `)
      .all(projectId)
      .map(robotRow);
  }

  function getRobot(projectId, robotId) {
    const row = db.prepare(`
      SELECT id, name, component_ids_json AS componentIdsJson, plugin_instance_ids_json AS pluginInstanceIdsJson,
        tags_json AS tagsJson, created_at AS createdAt, updated_at AS updatedAt
      FROM robots
      WHERE project_id = ? AND id = ?
    `).get(projectId, robotId);
    return row ? robotRow(row) : null;
  }

  function createRobot(projectId, value) {
    assertProject(projectId);
    const robot = normalizeRobot(value);
    assertComponentIdsAvailable(projectId, robot.componentIds, { robotId: robot.id });
    assertPluginIdsAvailable(projectId, robot.pluginInstanceIds, { robotId: robot.id });
    const now = Date.now();
    db.prepare(`
      INSERT INTO robots (id, project_id, name, component_ids_json, plugin_instance_ids_json, tags_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(robot.id, projectId, robot.name, JSON.stringify(robot.componentIds), JSON.stringify(robot.pluginInstanceIds), JSON.stringify(robot.tags), now, now);
    touchProject(projectId, now);
    return getRobot(projectId, robot.id);
  }

  function updateRobot(projectId, robotId, patch) {
    assertProject(projectId);
    const current = getRobot(projectId, robotId);
    if (!current) {
      throw notFoundError("robot not found");
    }
    const robot = normalizeRobot({ ...current, ...patch, id: current.id });
    assertComponentIdsAvailable(projectId, robot.componentIds, { robotId });
    assertPluginIdsAvailable(projectId, robot.pluginInstanceIds, { robotId });
    const now = Date.now();
    db.prepare(`
      UPDATE robots
      SET name = ?, component_ids_json = ?, plugin_instance_ids_json = ?, tags_json = ?, updated_at = ?
      WHERE project_id = ? AND id = ?
    `).run(robot.name, JSON.stringify(robot.componentIds), JSON.stringify(robot.pluginInstanceIds), JSON.stringify(robot.tags), now, projectId, robotId);
    touchProject(projectId, now);
    return getRobot(projectId, robotId);
  }

  function deleteRobot(projectId, robotId) {
    assertProject(projectId);
    const result = db.prepare("DELETE FROM robots WHERE project_id = ? AND id = ?").run(projectId, robotId);
    db.prepare("DELETE FROM panel_layouts WHERE project_id = ? AND scope_id = ?").run(projectId, `robot:${robotId}`);
    touchProject(projectId);
    return { deleted: result.changes > 0 };
  }

  function getPanelLayout(projectId, scopeId) {
    assertProject(projectId);
    const row = db.prepare("SELECT layout_json AS layoutJson, updated_at AS updatedAt FROM panel_layouts WHERE project_id = ? AND scope_id = ?").get(projectId, cleanId(scopeId, "scope id is required"));
    if (!row) {
      return { scopeId, layout: [], updatedAt: null };
    }
    return { scopeId, layout: normalizePanelLayout(parseJson(row.layoutJson, []), scopeId), updatedAt: row.updatedAt };
  }

  function savePanelLayout(projectId, scopeId, layout) {
    assertProject(projectId);
    const cleanScopeId = cleanId(scopeId, "scope id is required");
    const normalized = normalizePanelLayout(layout, cleanScopeId);
    const now = Date.now();
    db.prepare(`
      INSERT INTO panel_layouts (project_id, scope_id, layout_json, updated_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(project_id, scope_id) DO UPDATE SET
        layout_json = excluded.layout_json,
        updated_at = excluded.updated_at
    `).run(projectId, cleanScopeId, JSON.stringify(normalized), now);
    touchProject(projectId, now);
    return { scopeId: cleanScopeId, layout: normalized, updatedAt: now };
  }

  function listPanelLayouts(projectId) {
    assertProject(projectId);
    const rows = db.prepare("SELECT scope_id AS scopeId, layout_json AS layoutJson FROM panel_layouts WHERE project_id = ?").all(projectId);
    return Object.fromEntries(rows.map((row) => [row.scopeId, normalizePanelLayout(parseJson(row.layoutJson, []), row.scopeId)]));
  }

  function getProjectArchitecture(projectId) {
    return {
      catalog: listDeviceCatalog(),
      pluginInstances: listPluginInstances(projectId),
      components: listComponents(projectId),
      robots: listRobots(projectId),
      panelLayouts: listPanelLayouts(projectId)
    };
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

  function listArmTeachTracks(projectId) {
    if (!getProject(projectId)) {
      throw notFoundError("project not found");
    }
    return db
      .prepare("SELECT track_json AS trackJson FROM arm_teach_tracks WHERE project_id = ? ORDER BY updated_at DESC, created_at DESC")
      .all(projectId)
      .map((row) => parseJson(row.trackJson, null))
      .filter(Boolean);
  }

  function saveArmTeachTrack(projectId, track) {
    if (!getProject(projectId)) {
      throw notFoundError("project not found");
    }
    const normalized = normalizeArmTeachTrack(track);
    db.prepare(`
      INSERT INTO arm_teach_tracks (id, project_id, name, track_json, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        track_json = excluded.track_json,
        updated_at = excluded.updated_at
    `).run(normalized.id, projectId, normalized.name, JSON.stringify(normalized), normalized.createdAt, normalized.updatedAt);
    db.prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(normalized.updatedAt, projectId);
    return normalized;
  }

  function deleteArmTeachTrack(trackId) {
    const result = db.prepare("DELETE FROM arm_teach_tracks WHERE id = ?").run(cleanId(trackId, "track id is required"));
    return { deleted: result.changes > 0 };
  }

  function close() {
    db.close();
  }

  return {
    appendEvents,
    appendTelemetry,
    close,
    createComponent,
    createDeviceCatalogItem,
    createPluginInstance,
    createProject,
    createRobot,
    deleteComponent,
    deletePluginInstance,
    deleteRobot,
    db,
    getCurrentProject,
    getPanelLayout,
    getProject,
    getProjectArchitecture,
    getProjectState,
    getSession,
    initialize,
    listArmTeachTracks,
    listComponents,
    listDeviceCatalog,
    listLatestTelemetry,
    listPanelLayouts,
    listPluginInstances,
    listProjects,
    listRecentEvents,
    listRobots,
    saveArmTeachTrack,
    savePanelLayout,
    saveProjectState,
    setCurrentProject,
    startSession,
    deleteArmTeachTrack,
    endSession,
    updateComponent,
    updatePluginInstance,
    updateRobot
  };
}
