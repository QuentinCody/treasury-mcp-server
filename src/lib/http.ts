const TREASURY_BASE = "https://api.fiscaldata.treasury.gov/services/api/fiscal_service";

export interface TreasuryFetchOptions {
    baseUrl?: string;
    proxyUrl?: string;
    headers?: Record<string, string>;
}

function buildQueryString(params: Record<string, unknown>): string {
    const parts: string[] = [];
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null) continue;
        // Preserve bracket-notation keys like page[size] without double-encoding
        parts.push(`${key}=${encodeURIComponent(String(value))}`);
    }
    return parts.join("&");
}

/**
 * Fetch from the Treasury FiscalData API.
 *
 * KNOWN ISSUE: api.fiscaldata.treasury.gov's F5 BIG-IP load balancer rejects
 * TLS connections from Cloudflare Worker egress IPs (HTTP 525). This is a
 * network-level block, not a code issue. The API works from non-CF environments.
 * To resolve: set TREASURY_PROXY_URL to a proxy that forwards to the Treasury API.
 */
export async function treasuryFetch(
    path: string,
    params?: Record<string, unknown>,
    opts?: TreasuryFetchOptions,
): Promise<Response> {
    const baseUrl = opts?.proxyUrl ?? opts?.baseUrl ?? TREASURY_BASE;
    let url = `${baseUrl.replace(/\/$/, "")}${path}`;
    if (params && Object.keys(params).length > 0) {
        url += `?${buildQueryString(params)}`;
    }

    return fetch(url, {
        method: "GET",
        headers: {
            Accept: "application/json",
            "User-Agent": "Mozilla/5.0 (compatible; treasury-mcp-server/1.0)",
            ...(opts?.headers ?? {}),
        },
    });
}
