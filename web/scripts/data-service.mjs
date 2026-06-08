#!/usr/bin/env node
import { createServer } from "node:http";
import { DATA_SERVICE_SCHEMA_VERSION, defaultDatabasePath, openDataStore } from "./data-store.mjs";
import { isLocalRequest, readJsonBody as readHelperJsonBody, sendErrorJson, sendJson as sendBaseJson } from "./local-http-helper.mjs";

const HOST = "127.0.0.1";
const PORT = Number(process.env.DATA_SERVICE_PORT ?? 17351);
const MAX_REQUEST_BYTES = 8 * 1024 * 1024;
const DATA_SERVICE_METHODS = "GET,POST,PUT,PATCH,DELETE,OPTIONS";

function sendJson(response, statusCode, body) {
  sendBaseJson(response, statusCode, body, { methods: DATA_SERVICE_METHODS });
}

async function readJsonBody(request) {
  return readHelperJsonBody(request, { maxBytes: MAX_REQUEST_BYTES });
}

function projectPayload(store, project) {
  const state = store.getProjectState(project.id);
  return {
    project,
    state: state?.snapshot ?? null,
    stateUpdatedAt: state?.updatedAt ?? null,
    events: store.listRecentEvents(project.id, 120),
    telemetry: store.listLatestTelemetry(project.id, 240),
    architecture: store.getProjectArchitecture(project.id)
  };
}

