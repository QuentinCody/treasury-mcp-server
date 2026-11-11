import { afterEach, expect, it, vi } from "vitest";
import { observationPage } from "./observations";

afterEach(() => vi.unstubAllGlobals());
const params = { endpoint: "/v2/accounting/od/debt_to_penny", date_field: "record_date", start_date: "2026-09-01", end_date: "2026-09-29" };
// Shape and amount from the public debt response observed September 29, 2026.
const native = { data: [{ record_date: "2026-09-25", tot_pub_debt_out_amt: "40097178119750.91" }],
  meta: { count: 1, "total-count": 8401, "total-pages": 8401, labels: { record_date: "Record Date", tot_pub_debt_out_amt: "Total Public Debt Outstanding" },
    dataTypes: { record_date: "DATE", tot_pub_debt_out_amt: "CURRENCY" }, dataFormats: { record_date: "YYYY-MM-DD", tot_pub_debt_out_amt: "$10.20" } },
  links: { next: "&page%5Bnumber%5D=2&page%5Bsize%5D=1" } };

it("retains precision, full native metadata/links and unknown vintage", async () => {
  const requests: URL[] = [];
  vi.stubGlobal("fetch", async (url: URL) => { requests.push(url); return Response.json(native); });
  const result = await observationPage(params);
  expect(result).toMatchObject({ ...native, _observation: { release: null, released_at: null, last_updated: null, historical_vintage: null,
    date_field: "record_date", schema_sha256: expect.stringMatching(/^[0-9a-f]{64}$/) } });
  expect(requests[0].searchParams.get("page[size]")).toBe("1");
  expect(requests[1].searchParams.get("filter")).toBe("record_date:gte:2026-09-01,record_date:lte:2026-09-29");
  expect(requests[1].searchParams.has("fields")).toBe(false);
});
it("uses resource-specific DATE fields and equality filters", async () => {
  const tips = { ...native, data: [{ index_date: "2026-09-25", cusip: "001234567" }], meta: { ...native.meta, dataTypes: { index_date: "DATE", cusip: "STRING" } } };
  const requests: URL[] = [];
  vi.stubGlobal("fetch", async (url: URL) => { requests.push(url); return Response.json(tips); });
  await observationPage({ ...params, endpoint: "/v1/accounting/od/tips_cpi_data_detail", date_field: "index_date", filters: '{"cusip":"001234567"}', page: 2, page_size: 5 });
  expect(requests[1].searchParams.get("filter")).toBe("index_date:gte:2026-09-01,index_date:lte:2026-09-29,cusip:eq:001234567");
  expect(requests[1].searchParams.get("page[number]")).toBe("2");
});
it.each([
  { end_date: "2026-02-30" }, { start_date: "2027-01-01" }, { page_size: 1001 }, { page: 0 },
  { date_field: "record_date:lte" }, { endpoint: "https://evil.test" }, { as_of: "2020-01-01" },
])("rejects invalid selection before fetching %j", async change => {
  const mock = vi.fn(); vi.stubGlobal("fetch", mock);
  await expect(observationPage({ ...params, ...change })).rejects.toThrow(); expect(mock).not.toHaveBeenCalled();
});
it.each([
  { filters: { unknown: "value" } }, { filters: { record_date: "x,record_date:lt:2020-01-01" } },
  { date_field: "tot_pub_debt_out_amt" }, { expected_schema_hash: "old" },
])("rejects unavailable fields, syntax injection and schema mismatch %j", async change => {
  const mock = vi.fn(async () => Response.json(native)); vi.stubGlobal("fetch", mock);
  await expect(observationPage({ ...params, ...change })).rejects.toThrow(); expect(mock).toHaveBeenCalledTimes(1);
});
it("rejects schema drift between discovery and results", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValueOnce(Response.json(native)).mockResolvedValueOnce(Response.json({ ...native, meta: { ...native.meta, labels: {} } })));
  await expect(observationPage(params)).rejects.toThrow("between discovery");
});
it("rejects source rows outside the observation window", async () => {
  vi.stubGlobal("fetch", async () => Response.json({ ...native, data: [{ record_date: "2025-01-01" }] }));
  await expect(observationPage(params)).rejects.toThrow("outside");
});
it("handles empty results without claiming historical availability", async () => {
  vi.stubGlobal("fetch", async () => Response.json({ ...native, data: [] }));
  expect(await observationPage(params)).toMatchObject({ data: [], _observation: { historical_vintage: null } });
});
it("rejects non-Fiscal Data envelopes", async () => {
  vi.stubGlobal("fetch", async () => Response.json({ error: "unavailable" }));
  await expect(observationPage(params)).rejects.toThrow("Fiscal Data rows");
});
