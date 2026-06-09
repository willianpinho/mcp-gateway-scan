import { isCommentLine } from "./match.js";
import type { ScanFile } from "./types.js";

/**
 * Per-line context classification, computed once per file. Lets anti-pattern
 * matchers fire only on *defensible* lines (e.g. actual prompt content) and
 * never on comments or lines that merely *document* a pattern (grep recipes,
 * regex alternations, "pattern"/"example" prose).
 */
export interface LineContext {
  /** True if the line is a comment-only line. */
  comment: boolean;
  /**
   * True if the line is "meta": it describes/documents a rule rather than being
   * the rule. E.g. contains `rg `, `grep`, a backticked regex alternation, or
   * words like "pattern"/"regex"/"example"/"audit". Used to suppress matches
   * that quote the very thing we look for.
   */
  meta: boolean;
  /**
   * True if the line is inside a prompt: a JS/TS multiline template literal
   * assigned to a prompt-named binding, or a YAML prompt block scalar.
   */
  inPrompt: boolean;
}

// Variable/field names that signal "this string is a prompt handed to a model".
// No leading \b: identifiers like VULNERABLE_SYSTEM_PROMPT have the keyword as a
// suffix after an underscore (no word boundary), so we match the token anywhere.
const PROMPT_NAME =
  /(system[_-]?prompt|systemmessage|system_message|prompt(?:template)?|instruction|persona|preamble)/i;

// YAML keys whose block scalar is prompt content.
const PROMPT_YAML_KEY =
  /^\s*(system_?prompt|systemMessage|prompt|instructions?|persona|preamble)\s*:\s*[|>]/i;

// "Meta" markers: the line is talking ABOUT a pattern, not being one.
const META_MARKER =
  /(\brg\s|\bgrep\b|\bripgrep\b|\bpattern\b|\bregex\b|\bexample\b|\bfound by\b|\baudit grep\b|\|\s*if the user|`[^`]*\|[^`]*`)/i;

function isPromptAssignmentStart(line: string): boolean {
  // const SYSTEM_PROMPT = ` ...   OR   prompt: " ...  with an opening template/quote
  if (!PROMPT_NAME.test(line)) return false;
  return /=\s*[`'"]/.test(line) || /:\s*[`'"]/.test(line);
}

function countBackticks(line: string): number {
  let n = 0;
  for (const ch of line) if (ch === "`") n++;
  return n;
}

function indentOf(line: string): number {
  const m = line.match(/^(\s*)/);
  return m && m[1] !== undefined ? m[1].length : 0;
}

/**
 * Classify every line of a file. Tracks two prompt-context state machines:
 *  - JS/TS template literals (backtick-delimited) opened on a prompt-named line
 *  - YAML block scalars under a prompt key (indentation-based)
 */
export function classifyLines(file: ScanFile): LineContext[] {
  const out: LineContext[] = [];
  let inTemplate = false; // inside a prompt-named backtick template literal
  let yamlPromptIndent = -1; // base indent of an open YAML prompt block (-1 = none)

  for (let i = 0; i < file.lines.length; i++) {
    const line = file.lines[i] ?? "";
    const comment = isCommentLine(line);
    const meta = META_MARKER.test(line);

    // --- YAML prompt block scalar tracking ---
    if (yamlPromptIndent >= 0) {
      const trimmed = line.trim();
      if (trimmed.length > 0 && indentOf(line) <= yamlPromptIndent) {
        yamlPromptIndent = -1; // dedented out of the block
      }
    }
    const yamlOpens = PROMPT_YAML_KEY.test(line);
    const inYamlPrompt = yamlPromptIndent >= 0 || yamlOpens;

    // --- JS/TS template literal tracking ---
    const ticks = countBackticks(line);
    let inJsPrompt = false;
    if (inTemplate) {
      inJsPrompt = true; // this line is body of an open prompt template
      if (ticks % 2 === 1) inTemplate = false; // closing backtick on this line
    } else if (isPromptAssignmentStart(line) && line.includes("`")) {
      // Opened a prompt template on this line; the assignment line itself is
      // not prompt body, but subsequent lines are.
      if (ticks % 2 === 1) inTemplate = true; // stays open past this line
    }

    out.push({
      comment,
      meta,
      inPrompt: inJsPrompt || inYamlPrompt,
    });

    // Open the YAML block AFTER classifying the key line itself.
    if (yamlOpens) yamlPromptIndent = indentOf(line);
  }
  return out;
}
