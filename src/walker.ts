import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import type { ScanFile } from "./types.js";

/** Directories we never descend into. */
const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  ".next",
  "out",
  "coverage",
  ".turbo",
  ".cache",
  "vendor",
  "__pycache__",
  ".venv",
  "venv",
  ".terraform",
]);

/** Extensions we read. Config/code/IaC relevant to MCP gateways. */
const SCANNED_EXTENSIONS = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".rb",
  ".yaml",
  ".yml",
  ".json",
  ".toml",
  ".tf",
  ".env",
  ".ini",
  ".cfg",
  ".sh",
  ".md",
  ".txt",
  ".rego",
]);

/** Filenames (no extension) worth scanning. */
const SCANNED_FILENAMES = new Set([
  "Dockerfile",
  ".env",
  ".env.local",
  ".env.production",
  ".env.example",
  "docker-compose.yml",
  "docker-compose.yaml",
]);

/** Hard cap on per-file size so a stray binary/data blob never blows up memory. */
const MAX_FILE_BYTES = 2 * 1024 * 1024;

/**
 * Heuristic binary detection: a NUL byte in the first 4KB means it is not a text
 * file we should pattern-scan, even if its extension is allowlisted. Read-only.
 */
function looksBinary(content: string): boolean {
  const len = Math.min(content.length, 4096);
  for (let i = 0; i < len; i++) {
    if (content.charCodeAt(i) === 0) return true; // NUL byte => binary
  }
  return false;
}

function isScannable(name: string): boolean {
  if (SCANNED_FILENAMES.has(name)) return true;
  const dot = name.lastIndexOf(".");
  if (dot <= 0) return false;
  const ext = name.slice(dot).toLowerCase();
  // `.env.production` etc. — match on the trailing .env too.
  if (name.startsWith(".env")) return true;
  return SCANNED_EXTENSIONS.has(ext);
}

/**
 * Walk `root` read-only, returning every scannable file's content. Never executes,
 * never writes. Symlinked directories are skipped to avoid cycles/escapes.
 */
export function loadFiles(root: string): ScanFile[] {
  const out: ScanFile[] = [];

  function walk(dir: string): void {
    let entries: string[];
    try {
      entries = readdirSync(dir);
    } catch {
      return; // unreadable dir — skip silently, read-only contract
    }
    for (const name of entries) {
      const abs = join(dir, name);
      let st;
      try {
        st = statSync(abs); // statSync follows symlinks; lstat below guards loops
      } catch {
        continue;
      }
      if (st.isDirectory()) {
        if (IGNORED_DIRS.has(name)) continue;
        if (name.startsWith(".") && name !== "." && !name.startsWith(".env")) {
          // skip hidden dirs (.github is useful though)
          if (name !== ".github") continue;
        }
        walk(abs);
        continue;
      }
      if (!st.isFile()) continue;
      if (st.size > MAX_FILE_BYTES) continue; // skip oversized files gracefully
      if (!isScannable(name)) continue;
      let content: string;
      try {
        content = readFileSync(abs, "utf8");
      } catch {
        continue; // unreadable (permissions, race) — skip, read-only contract
      }
      if (looksBinary(content)) continue; // skip binary blobs in text extensions
      out.push({
        absPath: abs,
        relPath: relative(root, abs).split(sep).join("/") || name,
        content,
        lines: content.split(/\r?\n/),
      });
    }
  }

  const rootStat = statSync(root);
  if (rootStat.isFile()) {
    if (rootStat.size <= MAX_FILE_BYTES) {
      const content = readFileSync(root, "utf8");
      if (!looksBinary(content)) {
        out.push({
          absPath: root,
          relPath: root,
          content,
          lines: content.split(/\r?\n/),
        });
      }
    }
    return out;
  }
  walk(root);
  return out;
}
