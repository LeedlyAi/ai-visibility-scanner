import { createLiveHandler } from "../http.js";
import { readConfig } from "../config.js";

const paths = new Map([
  ["mcp", "/mcp"],
  ["metadata", "/.well-known/oauth-protected-resource/mcp"],
  ["consent", "/oauth/consent"],
  ["consent-js", "/oauth/consent.js"],
  ["supabase-js", "/oauth/supabase.js"],
  ["consent-config", "/oauth/config.json"],
]);

let handler;
export default async function pilot(request, response) {
  const path = paths.get(request.query?.surface);
  if (!path) {
    response.writeHead(404).end();
    return;
  }

  try {
    handler ??= createLiveHandler(readConfig(process.env));
  } catch {
    response.writeHead(503, { "cache-control": "no-store" }).end("Pilot configuration is incomplete.");
    return;
  }

  // Vercel may parse incoming JSON before the MCP transport sees the request.
  const body = request.method === "POST" ? request.body : undefined;
  return handler(request, response, { path, body });
}
