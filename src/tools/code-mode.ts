import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { createSearchTool } from "@bio-mcp/shared/codemode/search-tool";
import { createExecuteTool } from "@bio-mcp/shared/codemode/execute-tool";
import { treasuryCatalog } from "../spec/catalog";
import { createTreasuryApiFetch } from "../lib/api-adapter";

interface CodeModeEnv {
    TREASURY_DATA_DO: DurableObjectNamespace;
    CODE_MODE_LOADER: WorkerLoader;
}

export function registerCodeMode(server: McpServer, env: CodeModeEnv): void {
    const apiFetch = createTreasuryApiFetch();

    const searchTool = createSearchTool({
        prefix: "treasury",
        catalog: treasuryCatalog,
    });
    searchTool.register(server as unknown as { tool: (...args: unknown[]) => void });

    const executeTool = createExecuteTool({
        prefix: "treasury",
        catalog: treasuryCatalog,
        apiFetch,
        doNamespace: env.TREASURY_DATA_DO,
        loader: env.CODE_MODE_LOADER,
    });
    executeTool.register(server as unknown as { tool: (...args: unknown[]) => void });
}
