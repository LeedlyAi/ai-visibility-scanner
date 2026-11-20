const byId = (id) => document.getElementById(id);
function add(parent, tag, text) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  parent.append(element);
  return element;
}

function addEvidence(parent, ids, questions) {
  const line = add(parent, "p", "Related questions ");
  line.className = "source";
  for (const [index, id] of ids.entries()) {
    if (index) line.append(", ");
    const link = add(line, "a", String(questions.findIndex((question) => question.id === id) + 1));
    link.href = `#${id}`;
    link.addEventListener("click", () => { byId(id).open = true; });
  }
}

function render(report) {
  const { coverage, questions } = report;
  byId("scope").textContent = [report.domain, report.service, report.market].join(" · ");
  byId("status").textContent = "Illustrative preview. These sample results do not measure current AI visibility.";
  for (const [value, label] of [
    [`${coverage.observed}/${coverage.questions}`, "Questions answered"],
    [`${coverage.mentions}/${coverage.observed}`, "Answers mentioning the brand"],
    [`${coverage.ownedCitationAnswers}/${coverage.citationAnswers}`, "Answers linking to the domain"],
  ]) {
    const metric = add(byId("metrics"), "div");
    metric.className = "metric";
    add(metric, "strong", value);
    add(metric, "span", label);
  }
  byId("source").textContent = `${report.surface} scenario · ${report.source} · No live capture date`;

  for (const [index, question] of questions.entries()) {
    const item = add(byId("questions"), "details");
    item.id = question.id;
    item.open = index === 0;
    add(item, "summary", `${index + 1}. ${question.question}`);
    if (question.mentioned === null) {
      add(item, "p", `Answer unavailable. ${question.reason ?? ""}`.trim());
      continue;
    }
    add(item, "p", question.mentioned ? `${report.brand} was mentioned.` : `${report.brand} was absent from this answer.`);
    if (question.competitors.length) add(item, "p", `Other businesses mentioned: ${question.competitors.join(", ")}`);
    if (!question.citations?.length) {
      add(item, "p", question.citations === null ? "Citation data unavailable." : "This answer had no citations.");
      continue;
    }
    const list = add(item, "ul");
    for (const citation of question.citations) {
      const link = add(add(list, "li"), "a", citation.url);
      link.href = citation.url;
    }
  }

  for (const item of report.keywords) {
    const li = add(byId("keywords"), "li", item.keyword);
    addEvidence(li, [item.evidenceId], questions);
  }
  for (const action of report.actions) {
    const li = add(byId("actions"), "li");
    add(li, "strong", action.title);
    add(li, "p", action.detail);
    addEvidence(li, action.evidenceIds, questions);
  }
  const brief = byId("brief");
  add(brief, "h3", report.brief.title);
  add(brief, "p", report.brief.intent);
  for (const [title, entries] of [["Outline", report.brief.outline], ["Proof to gather", report.brief.proofNeeded]]) {
    add(brief, "h3", title);
    const list = add(brief, "ul");
    for (const entry of entries) add(list, "li", entry);
  }
  addEvidence(brief, report.brief.evidenceIds, questions);
  byId("report").hidden = false;
}

try {
  const response = await fetch("/report.json");
  if (!response.ok) throw new Error("Report request failed.");
  render(await response.json());
} catch {
  byId("status").textContent = "The sample report could not be loaded. Please refresh to try again.";
}
