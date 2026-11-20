import scan from "./fixtures/tampa.json" with { type: "json" };
import { buildReport } from "./report.js";

console.log(JSON.stringify(buildReport(scan), null, 2));
