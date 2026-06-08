export const LOOPBACK_ADDRESSES = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

export function isLocalRequest(request) {
  return LOOPBACK_ADDRESSES.has(request?.socket?.remoteAddress);
}

export function sendJson(response, statusCode, body, options = {}) {
  response.writeHead(statusCode, {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "content-type",
    "Access-Control-Allow-Methods": options.methods ?? "GET,POST,OPTIONS",
    "Content-Type": "application/json; charset=utf-8"
  });
  response.end(JSON.stringify(body));
}

export async function readJsonBody(request, options = {}) {
  const maxBytes = options.maxBytes ?? 1024 * 1024;
  const chunks = [];
  let total = 0;
  for await (const chunk of request) {
    total += chunk.length;
    if (total > maxBytes) {
      throw Object.assign(new Error("request body is too large"), { statusCode: 413 });
    }
    chunks.push(chunk);
  }
  if (chunks.length === 0) {
    return {};
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function sendErrorJson(response, error, options = {}) {
  sendJson(
    response,
    error?.statusCode ?? 500,
    {
      error: error?.message || options.fallbackMessage || "local helper error",
      ...options.extra
    },
    options
  );
}
