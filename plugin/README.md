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
