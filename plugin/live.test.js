import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { generateKeyPair, SignJWT } from "jose";
import { createHttpServer, createVerifier } from "./http.js";
import { createScanService } from "./live-scan.js";
import { parseAnswer, unavailable } from "./provider.js";

const owner = "2be5a53c-cf4a-4617-a9f8-62a36bc568e2";
const other = "4a653884-4ed8-4f59-997b-b40eb1c4541e";
const issuer = "https://auth.example.com";
const resource = "https://plugin.example.com/mcp";
const clientId = "test-client";
const scope = "openid";

const providerAnswer = {
  status_code: 20000,
  tasks: [{
    status_code: 20000,
    result: [{
      markdown: "Leedly and Example Agency offer audits.",
      brand_entities: [{ title: "Example Agency" }],
      sources: [{ url: "https://example.org/ai-audits" }],
      search_results: [{ url: "https://leedly.com/unused" }],
    }],
  }],
};

test("provider evidence separates final sources from retrieved links", () => {
  const observation = parseAnswer(providerAnswer, "Leedly");
  assert.deepEqual(observation.mentions, ["Example Agency", "Leedly"]);
  assert.deepEqual(observation.citations, ["https://example.org/ai-audits"]);
  const result = structuredClone(providerAnswer);
  result.tasks[0].result[0].markdown = "A [reference](https://leedly.com) and unleedly.";
  result.tasks[0].result[0].sources = null;
  assert.equal(parseAnswer(result, "Leedly").mentions.includes("Leedly"), false);
  assert.equal(parseAnswer(result, "Leedly").citationStatus, "unavailable");
  assert.equal(parseAnswer({ status_code: 40000 }, "Leedly").status, "unavailable");
});

test("the scan checks quota first, completes partial evidence, and avoids paid duplicate calls", async () => {
  let state = "reserved";
  let paid = 0;
  let saved;
  const store = {
    reserve: async () => ({ state, id: owner, remaining: 19, ...(saved && { report: saved }) }),
    finish: async (_owner, _id, report) => {
      saved = report;
      state = report ? "cached" : "reserved";
      return true;
    },
  };
  const scan = createScanService({
    store,
    observe: async () => {
      paid++;
      return paid === 1 ? parseAnswer(providerAnswer, "Leedly") : unavailable("Provider timeout");
    },
  });
  const first = await scan.scan(owner);
  assert.equal(first.state, "completed");
  assert.equal(first.remaining, 19);
  assert.equal(first.report.coverage.observed, 1);
  assert.equal(first.report.brief.evidenceIds[0], "q1");
  assert.equal((await scan.scan(owner)).state, "cached");
  state = "budget";
  assert.equal((await scan.scan(owner)).state, "budget");
  assert.equal(paid, 5);
  state = "reserved";
  const failed = await scan.scan(owner);
  assert.equal(failed.state, "unavailable");
  assert.equal(failed.remaining, 20);
});

