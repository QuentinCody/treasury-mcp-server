import { createExecuteTool } from "@bio-mcp/shared/codemode/execute-tool";
import { createSearchTool } from "@bio-mcp/shared/codemode/search-tool";
import type { McpServer } from "@bio-mcp/shared/mcp";
import { createTreasuryApiFetch } from "../lib/api-adapter";
import { treasuryResponse } from "../lib/tool-result";
import { treasuryCatalog } from "../spec/catalog";

interface CodeModeEnv {
    TREASURY_DATA_DO: DurableObjectNamespace;
    CODE_MODE_LOADER: WorkerLoader;
    TREASURY_PROXY_URL?: string;
}

export function registerCodeMode(server: McpServer, env: CodeModeEnv): void {
    const apiFetch = createTreasuryApiFetch(env.TREASURY_PROXY_URL);
    const registrar = { tool: (...args: unknown[]) => {
        const [name, ...rest] = args;
        const handler = rest.pop() as (args: unknown, extra: unknown) => ReturnType<Parameters<typeof treasuryResponse>[0]>;
        const respond = (args: unknown, extra: unknown) => treasuryResponse(() => handler(args, extra), env, String(name), extra, args);
        // SAFETY: shared factories supply the SDK arguments; only the alias changes.
        const register = server.tool.bind(server) as (...values: unknown[]) => void;
        register(name, ...rest, respond); register(`mcp_${String(name)}`, ...rest, respond);
    } };

    const searchTool = createSearchTool({
        prefix: "treasury",
        catalog: treasuryCatalog,
    });
    searchTool.register(registrar);

    const executeTool = createExecuteTool({
        prefix: "treasury",
        // Verifiable provenance: treasury_execute results carry a _meta.citation.
        source: { id: "treasury", name: "U.S. Treasury Fiscal Data", url: "https://fiscaldata.treasury.gov", license: "U.S. Public Domain" },
        catalog: treasuryCatalog,
        apiFetch,
        preserveApiErrors: true,
        doNamespace: env.TREASURY_DATA_DO,
        loader: env.CODE_MODE_LOADER,
        maxInlineBytes: 30 * 1024,
        stagingThreshold: 30 * 1024,
        timeout: 60000,
    });
    executeTool.register(registrar);
}
