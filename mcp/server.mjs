import { createServer } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { readFile } from "node:fs/promises";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { baseURL, catalogue, execute, instructions, pages } from "./core.mjs";
const base = baseURL(process.env.SENTIENT_API_BASE);
const r = await fetch(`${base}/openapi.json`, {
  redirect: "error",
  signal: AbortSignal.timeout(30000),
});
if (!r.ok) throw Error(`OpenAPI discovery failed: ${r.status}`);
const tools = catalogue(await r.json()),
  allowWrites = process.env.SENTIENT_MCP_ALLOW_WRITES === "true";
function makeServer(requestToken, accessMode) {
  const effectiveWrites = allowWrites && accessMode !== "read";
  const server = new Server(
    { name: "sentient-dash", version: "1.0.0" },
    { capabilities: { tools: {}, resources: {} }, instructions },
  );
  const schema = {
    type: "object",
    properties: {},
    additionalProperties: false,
  };
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: [
      {
        name: "product_guide",
        description:
          "Start here: product map, agent workflows, auth and policy.",
        inputSchema: schema,
        annotations: { readOnlyHint: true },
      },
      {
        name: "product_me",
        description: "Get signed-in user and permissions.",
        inputSchema: schema,
        annotations: { readOnlyHint: true },
      },
      ...[...tools.values()]
        .filter((t) => !t.write || effectiveWrites)
        .map(({ name, description, inputSchema, annotations }) => ({
          name,
          description,
          inputSchema,
          annotations,
        })),
    ],
  }));
  server.setRequestHandler(ListResourcesRequestSchema, async () => ({
    resources: [
      { uri: "sentient://guide", name: "Agent guide", mimeType: "text/plain" },
    ],
  }));
  server.setRequestHandler(ReadResourceRequestSchema, async ({ params }) => {
    if (params.uri !== "sentient://guide") throw Error("Unknown resource");
    return {
      contents: [
        {
          uri: params.uri,
          mimeType: "text/plain",
          text: instructions + "\n" + JSON.stringify(pages),
        },
      ],
    };
  });
  server.setRequestHandler(CallToolRequestSchema, async ({ params }) => {
    try {
      if (params.name === "product_guide")
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify({
                instructions,
                website: "https://sentientdash.app",
                pages,
                api: base,
                operations: tools.size,
              }),
            },
          ],
        };
      const tool =
        params.name === "product_me"
          ? [...tools.values()].find(
              (t) => t.path === "/api/dashboard/me" && t.method === "get",
            )
          : tools.get(params.name);
      if (!tool) throw Error("Unknown tool");
      const token =
        requestToken ||
        (process.env.SENTIENT_MCP_TOKEN_FILE
          ? (await readFile(process.env.SENTIENT_MCP_TOKEN_FILE, "utf8")).trim()
          : process.env.SENTIENT_MCP_TOKEN);
      return await execute(tool, params.arguments || {}, {
        base,
        token,
        allowWrites: effectiveWrites,
      });
    } catch (e) {
      return {
        isError: true,
        content: [
          {
            type: "text",
            text: String(e.message).replaceAll(
              process.env.SENTIENT_MCP_TOKEN || "\0",
              "[redacted]",
            ),
          },
        ],
      };
    }
  });
  return server;
}
if (process.argv.includes("--http")) {
  const host = process.env.SENTIENT_MCP_HOST || "127.0.0.1";
  const allowedHosts = (
    process.env.SENTIENT_MCP_ALLOWED_HOSTS || "localhost,127.0.0.1"
  ).split(",");
  const http = createServer(async (req, res) => {
    if (req.url !== "/mcp") {
      res.writeHead(404).end();
      return;
    }
    const hostname = (req.headers.host || "").split(":")[0];
    if (!allowedHosts.includes(hostname) || req.headers.origin) {
      res.writeHead(403).end();
      return;
    }
    if (req.method !== "POST") {
      res.writeHead(405, { Allow: "POST" }).end();
      return;
    }
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token) {
      res
        .writeHead(401)
        .end("Bearer agent connection key or Firebase ID token required");
      return;
    }
    let accessMode;
    // Authenticate before allowing even tool discovery; no shared user session.
    try {
      const auth = await fetch(`${base}/api/dashboard/me`, {
        headers: { Authorization: `Bearer ${token}` },
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
      if (!auth.ok) {
        res.writeHead(auth.status === 403 ? 403 : 401).end("Unauthorized");
        return;
      }
      accessMode = (await auth.json()).agent_access_mode;
    } catch {
      res.writeHead(503).end("Authentication unavailable");
      return;
    }
    const server = makeServer(token, accessMode),
      transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: undefined,
        enableJsonResponse: true,
      });
    res.on("close", () => {
      transport.close();
      server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res);
    } catch {
      if (!res.headersSent) res.writeHead(500).end("MCP request failed");
    }
  });
  http.listen(Number(process.env.PORT || 3100), host, () =>
    console.error(`Sentient MCP HTTP listening on ${host}`),
  );
} else await makeServer().connect(new StdioServerTransport());
