import { RestStagingDO } from "@bio-mcp/shared/staging/rest-staging-do";
import type { SchemaHints } from "@bio-mcp/shared/staging/schema-inference";

export class TreasuryDataDO extends RestStagingDO {
    protected getSchemaHints(data: unknown): SchemaHints | undefined {
        if (!data || typeof data !== "object") return undefined;

        const obj = data as Record<string, unknown>;

        // Standard FiscalData response: { data: [...], meta: {...} }
        if (obj.data && Array.isArray(obj.data)) {
            const sample = obj.data[0] as Record<string, unknown> | undefined;
            if (!sample) return undefined;

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
