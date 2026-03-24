import { restFetch } from "@bio-mcp/shared/http/rest-fetch";
import type { RestFetchOptions } from "@bio-mcp/shared/http/rest-fetch";

const TREASURY_BASE = "https://api.fiscaldata.treasury.gov/services/api/fiscal_service";

export interface TreasuryFetchOptions extends Omit<RestFetchOptions, "retryOn"> {
    baseUrl?: string;
}

/**
 * Fetch from the Treasury FiscalData API.
 * No auth required.
 */
export async function treasuryFetch(
    path: string,
    params?: Record<string, unknown>,
    opts?: TreasuryFetchOptions,
): Promise<Response> {
    const baseUrl = opts?.baseUrl ?? TREASURY_BASE;

    return restFetch(baseUrl, path, params, {
        ...opts,
        headers: {
            Accept: "application/json",
            ...(opts?.headers ?? {}),
        },
        retryOn: [429, 500, 502, 503],
        retries: opts?.retries ?? 2,
        timeout: opts?.timeout ?? 30_000,
        userAgent: "treasury-mcp-server/1.0 (bio-mcp)",
    });
}
