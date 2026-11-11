import { afterEach, expect, it, vi } from "vitest";
import { treasuryCatalog } from "../spec/catalog";
import { createTreasuryApiFetch } from "./api-adapter";

afterEach(() => vi.unstubAllGlobals());
it.each([
  ["/v2/accounting/od/auctions_query", "/v1/accounting/od/auctions_query"],
  ["/v2/accounting/od/upcoming_auctions", "/v1/accounting/od/upcoming_auctions"],
  ["/v1/accounting/od/gold_reserve", "/v2/accounting/od/gold_reserve"],
])("keeps the old %s alias on the documented resource", async (path, expected) => {
  const requests: URL[] = [];
  vi.stubGlobal("fetch", async (url: URL) => { requests.push(url); return Response.json({ data: [] }); });
  expect(await createTreasuryApiFetch()({ method: "GET", path })).toEqual({ status: 200, data: { data: [] } });
  expect(requests[0].pathname).toBe(`/services/api/fiscal_service${expected}`);
});
it.each(["/v2/accounting/od/tips_cpi_data", "/v2/accounting/od/treasury_offset_program"])("rejects ambiguous/unverified legacy %s explicitly", async path => {
  const mock = vi.fn(); vi.stubGlobal("fetch", mock);
  await expect(createTreasuryApiFetch()({ method: "GET", path })).rejects.toThrow(); expect(mock).not.toHaveBeenCalled();
});
it("isolates configured proxies between adapters including the default", async () => {
  const requests: URL[] = [];
  vi.stubGlobal("fetch", async (url: URL) => { requests.push(url); return Response.json({ data: [] }); });
  const first = createTreasuryApiFetch("https://first.test/api");
  const second = createTreasuryApiFetch("https://second.test/api");
  const request = { method: "GET" as const, path: "/v2/accounting/od/debt_to_penny" };
  await first(request); await second(request); await createTreasuryApiFetch()(request); await first(request);
  expect(requests.map(url => url.hostname)).toEqual(["first.test", "second.test", "api.fiscaldata.treasury.gov", "first.test"]);
});
it("rejects unsupported methods, bodies and non-JSON format", async () => {
  const api = createTreasuryApiFetch(); const path = "/v2/accounting/od/debt_to_penny";
  await expect(api({ method: "POST", path })).rejects.toThrow("GET");
  await expect(api({ method: "GET", path, body: {} })).rejects.toThrow("body");
  await expect(api({ method: "GET", path, params: { format: "csv" } })).rejects.toThrow("JSON");
});
it("catalog advertises separate canonical TIPS resources and observation helper", () => {
  const paths = treasuryCatalog.endpoints.map(endpoint => endpoint.path);
  expect(paths).toHaveLength(treasuryCatalog.endpointCount!);
  expect(paths).toEqual(expect.arrayContaining(["/observations", "/v1/accounting/od/tips_cpi_data_detail", "/v1/accounting/od/tips_cpi_data_summary"]));
  expect(paths).not.toContain("/v2/accounting/od/treasury_offset_program");
});
