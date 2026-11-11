import { afterEach, expect, it, vi } from "vitest";
import { createTreasuryApiFetch } from "./api-adapter";
import { DATASET_METADATA_URL } from "./website-service";

// Synthetic native document: no claim about the deployed service's key spelling.
const native = [{ dataset_id: "fixture-A", title: "Fixture metadata", apis: [
  { endpoint: "/v2/accounting/od/debt_to_penny", latest_date: "2026-09-29", last_updated: "2026-09-30", fields: [{ column_name: "amount", data_type: "CURRENCY", definition: "Exact decimal text" }] },
  { endpoint: "https://other.example/untrusted", latest_date: "2026-08-31", last_updated: null, row_count: "9007199254740993" },
], extra: { retained: true } }];
const request = { method: "GET", path: "/dataset-metadata" };
afterEach(() => vi.unstubAllGlobals());

it("preserves native metadata and separate endpoint dates without following discovered endpoints", async () => {
  const fetcher = vi.fn().mockImplementation(async () => Response.json(native, { headers: { etag: '"fixture"' } }));
  vi.stubGlobal("fetch", fetcher);
  const result = await createTreasuryApiFetch("https://proxy.example/resources")(request);
  expect(result).toMatchObject({ data: { native, source: {
    url: DATASET_METADATA_URL, row_count: 1, etag: '"fixture"', historical_vintage: null,
    snapshot_sha256: expect.stringMatching(/^[a-f0-9]{64}$/), data_availability_verified: false,
  } } });
  expect(fetcher).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledWith(DATASET_METADATA_URL, expect.objectContaining({ method: "GET", redirect: "manual" }));
  const evidence = result.data as { source: { snapshot_sha256: string } };
  await expect(createTreasuryApiFetch()({ ...request, params: { expected_snapshot_hash: evidence.source.snapshot_sha256 } })).resolves.toMatchObject({ data: { native } });
  fetcher.mockImplementation(async () => Response.json([{ ...native[0], title: "Changed" }]));
  await expect(createTreasuryApiFetch()({ ...request, params: { expected_snapshot_hash: evidence.source.snapshot_sha256 } })).rejects.toThrow("metadata snapshot changed");
});

it.each([{}, { error: "unavailable" }, [null], ["not metadata"], [[]]])("rejects incompatible metadata envelopes %#", async body => {
  vi.stubGlobal("fetch", async () => Response.json(body));
  await expect(createTreasuryApiFetch()(request)).rejects.toThrow("metadata array");
});

it.each([302, 401, 503])("preserves HTTP %i failure for metadata discovery", async status => {
  const fetcher = vi.fn().mockResolvedValue(new Response("error", { status })); vi.stubGlobal("fetch", fetcher);
  await expect(createTreasuryApiFetch()(request)).rejects.toMatchObject({ status });
  expect(fetcher).toHaveBeenCalledTimes(1);
});

it("rejects unsupported filters before fetching and bounds whole-document reads", async () => {
  const fetcher = vi.fn().mockImplementation(async () => new Response(JSON.stringify([{ field: "x".repeat(4 * 1024 * 1024) }])));
  vi.stubGlobal("fetch", fetcher);
  await expect(createTreasuryApiFetch()({ ...request, params: { dataset_id: "fixture-A" } })).rejects.toThrow("only expected_snapshot_hash");
  expect(fetcher).not.toHaveBeenCalled();
  await expect(createTreasuryApiFetch()(request)).rejects.toThrow("4 MiB");
});
