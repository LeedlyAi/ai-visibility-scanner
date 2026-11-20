import { z } from "zod";

const https = z.url({ protocol: /^https$/ });
const schema = z.object({
  LEEDLY_MCP_RESOURCE: https.refine((url) => new URL(url).pathname === "/mcp"),
  LEEDLY_OAUTH_ISSUER: https,
  LEEDLY_OAUTH_JWKS_URL: https,
  LEEDLY_OAUTH_CLIENT_ID: z.string().min(1),
  LEEDLY_OAUTH_SCOPE: z.literal("openid"),
  LEEDLY_OAUTH_CALLBACK: https.refine((url) => new URL(url).origin === "https://chatgpt.com"),
  PLUGIN_SUPABASE_URL: https,
  PLUGIN_SUPABASE_PUBLISHABLE_KEY: z.string().startsWith("sb_publishable_"),
  PLUGIN_SUPABASE_SECRET_KEY: z.string().startsWith("sb_secret_"),
  DATAFORSEO_LOGIN: z.string().min(1),
  DATAFORSEO_PASSWORD: z.string().min(1),
  PORT: z.coerce.number().int().min(1).max(65535).default(4174),
});

export function readConfig(env) {
  const parsed = schema.safeParse(env);
  if (!parsed.success) {
    throw new Error("Missing or invalid plugin configuration: " +
      parsed.error.issues.map((issue) => issue.path.join(".")).join(", "));
  }

  const config = parsed.data;
  return {
    resource: config.LEEDLY_MCP_RESOURCE,
    issuer: config.LEEDLY_OAUTH_ISSUER,
    jwksUrl: config.LEEDLY_OAUTH_JWKS_URL,
    clientId: config.LEEDLY_OAUTH_CLIENT_ID,
    scope: config.LEEDLY_OAUTH_SCOPE,
    callback: config.LEEDLY_OAUTH_CALLBACK,
    projectUrl: config.PLUGIN_SUPABASE_URL,
    secretKey: config.PLUGIN_SUPABASE_SECRET_KEY,
    publishableKey: config.PLUGIN_SUPABASE_PUBLISHABLE_KEY,
    providerLogin: config.DATAFORSEO_LOGIN,
    providerPassword: config.DATAFORSEO_PASSWORD,
    port: config.PORT,
  };
}
