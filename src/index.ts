import { McpAgent } from "agents/mcp";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { registerQueryData } from "./tools/query-data";
import { registerGetSchema } from "./tools/get-schema";
import { registerCodeMode } from "./tools/code-mode";
import { setTreasuryProxyUrl } from "./lib/api-adapter";
import { TreasuryDataDO } from "./do";

export { TreasuryDataDO };

interface TreasuryEnv {
    TREASURY_DATA_DO: DurableObjectNamespace;
    CODE_MODE_LOADER: WorkerLoader;
    TREASURY_PROXY_URL?: string;
}

export class MyMCP extends McpAgent {
    server = new McpServer({
        name: "treasury",
        version: "0.1.0",
    });

    async init() {
        const env = this.env as unknown as TreasuryEnv;
        if (env.TREASURY_PROXY_URL) {
            setTreasuryProxyUrl(env.TREASURY_PROXY_URL);
        }
        registerQueryData(this.server, env);
        registerGetSchema(this.server, env);
        registerCodeMode(this.server, env);
    }
}

export default {
    fetch(request: Request, env: Env, ctx: ExecutionContext) {
        const url = new URL(request.url);

        if (url.pathname === "/health") {
            return new Response("ok", {
                status: 200,
                headers: { "content-type": "text/plain" },
            });
        }

        if (url.pathname === "/mcp") {
            return MyMCP.serve("/mcp", { binding: "MCP_OBJECT" }).fetch(request, env, ctx);
        }

        return new Response("Not found", { status: 404 });
    },
};
