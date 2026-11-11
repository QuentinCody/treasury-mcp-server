import { verifyCitationEnvelope } from "@bio-mcp/shared";
import { afterEach, expect, it, vi } from "vitest";

vi.mock("cloudflare:workers", () => ({ RpcTarget: class {}, DurableObject: class { constructor(public ctx: unknown, public env: unknown) {} } }));

import { workflows } from "../spec/workflows";
import { fixture, recover } from "./staging-fixture";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
async function invoke(f: ReturnType<typeof fixture>, name: string, args: Record<string, unknown>, failed = false) {
  const result = await f.tools[name].handler(args, {});
  expect(result.isError === true, JSON.stringify(result).slice(0, 500)).toBe(failed);
  expect(result.content.length).toBeGreaterThan(0);
  const sc = result.structuredContent;
  const id = sc.staged ? sc.data_access_id : sc.data?.__staged ? sc.data.data_access_id : undefined;
  const staged = id ? await recover(f, id, "") : undefined;
  const proof = await verifyCitationEnvelope({ citation: sc._meta?.citation, structuredContent: sc, toolArguments: args,
    ...(staged ? { materialized: { value: staged } } : {}) });
  expect(proof.verification).toMatchObject({ query: "verified", result: "verified" });
  expect(Buffer.byteLength(JSON.stringify(result))).toBeLessThanOrEqual(30720);
  return { sc, id, data: sc.staged ? staged.structuredContent.data : sc.data?.__staged ? staged : sc.data };
}

it("makes compatibility spellings reachable through the actual Code Mode catalog guard", async () => {
  const f = fixture(); const requested: string[] = [];
  vi.stubGlobal("fetch", async (url: URL) => { requested.push(url.pathname); return Response.json({ data: [{ value: "001" }] }); });
  try {
    for (const path of ["/v2/accounting/od/auctions_query", "/v2/accounting/od/upcoming_auctions", "/v1/accounting/od/gold_reserve"]) {
      const result = await invoke(f, "mcp_treasury_execute", { code: `return await api.get(${JSON.stringify(path)}, {sort:"-record_date", "page[number]":1});` });
      expect(result.data).toEqual({ data: [{ value: "001" }] });
    }
    expect(requested).toEqual(["/services/api/fiscal_service/v1/accounting/od/auctions_query", "/services/api/fiscal_service/v1/accounting/od/upcoming_auctions", "/services/api/fiscal_service/v2/accounting/od/gold_reserve"]);
  } finally { f.close(); }
});

it.each(["", "mcp_"])("verifies every %s alias, argument hashes and error envelopes", async prefix => {
  const f = fixture();
  try {
    await invoke(f, `${prefix}treasury_search`, { query: "TOP" });
    await invoke(f, `${prefix}treasury_execute`, { code: "return {amount:'9007199254740993.01'};" });
    await invoke(f, `${prefix}treasury_execute`, { code: "" }, true);
    await invoke(f, `${prefix}treasury_query_data`, { data_access_id: "missing", sql: "SELECT * FROM missing" }, true);
    await invoke(f, `${prefix}treasury_get_schema`, { data_access_id: "missing" });
  } finally { f.close(); }
});

