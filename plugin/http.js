import { createServer } from "node:http";
import { readFileSync } from "node:fs";
import { jwtVerify, createRemoteJWKSet } from "jose";
import { z } from "zod";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { createScanService, pilot } from "./live-scan.js";
import { createProvider } from "./provider.js";
import { createStore } from "./store.js";

const identitySchema = z.uuid();
const messages = {
  reserved: "The scan is reserved.",
  completed: "Fresh scan completed.",
  cached: "Showing an existing report. No fresh scan was used.",
  pending: "This scan is already running. Check again shortly.",
  quota: "The monthly fresh-scan allowance has been used.",
  budget: "Fresh scans are temporarily paused at the provider spend limit.",
  unavailable: "The provider returned no usable answers. Your monthly allowance has been restored.",
};

export function createVerifier({ key, issuer, resource, clientId, scope }) {
  return async (header) => {
    const token = /^Bearer ([^ ]+)$/i.exec(header ?? "")?.[1];
    if (!token) return null;
    try {
      const { payload } = await jwtVerify(token, key, {
        issuer,
        audience: resource,
        algorithms: ["ES256", "RS256"],
        requiredClaims: ["sub", "exp"],
      });
      if (payload.client_id !== clientId || typeof payload.scope !== "string" ||
          !payload.scope.split(/\s+/).includes(scope)) return null;
      const parsed = identitySchema.safeParse(payload.sub);
      return parsed.success ? parsed.data : null;
    } catch {
      return null;
    }
  };
}

function createMcp(owner, scans, scope) {
  const server = new McpServer({ name: "leedly-ai-visibility", version: "0.2.0" });
  const security = { securitySchemes: [{ type: "oauth2", scopes: [scope] }] };
  const readOnly = { readOnlyHint: true, openWorldHint: false };

  server.registerTool("preview_tampa_scan", {
    description: "List the five buyer questions for the private Leedly-owned Tampa pilot before running it.",
    annotations: readOnly,
    _meta: security,
  }, () => ({
    content: [{ type: "text", text: "Review these five questions before running a fresh scan." }],
    structuredContent: pilot,
  }));

  server.registerTool("scan_tampa_visibility", {
    description: "Run the five-question Leedly Tampa pilot after the user approves it. A new result uses one monthly scan.",
    inputSchema: { confirmed: z.literal(true).describe("The user approved running the displayed scan.") },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    _meta: security,
  }, async () => {
    const result = await scans.scan(owner);
    return { content: [{ type: "text", text: messages[result.state] }], structuredContent: result };
  });

  server.registerTool("get_visibility_report", {
    description: "Read a saved report from the signed-in Leedly account.",
    inputSchema: { id: z.uuid() },
    annotations: readOnly,
    _meta: security,
  }, async ({ id }) => {
    const result = await scans.get(owner, id);
    return result
      ? { content: [{ type: "text", text: "Showing your saved report." }], structuredContent: result }
      : { isError: true, content: [{ type: "text", text: "Report unavailable for this account." }] };
  });
  return server;
}

export function createHttpHandler({ resource, issuer, scope, verify, scans, consent }) {
  const endpoint = new URL(resource);
  const metadataPath = `/.well-known/oauth-protected-resource${endpoint.pathname}`;
  const metadataUrl = new URL(metadataPath, endpoint).href;
  const metadata = {
    resource, authorization_servers: [issuer], scopes_supported: [scope], bearer_methods_supported: ["header"],
  };

  const authFiles = consent && new Map([
    ["/oauth/consent", ["text/html; charset=utf-8", readFileSync(new URL("./auth/consent.html", import.meta.url))]],
    ["/oauth/consent.js", ["text/javascript; charset=utf-8", readFileSync(new URL("./auth/consent.js", import.meta.url))]],
    ["/oauth/supabase.js", ["text/javascript; charset=utf-8", readFileSync(new URL("./node_modules/@supabase/supabase-js/dist/umd/supabase.js", import.meta.url))]],
    ["/oauth/config.json", ["application/json; charset=utf-8", JSON.stringify(consent)]],
  ]);
  return async (request, response, { path = request.url, body } = {}) => {
    try {
      const asset = request.method === "GET" && authFiles?.get(path.split("?")[0]);
      if (asset) {
        response.writeHead(200, {
          "content-type": asset[0],
          "content-security-policy": `default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; connect-src 'self' ${new URL(consent.projectUrl).origin}; frame-ancestors 'none'; base-uri 'none'; form-action 'none'`,
          "referrer-policy": "no-referrer",
          "x-content-type-options": "nosniff",
          "cache-control": "no-store",
        }).end(asset[1]);
        return;
      }
      if (path === metadataPath && request.method === "GET") {
        response.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify(metadata));
        return;
      }
      if (path !== endpoint.pathname) {
        response.writeHead(404).end();
        return;
      }
      const owner = await verify(request.headers.authorization);
      if (!owner) {
        response.writeHead(401, {
          "www-authenticate": `Bearer resource_metadata="${metadataUrl}", scope="${scope}"`,
          "cache-control": "no-store",
        }).end();
        return;
      }
      const server = createMcp(owner, scans, scope);
      const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
      response.on("close", () => { void server.close(); });
      await server.connect(transport);
      await transport.handleRequest(request, response, body);
    } catch {
      if (!response.headersSent) response.writeHead(500).end("Plugin request could not be completed.");
      else response.end();
    }
  };
}

export function createHttpServer(options) {
  return createServer(createHttpHandler(options));
}

export function verifyWithRemoteKeys(config) {
  const key = createRemoteJWKSet(new URL(config.jwksUrl));
  const { issuer, resource, clientId, scope } = config;
  return createVerifier({ key, issuer, resource, clientId, scope });
}

export function createLiveHandler(config) {
  const store = createStore({ projectUrl: config.projectUrl, secretKey: config.secretKey });
  const observe = createProvider({ login: config.providerLogin, password: config.providerPassword });
  return createHttpHandler({
    ...config,
    consent: {
      projectUrl: config.projectUrl,
      publishableKey: config.publishableKey,
      clientId: config.clientId,
      callback: config.callback,
    },
    verify: verifyWithRemoteKeys(config),
    scans: createScanService({ store, observe }),
  });
}
