const endpoint = "https://api.dataforseo.com/v3/ai_optimization/chat_gpt/llm_scraper/live/advanced";

export const unavailable = (reason) => ({
  status: "unavailable", reason, mentions: [], citationStatus: "unavailable", citations: [],
});

function safeSource(candidate) {
  try {
    const url = new URL(candidate);
    if (["https:", "http:"].includes(url.protocol) && !url.username && !url.password) return url.href;
  } catch {
    return null;
  }
  return null;
}

export function parseAnswer(payload, brand) {
  const task = payload?.tasks?.[0];
  const result = task?.result?.[0];
  if (payload?.status_code !== 20000 || task?.status_code !== 20000 ||
      typeof result?.markdown !== "string" || !result.markdown.trim()) {
    return unavailable("The provider did not return a usable answer.");
  }

  const names = new Map();
  for (const entity of result.brand_entities ?? []) {
    const name = typeof entity?.title === "string" ? entity.title.trim() : "";
    if (name) names.set(name.toLowerCase(), name);
  }
  const escapedBrand = brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const brandPattern = new RegExp(`(?<![\\p{L}\\p{N}])${escapedBrand}(?![\\p{L}\\p{N}])`, "iu");
  const answerText = result.markdown.replace(/\]\([^\n)]*\)/g, "]").replace(/https?:\/\/[^\s<>]+/g, "");
  if (brandPattern.test(answerText)) names.set(brand.toLowerCase(), brand);

  const sourceUrls = Array.isArray(result.sources) ? result.sources.map((source) => safeSource(source?.url)) : null;
  const citations = sourceUrls?.filter(Boolean);
  return {
    status: "observed",
    mentions: [...names.values()],
    citationStatus: citations && citations.length === sourceUrls.length ? "available" : "unavailable",
    citations: [...new Set(citations ?? [])],
  };
}

export function createProvider({ login, password, fetcher = fetch }) {
  const authorization = `Basic ${Buffer.from(`${login}:${password}`).toString("base64")}`;
  return async (question, brand, tag) => {
    try {
      const response = await fetcher(endpoint, {
        method: "POST",
        headers: { authorization, "content-type": "application/json" },
        redirect: "error",
        signal: AbortSignal.timeout(125_000),
        body: JSON.stringify([{
          keyword: question.replaceAll("%", "%25").replaceAll("+", "%2B"),
          location_code: 2840,
          language_code: "en",
          force_web_search: true,
          tag,
        }]),
      });
      if (!response.ok) return unavailable("The provider request failed.");
      return parseAnswer(await response.json(), brand);
    } catch {
      return unavailable("The provider request could not be completed.");
    }
  };
}
