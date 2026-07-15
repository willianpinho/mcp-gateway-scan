import assert from "node:assert/strict";
import { test } from "node:test";
import {
  computeVerdict,
  verdictExitCode,
  type ConnectVerdict,
} from "./connect.js";
import type { Color, DimensionResult, ScanResult, Severity } from "./types.js";

/** Build a minimal DimensionResult; one negative evidence row when red/yellow. */
function dim(
  id: string,
  color: Color,
  severity: Severity,
  withFinding = color !== "green",
): DimensionResult {
  return {
    id,
    title: `${id} title`,
    color,
    severity,
    summary: `${id} summary`,
    evidence: withFinding
      ? [
          {
            file: `${id}.ts`,
            line: 7,
            excerpt: "evidence",
            polarity: "negative",
            label: `${id}-label`,
          },
        ]
      : [],
  };
}

function result(dimensions: DimensionResult[]): ScanResult {
  const score = { green: 0, yellow: 0, red: 0 };
  for (const d of dimensions) score[d.color] += 1;
  return {
    tool: "mcp-gateway-scan",
    version: "0.2.0",
    target: "/tmp/x",
    scannedFiles: 3,
    dimensions,
    score,
  };
}

test("all green -> CONNECT, exit 0, no finding", () => {
  const v = computeVerdict(
    result([dim("D1", "green", "S1"), dim("D2", "green", "S2")]),
  );
  assert.equal(v.verdict, "CONNECT");
  assert.equal(v.topFinding, null);
  assert.deepEqual(v.blockingDimensions, []);
  assert.equal(verdictExitCode(v.verdict), 0);
});

test("a red S1 dimension -> DO-NOT-CONNECT, exit 1", () => {
  const v = computeVerdict(
    result([dim("D1", "green", "S1"), dim("D6", "red", "S1")]),
  );
  assert.equal(v.verdict, "DO-NOT-CONNECT");
  assert.deepEqual(v.blockingDimensions, ["D6"]);
  assert.equal(verdictExitCode(v.verdict), 1);
});

test("red S2 but no S1 blocker -> REVIEW", () => {
  const v = computeVerdict(
    result([dim("D1", "green", "S1"), dim("D3", "red", "S2")]),
  );
  assert.equal(v.verdict, "REVIEW");
  assert.deepEqual(v.blockingDimensions, []);
  assert.deepEqual(v.reviewDimensions, ["D3"]);
  assert.equal(verdictExitCode(v.verdict), 1);
});

test("only a yellow -> REVIEW", () => {
  const v = computeVerdict(
    result([dim("D1", "green", "S1"), dim("D4", "yellow", "S3")]),
  );
  assert.equal(v.verdict, "REVIEW");
  assert.deepEqual(v.reviewDimensions, ["D4"]);
});

test("topFinding picks the most severe red dimension (S1 over S2)", () => {
  const v: ConnectVerdict = computeVerdict(
    result([
      dim("D3", "red", "S2"),
      dim("D2", "red", "S1"),
      dim("D5", "red", "S3"),
    ]),
  );
  assert.equal(v.verdict, "DO-NOT-CONNECT");
  assert.ok(v.topFinding);
  assert.equal(v.topFinding?.dimension, "D2");
  assert.equal(v.topFinding?.severity, "S1");
});

test("topFinding ignores yellow dimensions (only red carries the danger signal)", () => {
  const v = computeVerdict(
    result([dim("D1", "green", "S1"), dim("D4", "yellow", "S2")]),
  );
  assert.equal(v.topFinding, null);
});
