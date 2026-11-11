import type { ApiFetchFn } from "@bio-mcp/shared/codemode/catalog";
import { observationPage } from "./observations";
import { readTreasury } from "./read";
import { releaseCalendar } from "./release-calendar";
import { resourceAliases } from "./resource-aliases";
import { readWebsiteService } from "./website-service";

export function createTreasuryApiFetch(proxyUrl?: string): ApiFetchFn {
    return async (request) => {
        if (request.method !== "GET" || request.body !== undefined) throw new Error("Treasury supports GET without a body");
        const params = { ...(request.params as Record<string, unknown> || {}) };
        if (request.path === "/release-calendar") return { status: 200, data: await releaseCalendar(params) };
        if (request.path === "/dataset-metadata") return { status: 200, data: await readWebsiteService("metadata", params) };
        if (request.path === "/observations") {
            return { status: 200, data: await observationPage(params, proxyUrl) };
        }
        if (params.format !== undefined && params.format !== "json") throw new Error("Use JSON format for Code Mode");
        return { status: 200, data: await readTreasury(canonicalPath(request.path), params, proxyUrl) };
    };
}

function canonicalPath(path: string): string {
    if (path === "/v2/accounting/od/tips_cpi_data") throw new Error("Choose /v1/accounting/od/tips_cpi_data_detail or tips_cpi_data_summary explicitly");
    if (path === "/v2/accounting/od/treasury_offset_program") throw new Error("Use the metadata-advertised /v1/debt/treasury_offset_program resource; inspect state_or_agency and debt_category rather than assuming separate federal/state tables");
    return resourceAliases[path] ?? path;
}
