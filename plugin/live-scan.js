import { createHash } from "node:crypto";
import fixture from "./fixtures/tampa.json" with { type: "json" };
import { buildReport } from "./report.js";

export const pilot = Object.freeze({
  domain: fixture.domain,
  brand: fixture.brand,
  service: fixture.service,
  market: fixture.market,
  surface: fixture.surface,
  questions: Object.freeze(fixture.observations.map(({ id, question }) => Object.freeze({ id, question }))),
});

const scanKey = createHash("sha256").update(JSON.stringify(["chatgpt-tampa-pilot-v1", pilot])).digest("hex");

function fromObservations(observations, capturedAt) {
  const report = buildReport({
    ...pilot,
    observations,
    capturedAt,
    mode: "provider",
    source: "DataForSEO ChatGPT LLM Scraper, U.S. location with Tampa in the questions",
    keywordOpportunities: fixture.keywordOpportunities,
    actions: [],
    brief: fixture.brief,
  });
  const answers = report.questions.filter((question) => question.mentioned !== null);
  const citationGap = answers.find((question) =>
    question.citations?.some((citation) => !citation.owned) &&
    !question.citations.some((citation) => citation.owned));
  const mentionGap = answers.find((question) => !question.mentioned && question.competitors.length);
  const question = citationGap ?? mentionGap ?? answers[0];

  report.actions = [
    {
      title: "Address this buyer question",
      detail: "Check the current service page for a direct answer, verifiable examples, and clear scope.",
      evidenceIds: [question.id],
    },
    {
      title: citationGap ? "Review the sources this answer relied on" : "Check the pages behind the observed answers",
      detail: "Compare the available sources with the relevant Leedly page and gather the facts a buyer needs.",
      evidenceIds: [(citationGap ?? question).id],
    },
    {
      title: "Repeat the same question to check whether the result persists",
      detail: "Use the same market and wording on the next eligible scan before drawing a trend conclusion.",
      evidenceIds: [question.id],
    },
  ];
  report.brief = {
    title: question.question,
    intent: "Answer the buyer's question with a clear, verifiable explanation.",
    outline: ["Give a direct answer", "Explain what buyers should compare", "Show a concrete example"],
    proofNeeded: ["One verifiable example", "First-party evidence supporting any claims"],
    evidenceIds: [question.id],
  };
  return report;
}

export function createScanService({ store, observe, now = () => new Date() }) {
  return {
    async scan(owner) {
      const reservation = await store.reserve(owner, scanKey);
      if (reservation.state !== "reserved") return reservation;

      let report;
      try {
        const observations = await Promise.all(pilot.questions.map(async ({ id, question }) => ({
          id,
          question,
          ...await observe(question, pilot.brand, `${reservation.id}:${id}`),
        })));
        if (observations.some((observation) => observation.status === "observed")) {
          report = fromObservations(observations, now().toISOString());
        }
      } catch {
        // Leave the scan retryable even if an observation could not be normalized.
      }

      const finished = await store.finish(owner, reservation.id, report ?? null);
      if (!finished) throw new Error("Scan reservation expired.");
      if (!report) {
        return { state: "unavailable", remaining: reservation.remaining + 1, resetsAt: reservation.resetsAt };
      }
      return { ...reservation, state: "completed", report };
    },
    get: (owner, id) => store.get(owner, id),
  };
}
