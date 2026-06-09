import type { Color, Evidence, ScanContext, ScanFile } from "./types.js";

/** Max chars kept from a matched line in evidence excerpts. */
const EXCERPT_MAX = 120;

/** Files we treat as "prose only" — markdown/text. Used to down-weight doc matches. */
export function isProse(file: ScanFile): boolean {
  return file.relPath.endsWith(".md") || file.relPath.endsWith(".txt");
}

function trimExcerpt(raw: string): string {
  const t = raw.trim();
  return t.length > EXCERPT_MAX ? `${t.slice(0, EXCERPT_MAX)}…` : t;
}

/**
 * True if the line is comment-only (starts with #, //, *, or --). Used to keep
 * "control present" (positive) signals from matching a comment that merely
 * *mentions* a control — most damningly a comment about its ABSENCE
 * (e.g. `# No max_tokens, no kill-switch`).
 */
export function isCommentLine(line: string): boolean {
  const t = line.trim();
  return (
    t.startsWith("#") ||
    t.startsWith("//") ||
    t.startsWith("*") ||
    t.startsWith("/*") ||
    t.startsWith("--")
  );
}

export interface MatchOptions {
  /** Skip prose (.md/.txt) files entirely for this pattern. */
  codeOnly?: boolean;
  /** Restrict to files whose relPath matches this test. */
  fileFilter?: (file: ScanFile) => boolean;
  /** Skip comment-only lines. Use for positive "control present" signals. */
  skipComments?: boolean;
}

/**
 * Scan every line of every file for `pattern`, returning evidence rows.
 * Read-only. `pattern` must have the global flag for repeated lastIndex use is
 * avoided — we test per line, so a non-global regex is fine and simpler.
 */
export function findLines(
  ctx: ScanContext,
  pattern: RegExp,
  meta: { label: string; polarity: Evidence["polarity"] },
  opts: MatchOptions = {},
): Evidence[] {
  const results: Evidence[] = [];
  for (const file of ctx.files) {
    if (opts.codeOnly && isProse(file)) continue;
    if (opts.fileFilter && !opts.fileFilter(file)) continue;
    for (let i = 0; i < file.lines.length; i++) {
      const line = file.lines[i];
      if (line === undefined) continue;
      if (opts.skipComments && isCommentLine(line)) continue;
      if (pattern.test(line)) {
        results.push({
          file: file.relPath,
          line: i + 1,
          excerpt: trimExcerpt(line),
          polarity: meta.polarity,
          label: meta.label,
        });
      }
    }
  }
  return results;
}

/** True if ANY line in the corpus matches `pattern`. */
export function anyMatch(
  ctx: ScanContext,
  pattern: RegExp,
  opts: MatchOptions = {},
): boolean {
  for (const file of ctx.files) {
    if (opts.codeOnly && isProse(file)) continue;
    if (opts.fileFilter && !opts.fileFilter(file)) continue;
    for (const line of file.lines) {
      if (opts.skipComments && isCommentLine(line)) continue;
      if (pattern.test(line)) return true;
    }
  }
  return false;
}

/** Count code (non-prose) files in the corpus — used to size "absence" verdicts. */
export function codeFileCount(ctx: ScanContext): number {
  return ctx.files.filter((f) => !isProse(f)).length;
}

/** Cap evidence lists so the report stays readable. */
export function capEvidence(evidence: Evidence[], max = 8): Evidence[] {
  return evidence.slice(0, max);
}

/**
 * Standard color rollup helper: red wins, then yellow, then green.
 */
export function worst(...colors: Color[]): Color {
  if (colors.includes("red")) return "red";
  if (colors.includes("yellow")) return "yellow";
  return "green";
}
