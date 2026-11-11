import type { ApiCatalog, ApiEndpoint } from "@bio-mcp/shared/codemode/catalog";
import { resourceAliases } from "../lib/resource-aliases";
import { workflows } from "./workflows";

function resourceParameters(endpoints: ApiEndpoint[]): ApiEndpoint[] {
    const common: NonNullable<ApiEndpoint["queryParams"]> = [
        { name: "fields", type: "string", required: false, description: "Native field projection; omitted dimensions can cause implicit aggregation. Prefer full rows for exact comparisons." },
        { name: "filter", type: "string", required: false, description: "Native field:operator:value filters; discover names and types from resource metadata." },
        { name: "sort", type: "string", required: false, description: "Comma-separated native fields, with - for descending. Tied dates alone do not guarantee stable page order." },
        { name: "page[number]", type: "number", required: false, description: "One-based native page number; separate pages are not an atomic snapshot." },
        { name: "page[size]", type: "number", required: false, description: "Native page size, up to 10000; reduce it to meet the response body bound." },
    ];
    const canonical = endpoints.map(endpoint => !/^\/v[12]\//.test(endpoint.path) ? endpoint : {
        ...endpoint, queryParams: [...(endpoint.queryParams ?? []), ...common.filter(param => !endpoint.queryParams?.some(existing => existing.name === param.name))],
    });
    return [...canonical, ...Object.entries(resourceAliases).map(([path, target]) => {
        const endpoint = canonical.find(endpoint => endpoint.path === target);
        if (!endpoint) throw new Error(`Missing canonical Treasury resource ${target}`);
        return { ...endpoint, path, category: "compatibility", deprecated: true, featured: false,
            summary: `Compatibility spelling; use ${target}`,
            description: `Adapter alias for ${target}, not an additional native Treasury endpoint. Requests use the canonical route.`,
        };
    })];
}

