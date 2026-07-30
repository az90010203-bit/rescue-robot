/** Expands development-only CSP sources without weakening packaged builds. */
export function applyRendererCsp(
  html: string,
  command: "build" | "serve"
): string {
  const developmentConnections =
    command === "serve" ? "ws://localhost:* http://localhost:*" : "";
  const developmentStyles = command === "serve" ? "'unsafe-inline'" : "";
  return html
    .replace("__DEV_CONNECT_SOURCES__", developmentConnections)
    .replace("__DEV_STYLE_SOURCES__", developmentStyles);
}
