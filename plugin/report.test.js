import assert from "node:assert/strict";
import { test } from "node:test";
import scan from "./fixtures/tampa.json" with { type: "json" };
import { buildReport } from "./report.js";

test("builds the Tampa report and distinguishes the mention and citation denominators", () => {
  const report = buildReport(scan);
  assert.deepEqual(report.coverage, {
    questions: 5,
    observed: 4,
    mentions: 2,
    citationAnswers: 3,
    ownedCitationAnswers: 1,
  });
  assert.equal(report.questions[0].mentioned, true);
  assert.equal(report.questions[0].citations[0].owned, false);
  assert.equal(report.questions[2].citations[0].owned, true);
  assert.equal(report.questions[3].mentioned, false);
  assert.equal(report.questions[3].citations, null);
  assert.equal(report.questions[4].mentioned, null);
  assert.equal(report.questions[4].citations, null);
  assert.equal(report.capturedAt, null);
  assert.equal(report.mode, "fixture");
  assert.equal(report.keywords.length, 5);
  assert.equal(report.actions.length, 3);
  assert.deepEqual(report.brief.evidenceIds, ["q2"]);
});

test("classifies owned citations by domain boundary and rejects non-web links", () => {
  const input = structuredClone(scan);
  input.observations[0].citations = ["https://docs.leedly.com/a", "https://leedly.com.example.org/a"];
  assert.deepEqual(buildReport(input).questions[0].citations.map(({ owned }) => owned), [true, false]);
  input.observations[0].citations = ["javascript:alert(1)"];
  assert.throws(() => buildReport(input), /HTTP/);
});

test("validates that report evidence refers to real question IDs", () => {
  const input = structuredClone(scan);
  input.brief.evidenceIds = ["q99"];
  assert.throws(() => buildReport(input), /Unknown evidence reference/);
});
