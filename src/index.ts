import { buildHealthResponse, configureCitationSigning } from "@bio-mcp/shared";
import { McpServer, StatelessMcpWorker } from "@bio-mcp/shared/mcp";
import { TreasuryDataDO } from "./do";
import { registerCodeMode } from "./tools/code-mode";
import { registerGetSchema } from "./tools/get-schema";
import { registerQueryData } from "./tools/query-data";

export { TreasuryDataDO };

interface TreasuryEnv {
    TREASURY_DATA_DO: DurableObjectNamespace;
    CODE_MODE_LOADER: WorkerLoader;
    TREASURY_PROXY_URL?: string;
}

export class MyMCP extends StatelessMcpWorker {
    server = new McpServer({
        name: "treasury",
        version: "0.1.0",
    });

    async init() {

    	configureCitationSigning(this.env);
        const env = this.env as unknown as TreasuryEnv;
        registerQueryData(this.server, env);
        registerGetSchema(this.server, env);
        registerCodeMode(this.server, env);
    }
}

export default {
    fetch(request: Request, env: Env, ctx: ExecutionContext) {
        const url = new URL(request.url);

        if (url.pathname === "/health") {
            return buildHealthResponse("treasury");
        }

        if (url.pathname === "/readyz") {
            return MyMCP.readiness(env, "treasury");
        }

        if (url.pathname === "/mcp") {
            return MyMCP.serve("/mcp").fetch(request, env, ctx);
        }

        return new Response("Not found", { status: 404 });
    },
};
