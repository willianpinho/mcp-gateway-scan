import { classifyLines } from "./match-context.js";
import type { Evidence, ScanContext, ScanFile } from "./types.js";

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

export interface AntiPatternOptions {
  /** Skip prose (.md/.txt) files entirely. */
  codeOnly?: boolean;
  /**
   * Only fire when the matched line is inside prompt context (a prompt template
   * literal or a YAML prompt field). Use for "authorization-in-prompt".
   */
  requirePrompt?: boolean;
}

/**
 * Find anti-pattern matches with false-positive suppression. ALWAYS excludes
 * comment-only lines and "meta" lines that merely document the pattern (grep
 * recipes, regex alternations, "pattern"/"example" prose). With `requirePrompt`,
 * additionally requires the line to be inside prompt content — so a doc comment
 * quoting `rg 'only use|if the user is admin'` is never flagged, but the same
 * words inside a system-prompt string ARE.
 *
 * The bar: every row this returns must be defensible to a skeptical engineer.
 */
export function findAntiPattern(
  ctx: ScanContext,
  pattern: RegExp,
  meta: { label: string },
  opts: AntiPatternOptions = {},
): Evidence[] {
  const results: Evidence[] = [];
  for (const file of ctx.files) {
    if (opts.codeOnly && isProse(file)) continue;
    const classes = classifyLines(file);
    for (let i = 0; i < file.lines.length; i++) {
      const line = file.lines[i];
      const cls = classes[i];
      if (line === undefined || cls === undefined) continue;
      if (cls.comment || cls.meta) continue; // never flag comments/docs
      if (opts.requirePrompt && !cls.inPrompt) continue;
      if (pattern.test(line)) {
        results.push({
          file: file.relPath,
          line: i + 1,
          excerpt: trimExcerpt(line),
          polarity: "negative",
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
