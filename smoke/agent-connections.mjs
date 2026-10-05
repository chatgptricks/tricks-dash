import assert from "node:assert/strict";
import {existsSync} from "node:fs";
import { createServer } from "node:http";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { build } from "esbuild";
import { chromium } from "playwright";

const directory = path.resolve("work/agent-connections");
await mkdir(directory, { recursive: true });
await build({
  entryPoints: ["src/agents.jsx"],
  bundle: true,
  outdir: directory,
  format: "esm",
  platform: "browser",
  jsx: "automatic",
  define: {
    "import.meta.env.VITE_API_BASE": '"https://api.test"',
    "import.meta.env.BASE_URL": '"/"',
    "import.meta.env.MODE": '"test"',
    "import.meta.env.DEV": "false",
    "import.meta.env.PROD": "true",
  },
  alias: {
    "firebase/app": path.resolve("smoke/stub-firebase-app.js"),
    "firebase/auth": path.resolve("smoke/stub-firebase-auth.js"),
  },
});
const http = createServer(async (req, res) => {
  try {
    if (req.url === "/") {
      res.setHeader("Content-Type", "text/html");
      res.end(
        '<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/agents.css"></head><body><div id="root"></div><script type="module" src="/agents.js"></script></body></html>',
      );
    } else {
      res.setHeader(
        "Content-Type",
        req.url.endsWith(".css") ? "text/css" : "application/javascript",
      );
      res.end(await readFile(path.join(directory, req.url.slice(1))));
    }
  } catch {
    res.writeHead(404).end();
  }
});
await new Promise((r) => http.listen(0, "127.0.0.1", r));
const chrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH || (existsSync(chrome) ? chrome : undefined)});
try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } }),
      errors = [];
    page.setDefaultTimeout(10000);
    page.on("console", (m) => {
      if (m.type() === "error") console.error(m.text());
    });
    page.on("pageerror", (e) => errors.push(e.message));
    let saved = null,
      failRevoke = false;
    const key = "sad_agent_" + "x".repeat(43); // Fabricated test value, never a production credential.
    await page.route("https://api.test/**", async (route) => {
      const req = route.request();
      assert.equal(req.headers().authorization, "Bearer tok");
      if (req.method() === "POST") {
        const payload = req.postDataJSON();
        assert.equal(payload.name, "My Dots");
        saved = {
          id: "test-id",
          name: payload.name,
          access_mode: payload.access_mode,
          expires_at: "2099-01-01T00:00:00Z",
          revoked_at: null,
          last_used_at: null,
        };
        await route.fulfill({
          status: 201,
          contentType: "application/json",
          body: JSON.stringify({ key, connection: saved }),
        });
      } else if (req.method() === "DELETE") {
        if (failRevoke)
          await route.fulfill({
            status: 403,
            contentType: "application/json",
            body: '{"detail":"Revoke denied"}',
          });
        else {
          saved.revoked_at = new Date().toISOString();
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: '{"revoked":true}',
          });
        }
      } else
        await route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({ connections: saved ? [saved] : [] }),
        });
    });
    await page.goto(`http://127.0.0.1:${http.address().port}`);
    console.log("Loaded agent page", width);
    await page.getByText("No agents connected yet.").waitFor();
    await page.getByLabel("Agent name").fill("My Dots");
    await page
      .getByRole("button", { name: "Generate connection code" })
      .click();
    await page
      .getByRole("heading", { name: "Your connection code", exact: true })
      .waitFor();
    assert.equal(
      await page.getByLabel("Connection code", { exact: true }).inputValue(),
      key,
    );
    assert.equal(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
      true,
    );
    await page.screenshot({
      path: path.join(directory, `agents-${width}.png`),
      fullPage: true,
    });
    await page.getByRole("button", { name: "I saved the code" }).click();
    assert.equal(
      await page.getByLabel("Connection code", { exact: true }).count(),
      0,
    );
    await page.getByRole("button", { name: "Revoke", exact: true }).click();
    failRevoke = true;
    await page.getByRole("button", { name: "Confirm revoke" }).click();
    await page
      .getByRole("alert")
      .filter({ hasText: "Revoke denied" })
      .waitFor();
    assert.equal(
      await page
        .getByText("Full account access · Active", { exact: true })
        .count(),
      1,
    );
    failRevoke = false;
    await page.getByRole("button", { name: "Confirm revoke" }).click();
    await page
      .getByText("Full account access · Revoked", { exact: true })
      .waitFor();
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(
    "Agent connection desktop/mobile create, one-time display, failed revoke and successful revoke checks passed.",
  );
} finally {
  await browser.close();
  http.close();
}
