import assert from "node:assert/strict";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

test("reads the sample through a real local MCP session", async () => {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("./server.js", import.meta.url))],
    stderr: "pipe",
  });
  const client = new Client({ name: "leedly-preview-test", version: "1.0.0" });
  try {
    await client.connect(transport);
    const { tools } = await client.listTools();
    assert.equal(tools.length, 1);
    assert.equal(tools[0].annotations.readOnlyHint, true);
    const result = await client.callTool({ name: tools[0].name, arguments: {} });
    assert.equal(result.structuredContent.mode, "fixture");
    assert.equal(result.structuredContent.questions.length, 5);
    assert.equal(result.structuredContent.questions[4].mentioned, null);
    assert.equal(result.structuredContent.brief.evidenceIds[0], "q2");
  } finally {
    await client.close();
  }
});
