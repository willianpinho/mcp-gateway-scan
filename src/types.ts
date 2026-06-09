import { z } from "zod";

/**
 * Core domain types for the scanner. A Zod schema is the source of truth for the
 * machine-readable result (used by `--json`), and TS types are inferred from it.
 */

export const ColorSchema = z.enum(["green", "yellow", "red"]);
export type Color = z.infer<typeof ColorSchema>;

export const SeveritySchema = z.enum(["S1", "S2", "S3"]);
export type Severity = z.infer<typeof SeveritySchema>;

/** One matched line of evidence. `value` is REDACTED for secret hits — never raw. */
export const EvidenceSchema = z.object({
  file: z.string(),
  line: z.number().int().positive(),
  /** A short, safe excerpt. For secret hits this is "<redacted secret literal>". */
  excerpt: z.string(),
  /** Whether this evidence supports the dimension (a good signal) or harms it (anti-pattern). */
  polarity: z.enum(["positive", "negative"]),
  /** Free-text label of what was matched, e.g. "authz-in-prompt". */
  label: z.string(),
});
export type Evidence = z.infer<typeof EvidenceSchema>;

export const DimensionResultSchema = z.object({
  id: z.string(),
  title: z.string(),
  color: ColorSchema,
  severity: SeveritySchema,
  summary: z.string(),
  evidence: z.array(EvidenceSchema),
});
export type DimensionResult = z.infer<typeof DimensionResultSchema>;

export const ScanResultSchema = z.object({
  tool: z.literal("mcp-gateway-scan"),
  version: z.string(),
  target: z.string(),
  scannedFiles: z.number().int().nonnegative(),
  dimensions: z.array(DimensionResultSchema),
  score: z.object({
    green: z.number().int().nonnegative(),
    yellow: z.number().int().nonnegative(),
    red: z.number().int().nonnegative(),
  }),
});
export type ScanResult = z.infer<typeof ScanResultSchema>;

/** A single file loaded into memory (read-only) for the dimension modules. */
export interface ScanFile {
  /** Absolute path on disk. */
  absPath: string;
  /** Path relative to the scan root, for display. */
  relPath: string;
  /** Full text content. */
  content: string;
  /** Lines split once, shared across all dimensions for efficiency. */
  lines: string[];
}

/** The corpus handed to every dimension module. */
export interface ScanContext {
  root: string;
  files: ScanFile[];
}

/** Contract every dimension module implements. */
export interface DimensionModule {
  id: string;
  title: string;
  run(ctx: ScanContext): DimensionResult;
}
