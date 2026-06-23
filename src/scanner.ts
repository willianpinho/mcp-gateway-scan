import { d1Rbac } from "./dimensions/d1-rbac.js";
import { d2FailClose } from "./dimensions/d2-failclose.js";
import { d3SupplyChain } from "./dimensions/d3-supplychain.js";
import { d4Observability } from "./dimensions/d4-observability.js";
import { d5Routing } from "./dimensions/d5-routing.js";
import { d6Secrets } from "./dimensions/d6-secrets.js";
import { d7ProdReady } from "./dimensions/d7-prodready.js";
import { loadFiles } from "./walker.js";
import type { DimensionModule, ScanContext, ScanResult } from "./types.js";

export const VERSION = "0.2.0";

/** The seven dimension modules, in canonical order. */
export const DIMENSIONS: DimensionModule[] = [
  d1Rbac,
  d2FailClose,
  d3SupplyChain,
  d4Observability,
  d5Routing,
  d6Secrets,
  d7ProdReady,
];

/**
 * Run all dimensions against a target path (file or directory). READ-ONLY:
 * loads files and pattern-matches; never executes target code, never writes.
 */
export function scan(root: string): ScanResult {
  const files = loadFiles(root);
  const ctx: ScanContext = { root, files };

  const dimensions = DIMENSIONS.map((d) => d.run(ctx));

  const score = { green: 0, yellow: 0, red: 0 };
  for (const d of dimensions) score[d.color] += 1;

  return {
    tool: "mcp-gateway-scan",
    version: VERSION,
    target: root,
    scannedFiles: files.length,
    dimensions,
    score,
  };
}
