export function createStore({ projectUrl, secretKey, fetcher = fetch }) {
  async function request(path, options = {}) {
    const response = await fetcher(new URL(`/rest/v1/${path}`, projectUrl), {
      ...options,
      headers: { apikey: secretKey, "content-type": "application/json" },
      redirect: "error",
      signal: AbortSignal.timeout(12_000),
    });
    if (!response.ok) throw new Error("Plugin database request failed.");
    return response.json();
  }

  return {
    reserve: (owner, key) => request("rpc/plugin_reserve_scan", {
      method: "POST", body: JSON.stringify({ p_owner: owner, p_key: key }),
    }),
    finish: (owner, id, report) => request("rpc/plugin_finish_scan", {
      method: "POST", body: JSON.stringify({ p_owner: owner, p_id: id, p_report: report }),
    }),
    async get(owner, id) {
      const params = new URLSearchParams({
        select: "id,report,finished_at",
        owner_id: `eq.${owner}`,
        id: `eq.${id}`,
        status: "eq.completed",
      });
      const rows = await request(`plugin_scans?${params}`);
      return rows[0] ?? null;
    },
  };
}
