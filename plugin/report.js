function domainName(value) {
  return value.toLowerCase().replace(/^www\./, "").replace(/\.$/, "");
}

function citationFor(url, targetDomain) {
  const source = new URL(url);
  if (!["https:", "http:"].includes(source.protocol) || source.username || source.password) {
    throw new Error("Citations must be HTTP(S) URLs without credentials.");
  }
  const host = domainName(source.hostname);
  return { url: source.href, owned: host === targetDomain || host.endsWith(`.${targetDomain}`) };
}

export function buildReport(scan) {
  const domain = domainName(scan.domain);
  const brand = scan.brand.trim().toLowerCase();
  const questions = scan.observations.map((observation) => {
    const observed = observation.status === "observed";
    const citationsAvailable = observed && observation.citationStatus === "available";
    const brands = observed ? observation.mentions.map((name) => name.trim()) : [];
    return {
      id: observation.id,
      question: observation.question,
      status: observation.status,
      reason: observation.reason ?? null,
      mentioned: observed ? brands.some((name) => name.toLowerCase() === brand) : null,
      competitors: [...new Set(brands.filter((name) => name.toLowerCase() !== brand))],
      citations: citationsAvailable ? observation.citations.map((url) => citationFor(url, domain)) : null,
    };
  });
  const answers = questions.filter((question) => question.mentioned !== null);
  const citationAnswers = answers.filter((question) => question.citations !== null);
  const questionIds = new Set(questions.map((question) => question.id));
  if (questionIds.size !== questions.length) throw new Error("Duplicate question ID.");
  const evidenceIds = [
    ...scan.keywordOpportunities.map((item) => item.evidenceId),
    ...scan.actions.flatMap((item) => item.evidenceIds),
    ...scan.brief.evidenceIds,
  ];
  if (evidenceIds.some((id) => !questionIds.has(id))) throw new Error("Unknown evidence reference.");

  return {
    mode: scan.mode,
    domain,
    brand: scan.brand,
    service: scan.service,
    market: scan.market,
    surface: scan.surface,
    source: scan.source,
    capturedAt: scan.capturedAt,
    coverage: {
      questions: questions.length,
      observed: answers.length,
      mentions: answers.filter((question) => question.mentioned).length,
      citationAnswers: citationAnswers.length,
      ownedCitationAnswers: citationAnswers.filter((question) => question.citations.some((citation) => citation.owned)).length,
    },
    questions,
    keywords: scan.keywordOpportunities,
    actions: scan.actions,
    brief: scan.brief,
  };
}
