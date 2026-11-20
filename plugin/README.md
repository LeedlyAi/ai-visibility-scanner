# Leedly AI Visibility Scan preview

This package demonstrates the first report for leedly.com in Tampa. It uses synthetic answers and competitor names, so the preview does not represent current AI visibility.

With Node 22 or later:

```sh
cd plugin
npm ci
npm test
npm run demo
npm start
```

Open http://127.0.0.1:4173 to review the interactive report. The preview requires no credentials or paid API calls. The existing web scanner has its own entry point.

`buildReport()` accepts normalized observations and returns report data. An unanswered question has an unknown mention status. An answered question may also have unavailable citation data. Mention rates and owned citation rates use separate denominators.

Run `npm run mcp` to start the local stdio MCP server. Its single read-only tool, `get_tampa_sample_report`, returns the same report as structured content. This local tool is for development and verification.

The next integration adds a provider adapter behind the dedicated plugin service, account sign-in and report ownership, quotas, and spend reservation before provider calls.

## Private live pilot

The HTTP server exposes three OAuth-protected tools for the Leedly Tampa pilot. It previews five questions, runs a confirmed scan, and retrieves a saved report for the verified account. Live answers use the [DataForSEO ChatGPT scraper](https://docs.dataforseo.com/v3/ai_optimization-chat_gpt-llm_scraper-live-advanced/). Suggested buyer keywords come from the fixed pilot questions. They carry no measured search volume.

Apply the migrations in order to a dedicated Supabase project. Never use the existing lead scanner or LIA database. The reservation charges the local budget for all five possible calls, including failed or abandoned requests. A fully unavailable scan returns the user's scan allowance. Cache and quota windows reset on UTC boundaries where a calendar boundary applies. Reconcile provider charges separately and use a provider-side budget backstop for production.

Use a private deployment with a stable HTTPS MCP URL and a request limit long enough for five parallel provider calls, each allowing up to 125 seconds. Configure an OAuth client for ChatGPT's exact callback. In Supabase Auth, set the Site URL to the private HTTPS deployment and configure the authorization path as `/oauth/consent`, add the registered client ID and MCP resource to the singleton `plugin_oauth_client` row, then enable `public.plugin_access_token_hook`. The hook binds the registered client's token to this MCP audience. Verify Supabase token issuance before testing the ChatGPT install. The pilot consent page uses password sign-in for pre-created test accounts. Configure private pilot access in Supabase Auth before sharing the endpoint.

Configure these environment variables in the private deployment:

| Variable | Value |
| --- | --- |
| `LEEDLY_MCP_RESOURCE` | Full HTTPS MCP URL ending in `/mcp` |
| `LEEDLY_OAUTH_ISSUER` | Exact OAuth issuer |
| `LEEDLY_OAUTH_JWKS_URL` | OAuth signing key discovery URL |
| `LEEDLY_OAUTH_CLIENT_ID` | Registered ChatGPT OAuth client ID |
| `LEEDLY_OAUTH_SCOPE` | `openid` for this pilot |
| `LEEDLY_OAUTH_CALLBACK` | Exact ChatGPT callback URI |
| `PLUGIN_SUPABASE_PUBLISHABLE_KEY` | Dedicated project’s public browser key |
| `PLUGIN_SUPABASE_URL` | Dedicated plugin project URL |
| `PLUGIN_SUPABASE_SECRET_KEY` | Dedicated plugin project's server-side secret key |
| `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD` | DataForSEO credentials from the approved secret store |
| `PORT` | Runtime listen port, default 4174 |

Run `npm run start:live`. Confirm one account can run a fresh scan and reopen it at 19 remaining. Verify a second account receives no report for that ID. Confirm the provider result and cost in DataForSEO before increasing coverage.

### Vercel pilot host

The dedicated Vercel project uses the `plugin/` directory as its deployment root. `vercel.json` routes MCP and consent requests to the Node function, with the same OAuth checks as the standalone server. Newly created deployments return 503 on pilot routes until the required environment variables are present.

Set `DATAFORSEO_LOGIN`, `DATAFORSEO_PASSWORD`, and `PLUGIN_SUPABASE_SECRET_KEY` as Sensitive variables on that project. Use the API credentials from DataForSEO API Access and a server-side key from the dedicated plugin Supabase project. Keep the provider and Supabase secrets out of client assets, source control, and chat.
