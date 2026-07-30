import path from "node:path";

/**
 * Resolves a fixed custom-protocol URL without allowing directory traversal.
 *
 * @param rendererRoot - Absolute directory containing the built renderer
 * @param requestUrl - URL requested through the rescue protocol
 * @returns An absolute renderer asset path, or null for an invalid request
 */
export function resolveRendererAsset(
  rendererRoot: string,
  requestUrl: string
): string | null {
  const url = new URL(requestUrl);
  if (url.protocol !== "rescue:" || url.hostname !== "app") {
    return null;
  }
  let pathname: string;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    return null;
  }
  if (pathname.includes("\0")) {
    return null;
  }
  const relativeAsset = pathname.replace(/^[/\\]+/, "") || "index.html";
  const assetPath = path.resolve(rendererRoot, relativeAsset);
  const relative = path.relative(rendererRoot, assetPath);
  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    return null;
  }
  return assetPath;
}