async function route(store, request, response) {
  if (!isLocalRequest(request)) {
    sendJson(response, 403, { error: "local requests only" });
    return;
  }
  if (request.method === "OPTIONS") {
    sendJson(response, 204, {});
    return;
  }

  const url = new URL(request.url ?? "/", `http://${HOST}:${PORT}`);
  const segments = url.pathname.split("/").filter(Boolean);

  if (request.method === "GET" && url.pathname === "/health") {
    const currentProject = store.getCurrentProject();
    sendJson(response, 200, {
      ok: true,
      dbPath: defaultDatabasePath(),
      schemaVersion: DATA_SERVICE_SCHEMA_VERSION,
      currentProject,
      projectCount: store.listProjects().length
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/projects") {
    sendJson(response, 200, { projects: store.listProjects() });
    return;
  }

  if (request.method === "GET" && url.pathname === "/catalog/devices") {
    sendJson(response, 200, {
      items: store.listDeviceCatalog({
        type: url.searchParams.get("type") ?? "",
        brand: url.searchParams.get("brand") ?? "",
        model: url.searchParams.get("model") ?? "",
        query: url.searchParams.get("query") ?? ""
      })
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/catalog/devices") {
    const body = await readJsonBody(request);
    sendJson(response, 201, store.createDeviceCatalogItem(body.item ?? body));
    return;
  }

  if (request.method === "POST" && url.pathname === "/projects") {
    const body = await readJsonBody(request);
    const project = store.createProject(body.name);
    sendJson(response, 201, projectPayload(store, project));
    return;
  }

  if (request.method === "GET" && url.pathname === "/projects/current") {
    sendJson(response, 200, projectPayload(store, store.getCurrentProject()));
    return;
  }

  if (segments[0] === "projects" && segments[1] && request.method === "PUT" && segments[2] === "state") {
    const body = await readJsonBody(request);
    const result = store.saveProjectState(segments[1], body.snapshot ?? body);
    sendJson(response, 200, result);
    return;
  }

  if (segments[0] === "projects" && segments[1] && request.method === "PATCH" && segments[2] === "current") {
    const project = store.setCurrentProject(segments[1]);
    sendJson(response, 200, projectPayload(store, project));
    return;
  }

  if (segments[0] === "projects" && segments[1] && segments[2] === "plugin-instances") {
    if (request.method === "GET" && !segments[3]) {
      sendJson(response, 200, { pluginInstances: store.listPluginInstances(segments[1]) });
      return;
    }
    if (request.method === "POST" && !segments[3]) {
      const body = await readJsonBody(request);
      sendJson(response, 201, store.createPluginInstance(segments[1], body.pluginInstance ?? body));
      return;
    }
    if (request.method === "PATCH" && segments[3]) {
      const body = await readJsonBody(request);
      sendJson(response, 200, store.updatePluginInstance(segments[1], segments[3], body.pluginInstance ?? body));
      return;
    }
    if (request.method === "DELETE" && segments[3]) {
      sendJson(response, 200, store.deletePluginInstance(segments[1], segments[3]));
      return;
    }
  }

  if (segments[0] === "projects" && segments[1] && segments[2] === "components") {
    if (request.method === "GET" && !segments[3]) {
      sendJson(response, 200, { components: store.listComponents(segments[1]) });
      return;
    }
    if (request.method === "POST" && !segments[3]) {
      const body = await readJsonBody(request);
      sendJson(response, 201, store.createComponent(segments[1], body.component ?? body));
      return;
    }
    if (request.method === "PATCH" && segments[3]) {
      const body = await readJsonBody(request);
      sendJson(response, 200, store.updateComponent(segments[1], segments[3], body.component ?? body));
      return;
    }
    if (request.method === "DELETE" && segments[3]) {
      sendJson(response, 200, store.deleteComponent(segments[1], segments[3]));
      return;
    }
  }

  if (segments[0] === "projects" && segments[1] && segments[2] === "robots") {
    if (request.method === "GET" && !segments[3]) {
      sendJson(response, 200, { robots: store.listRobots(segments[1]) });
      return;
    }
    if (request.method === "POST" && !segments[3]) {
      const body = await readJsonBody(request);
      sendJson(response, 201, store.createRobot(segments[1], body.robot ?? body));
      return;
    }
    if (request.method === "PATCH" && segments[3]) {
      const body = await readJsonBody(request);
      sendJson(response, 200, store.updateRobot(segments[1], segments[3], body.robot ?? body));
      return;
    }
    if (request.method === "DELETE" && segments[3]) {
      sendJson(response, 200, store.deleteRobot(segments[1], segments[3]));
      return;
    }
  }

  if (segments[0] === "projects" && segments[1] && segments[2] === "panel-layouts" && segments[3]) {
    if (request.method === "GET") {
      sendJson(response, 200, store.getPanelLayout(segments[1], decodeURIComponent(segments[3])));
      return;
    }
    if (request.method === "PUT") {
      const body = await readJsonBody(request);
      sendJson(response, 200, store.savePanelLayout(segments[1], decodeURIComponent(segments[3]), body.layout ?? body));
      return;
    }
  }

  if (segments[0] === "projects" && segments[1] && request.method === "POST" && segments[2] === "sessions") {
    const session = store.startSession(segments[1]);
    sendJson(response, 201, session);
    return;
  }

  if (segments[0] === "projects" && segments[1] && request.method === "GET" && segments[2] === "arm-teach-tracks") {
    sendJson(response, 200, { tracks: store.listArmTeachTracks(segments[1]) });
    return;
  }

  if (segments[0] === "projects" && segments[1] && request.method === "PUT" && segments[2] === "arm-teach-tracks" && segments[3]) {
    const body = await readJsonBody(request);
    const track = store.saveArmTeachTrack(segments[1], { ...(body.track ?? body), id: segments[3] });
    sendJson(response, 200, track);
    return;
  }

  if (segments[0] === "arm-teach-tracks" && segments[1] && request.method === "DELETE") {
    sendJson(response, 200, store.deleteArmTeachTrack(segments[1]));
    return;
  }

  if (segments[0] === "sessions" && segments[1] && request.method === "PATCH" && segments[2] === "end") {
    const session = store.endSession(segments[1]);
    sendJson(response, 200, session);
    return;
  }

  if (segments[0] === "sessions" && segments[1] && request.method === "POST" && segments[2] === "events" && segments[3] === "batch") {
    const body = await readJsonBody(request);
    const result = store.appendEvents(segments[1], body.events);
    sendJson(response, 200, result);
    return;
  }

  if (segments[0] === "sessions" && segments[1] && request.method === "POST" && segments[2] === "telemetry" && segments[3] === "batch") {
    const body = await readJsonBody(request);
    const result = store.appendTelemetry(segments[1], body.telemetry);
    sendJson(response, 200, result);
    return;
  }

  sendJson(response, 404, { error: "not found" });
}

const store = await openDataStore();
const server = createServer((request, response) => {
  route(store, request, response).catch((error) => {
    sendErrorJson(response, error, {
      fallbackMessage: "data service error",
      methods: DATA_SERVICE_METHODS
    });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Data service listening on http://${HOST}:${PORT}`);
  console.log(`SQLite database: ${defaultDatabasePath()}`);
});

function shutdown() {
  server.close(() => {
    store.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
