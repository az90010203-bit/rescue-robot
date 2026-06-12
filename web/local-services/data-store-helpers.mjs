import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";

const TYPE_A_BOARD_SILK_TO_PIN = {
  A: "PI0",
  B: "PH12",
  C: "PH11",
  D: "PH10",
  E: "PD15",
  F: "PD14",
  G: "PD13",
  H: "PD12",
  I1: "PF1",
  I2: "PF0",
  J1: "PE5",
  J2: "PE4",
  K1: "PE6",
  K2: "PE12",
  L1: "PC2",
  L2: "PB0",
  M1: "PC3",
  M2: "PB1",
  N1: "PC4",
  N2: "PC0",
  O1: "PC5",
  O2: "PC1",
  P1: "PA5",
  P2: "PA4",
  Q1: "PF10",
  Q2: "PI9",
  S: "PA0",
  T: "PA1",
  U: "PA2",
  V: "PA3",
  W: "PI5",
  X: "PI6",
  Y: "PI7",
  Z: "PI2"
};

const MOTOR_PIN_FIELD_IDS = new Set(["pwmPin", "in1Pin", "in2Pin", "enablePin", "sensorPin", "encoderAPin", "encoderBPin"]);

export const BUILTIN_DEVICE_CATALOG_ITEMS = JSON.parse(
  readFileSync(new URL("../src/platform/defaultCatalog.json", import.meta.url), "utf8")
);

const LEGACY_FEETECH_SERVO_DEFAULTS = {
  type: "servo",
  brand: "Feetech",
  model: "Legacy STS/SCS",
  displayName: "Legacy Feetech Servo",
  driverId: "driver.feetech-servo",
  transportId: "transport.web-serial",
  capabilities: [{ id: "servo", features: ["position_control", "wheel_speed_control", "torque_control", "feedback"] }],
  configSchema: [
    { id: "servoId", label: "ID", kind: "number", required: true, min: 0, max: 253, step: 1 },
    { id: "minDeg", label: "Min Angle", kind: "number", min: 0, max: 360, step: 1 },
    { id: "maxDeg", label: "Max Angle", kind: "number", min: 0, max: 360, step: 1 },
    { id: "direction", label: "Direction", kind: "select", options: [{ label: "Normal", value: 1 }, { label: "Reverse", value: -1 }] }
  ],
  defaultConfig: { servoId: 1, minDeg: 0, maxDeg: 360, direction: 1 },
  tags: ["servo", "ttl", "feetech", "legacy"]
};


export function importNodeBuiltin(specifier) {
  return Function("specifier", "return import(specifier)")(specifier);
}

