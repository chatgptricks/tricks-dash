import test from "node:test";
import { fileURLToPath } from "node:url";
import assert from "node:assert/strict";
import { catalogue, execute, baseURL } from "./core.mjs";
const spec = { paths: {} };
spec.paths["/api/dashboard/me"] = { get: { summary: "Me" } };
spec.paths["/api/auth/custom-token"] = { post: {} };
spec.paths["/api/queue/{id}"] = {
  post: {
    parameters: [
      { in: "path", name: "id", required: true, schema: { type: "string" } },
    ],
    requestBody: {
      required: true,
      content: {
        "application/x-www-form-urlencoded": {
          schema: {
            type: "object",
            properties: { accounts: { type: "string" } },
            required: ["accounts"],
          },
        },
      },
    },
  },
};

const tools = catalogue(spec),
  write = tools.get("post_queue_id_");
test("discovery excludes credential minting and resolves typed tools", () => {
  assert.equal(tools.size, 2);
  assert.equal(write.write, true);
  assert.ok(
    write.validate({
      path: { id: "123" },
      body: { accounts: "[]" },
      confirm: true,
    }),
  );
});
test("writes require opt-in and confirm, invalid arguments never fetch", async () => {
  for (const [args, allowWrites] of [
    [{ path: { id: "1" }, body: { accounts: "[]" }, confirm: true }, false],
    [{ path: { id: "1" }, body: { accounts: "[]" } }, true],
  ])
    await assert.rejects(
      execute(write, args, {
        base: "https://example.com",
        token: "t",
        allowWrites,
        fetchImpl: () => {
          throw Error("should not fetch");
        },
      }),
      /Writes disabled|Invalid arguments/,
    );
});
test("auth, form serialization and HTTP errors preserved", async () => {
  const result = await execute(
    write,
    { path: { id: "a b" }, body: { accounts: "[]" }, confirm: true },
    {
      base: "https://example.com",
      token: "secret",
      allowWrites: true,
      fetchImpl: async (url, options) => {
        assert.equal(url.pathname, "/api/queue/a%20b");
        assert.equal(options.headers.Authorization, "Bearer secret");
        assert.equal(options.body.toString(), "accounts=%5B%5D");
        assert.equal(options.redirect, "error");
        return new Response('{"detail":"Denied"}', { status: 403 });
      },
    },
  );
  assert.equal(result.isError, true);
  assert.equal(JSON.parse(result.content[0].text).status, 403);
});
test("base and traversal constraints", async () => {
  assert.throws(() => baseURL("http://example.com"));
  assert.throws(() => baseURL("https://user:pass@example.com"));
  assert.equal(baseURL("http://localhost:8000"), "http://localhost:8000");
  await assert.rejects(
    execute(
      write,
      { path: { id: ".." }, body: { accounts: "[]" }, confirm: true },
      { base: "https://example.com", token: "t", allowWrites: true },
    ),
    /Invalid path/,
  );
});
test("real MCP client initializes, discovers and invokes tools over stdio", async () => {
  const { createServer } = await import("node:http");
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StdioClientTransport } =
    await import("@modelcontextprotocol/sdk/client/stdio.js");
  const api = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/openapi.json") res.end(JSON.stringify(spec));
    else {
      assert.equal(req.headers.authorization, "Bearer test-token");
      res.end(JSON.stringify({ email: "agent@example.com", is_admin: false }));
    }
  });
  await new Promise((r) => api.listen(0, "127.0.0.1", r));
  const client = new Client({ name: "integration-test", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [fileURLToPath(new URL("./server.mjs", import.meta.url))],
    env: {
      ...process.env,
      SENTIENT_API_BASE: `http://127.0.0.1:${api.address().port}`,
      SENTIENT_MCP_TOKEN: "test-token",
      SENTIENT_MCP_ALLOW_WRITES: "false",
    },
  });
  try {
    await client.connect(transport);
    const list = await client.listTools();
    assert.ok(list.tools.some((t) => t.name === "product_me"));
    assert.ok(!list.tools.some((t) => t.name === "post_queue_id_"));
    const result = await client.callTool({ name: "product_me", arguments: {} });
    assert.equal(
      JSON.parse(result.content[0].text).data.email,
      "agent@example.com",
    );
    const resources = await client.listResources();
    assert.equal(resources.resources[0].uri, "sentient://guide");
  } finally {
    await client.close();
    api.close();
  }
});

test("HTTP MCP authenticates each caller and rejects missing credentials", async () => {
  const { createServer } = await import("node:http");
  const { spawn } = await import("node:child_process");
  const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
  const { StreamableHTTPClientTransport } =
    await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
  const api = createServer((req, res) => {
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/openapi.json") res.end(JSON.stringify(spec));
    else if (req.headers.authorization === "Bearer sad_agent_" + "t".repeat(43))
      res.end('{"email":"http-agent@example.com","agent_access_mode":"read"}');
    else res.writeHead(401).end("{}");
  });
  await new Promise((r) => api.listen(0, "127.0.0.1", r));
  const reservation = createServer();
  await new Promise((r) => reservation.listen(0, "127.0.0.1", r));
  const port = reservation.address().port;
  await new Promise((r) => reservation.close(r));
  const child = spawn(
    process.execPath,
    [fileURLToPath(new URL("./server.mjs", import.meta.url)), "--http"],
    {
      env: {
        ...process.env,
        PORT: String(port),
        SENTIENT_API_BASE: `http://127.0.0.1:${api.address().port}`,
        SENTIENT_MCP_ALLOW_WRITES: "true",
      },
      stdio: ["ignore", "ignore", "pipe"],
    },
  );
  const client = new Client({ name: "http-test", version: "1.0.0" });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(Error("Server startup timeout")),
        10000,
      );
      child.stderr.on("data", (d) => {
        if (String(d).includes("listening")) {
          clearTimeout(timer);
          resolve();
        }
      });
      child.on("exit", () => {
        clearTimeout(timer);
        reject(Error("Server exited"));
      });
    });
    const url = new URL(`http://127.0.0.1:${port}/mcp`);
    assert.equal((await fetch(url, { method: "POST" })).status, 401);
    assert.equal(
      (
        await fetch(url, {
          method: "POST",
          headers: { Authorization: "Bearer wrong" },
        })
      ).status,
      401,
    );
    const transport = new StreamableHTTPClientTransport(url, {
      requestInit: {
        headers: { Authorization: "Bearer sad_agent_" + "t".repeat(43) },
      },
    });
    await client.connect(transport);
    const discovery = await client.listTools();
    assert.ok(!discovery.tools.some(t => t.name === "post_queue_id_"));
    const result = await client.callTool({ name: "product_me", arguments: {} });
    assert.equal(
      JSON.parse(result.content[0].text).data.email,
      "http-agent@example.com",
    );
  } finally {
    await client.close();
    child.kill();
    api.close();
  }
});
