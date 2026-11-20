import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import scan from "./fixtures/tampa.json" with { type: "json" };
import { buildReport } from "./report.js";

const server = new McpServer({ name: "leedly-ai-visibility-preview", version: "0.1.0" });
server.registerTool("get_tampa_sample_report", {
  title: "Get the Tampa sample visibility report",
  description: "Returns an illustrative report for leedly.com in Tampa. Uses synthetic evidence and is intended for reviewing the report format.",
  inputSchema: {},
  annotations: { readOnlyHint: true, openWorldHint: false },
}, () => {
  const report = buildReport(scan);
  return {
    content: [{ type: "text", text: "Illustrative report using synthetic observations. No current visibility was measured." }],
    structuredContent: report,
  };
});

await server.connect(new StdioServerTransport());
