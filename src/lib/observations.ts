import { readTreasury } from "./read";

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Expected an object");
  return value as Record<string, unknown>; // SAFETY: object shape checked above.
}

function envelope(value: unknown) {
  const native = object(value);
  if (!Array.isArray(native.data)) throw new Error("Expected Fiscal Data rows");
  const meta = object(native.meta);
  return { native, rows: native.data, types: object(meta.dataTypes), meta };
}

function date(value: unknown, name: string): string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error(`${name} must be YYYY-MM-DD`);
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) throw new Error(`Invalid ${name}`);
  return value;
}

function pageInteger(value: unknown, fallback: number, max: number): number {
  const number = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(number) || number < 1 || number > max) throw new Error(`Page value must be an integer from 1 to ${max}`);
  return number;
}

function equalityFilters(value: unknown, types: Record<string, unknown>): string[] {
  if (value === undefined) return [];
  const filters = typeof value === "string" ? JSON.parse(value) : value;
  return Object.entries(object(filters)).map(([field, term]) => {
    if (!/^[a-z][a-z0-9_]*$/.test(field) || !Object.prototype.hasOwnProperty.call(types, field)) throw new Error(`Unknown filter field: ${field}`);
    if (typeof term !== "string" || !term.length || /[,:()\r\n]/.test(term)) throw new Error("Equality filters require nonempty strings without filter syntax");
    return `${field}:eq:${term}`;
  });
}

async function hash(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function schemaHash(meta: Record<string, unknown>): Promise<string> {
  const schema = ["labels", "dataTypes", "dataFormats"].map(key =>
    [key, Object.entries(object(meta[key])).sort(([a], [b]) => a.localeCompare(b))]);
  return hash(schema);
}

function selection(params: Record<string, unknown>) {
  const allowed = ["endpoint", "date_field", "start_date", "end_date", "filters", "page", "page_size", "expected_schema_hash"];
  if (Object.keys(params).some(key => !allowed.includes(key))) throw new Error("Unknown observation parameter");
  if (typeof params.endpoint !== "string" || !/^\/v[12]\/[a-z0-9_/]+$/.test(params.endpoint)) throw new Error("endpoint must be a Fiscal Data resource path");
  if (typeof params.date_field !== "string" || !/^[a-z][a-z0-9_]*$/.test(params.date_field)) throw new Error("Choose the resource-specific date_field");
  const start = date(params.start_date, "start_date"); const end = date(params.end_date, "end_date");
  if (start > end) throw new Error("start_date must not follow end_date");
  return { endpoint: params.endpoint, field: params.date_field, start, end,
    page: pageInteger(params.page, 1, 1000000), size: pageInteger(params.page_size, 100, 1000) };
}

export async function observationPage(params: Record<string, unknown>, proxyUrl?: string): Promise<unknown> {
  const selected = selection(params);
  const sample = envelope(await readTreasury(selected.endpoint, { "page[size]": 1 }, proxyUrl));
  if (sample.types[selected.field] !== "DATE") throw new Error("date_field is not a DATE in the observed provider schema");
  const schema = await schemaHash(sample.meta);
  if (params.expected_schema_hash !== undefined && params.expected_schema_hash !== schema) throw Object.assign(new Error("Observed Treasury schema changed"), {
    status: 409, data: { discovery: sample.native, expected_schema_hash: params.expected_schema_hash, observed_schema_hash: schema, incomplete: true },
  });
  const filter = [`${selected.field}:gte:${selected.start}`, `${selected.field}:lte:${selected.end}`,
    ...equalityFilters(params.filters, sample.types)].join(",");
  const query = { filter, sort: `-${selected.field}`, "page[number]": selected.page, "page[size]": selected.size };
  const page = envelope(await readTreasury(selected.endpoint, query, proxyUrl));
  const observedSchema = await schemaHash(page.meta);
  if (observedSchema !== schema) throw Object.assign(new Error("Treasury schema changed between discovery and page retrieval"), {
    status: 409, data: { discovery: sample.native, response: page.native, expected_schema_hash: schema, observed_schema_hash: observedSchema, incomplete: true },
  });
  validateRows(page.rows, selected);
  return { ...page.native, _observation: {
    endpoint: selected.endpoint, request: query, retrieved_at: new Date().toISOString(),
    date_field: selected.field, start_date: selected.start, end_date: selected.end,
    schema_sha256: schema, response_sha256: await hash(page.native),
    hash_scope: "JSON serialization of parsed native response; not a dataset release checksum",
    release: null, released_at: null, last_updated: null, historical_vintage: null,
    semantics: "Observation date window in the currently served data; not data as known at a historical time",
    pagination: "One page; native totals/links preserved. Subsequent pages may change as the source updates.",
  } };
}

function validateRows(rows: unknown[], selected: ReturnType<typeof selection>): void {
  if (rows.length > selected.size) throw new Error("Provider exceeded requested page size");
  for (const row of rows) {
    const observed = date(object(row)[selected.field], "returned date");
    if (observed < selected.start || observed > selected.end) throw new Error("Provider returned a date outside the requested window");
  }
}
