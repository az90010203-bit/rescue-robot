import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(scriptDir, "..", "..");
const readmePath = resolve(repoRoot, "README.md");
const architectureStart = "<!-- ARCHITECTURE:BEGIN -->";
const architectureEnd = "<!-- ARCHITECTURE:END -->";

function git(args) {
  return execFileSync("git", args, { cwd: repoRoot, encoding: "utf8" }).trim();
}

function readHeadFile(path) {
  try {
    return git(["show", `HEAD:${path}`]);
  } catch {
    return "";
  }
}

function architectureBlock(text) {
  const start = text.indexOf(architectureStart);
  const end = text.indexOf(architectureEnd);
  if (start === -1 || end === -1 || end <= start) {
    return "";
  }
  return text.slice(start, end + architectureEnd.length);
}

const changedFiles = git(["diff", "--name-only", "HEAD", "--"])
  .split(/\r?\n/)
  .map((item) => item.trim())
  .filter(Boolean);

const nonReadmeChanges = changedFiles.filter((path) => path !== "README.md");

if (nonReadmeChanges.length === 0) {
  process.exit(0);
}

if (!changedFiles.includes("README.md")) {
  console.error("README.md must be updated whenever tracked code, config, script, firmware, or docs files change.");
  console.error(`Changed files: ${nonReadmeChanges.join(", ")}`);
  process.exit(1);
}

const currentReadme = readFileSync(readmePath, "utf8");
const headReadme = readHeadFile("README.md");
const currentBlock = architectureBlock(currentReadme);
const headBlock = architectureBlock(headReadme);

if (!currentBlock) {
  console.error(`README.md must contain ${architectureStart} and ${architectureEnd}.`);
  process.exit(1);
}

if (currentBlock === headBlock) {
  console.error("README.md architecture Mermaid block must be updated together with tracked changes.");
  process.exit(1);
}