it("continues through staged metadata and retains parent indexes, unknown fields and source evidence", async () => {
  const f = fixture();
  const field = { column_name: "agency_id", definition: "α".repeat(20000), data_type: "STRING", unknown: null };
  const api = { api_id: 299, endpoint_txt: "/services/api/fiscal_service/v1/debt/treasury_offset_program", last_updated: "2026-09-18", latest_date: "2026-09-11", fields: [field, { ...field, column_name: "net_offset_amt" }] };
  const native = [{ dataset_id: "015-BFS-2014Q3-052", apis: [api], extra: { id: "001" } }];
  vi.stubGlobal("fetch", async () => Response.json(native));
  try {
    const result = await invoke(f, "treasury_execute", { code: workflows[0].code });
    expect(result.data.resources.results.map((v: {native_json: string}) => JSON.parse(v.native_json))).toEqual([expect.objectContaining({ api_id: 299, endpoint_txt: api.endpoint_txt, last_updated: api.last_updated, latest_date: api.latest_date })]);
    const id = result.data.metadata.data_access_id;
    expect((await recover(f, id, "")).native).toEqual(native);
    const query = await invoke(f, "mcp_treasury_query_data", { data_access_id: id, sql: "SELECT parent_dataset_id,parent_api_id,dataset_index,api_index,field_index,column_name FROM dataset_fields ORDER BY field_index" });
    expect(query.data.rows).toEqual([field, { ...field, column_name: "net_offset_amt" }].map((v, i) => ({ parent_dataset_id: native[0].dataset_id, parent_api_id: 299, dataset_index: 0, api_index: 0, field_index: i, column_name: v.column_name })));
    const failed = await invoke(f, "treasury_execute", { code: `return await api.get('/dataset-metadata',{expected_snapshot_hash:'${"0".repeat(64)}'});` }, true);
    const evidence = failed.data.data.__staged ? await recover(f, failed.data.data.data_access_id, "") : failed.data.data;
    expect(evidence.native).toEqual(native); expect(evidence.expected_snapshot_hash).toBe("0".repeat(64));
  } finally { f.close(); }
});

it("preserves large TOP amount/identifier strings, duplicate calendar events and full error bodies", async () => {
  const f = fixture();
  const native = { data: [{ record_date: "2026-09-11", net_offset_amt: "9007199254740993.01", agency_id: "04", agency_site_cd: "6EI ", note: "α".repeat(18000) }], meta: { count: 1 }, links: { next: "page2" } };
  vi.stubGlobal("fetch", async () => Response.json(native));
  try {
    const result = await invoke(f, "treasury_execute", { code: 'return await api.get("/v1/debt/treasury_offset_program");' });
    expect(result.data).toEqual(native);
    const query = await invoke(f, "treasury_query_data", { data_access_id: result.id, sql: "SELECT net_offset_amt,typeof(net_offset_amt) AS type,agency_id,agency_site_cd FROM treasury_offsets" });
    expect(query.data.rows).toEqual([{ net_offset_amt: "9007199254740993.01", type: "text", agency_id: "04", agency_site_cd: "6EI " }]);
    const restaged = await invoke(f, "mcp_treasury_query_data", { data_access_id: result.id, sql: "SELECT * FROM treasury_offsets" });
    const schema = await invoke(f, "treasury_get_schema", { data_access_id: restaged.id });
    expect(JSON.stringify(schema.data)).toContain('"query_rows"');
    expect(restaged.data.rows[0]).toMatchObject({ _rowid: 1, agency_id: "04", note: native.data[0].note });
    const calendar = Array.from({ length: 500 }, (_, i) => ({ datasetId: "015-BFS-2014Q3-065", date: "2026-10-02", time: "16:00", released: i % 2 ? "true" : "false" }));
    vi.stubGlobal("fetch", async () => Response.json(calendar));
    const events = await invoke(f, "treasury_execute", { code: workflows[1].code });
    expect(events.data.events.results.map((v: {native_json: string}) => JSON.parse(v.native_json))).toEqual(calendar.slice(0, 20));
    const problem = { error: "Invalid query", message: "α".repeat(25000) };
    vi.stubGlobal("fetch", async () => Response.json(problem, { status: 400 }));
    const failed = await invoke(f, "treasury_execute", { code: 'return await api.get("/v1/debt/treasury_offset_program");' }, true);
    const evidence = failed.data.data.__staged ? await recover(f, failed.data.data.data_access_id, "") : failed.data.data;
    expect(evidence.problem).toEqual(problem); expect(JSON.parse(evidence.response)).toEqual(problem);
    const composed = await invoke(f, "mcp_treasury_execute", { code: 'return {notes:"α😀".repeat(12000),values:[0,null,"001"]};' });
    expect(composed.sc.staged).toBe(true); expect(composed.data.notes).toBe("α😀".repeat(12000));
  } finally { f.close(); }
});
