import { McpServer } from "@bio-mcp/shared/mcp";
import { createApiProxyTool } from "@bio-mcp/shared/tools/api-proxy";
import { afterEach, expect, it, vi } from "vitest";
import { treasuryCatalog } from "../spec/catalog";
import { registerCodeMode } from "../tools/code-mode";
import { createTreasuryApiFetch } from "./api-adapter";
import { RELEASE_CALENDAR_URL } from "./release-calendar";

// Synthetic rows following the website source contract, not observed live data.
const rows = [
  { datasetId: "fixture-A", date: "2026-10-01", time: "16:00", released: "false", extra: { note: "retained" } },
  { datasetId: "fixture-A", date: "2026-09-30", time: "16:00", released: "true" },
  { datasetId: "fixture-B", date: null, time: null, released: null },
];
const request = { method: "GET", path: "/release-calendar" };
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

it("reads the fixed calendar service separately from a Fiscal Data proxy and preserves native semantics", async () => {
  const fetcher = vi.fn().mockImplementation(async () => Response.json(rows, { headers: { etag: '"fixture"', "last-modified": "Wed, 30 Sep 2026 20:00:00 GMT" } }));
  vi.stubGlobal("fetch", fetcher);
  const result = await createTreasuryApiFetch("https://proxy.example/resources")(request);
  expect(fetcher).toHaveBeenCalledWith(RELEASE_CALENDAR_URL, expect.objectContaining({ method: "GET", redirect: "manual", signal: expect.any(AbortSignal) }));
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(result).toMatchObject({ status: 200, data: { native: rows, source: {
    url: RELEASE_CALENDAR_URL, row_count: 3, etag: '"fixture"', historical_vintage: null,
    snapshot_sha256: expect.stringMatching(/^[a-f0-9]{64}$/), data_availability_verified: false,
  } } });
  const data = result.data as { source: { snapshot_sha256: string } };
  const expected = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(rows)))), byte => byte.toString(16).padStart(2, "0")).join("");
  expect(data.source.snapshot_sha256).toBe(expected);
  await expect(createTreasuryApiFetch()({ ...request, params: { expected_snapshot_hash: expected } })).resolves.toMatchObject({ data: { native: rows } });
  fetcher.mockImplementation(async () => Response.json([{ ...rows[0], released: "true" }, ...rows.slice(1)]));
  await expect(createTreasuryApiFetch()({ ...request, params: { expected_snapshot_hash: expected } })).rejects.toThrow("snapshot changed");
});

it.each([{ data: rows }, [null], [{ date: "2026-10-01" }], [{ datasetId: 12 }]])("rejects a changed calendar envelope %#", async native => {
  vi.stubGlobal("fetch", async () => Response.json(native));
  await expect(createTreasuryApiFetch()(request)).rejects.toThrow("calendar array");
});

it("preserves an empty native calendar without claiming full release coverage", async () => {
  vi.stubGlobal("fetch", async () => Response.json([]));
  expect(await createTreasuryApiFetch()(request)).toMatchObject({ data: { native: [], source: { row_count: 0, data_availability_verified: false } } });
});

it.each([302, 403, 503])("keeps HTTP %i as a failure without fallback calendar data", async status => {
  const fetcher = vi.fn().mockResolvedValue(new Response("not calendar data", { status, headers: { location: "https://other.example" } }));
  vi.stubGlobal("fetch", fetcher);
  await expect(createTreasuryApiFetch()(request)).rejects.toMatchObject({ status });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("rejects unsupported parameters and mutations before fetching", async () => {
  const fetcher = vi.fn(); vi.stubGlobal("fetch", fetcher);
  for (const params of [{ url: "https://other.example" }, { expected_snapshot_hash: "invalid" }, { dataset_id: "fixture-A" }]) {
    await expect(createTreasuryApiFetch()({ ...request, params })).rejects.toThrow();
  }
  await expect(createTreasuryApiFetch()({ ...request, method: "POST" })).rejects.toThrow("GET");
  await expect(createTreasuryApiFetch()({ ...request, body: {} })).rejects.toThrow("body");
  expect(fetcher).not.toHaveBeenCalled();
});

it("bounds a calendar read that stalls before response headers", async () => {
  vi.useFakeTimers(); let signal: AbortSignal | undefined;
  vi.stubGlobal("fetch", (_url: string, options: RequestInit) => { signal = options.signal ?? undefined; return new Promise(() => {}); });
  const assertion = expect(createTreasuryApiFetch()(request)).rejects.toThrow("25 seconds");
  await vi.advanceTimersByTimeAsync(25000); await assertion;
  expect(signal?.aborted).toBe(true);
});

it.each(["/release-calendar", "/dataset-metadata"])("stages complete native discovery and snapshot evidence through the real Code Mode proxy: %s", async path => {
  const native = [{ ...rows[0], description: "α".repeat(20000) }, ...rows.slice(1)];
  vi.stubGlobal("fetch", async () => Response.json(native));
  const stored: unknown[] = [];
  const namespace = { idFromName: (name: string) => name, get: () => ({ fetch: async (req: Request) => {
    if (new URL(req.url).pathname === "/process") {
      stored.push((await req.json() as { data: unknown }).data);
      return Response.json({ success: true, tables_created: ["payloads"], total_rows: 1 });
    }
    return Response.json({ success: true, schema: { tables: {} } });
  } }) };
  const proxy = createApiProxyTool({ apiFetch: createTreasuryApiFetch(), catalog: treasuryCatalog, doNamespace: namespace, stagingPrefix: "treasury", maxInlineBytes: 30 * 1024 });
  const result = await proxy.handler({ ...request, path }, { sql: () => [] });
  expect(result).toMatchObject({ __staged: true, _staging: expect.any(Object) });
  expect(stored.filter(value => typeof value === "string").map(value => JSON.parse(value as string))).toContainEqual(expect.objectContaining({ native, source: expect.objectContaining({ row_count: 3 }) }));
  expect(new TextEncoder().encode(JSON.stringify(result)).byteLength).toBeLessThan(30 * 1024);
});

it.each([["release calendar", "/release-calendar"], ["dataset metadata update", "/dataset-metadata"]])("discovers %s through both existing MCP search aliases", async (query, path) => {
  const server = new McpServer({ name: "fixture", version: "1" });
  registerCodeMode(server, { CODE_MODE_LOADER: { get: () => ({}) } } as unknown as Parameters<typeof registerCodeMode>[1]);
  const tools = (server as unknown as { _registeredTools: Record<string, { handler: (args: unknown, extra: unknown) => Promise<unknown> }> })._registeredTools;
  for (const name of ["treasury_search", "mcp_treasury_search"]) {
    const result = await tools[name].handler({ query, max_results: 2 }, {});
    expect(result).toMatchObject({ content: expect.any(Array), structuredContent: { success: true } });
    expect(JSON.stringify(result)).toContain(path);
  }
});
