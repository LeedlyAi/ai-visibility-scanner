import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import scan from "./fixtures/tampa.json" with { type: "json" };
import { buildReport } from "./report.js";

const files = new Map([
  ["/", ["text/html; charset=utf-8", await readFile(new URL("./preview.html", import.meta.url))]],
  ["/view.js", ["text/javascript; charset=utf-8", await readFile(new URL("./view.js", import.meta.url))]],
  ["/report.json", ["application/json; charset=utf-8", JSON.stringify(buildReport(scan))]],
]);

const server = createServer((request, response) => {
  const file = request.method === "GET" ? files.get(request.url) : null;
  if (!file) {
    response.writeHead(404).end();
    return;
  }
  response.writeHead(200, {
    "Content-Type": file[0],
    "Content-Security-Policy": "default-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'",
    "X-Content-Type-Options": "nosniff",
  }).end(file[1]);
});

server.listen(Number(process.env.PORT ?? 4173), "127.0.0.1", () => {
  console.log(`Fixture preview: http://127.0.0.1:${server.address().port}`);
});
