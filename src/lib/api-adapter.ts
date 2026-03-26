import type { ApiFetchFn } from "@bio-mcp/shared/codemode/catalog";
import { treasuryFetch } from "./http";

let envProxyUrl: string | undefined;

export function setTreasuryProxyUrl(url: string | undefined): void {
    envProxyUrl = url;
}

export function createTreasuryApiFetch(): ApiFetchFn {
    return async (request) => {
        const params = { ...(request.params as Record<string, unknown> || {}) };

        const response = await treasuryFetch(request.path, params, { proxyUrl: envProxyUrl });

        if (!response.ok) {
            const errorBody = await response.text().catch(() => response.statusText);
            const error = new Error(`HTTP ${response.status}: ${errorBody.slice(0, 200)}`) as Error & {
                status: number;
                data: unknown;
            };
            error.status = response.status;
            error.data = errorBody;
            throw error;
        }

        const data = await response.json();
        return { status: response.status, data };
    };
}