export function projectRow(row) {
  return {
    id: row.id,
    name: row.name,
    isCurrent: Boolean(row.isCurrent),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export function deviceCatalogRow(row) {
  return {
    id: row.id,
    type: row.type,
    brand: row.brand,
    model: row.model,
    displayName: row.displayName,
    driverId: row.driverId,
    transportId: row.transportId,
    capabilities: parseJson(row.capabilitiesJson, []),
    configSchema: parseJson(row.configSchemaJson, []),
    defaultConfig: parseJson(row.defaultConfigJson, {}),
    tags: parseJson(row.tagsJson, []),
    userDefined: Boolean(row.userDefined),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export function pluginInstanceRow(row) {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    catalogItemId: row.catalogItemId ?? null,
    brand: row.brand,
    model: row.model,
    driverId: row.driverId,
    transportId: row.transportId,
    capabilities: parseJson(row.capabilitiesJson, []),
    config: parseJson(row.configJson, {}),
    tags: parseJson(row.tagsJson, []),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export function componentRow(row) {
  return {
    id: row.id,
    name: row.name,
    kind: row.kind === "robot-arm" || row.kind === "mecanum-drive" || row.kind === "can-servo-group" ? row.kind : "custom",
    pluginInstanceIds: normalizeStringArray(parseJson(row.pluginInstanceIdsJson, [])),
    config: parseJson(row.configJson, {}),
    tags: normalizeStringArray(parseJson(row.tagsJson, [])),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export function robotRow(row) {
  return {
    id: row.id,
    name: row.name,
    componentIds: normalizeStringArray(parseJson(row.componentIdsJson, [])),
    pluginInstanceIds: normalizeStringArray(parseJson(row.pluginInstanceIdsJson, [])),
    config: normalizeJsonObject(parseJson(row.configJson, {})),
    tags: normalizeStringArray(parseJson(row.tagsJson, [])),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };
}

export function normalizeDeviceCatalogItem(value, userDefined = false) {
  if (!value || typeof value !== "object") {
    throw badRequestError("catalog item is required");
  }
  const type = cleanType(value.type);
  const fallback = catalogDefaultsForType(type);
  const brand = cleanName(value.brand, "Generic");
  const model = cleanName(value.model, "Custom Device");
  const displayName = cleanName(value.displayName, `${brand} ${model}`);
  return {
    id: typeof value.id === "string" && value.id.trim() ? value.id.trim() : `catalog.${slug(brand)}.${slug(model)}.${randomUUID().slice(0, 8)}`,
    type,
    brand,
    model,
    displayName,
    driverId: cleanName(value.driverId, fallback.driverId),
    transportId: cleanName(value.transportId, fallback.transportId),
    capabilities: normalizeCapabilities(value.capabilities, type),
    configSchema: normalizeConfigSchema(value.configSchema, fallback.configSchema),
    defaultConfig: normalizePlainObject(value.defaultConfig ?? fallback.defaultConfig),
    tags: normalizeStringArray(value.tags ?? [type, brand.toLowerCase()]),
    userDefined
  };
}

export function normalizePluginInstance(value, catalogItem, existing) {
  if (!value || typeof value !== "object") {
    throw badRequestError("plugin instance is required");
  }
  const type = cleanType(value.type ?? catalogItem?.type);
  const fallback = catalogItem ?? pluginDefaultsForValue(value, type);
  const configSchema = Array.isArray(fallback.configSchema) ? fallback.configSchema : [];
  const config = normalizeConfigForSchema(configSchema, { ...(fallback.defaultConfig ?? {}), ...(value.config ?? {}) });
  const instance = {
    id: typeof value.id === "string" && value.id.trim() ? value.id.trim() : randomUUID(),
    name: cleanName(value.name, fallback.displayName ?? fallback.model ?? "Plugin Instance"),
    type,
    catalogItemId: typeof value.catalogItemId === "string" && value.catalogItemId.trim() ? value.catalogItemId.trim() : catalogItem?.id ?? null,
    brand: cleanName(value.brand, fallback.brand ?? "Generic"),
    model: cleanName(value.model, fallback.model ?? "Custom Device"),
    driverId: cleanName(value.driverId, fallback.driverId),
    transportId: cleanName(value.transportId, fallback.transportId),
    capabilities: normalizeCapabilities(value.capabilities ?? fallback.capabilities, type),
    config,
    tags: normalizeStringArray(value.tags ?? fallback.tags ?? [type])
  };
  const duplicateName = existing.find((item) => item.id !== instance.id && item.name.trim().toLowerCase() === instance.name.trim().toLowerCase());
  if (duplicateName) {
    throw badRequestError(`duplicate plugin instance name: ${instance.name}`);
  }
  return instance;
}

function pluginDefaultsForValue(value, type) {
  if (type === "servo" && value?.driverId === "driver.feetech-servo") {
    return LEGACY_FEETECH_SERVO_DEFAULTS;
  }
  return catalogDefaultsForType(type);
}

export function validatePluginInstanceForProject(projectId, instance, ignoreId) {
  const detectedDeviceId = typeof instance.config.detectedDeviceId === "string" ? instance.config.detectedDeviceId.trim() : "";
  if (detectedDeviceId) {
    const duplicate = pluginInstancesForValidation(projectId).find((item) => item.id !== ignoreId && String(item.config.detectedDeviceId ?? "").trim() === detectedDeviceId);
    if (duplicate) {
      throw badRequestError(`duplicate detected device: ${detectedDeviceId}`);
    }
  }
  if (instance.type === "servo") {
    const servoId = Number(instance.config.servoId);
    if (!Number.isInteger(servoId) || servoId < 0 || servoId > 253) {
      throw badRequestError("servo plugin instance requires servoId from 0 to 253");
    }
    const duplicate = pluginInstancesForValidation(projectId).find((item) => (
      item.id !== ignoreId &&
      item.type === "servo" &&
      item.driverId === instance.driverId &&
      item.transportId === instance.transportId &&
      Number(item.config.servoId) === servoId
    ));
    if (duplicate) {
      throw badRequestError(`duplicate servo ID: ${servoId}`);
    }
  }
  if (instance.type === "motor") {
    const channel = normalizeMotorChannel(instance.config.channel);
    if (!isValidMotorChannel(channel)) {
      throw badRequestError("motor plugin instance requires a valid channel");
    }
    instance.config.channel = channel;
    normalizeMotorPinAliases(instance.config);
    const duplicate = pluginInstancesForValidation(projectId).find((item) => item.id !== ignoreId && item.type === "motor" && normalizeMotorChannel(item.config.channel) === channel);
    if (duplicate) {
      throw badRequestError(`duplicate motor channel: ${channel}`);
    }
  }
}

export function pluginInstancesForValidation(projectId) {
  return currentDb()
    .prepare(`
      SELECT id, name, type, catalog_item_id AS catalogItemId, brand, model, driver_id AS driverId, transport_id AS transportId,
        capabilities_json AS capabilitiesJson, config_json AS configJson, tags_json AS tagsJson, created_at AS createdAt, updated_at AS updatedAt
      FROM plugin_instances
      WHERE project_id = ?
    `)
    .all(projectId)
    .map(pluginInstanceRow);
}

export function normalizeComponent(value) {
  if (!value || typeof value !== "object") {
    throw badRequestError("component is required");
  }
  const kind = value.kind === "robot-arm" || value.kind === "mecanum-drive" || value.kind === "can-servo-group" ? value.kind : "custom";
  const config = value.config && typeof value.config === "object" && !Array.isArray(value.config) ? value.config : {};
  return {
    id: typeof value.id === "string" && value.id.trim() ? value.id.trim() : randomUUID(),
    name: cleanName(value.name, "Component"),
    kind,
    pluginInstanceIds: uniqueStrings(value.pluginInstanceIds),
    config,
    tags: normalizeStringArray(value.tags)
  };
}

export function normalizeRobot(value) {
  if (!value || typeof value !== "object") {
    throw badRequestError("robot is required");
  }
  return {
    id: typeof value.id === "string" && value.id.trim() ? value.id.trim() : randomUUID(),
    name: cleanName(value.name, "Robot"),
    componentIds: uniqueStrings(value.componentIds),
    pluginInstanceIds: uniqueStrings(value.pluginInstanceIds),
    config: normalizeJsonObject(value.config),
    tags: normalizeStringArray(value.tags)
  };
}

export function assertProject(projectId) {
  if (!projectId || !getProjectFromDb(projectId)) {
    throw notFoundError("project not found");
  }
}

export function getProjectFromDb(projectId) {
  return projectId
    ? currentDb().prepare("SELECT id FROM projects WHERE id = ?").get(projectId)
    : null;
}

let activeDb = null;

export function setActiveDb(db) {
  activeDb = db;
}
export function currentDb() {
  if (!activeDb) {
    throw new Error("database helper used before initialization");
  }
  return activeDb;
}

export function touchProject(projectId, timestamp = Date.now()) {
  currentDb().prepare("UPDATE projects SET updated_at = ? WHERE id = ?").run(timestamp, projectId);
}

export function assertPluginIdsAvailable(projectId, pluginIds, options = {}) {
  const cleanIds = uniqueStrings(pluginIds);
  const existing = new Set(listPluginIds(projectId));
  for (const pluginId of cleanIds) {
    if (!existing.has(pluginId)) {
      throw notFoundError(`plugin instance not found: ${pluginId}`);
    }
    const owners = pluginInstanceOwners(projectId, pluginId, options);
    if (owners.length > 0) {
      throw badRequestError(`plugin instance ${pluginId} is already assigned to ${owners[0].name}`);
    }
  }
}

export function assertComponentPluginTypes(projectId, component) {
  if (component.kind !== "robot-arm" && component.kind !== "mecanum-drive" && component.kind !== "can-servo-group") {
    return;
  }
  const rows = currentDb()
    .prepare("SELECT id, type, driver_id AS driverId, config_json AS configJson FROM plugin_instances WHERE project_id = ?")
    .all(projectId);
  const pluginById = new Map(rows.map((row) => [row.id, { ...row, config: parseJson(row.configJson, {}) }]));
  for (const pluginId of component.pluginInstanceIds) {
    const plugin = pluginById.get(pluginId);
    if (component.kind === "robot-arm" && (plugin?.type !== "servo" || plugin.driverId !== "driver.feetech-servo")) {
      throw badRequestError(`robot-arm component requires Feetech servo plugin instances: ${pluginId}`);
    }
    if (component.kind === "mecanum-drive" && plugin?.type !== "motor") {
      throw badRequestError(`mecanum-drive component requires motor plugin instances: ${pluginId}`);
    }
    if (component.kind === "can-servo-group" && (plugin?.type !== "servo" || plugin.driverId !== "driver.asme-can-servo")) {
      throw badRequestError(`can-servo-group component requires ASME CAN servo plugin instances: ${pluginId}`);
    }
  }
  if (component.kind === "mecanum-drive") {
    const wheels = component.config?.wheels && typeof component.config.wheels === "object" && !Array.isArray(component.config.wheels)
      ? component.config.wheels
      : {};
    const wheelIds = ["frontLeft", "frontRight", "rearLeft", "rearRight"]
      .map((position) => typeof wheels[position] === "string" ? wheels[position].trim() : "")
      .filter(Boolean);
    if (component.pluginInstanceIds.length !== 4 || new Set(component.pluginInstanceIds).size !== 4 || wheelIds.length !== 4 || new Set(wheelIds).size !== 4) {
      throw badRequestError("mecanum-drive component requires four unique motor plugin instances");
    }
    for (const pluginId of wheelIds) {
      if (!component.pluginInstanceIds.includes(pluginId)) {
        throw badRequestError(`mecanum-drive wheel plugin must be assigned to the component: ${pluginId}`);
      }
    }
  }
  if (component.kind === "can-servo-group") {
    const servos = component.config?.servos && typeof component.config.servos === "object" && !Array.isArray(component.config.servos)
      ? component.config.servos
      : {};
    const servoIds = ["servo1", "servo2", "servo3", "servo4"]
      .map((slot) => typeof servos[slot] === "string" ? servos[slot].trim() : "")
      .filter(Boolean);
    if (component.pluginInstanceIds.length !== 4 || new Set(component.pluginInstanceIds).size !== 4 || servoIds.length !== 4 || new Set(servoIds).size !== 4) {
      throw badRequestError("can-servo-group component requires four unique ASME CAN servo plugin instances");
    }
    const profiles = servoIds.map((pluginId) => pluginById.get(pluginId)).filter(Boolean);
    for (const pluginId of servoIds) {
      if (!component.pluginInstanceIds.includes(pluginId)) {
        throw badRequestError(`can-servo-group servo plugin must be assigned to the component: ${pluginId}`);
      }
      const plugin = pluginById.get(pluginId);
      if (plugin?.type !== "servo" || plugin.driverId !== "driver.asme-can-servo") {
        throw badRequestError(`can-servo-group component requires ASME CAN servo plugin instances: ${pluginId}`);
      }
    }
    const first = profiles[0]?.config ?? {};
    const firstBus = String(first.canBus ?? "CAN1");
    const firstBitrate = Number(first.bitrateKbps ?? 250);
    if (profiles.some((plugin) => String(plugin.config?.canBus ?? "CAN1") !== firstBus || Number(plugin.config?.bitrateKbps ?? 250) !== firstBitrate)) {
      throw badRequestError("can-servo-group component requires all servos to use the same CAN bus and bitrate");
    }
  }
}

export function assertComponentIdsAvailable(projectId, componentIds, options = {}) {
  const cleanIds = uniqueStrings(componentIds);
  const existing = new Set(listComponentIds(projectId));
  for (const componentId of cleanIds) {
    if (!existing.has(componentId)) {
      throw notFoundError(`component not found: ${componentId}`);
    }
    const owners = robotsReferencingComponent(projectId, componentId, options);
    if (owners.length > 0) {
      throw badRequestError(`component ${componentId} is already assigned to ${owners[0].name}`);
    }
  }
}

export function listPluginIds(projectId) {
  return currentDb().prepare("SELECT id FROM plugin_instances WHERE project_id = ?").all(projectId).map((row) => row.id);
}

export function listComponentIds(projectId) {
  return currentDb().prepare("SELECT id FROM components WHERE project_id = ?").all(projectId).map((row) => row.id);
}

export function pluginInstanceOwners(projectId, pluginId, options = {}) {
  const owners = [];
  const components = currentDb()
    .prepare("SELECT id, name, plugin_instance_ids_json AS pluginInstanceIdsJson FROM components WHERE project_id = ?")
    .all(projectId);
  for (const component of components) {
    if (component.id !== options.componentId && normalizeStringArray(parseJson(component.pluginInstanceIdsJson, [])).includes(pluginId)) {
      owners.push({ kind: "component", id: component.id, name: component.name });
    }
  }
  const robots = currentDb()
    .prepare("SELECT id, name, plugin_instance_ids_json AS pluginInstanceIdsJson FROM robots WHERE project_id = ?")
    .all(projectId);
  for (const robot of robots) {
    if (robot.id !== options.robotId && normalizeStringArray(parseJson(robot.pluginInstanceIdsJson, [])).includes(pluginId)) {
      owners.push({ kind: "robot", id: robot.id, name: robot.name });
    }
  }
  return owners;
}

export function robotsReferencingComponent(projectId, componentId, options = {}) {
  const rows = currentDb()
    .prepare("SELECT id, name, component_ids_json AS componentIdsJson FROM robots WHERE project_id = ?")
    .all(projectId);
  return rows
    .filter((robot) => robot.id !== options.robotId && normalizeStringArray(parseJson(robot.componentIdsJson, [])).includes(componentId))
    .map((robot) => ({ kind: "robot", id: robot.id, name: robot.name }));
}

export function normalizePanelLayout(value, scopeId) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .filter((item) => item && typeof item === "object")
    .map((item, index) => {
      const visibleItemIds = uniqueStrings(item.visibleItemIds);
      return {
        id: cleanOptionalString(item.id, `${scopeId}:panel:${index + 1}`),
        scopeId,
        panelId: cleanOptionalString(item.panelId, "panel"),
        targetId: cleanOptionalString(item.targetId, "target"),
        capability: cleanOptionalString(item.capability, "servo"),
        title: cleanOptionalString(item.title, "Panel"),
        ...(visibleItemIds.length > 0 ? { visibleItemIds } : {}),
        x: integerInRange(item.x, 0, 11, 0),
        y: integerInRange(item.y, 0, 999, 0),
        w: integerInRange(item.w, 1, 12, 6),
        h: integerInRange(item.h, 2, 8, 3),
        order: integerInRange(item.order, 0, 999, index)
      };
    })
    .sort((a, b) => a.order - b.order)
    .map((item, index) => ({ ...item, order: index }));
}

export function catalogDefaultsForType(type) {
  const builtIn = BUILTIN_DEVICE_CATALOG_ITEMS.find((item) => item.type === type);
  if (builtIn) {
    return builtIn;
  }
  return {
    type,
    brand: "Generic",
    model: "Custom Device",
    displayName: "Custom Device",
    driverId: `driver.custom-${type}`,
    transportId: "transport.controller-json",
    capabilities: [{ id: type, features: [] }],
    configSchema: [],
    defaultConfig: {},
    tags: [type]
  };
}

export function normalizeCapabilities(value, type) {
  if (!Array.isArray(value) || value.length === 0) {
    return [{ id: type, features: [] }];
  }
  return value
    .filter((item) => item && typeof item === "object")
    .map((item) => ({
      id: cleanOptionalString(item.id, type),
      features: normalizeStringArray(item.features)
    }));
}

export function normalizeConfigSchema(value, fallback = []) {
  const raw = Array.isArray(value) ? value : fallback;
  return raw
    .filter((item) => item && typeof item === "object" && typeof item.id === "string" && item.id.trim())
    .map((item) => ({
      id: item.id.trim(),
      label: cleanOptionalString(item.label, item.id.trim()),
      kind: item.kind === "number" || item.kind === "select" || item.kind === "toggle" ? item.kind : "text",
      ...(item.required === true ? { required: true } : {}),
      ...(typeof item.min === "number" ? { min: item.min } : {}),
      ...(typeof item.max === "number" ? { max: item.max } : {}),
      ...(typeof item.step === "number" ? { step: item.step } : {}),
      ...(Array.isArray(item.options) ? { options: item.options.filter(Boolean).map((option) => ({ label: cleanOptionalString(option.label, String(option.value ?? "")), value: option.value })) } : {})
    }));
}

export function normalizeConfigForSchema(schema, config) {
  const normalized = {};
  const schemaIds = new Set(schema.map((field) => field.id));
  for (const field of schema) {
    const value = config?.[field.id];
    if (field.kind === "number") {
      const number = typeof value === "number" ? value : typeof value === "string" && value.trim() ? Number(value) : null;
      normalized[field.id] = Number.isFinite(number) ? clampNumber(number, field.min, field.max) : null;
    } else if (field.kind === "toggle") {
      normalized[field.id] = value === true;
    } else if (field.kind === "select") {
      const selectValue = typeof value === "string" && MOTOR_PIN_FIELD_IDS.has(field.id) ? resolveMotorPinAlias(value) : value;
      const selected = (field.options ?? []).find((option) => String(option.value) === String(selectValue));
      normalized[field.id] = selected ? selected.value : field.options?.[0]?.value ?? null;
    } else {
      normalized[field.id] = value === null || value === undefined ? "" : String(value);
    }
  }
  for (const [key, value] of Object.entries(config ?? {})) {
    if (!schemaIds.has(key) && (value === null || ["string", "number", "boolean"].includes(typeof value))) {
      normalized[key] = value;
    }
  }
  return normalized;
}

export function normalizePlainObject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return Object.fromEntries(
    Object.entries(value).filter(([, item]) => item === null || ["string", "number", "boolean"].includes(typeof item))
  );
}

export function normalizeJsonObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

export function cleanType(value) {
  return cleanOptionalString(value, "servo").slice(0, 48);
}

export function cleanName(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, 120) : fallback;
}

export function cleanOptionalString(value, fallback) {
  return typeof value === "string" && value.trim() ? value.trim() : fallback;
}

export function uniqueStrings(value) {
  return Array.from(new Set(normalizeStringArray(value)));
}

export function normalizeStringArray(value) {
  return Array.isArray(value) ? value.filter((item) => typeof item === "string" && item.trim()).map((item) => item.trim()) : [];
}

export function normalizeMotorChannel(value) {
  const text = typeof value === "string" ? value.trim().toUpperCase() : "";
  const match = text.match(/^M(\d+)$/);
  return match ? `M${Number(match[1])}` : text;
}

export function isValidMotorChannel(value) {
  return /^M([1-9]|1[0-6])$/.test(normalizeMotorChannel(value));
}

const TYPE_A_PIN_ALIASES = {
  ...TYPE_A_BOARD_SILK_TO_PIN,
  CAN1_TX: "PD1",
  CAN1_H: "PD1",
  CAN1_RX: "PD0",
  CAN1_L: "PD0",
  CAN2_TX: "PB13",
  CAN2_H: "PB13",
  CAN2_RX: "PB12",
  CAN2_L: "PB12",
  UART6_TX: "PG14",
  USART6_TX: "PG14",
  UART6_RX: "PG9",
  USART6_RX: "PG9",
  UART3_TX: "PD8",
  USART3_TX: "PD8",
  UART3_RX: "PD9",
  USART3_RX: "PD9",
  USART2_TX: "PD5",
  USART2_RX: "PD6",
  KEY: "PD10",
  USER_KEY: "PD10",
  LASER: "PG13",
  BUZZER: "PB4",
  MPU_INT: "PE1",
  IMU_INT: "PE1",
  IST8310_DRDY: "PE3",
  IST8310_SET_RESET: "PE2"
};

function normalizeMotorPinAliases(config) {
  for (const role of ["pwmPin", "in1Pin", "in2Pin", "enablePin", "sensorPin", "encoderAPin", "encoderBPin"]) {
    const normalized = resolveMotorPinAlias(config[role]);
    if (normalized) {
      config[role] = normalized;
    }
  }
}

function resolveMotorPinAlias(value) {
  const key = typeof value === "string" ? value.trim().toUpperCase().replace(/[\s.:-]+/g, "_") : "";
  if (!key) return "";
  if (/^P[A-I][0-9]{1,2}$/.test(key)) return key;
  return TYPE_A_PIN_ALIASES[key] ?? key;
}

export function integerInRange(value, min, max, fallback) {
  const number = Number(value);
  return Number.isInteger(number) ? Math.min(max, Math.max(min, number)) : fallback;
}

export function clampNumber(value, min, max) {
  let next = value;
  if (typeof min === "number") {
    next = Math.max(min, next);
  }
  if (typeof max === "number") {
    next = Math.min(max, next);
  }
  return next;
}

export function slug(value) {
  const text = String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return text || "custom";
}

export function cleanProjectName(name) {
  return typeof name === "string" && name.trim() ? name.trim().slice(0, 120) : DEFAULT_PROJECT_NAME;
}

export function normalizeEventBatch(events) {
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

export function normalizeTelemetryBatch(telemetry) {
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

export function normalizeArmTeachTrack(track) {
  if (!track || typeof track !== "object") {
    throw badRequestError("track is required");
  }
  const now = Date.now();
  const id = cleanId(track.id, "track id is required");
  const name = typeof track.name === "string" && track.name.trim() ? track.name.trim().slice(0, 120) : "Teach Track";
  return {
    ...track,
    id,
    name,
    createdAt: finiteTimestamp(track.createdAt) ?? now,
    updatedAt: finiteTimestamp(track.updatedAt) ?? now
  };
}

export function cleanId(value, message) {
  if (typeof value !== "string" || !value.trim()) {
    throw badRequestError(message);
  }
  return value.trim();
}

export function clampLimit(value) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 && number <= 1000 ? number : 120;
}

export function finiteTimestamp(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function parseJson(text, fallback) {
  try {
    return JSON.parse(text);
  } catch {
    return fallback;
  }
}

export function badRequestError(message) {
  return Object.assign(new Error(message), { statusCode: 400 });
}

export function notFoundError(message) {
  return Object.assign(new Error(message), { statusCode: 404 });
}
