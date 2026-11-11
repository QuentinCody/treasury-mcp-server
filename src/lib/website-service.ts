import { readTreasuryResponse } from "./read";

const services = {
  calendar: {
    url: "https://api.fiscaldata.treasury.gov/services/calendar/release",
    semantics: "Native schedule and provider release flags, retained without coercion. Dates, times and released flags do not independently verify publication, underlying data availability or a historical as-known snapshot. No timezone is inferred. An empty calendar does not establish that no releases exist elsewhere.",
  },
  metadata: {
    url: "https://api.fiscaldata.treasury.gov/services/dtg/metadata/",
    semantics: "Native website dataset metadata, retaining original field names and per-endpoint dates. Update dates, observation coverage, HTTP Last-Modified and retrieval time have different meanings. No dataset-wide date is inferred, no fields are renamed and no advertised endpoint is fetched. This is not a historical as-known snapshot or proof that the described data is available.",
  },
} as const;

export const RELEASE_CALENDAR_URL = services.calendar.url;
export const DATASET_METADATA_URL = services.metadata.url;

/** Preserve website discovery documents separately from Fiscal Data observations. */
export async function readWebsiteService(kind: keyof typeof services, params: Record<string, unknown>) {
  if (Object.keys(params).some(key => key !== "expected_snapshot_hash")) throw new Error("Discovery accepts only expected_snapshot_hash; filter native rows in Code Mode");
  const expected = params.expected_snapshot_hash;
  if (expected !== undefined && (typeof expected !== "string" || !/^[a-f0-9]{64}$/.test(expected))) throw new Error("expected_snapshot_hash must be a lowercase SHA-256");
  const service = services[kind];
  const { data, response } = await readTreasuryResponse(signal => fetch(service.url, {
    method: "GET", redirect: "manual", signal,
    headers: { Accept: "application/json", "User-Agent": "treasury-mcp-server/1.0" },
  }));
  if (!Array.isArray(data) || data.some(row => !row || typeof row !== "object" || Array.isArray(row)
    || (kind === "calendar" && (typeof row.datasetId !== "string" || !row.datasetId)))) {
    throw new Error(`Expected native Treasury ${kind} array of objects${kind === "calendar" ? " with datasetId on each row" : ""}`);
  }
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(data)));
  const hash = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
  const result = { native: data, source: {
    kind,
    url: service.url, retrieved_at: new Date().toISOString(), http_status: response.status,
    etag: response.headers.get("etag"), last_modified: response.headers.get("last-modified"),
    snapshot_sha256: hash, hash_scope: "JSON serialization of the complete parsed discovery response; not a dataset checksum",
    row_count: data.length, historical_vintage: null, data_availability_verified: false,
    semantics: service.semantics,
  } };
  if (expected !== undefined && expected !== hash) throw Object.assign(new Error(`Treasury ${kind} snapshot changed; retrieve and review the current document`), {
    status: 409, data: { ...result, expected_snapshot_hash: expected, observed_snapshot_hash: hash, incomplete: true },
  });
  return result;
}