export const treasuryCatalog: ApiCatalog = {
    name: "Treasury FiscalData",
    baseUrl: "https://api.fiscaldata.treasury.gov/services/api/fiscal_service",
    version: "v1/v2 (resource-specific)",
    auth: "none",
    endpointCount: 20,
    workflows,
    notes:
        "- No API key required\n" +
        "- Common params: fields (comma-separated), filter (field:eq:value, field:gte:value, field:lte:value),\n" +
        "  sort (-field for desc), page[number], page[size] (max 10000)\n" +
        "- Dates are in YYYY-MM-DD format\n" +
        "- Most datasets have record_date as the primary date field\n" +
        "- Response format: { data: [...], meta: { total-count, total-pages, ... }, links: {...} }\n" +
        "- Preserve amount strings; JavaScript Number/SQLite REAL can lose decimal precision\n" +
        "- /observations is a local helper: schema-checked date window plus native data/meta/links and retrieval/hash context\n" +
        "- Observation dates are not release dates or historical as-known vintages. Release/update timestamps remain unknown\n" +
        "- TIPS detail uses index_date; summary uses original_issue_date. Choose date fields explicitly\n" +
        "- Selecting fields can implicitly aggregate results. The observation helper requests full rows\n" +
        "- /release-calendar and /dataset-metadata read native website discovery documents directly, separately from any Fiscal Data resource proxy. They do not establish publication, data availability or historical vintages. Staged metadata has dataset_metadata, dataset_apis, dataset_fields and discovery_snapshot tables; calendar rows retain duplicate IDs and string flags\n" +
        "- TOP is /v1/debt/treasury_offset_program, advertised by current native metadata. Inspect state_or_agency, debt_category and native field definitions; do not infer a separate federal/state API or aggregate amounts across unlike streams",
    endpoints: resourceParameters([
        {
            method: "GET", path: "/dataset-metadata", category: "discovery", featured: true,
            summary: "Discover native Treasury dataset and endpoint metadata, including update dates, coverage and field definitions when supplied",
            description: "Local helper over the website's /services/dtg/metadata/ service. Returns its complete native array and snapshot evidence; preserves original field names, unknown fields, nulls and endpoint-specific dates without website transformations. Inspect native identifiers and endpoint paths before joining to calendar datasetId or observations; no automatic joins or advertised-URL fetches. The snapshot hash covers metadata, not data revisions. Large results use staging with separate dataset, API and field tables preserving parent indexes; query discovery_snapshot for the guard hash. Fixed Treasury service, independent of TREASURY_PROXY_URL.",
            queryParams: [{ name: "expected_snapshot_hash", type: "string", required: false, description: "Prior source.snapshot_sha256; rejects changes to the complete parsed metadata document. Not a dataset release or historical vintage." }],
            example: "return await api.get('/dataset-metadata');",
        },
        {
            method: "GET", path: "/release-calendar", category: "discovery", featured: true,
            summary: "Read Treasury's native release calendar with dataset IDs, unchanged dates/times/released flags and snapshot evidence",
            description: "Local helper over /services/calendar/release, used by Treasury's website. Returns the full native array and source evidence; filter native rows by datasetId in Code Mode or query release_calendar when staged. No time-zone, publication, complete historical coverage or data-availability inference. Uses the fixed Treasury service directly, not TREASURY_PROXY_URL. Dates, times and released strings remain uncoerced.",
            queryParams: [{ name: "expected_snapshot_hash", type: "string", required: false, description: "Optional prior source.snapshot_sha256; reject any change to the parsed calendar snapshot. This is not a dataset release identifier." }],
            example: "return await api.get('/release-calendar');",
        },
        // --- Interest Rates ---
        {
            method: "GET", path: "/v1/debt/treasury_offset_program", category: "debt", featured: true,
            summary: "Treasury Offset Program (TOP) native offset and reversal records",
            description: "Discovered from dataset metadata 015-BFS-2014Q3-052. Full rows preserve net/total offset and reversal amounts, counts, agency/site identifiers, stream and debt category. state_or_agency is a native classification, not a separate resource. Inspect current labels/dataTypes/dataFormats and dataset definitions before combining measures. Amount strings, leading zeros and trailing spaces are evidence; avoid numeric coercion. Default page covers only a subset; native totals/links are not snapshot isolation.",
            queryParams: [{ name: "filter", type: "string", required: false, description: "Native filter, for example state_or_agency:eq:State" },
                { name: "sort", type: "string", required: false, description: "Native order, for example -record_date,-row_index_nbr" },
                { name: "page[size]", type: "number", required: false, description: "Bounded page size; prefer full rows to projections that aggregate" }],
            example: 'return await api.get("/v1/debt/treasury_offset_program", {"page[size]": 5, sort: "-record_date,-row_index_nbr"});',
        },
        {
            method: "GET",
            path: "/v2/accounting/od/avg_interest_rates",
            summary: "Average interest rates on US Treasury securities by type (bills, notes, bonds, TIPS, FRNs)",
            category: "interest_rates",
            queryParams: [
                { name: "fields", type: "string", required: false, description: "Comma-separated field names" },
                { name: "filter", type: "string", required: false, description: "Example: security_type_desc:eq:Marketable. Specific categories use security_desc; discover native labels/types first" },
                { name: "sort", type: "string", required: false, description: "Sort field (-record_date for newest first)" },
                { name: "page[number]", type: "number", required: false, description: "Page number", default: 1 },
                { name: "page[size]", type: "number", required: false, description: "Results per page (max 10000)", default: 100 },
            ],
        },
        // --- National Debt ---
        {
            method: "GET",
            path: "/v2/accounting/od/debt_to_penny",
            summary: "Daily total public debt outstanding (the national debt). Updated daily",
            category: "debt",
            queryParams: [
                { name: "fields", type: "string", required: false, description: "Comma-separated field names" },
                { name: "filter", type: "string", required: false, description: "Filter (e.g. record_date:gte:2024-01-01)" },
                { name: "sort", type: "string", required: false, description: "Sort field", default: "-record_date" },
                { name: "page[size]", type: "number", required: false, description: "Results per page", default: 100 },
            ],
        },
        {
            method: "GET",
            path: "/v2/accounting/od/debt_outstanding",
            summary: "Historical annual total debt outstanding at fiscal year end",
            category: "debt",
            queryParams: [
                { name: "fields", type: "string", required: false, description: "Comma-separated field names" },
                { name: "filter", type: "string", required: false, description: "Filter" },
                { name: "sort", type: "string", required: false, description: "Sort field", default: "-record_date" },
                { name: "page[size]", type: "number", required: false, description: "Results per page", default: 100 },
            ],
        },
        // --- Revenue & Spending ---
        {
            method: "GET",
            path: "/v1/accounting/mts/mts_table_4",
            summary: "Monthly Treasury Statement: federal revenue by source (individual tax, corporate tax, etc.)",
            category: "revenue_spending",
            queryParams: [
                { name: "fields", type: "string", required: false, description: "Field names" },
                { name: "filter", type: "string", required: false, description: "Filter" },
                { name: "sort", type: "string", required: false, description: "Sort field", default: "-record_date" },
                { name: "page[size]", type: "number", required: false, description: "Results per page", default: 100 },
            ],
        },
        {
            method: "GET",
            path: "/v1/accounting/mts/mts_table_5",
            summary: "Monthly Treasury Statement: federal outlays (spending) by agency",
            category: "revenue_spending",
            queryParams: [
                { name: "fields", type: "string", required: false, description: "Field names" },
                { name: "filter", type: "string", required: false, description: "Filter" },
                { name: "sort", type: "string", required: false, description: "Sort field", default: "-record_date" },
                { name: "page[size]", type: "number", required: false, description: "Results per page", default: 100 },
            ],
        },
        {
            method: "GET",
            path: "/v1/accounting/mts/mts_table_1",
            summary: "Monthly Treasury Statement: budget summary (receipts, outlays, surplus/deficit)",
            category: "revenue_spending",
            queryParams: [
                { name: "fields", type: "string", required: false, description: "Field names" },
                { name: "filter", type: "string", required: false, description: "Filter" },
                { name: "sort", type: "string", required: false, description: "Sort field", default: "-record_date" },
                { name: "page[size]", type: "number", required: false, description: "Results per page", default: 100 },
            ],
        },
        // --- Exchange Rates ---
        {
            method: "GET",
            path: "/v1/accounting/od/rates_of_exchange",
            summary: "Treasury exchange rates (official US government rates for ~170 currencies)",
            category: "exchange_rates",
            queryParams: [
                { name: "fields", type: "string", required: false, description: "Field names" },
                { name: "filter", type: "string", required: false, description: "Filter (e.g. country_currency_desc:eq:Euro Zone-Euro)" },
                { name: "sort", type: "string", required: false, description: "Sort field", default: "-record_date" },
                { name: "page[size]", type: "number", required: false, description: "Results per page", default: 100 },
            ],
        },
        // --- Auctions ---
        {
            method: "GET",
            path: "/v1/accounting/od/auctions_query",
            summary: "Historical Treasury auction results (bid-to-cover ratio, high yield, allotted amount)",
            category: "auctions",
            queryParams: [
                { name: "fields", type: "string", required: false, description: "Field names" },
                { name: "filter", type: "string", required: false, description: "Filter (e.g. security_type:eq:Note)" },
                { name: "sort", type: "string", required: false, description: "Sort field", default: "-auction_date" },
                { name: "page[size]", type: "number", required: false, description: "Results per page", default: 100 },
            ],
        },
        {
            method: "GET",
            path: "/v1/accounting/od/upcoming_auctions",
            summary: "Upcoming Treasury auction schedule",
            category: "auctions",
            queryParams: [
                { name: "fields", type: "string", required: false, description: "Field names" },
                { name: "sort", type: "string", required: false, description: "Sort field" },
                { name: "page[size]", type: "number", required: false, description: "Results per page", default: 100 },
            ],
        },
        // --- Other ---
        {
            method: "GET",
            path: "/v1/accounting/od/savings_bonds_pcs",
            summary: "Savings bond piece counts by series: issued, outstanding and redeemed (not bond redemption values)",
            category: "savings_bonds",
            queryParams: [
                { name: "fields", type: "string", required: false, description: "Field names" },
                { name: "filter", type: "string", required: false, description: "Filter" },
                { name: "page[size]", type: "number", required: false, description: "Results per page", default: 100 },
            ],
        },
        {
            method: "GET",
            path: "/v1/accounting/od/tips_cpi_data_detail",
            summary: "TIPS CPI detail; date windows use index_date, not record_date",
            category: "tips",
            queryParams: [
                { name: "fields", type: "string", required: false, description: "Field names" },
                { name: "filter", type: "string", required: false, description: "Filter" },
                { name: "sort", type: "string", required: false, description: "Sort field", default: "-index_date" },
                { name: "page[size]", type: "number", required: false, description: "Results per page", default: 100 },
            ],
        },
        {
            method: "GET",
            path: "/v1/accounting/od/tips_cpi_data_summary",
            summary: "TIPS CPI summary; date windows use original_issue_date",
            category: "tips",
            queryParams: [
                { name: "filter", type: "string", required: false, description: "Native field filters; original_issue_date is the primary date" },
                { name: "sort", type: "string", required: false, description: "Sort field", default: "-original_issue_date" },
                { name: "page[number]", type: "number", required: false, description: "Page number", default: 1 },
                { name: "page[size]", type: "number", required: false, description: "Results per page", default: 100 },
            ],
        },
        {
            method: "GET",
            path: "/v2/accounting/od/gold_reserve",
            summary: "US gold reserve value and quantity",
            category: "gold",
            queryParams: [
                { name: "fields", type: "string", required: false, description: "Field names" },
                { name: "filter", type: "string", required: false, description: "Filter" },
                { name: "sort", type: "string", required: false, description: "Sort field", default: "-record_date" },
                { name: "page[size]", type: "number", required: false, description: "Results per page", default: 100 },
            ],
        },
        {
            method: "GET",
            path: "/observations",
            summary: "Local helper: bounded, schema-checked observation-date page with source metadata; not a historical vintage API",
            category: "provenance",
            queryParams: [
                { name: "endpoint", type: "string", required: true, description: "Canonical /v1/ or /v2/ Fiscal Data endpoint" },
                { name: "date_field", type: "string", required: true, description: "Resource-specific DATE field; checked against native meta.dataTypes" },
                { name: "start_date", type: "string", required: true, description: "Inclusive YYYY-MM-DD observation start" },
                { name: "end_date", type: "string", required: true, description: "Inclusive YYYY-MM-DD observation end; not publication cutoff" },
                { name: "filters", type: "string", required: false, description: "JSON object of exact-equality field/string pairs; fields checked against observed schema" },
                { name: "page", type: "number", required: false, description: "Page number (1–1000000)", default: 1 },
                { name: "page_size", type: "number", required: false, description: "Rows per page (1–1000)", default: 100 },
                { name: "expected_schema_hash", type: "string", required: false, description: "Optional schema_sha256 from an earlier helper response; detects schema drift only" },
            ],
        },
    ]),
};
