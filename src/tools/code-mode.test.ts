import { McpServer } from "@bio-mcp/shared/mcp";
import { createApiProxyTool } from "@bio-mcp/shared/tools/api-proxy";
import { afterEach, expect, it, vi } from "vitest";
import { createTreasuryApiFetch } from "../lib/api-adapter";
import { treasuryCatalog } from "../spec/catalog";
import { registerCodeMode } from "./code-mode";
import { registerGetSchema } from "./get-schema";
import { registerQueryData } from "./query-data";

afterEach(() => vi.unstubAllGlobals());

it("registers eight aliases with both fields on success and errors", async () => {
  const server = new McpServer({ name: "fixture", version: "1" });
  // SAFETY: invalid execution never invokes the fixture loader.
  registerCodeMode(server, { CODE_MODE_LOADER: { get: () => ({}) } } as unknown as Parameters<typeof registerCodeMode>[1]);
  registerQueryData(server, {}); registerGetSchema(server, {});
  // SAFETY: inspect the SDK registry to exercise actual callbacks.
  const tools = (server as unknown as { _registeredTools: Record<string, { handler: (args: unknown, extra: unknown) => Promise<unknown> }> })._registeredTools;
  expect(Object.keys(tools)).toHaveLength(8);
  for (const prefix of ["", "mcp_"]) {
    expect(await tools[prefix + "treasury_search"].handler({ query: "observations", max_results: 2 }, {})).toMatchObject({ content: expect.any(Array), structuredContent: { success: true } });
    for (const [name, args] of [["treasury_execute", { code: "" }], ["treasury_query_data", { data_access_id: "fixture", sql: "SELECT 1" }], ["treasury_get_schema", { data_access_id: "fixture" }]] as const) {
      expect(await tools[prefix + name].handler(args, {})).toMatchObject({ content: expect.any(Array), structuredContent: expect.any(Object), isError: true });
    }
  }
});

it("stages full observation metadata, exact strings and native pagination", async () => {
  const native = { data: [{ record_date: "2026-09-25", amount: "40097178119750.91", note: "α".repeat(20000) }],
    meta: { dataTypes: { record_date: "DATE", amount: "CURRENCY", note: "STRING" }, labels: {}, dataFormats: {}, "total-count": 99 }, links: { next: "page2" } };
  vi.stubGlobal("fetch", async () => Response.json(native));
  const stored: unknown[] = [];
  const namespace = { idFromName: (name: string) => name, get: () => ({ fetch: async (request: Request) => {
    if (new URL(request.url).pathname === "/process") {
      // SAFETY: shared staging sends a data envelope to this route.
      const payload = await request.json() as { data: unknown }; stored.push(payload.data);
      return Response.json({ success: true, tables_created: ["observations"], total_rows: 1 });
    }
    return Response.json({ success: true, schema: { tables: { observations: { columns: [{ name: "record_date" }] } } } });
  } }) };
  const proxy = createApiProxyTool({ apiFetch: createTreasuryApiFetch(), catalog: treasuryCatalog, doNamespace: namespace, stagingPrefix: "treasury", maxInlineBytes: 30 * 1024 });
  const result = await proxy.handler({ method: "GET", path: "/observations", params: {
    endpoint: "/v2/accounting/od/debt_to_penny", date_field: "record_date", start_date: "2026-09-01", end_date: "2026-09-29",
  } }, { sql: () => [] });
  expect(result).toMatchObject({ __staged: true, data_access_id: expect.any(String), _staging: expect.any(Object) });
  expect(stored.map(value => typeof value === "string" ? JSON.parse(value) : value)).toEqual(expect.arrayContaining([expect.objectContaining({ ...native, _observation: expect.objectContaining({ historical_vintage: null }) })]));
  expect(new TextEncoder().encode(JSON.stringify(result)).byteLength).toBeLessThan(100000);
});
