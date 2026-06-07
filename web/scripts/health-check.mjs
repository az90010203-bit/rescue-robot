import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = dirname(scriptPath);
const webRoot = resolve(scriptDir, "..");
const repoRoot = resolve(webRoot, "..");
const sourceExtensions = new Set([".ts", ".tsx", ".mjs", ".cpp", ".h"]);
const textDecoder = new TextDecoder("utf-8", { fatal: true });

const sourceFiles = listFiles([resolve(webRoot, "src"), resolve(webRoot, "scripts"), resolve(repoRoot, "firmware", "src")])
  .filter((file) => sourceExtensions.has(extname(file)));
const sourceStats = sourceFiles
  .map((file) => {
    const text = readUtf8(file);
    return {
      path: relative(file),
      lines: text.split(/\r?\n/).length,
      anyCount: countMatches(text, /\bany\b/g),
      testCount: /\.test\.(ts|tsx|mjs)$/.test(file) ? countMatches(text, /\b(?:it|test)\(/g) : 0
    };
  })
  .sort((left, right) => right.lines - left.lines);

const distChunks = listFiles([resolve(webRoot, "dist", "assets")])
  .filter((file) => extname(file) === ".js")
  .map((file) => ({
    path: relative(file),
    bytes: statSync(file).size
  }))
  .sort((left, right) => right.bytes - left.bytes);
const mainChunk = distChunks.find((chunk) => /assets[\\/]+index-.*\.js$/.test(chunk.path));
const docs = [resolve(repoRoot, "README.md"), resolve(repoRoot, "DESIGN.md"), resolve(repoRoot, "docs", "camera_stream_gimbal.md")];
const invalidUtf8Docs = docs.filter((file) => {
  try {
    readUtf8(file);
    return false;
  } catch {
    return true;
  }
});
const mojibakeMatches = scanMojibake([...new Set([...sourceFiles.filter((file) => file !== scriptPath), ...docs])]);

const report = {
  largestFiles: sourceStats.slice(0, 10),
  totals: {
    sourceFiles: sourceStats.length,
    anyCount: sourceStats.reduce((sum, item) => sum + item.anyCount, 0),
    declaredTests: sourceStats.reduce((sum, item) => sum + item.testCount, 0)
  },
  chunks: distChunks,
  utf8Docs: {
    checked: docs.map(relative),
    invalid: invalidUtf8Docs.map(relative)
  },
  mojibake: {
    matches: mojibakeMatches
  }
};

console.log(JSON.stringify(report, null, 2));

const failures = [];
if (mainChunk && mainChunk.bytes > 500 * 1024) {
  failures.push(`Main chunk ${mainChunk.path} is ${formatKb(mainChunk.bytes)}, above 500 kB.`);
}
if (invalidUtf8Docs.length > 0) {
  failures.push(`Docs are not valid UTF-8: ${invalidUtf8Docs.map(relative).join(", ")}`);
}
if (mojibakeMatches.length > 0) {
  failures.push(`Possible mojibake text found: ${mojibakeMatches.map((item) => `${item.path}:${item.line}`).join(", ")}`);
}
if (failures.length > 0) {
  for (const failure of failures) {
    console.error(failure);
  }
  process.exit(1);
}

function listFiles(roots) {
  const files = [];
  for (const root of roots) {
    collect(root, files);
  }
  return files;
}

function collect(path, files) {
  let entry;
  try {
    entry = statSync(path);
  } catch {
    return;
  }
  if (entry.isFile()) {
    files.push(path);
    return;
  }
  if (!entry.isDirectory()) {
    return;
  }
  for (const child of readdirSync(path)) {
    if (child === "node_modules" || child === "dist") {
      continue;
    }
    collect(join(path, child), files);
  }
}

function readUtf8(path) {
  return textDecoder.decode(readFileSync(path));
}

function countMatches(text, pattern) {
  return text.match(pattern)?.length ?? 0;
}

function scanMojibake(files) {
  const patterns = [
    /鑸垫満/u,
    /鐢垫満/u,
    /鎽勫儚/u,
    /椋炵壒/u,
    /鐩磋繛/u,
    /涓嶉渶/u,
    /涓嶅彂/u,
    /宸叉敼/u,
    /鎬荤嚎/u,
    /閼稿灚/u
  ];
  const matches = [];
  for (const file of files) {
    let text;
    try {
      text = readUtf8(file);
    } catch {
      continue;
    }
    const lines = text.split(/\r?\n/);
    for (const [index, line] of lines.entries()) {
      const pattern = patterns.find((candidate) => candidate.test(line));
      if (!pattern) {
        continue;
      }
      matches.push({
        path: relative(file),
        line: index + 1,
        pattern: pattern.source,
        text: line.trim().slice(0, 160)
      });
      if (matches.length >= 50) {
        return matches;
      }
    }
  }
  return matches;
}

function relative(path) {
  return path.replace(`${repoRoot}\\`, "").replace(`${repoRoot}/`, "").replaceAll("\\", "/");
}

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(2)} kB`;
}
