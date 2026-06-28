import { readFileSync, statSync } from "node:fs";
import { basename } from "node:path";

/**
 * Connect-target resolver — the net-new INPUT MODE for the connect re-aim.
 *
 * The original CLI answers "score MY gateway repo". The connect mode answers
 * "should I connect to THIS third-party server?", so the target is the artifact
 * a user actually has in hand when making that decision:
 *
 *   - an MCP client config entry (`.mcp.json` / `claude_desktop_config.json`)
 *     declaring how the server is launched (command/args/env),
 *   - the server's package manifest (`package.json`),
 *   - or a checkout/clone of the server repo (a directory).
 *
 * This resolver only CLASSIFIES the target and extracts a human label; the
 * actual scanning is delegated to the existing `scan()` core unchanged. It is
 * network-free and read-only — it never installs, fetches, or executes anything.
 */

export type ConnectTargetKind = "mcp-config" | "manifest" | "repo" | "file";

export interface DeclaredServer {
  /** The key under `mcpServers`, or the package name. */
  name: string;
  /** The launch command line, e.g. `npx -y some-server@latest`. */
  command: string;
}

export interface ConnectTarget {
  /** Path handed to `scan()` (file or directory). */
  root: string;
  kind: ConnectTargetKind;
  /** Short human label describing what is being assessed. */
  label: string;
  /** Server launch entries parsed from an MCP config, when present. */
  servers: DeclaredServer[];
}

interface RawServerEntry {
  command?: unknown;
  args?: unknown;
}

/** Build a readable launch command from an mcpServers entry. */
function commandLine(entry: RawServerEntry): string {
  const cmd = typeof entry.command === "string" ? entry.command : "";
  const args = Array.isArray(entry.args)
    ? entry.args.filter((a): a is string => typeof a === "string")
    : [];
  return [cmd, ...args].join(" ").trim();
}

/** Extract declared servers from a parsed MCP client config, if it has any. */
function parseMcpServers(parsed: unknown): DeclaredServer[] {
  if (typeof parsed !== "object" || parsed === null) return [];
  const servers = (parsed as { mcpServers?: unknown }).mcpServers;
  if (typeof servers !== "object" || servers === null) return [];
  const out: DeclaredServer[] = [];
  for (const [name, raw] of Object.entries(
    servers as Record<string, unknown>,
  )) {
    const entry = (raw ?? {}) as RawServerEntry;
    out.push({ name, command: commandLine(entry) });
  }
  return out;
}

/**
 * Resolve a connect-target spec into a scannable root + metadata. Throws on a
 * nonexistent path; callers map that to a usage error.
 */
export function resolveConnectTarget(spec: string): ConnectTarget {
  const st = statSync(spec); // throws ENOENT — caller handles

  if (st.isDirectory()) {
    return {
      root: spec,
      kind: "repo",
      label: `server checkout: ${basename(spec) || spec}`,
      servers: [],
    };
  }

  const name = basename(spec);

  if (name.toLowerCase().endsWith(".json")) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(readFileSync(spec, "utf8"));
    } catch {
      parsed = undefined; // not valid JSON — fall through to plain-file handling
    }
    const servers = parseMcpServers(parsed);
    if (servers.length > 0) {
      const names = servers.map((s) => s.name).join(", ");
      return {
        root: spec,
        kind: "mcp-config",
        label: `MCP config: ${servers.length} server entr${servers.length === 1 ? "y" : "ies"} (${names})`,
        servers,
      };
    }
    if (name === "package.json") {
      const pkgName =
        parsed && typeof parsed === "object" && "name" in parsed
          ? String((parsed as { name?: unknown }).name ?? name)
          : name;
      return {
        root: spec,
        kind: "manifest",
        label: `package manifest: ${pkgName}`,
        servers: [],
      };
    }
  }

  return {
    root: spec,
    kind: "file",
    label: `file: ${name}`,
    servers: [],
  };
}
