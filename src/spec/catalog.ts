import type { ApiCatalog } from "@bio-mcp/shared/codemode/catalog";

export const treasuryCatalog: ApiCatalog = {
    name: "Treasury FiscalData",
    baseUrl: "https://api.fiscaldata.treasury.gov/services/api/fiscal_service",
    version: "2.0",
    auth: "none",
    endpointCount: 13,
    notes:
        "- No API key required\n" +
        "- Common params: fields (comma-separated), filter (field:eq:value, field:gte:value, field:lte:value),\n" +
        "  sort (-field for desc), page[number], page[size] (max 10000)\n" +
        "- Dates are in YYYY-MM-DD format\n" +
        "- Most datasets have record_date as the primary date field\n" +
        "- Response format: { data: [...], meta: { total-count, total-pages, ... }, links: {...} }\n" +
        "- Amounts are strings (to preserve precision) — cast to number in queries\n" +
        "- Use filter=record_date:gte:2024-01-01 for date range queries",
    endpoints: [
        // --- Interest Rates ---
        {
            method: "GET",
            path: "/v2/accounting/od/avg_interest_rates",
            summary: "Average interest rates on US Treasury securities by type (bills, notes, bonds, TIPS, FRNs)",
            category: "interest_rates",
            queryParams: [
                { name: "fields", type: "string", required: false, description: "Comma-separated field names" },
                { name: "filter", type: "string", required: false, description: "Filter: record_date:gte:YYYY-MM-DD, security_type_desc:eq:Treasury Notes" },
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
            summary: "Debt outstanding by type of security (bills, notes, bonds, TIPS, etc.)",
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
            path: "/v2/accounting/od/auctions_query",
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
            path: "/v2/accounting/od/upcoming_auctions",
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
            summary: "Savings bond redemption values (what your bonds are worth)",
            category: "savings_bonds",
            queryParams: [
                { name: "fields", type: "string", required: false, description: "Field names" },
                { name: "filter", type: "string", required: false, description: "Filter" },
                { name: "page[size]", type: "number", required: false, description: "Results per page", default: 100 },
            ],
        },
        {
            method: "GET",
            path: "/v2/accounting/od/tips_cpi_data",
            summary: "TIPS CPI reference data (inflation-indexed bond pricing)",
            category: "tips",
            queryParams: [
                { name: "fields", type: "string", required: false, description: "Field names" },
                { name: "filter", type: "string", required: false, description: "Filter" },
                { name: "sort", type: "string", required: false, description: "Sort field", default: "-record_date" },
                { name: "page[size]", type: "number", required: false, description: "Results per page", default: 100 },
            ],
        },
        {
            method: "GET",
            path: "/v1/accounting/od/gold_reserve",
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
            path: "/v2/accounting/od/treasury_offset_program",
            summary: "Treasury offset collections (tax refund offsets for debts owed to federal/state agencies)",
            category: "collections",
            queryParams: [
                { name: "fields", type: "string", required: false, description: "Field names" },
                { name: "filter", type: "string", required: false, description: "Filter" },
                { name: "sort", type: "string", required: false, description: "Sort field", default: "-record_date" },
                { name: "page[size]", type: "number", required: false, description: "Results per page", default: 100 },
            ],
        },
    ],
};
