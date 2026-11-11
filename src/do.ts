import { RestStagingDO } from "@bio-mcp/shared/staging/rest-staging-do";
import type { SchemaHints } from "@bio-mcp/shared/staging/schema-inference";

type Row = Record<string, unknown>;
const record = (value: unknown): value is Row => value !== null && typeof value === "object" && !Array.isArray(value);
const row = (value: unknown, index: number): Row => ({
    ...(record(value) ? Object.fromEntries(Object.entries(value).filter(([key]) => key !== "_rowid").map(([key, item]) =>
        [key, item !== null && typeof item === "object" ? JSON.stringify(item) : item])) : { value }),
    native_json: JSON.stringify(value), source_index: index,
});

export class TreasuryDataDO extends RestStagingDO {
    protected getTabularData(value: unknown): unknown {
        const data = record(value) && Array.isArray(value.content) && record(value.structuredContent) && "data" in value.structuredContent
            ? value.structuredContent.data : value;
        if (Array.isArray(data)) return { native_records: data.map(row) };
        if (!record(data)) return data;
        if (typeof data.sql === "string" && Array.isArray(data.rows)) return { query_rows: data.rows.map(row) };
        if (Array.isArray(data.native) && record(data.source)) {
            const tables: Record<string, Row[]> = { discovery_snapshot: [row(data.source, 0)] };
            if (data.source.kind === "metadata") {
                tables.dataset_metadata = []; tables.dataset_apis = []; tables.dataset_fields = [];
                data.native.forEach((dataset, datasetIndex) => {
                    if (!record(dataset)) return;
                    const { apis, ...context } = dataset;
                    tables.dataset_metadata.push(row(context, datasetIndex));
                    if (!Array.isArray(apis)) return;
                    apis.forEach((api, apiIndex) => {
                        if (!record(api)) return;
                        const { fields, ...apiContext } = api;
                        const parent = { parent_dataset_id: dataset.dataset_id, dataset_index: datasetIndex, api_index: apiIndex };
                        tables.dataset_apis.push({ ...row(apiContext, apiIndex), ...parent });
                        if (Array.isArray(fields)) fields.forEach((field, fieldIndex) => {
                            tables.dataset_fields.push({ ...row(field, fieldIndex), ...parent, parent_api_id: api.api_id, field_index: fieldIndex });
                        });
                    });
                });
            } else tables.release_calendar = data.native.map(row);
            return tables;
        }
        if (Array.isArray(data.data)) {
            const { data: nativeRows, ...context } = data;
            return { [this.observationHints(data)?.tableName ?? "treasury_data"]: nativeRows.map(row),
                response_context: [{ native_json: JSON.stringify(context) }] };
        }
        return { native_objects: [row(data, 0)] };
    }

    protected getSchemaHints(value: unknown): SchemaHints {
        const tables = this.getTabularData(value);
        const columnTypes: Record<string, string> = { native_json: "TEXT" };
        if (record(tables)) for (const values of Object.values(tables)) {
            if (!Array.isArray(values)) continue;
            for (const item of values) if (record(item)) for (const [key, cell] of Object.entries(item)) {
                if (typeof cell === "string") columnTypes[key] = "TEXT";
            }
        }
        return { columnTypes };
    }

    private observationHints(data: unknown): SchemaHints | undefined {
        if (!data || typeof data !== "object") return undefined;

        const obj = data as Record<string, unknown>;

        // Standard FiscalData response: { data: [...], meta: {...} }
        if (obj.data && Array.isArray(obj.data)) {
            const sample = obj.data[0] as Record<string, unknown> | undefined;
            if (!sample) return undefined;

            if ("net_offset_amt" in sample) return { tableName: "treasury_offsets" };

            // Interest rates
            if (sample.avg_interest_rate_amt || sample.security_type_desc) {
                return {
                    tableName: "interest_rates",
                    indexes: ["record_date", "security_type_desc"],
                };
            }

            // Debt to the penny
            if (sample.tot_pub_debt_out_amt || sample.debt_held_public_amt) {
                return {
                    tableName: "debt_outstanding",
                    indexes: ["record_date"],
                };
            }

            // Monthly Treasury Statement revenue
            if (sample.current_month_net_rcpt_amt || sample.classification_desc) {
                return {
                    tableName: "revenue",
                    indexes: ["record_date", "classification_desc"],
                };
            }

            // Exchange rates
            if (sample.exchange_rate || sample.country_currency_desc) {
                return {
                    tableName: "exchange_rates",
                    indexes: ["record_date", "country_currency_desc"],
                };
            }

            // Auction results
            if (sample.high_yield_pct || sample.bid_to_cover_ratio) {
                return {
                    tableName: "auctions",
                    indexes: ["auction_date", "security_type"],
                };
            }

            // Savings bonds
            if (sample.redemption_value_amt || sample.issue_year_month) {
                return {
                    tableName: "savings_bonds",
                    indexes: ["issue_year_month", "redemp_period"],
                };
            }

            // TIPS CPI data
            if (sample.index_ratio || sample.ref_cpi_on_dated_date) {
                return {
                    tableName: "tips_cpi",
                    indexes: ["record_date", "cusip"],
                };
            }

            // Gold reserve
            if (sample.book_value_amt && sample.fine_troy_ounce_qty) {
                return {
                    tableName: "gold_reserve",
                    indexes: ["record_date"],
                };
            }

            // Generic with record_date
            if (sample.record_date) {
                return {
                    tableName: "treasury_data",
                    indexes: ["record_date"],
                };
            }
        }

        return undefined;
    }
}