test("database enforces reservations, ownership, repeat scans, quotas and global spend", async () => {
  const db = new PGlite();
  try {
    await db.exec(`
      create role anon;
      create role authenticated;
      create role service_role bypassrls;
      create role supabase_auth_admin;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as
      'select current_setting(''request.jwt.claim.sub'', true)::uuid';
      grant usage on schema auth to authenticated;
    `);
    await db.exec(await readFile(new URL("./supabase/migrations/202611200001_plugin_scans.sql", import.meta.url), "utf8"));
    await db.exec(await readFile(new URL("./supabase/migrations/202611200002_plugin_oauth_hook.sql", import.meta.url), "utf8"));
    await db.query("insert into plugin_oauth_client (client_id, resource) values ($1, $2)", [clientId, resource]);
    await db.exec("set role supabase_auth_admin");
    const claim = async (id) => (await db.query("select plugin_access_token_hook($1) as token", [
      { claims: { aud: "authenticated", client_id: id } },
    ])).rows[0].token.claims;
    assert.deepEqual(await claim(clientId), { aud: resource, client_id: clientId, scope });
    assert.equal((await claim("another-client")).aud, "authenticated");
    await db.exec("reset role");
    await db.query("insert into auth.users values ($1), ($2)", [owner, other]);
    await db.exec("set role service_role");
    const reserve = async (account, key) =>
      (await db.query("select plugin_reserve_scan($1, $2) as result", [account, key])).rows[0].result;
    const finish = async (account, id, report) =>
      (await db.query("select plugin_finish_scan($1, $2, $3) as result", [account, id, report])).rows[0].result;

    const [first, second] = await Promise.all([reserve(owner, "tampa"), reserve(owner, "tampa")]);
    assert.equal(first.state, "reserved");
    assert.equal(first.remaining, 19);
    assert.equal(second.state, "pending");
    assert.equal(second.id, first.id);
    assert.equal(await finish(other, first.id, { test: true }), false);
    assert.equal(await finish(owner, first.id, { test: true }), true);
    const cached = await reserve(owner, "tampa");
    assert.equal(cached.state, "cached");
    assert.equal(cached.remaining, 19);
    assert.equal((await reserve(other, "tampa")).state, "reserved");

    await db.exec("reset role; set role authenticated");
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [other]);
    assert.equal((await db.query("select id from plugin_scans where id = $1", [first.id])).rows.length, 0);
    await assert.rejects(reserve(other, "bypass"), /permission denied/);
    await db.exec("reset role; set role service_role");
    const next = await reserve(other, "try-again");
    assert.equal(await finish(other, next.id, null), true);
    assert.equal((await reserve(other, "try-again")).remaining, 18);

    await db.exec("reset role");
    await db.query(`insert into plugin_scans (owner_id, scan_key, status, report)
      select $1, 'quota-' || n, 'completed', '{}'::jsonb from generate_series(1,19) n`, [owner]);
    assert.equal((await reserve(owner, "too-many")).state, "quota");
    assert.equal((await reserve(owner, "tampa")).state, "cached");
    await db.exec("insert into plugin_spend_reservations values (gen_random_uuid(), now(), 2000000)");
    const daily = await reserve(other, "beyond-daily-budget");
    assert.equal(daily.state, "budget");
    await db.exec("insert into plugin_spend_reservations values (gen_random_uuid(), now(), 50000000)");
    const monthly = await reserve(other, "beyond-monthly-budget");
    assert.equal(monthly.state, "budget");
    assert.equal(monthly.retryAt, monthly.resetsAt);
  } finally {
    await db.close();
  }
});

test("HTTP MCP verifies identity and challenges invalid resource tokens", async () => {
  const { privateKey, publicKey } = await generateKeyPair("ES256");
  const token = (audience, client = clientId, claimedScope = scope) => new SignJWT({ client_id: client, scope: claimedScope })
    .setProtectedHeader({ alg: "ES256" }).setSubject(owner).setIssuer(issuer)
    .setAudience(audience).setExpirationTime("10m").sign(privateKey);
  const valid = await token(resource);
  const wrong = await token("https://other.example.com/mcp");
  const wrongClient = await token(resource, "wrong-client");
  const wrongScope = await token(resource, clientId, "profile");
  const verify = createVerifier({ key: publicKey, issuer, resource, clientId, scope });
  const server = createHttpServer({
    resource, issuer, scope, verify,
    scans: { get: async (account, id) => account === owner && id === owner ? { id, report: {} } : null },
  });
  try {
    await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
    const url = `http://127.0.0.1:${server.address().port}`;
    const request = (authorization, method, params) => fetch(`${url}/mcp`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${authorization}`,
        accept: "application/json, text/event-stream",
        "content-type": "application/json",
      },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    });
    const metadata = await (await fetch(`${url}/.well-known/oauth-protected-resource/mcp`)).json();
    assert.equal(metadata.resource, resource);
    for (const invalid of [wrong, wrongClient, wrongScope]) {
      const challenged = await request(invalid, "tools/list");
      assert.equal(challenged.status, 401);
      assert.match(challenged.headers.get("www-authenticate"), /resource_metadata=/);
    }
    const result = await (await request(valid, "tools/list")).json();
    assert.equal(result.result.tools.length, 3);
    const allowed = await (await request(valid, "tools/call", {
      name: "get_visibility_report", arguments: { id: owner },
    })).json();
    assert.equal(allowed.result.structuredContent.id, owner);
    const denied = await (await request(valid, "tools/call", {
      name: "get_visibility_report", arguments: { id: other },
    })).json();
    assert.equal(denied.result.isError, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
