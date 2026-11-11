const TREASURY_BASE = "https://api.fiscaldata.treasury.gov/services/api/fiscal_service";

export interface TreasuryFetchOptions {
    baseUrl?: string;
    proxyUrl?: string;
    headers?: Record<string, string>;
    signal?: AbortSignal;
}

function buildQueryString(params: Record<string, unknown>): string {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
        if (value === undefined || value === null) continue;
        query.set(key, String(value));
    }
    return query.toString();
}

function resourceUrl(base: string, path: string): URL {
    if (!/^\/v[12]\/[a-z0-9_/]+$/.test(path) || path.includes("//")) {
        throw new Error("Expected a Fiscal Data /v1/ or /v2/ resource path without query text");
    }
    const url = new URL(`${base.replace(/\/$/, "")}${path}`);
    if (url.protocol !== "https:" || url.username || url.password || url.hash || url.search) {
        throw new Error("Invalid Treasury base URL");
    }
    return url;
}

/**
 * Fetch from the Treasury FiscalData API.
 *
 * A previous deployment reported egress failures; current availability is not assumed.
 * Configured proxies must accept the same relative Fiscal Data paths.
 */
export async function treasuryFetch(
    path: string,
    params?: Record<string, unknown>,
    opts?: TreasuryFetchOptions,
): Promise<Response> {
    const baseUrl = opts?.proxyUrl ?? opts?.baseUrl ?? TREASURY_BASE;
    const url = resourceUrl(baseUrl, path);
    if (params && Object.keys(params).length > 0) {
        url.search = buildQueryString(params);
    }

    return fetch(url, {
        method: "GET",
        signal: opts?.signal,
        redirect: "manual",
        headers: {
            Accept: "application/json",
            "User-Agent": "Mozilla/5.0 (compatible; treasury-mcp-server/1.0)",
            ...(opts?.headers ?? {}),
        },
    });
}
