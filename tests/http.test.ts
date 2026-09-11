import { request } from "node:http";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Workspace, startWeb } from "../src/server/http";
test("HTTP 验证令牌、Origin、Host、路径和版本冲突", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "projectflow-http-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const w = new Workspace();
  const bound = await w.bind(root, "HTTP 验证");
  const app = await startWeb(w, path.resolve("dist/web"));
  t.after(
    () => new Promise<void>((resolve) => app.server.close(() => resolve())),
  );
  const headers = {
    Authorization: `Bearer ${app.token}`,
    "Content-Type": "application/json",
  };
  assert.equal((await fetch(`${app.origin}/api/projects`)).status, 401);
  assert.equal(
    (
      await fetch(`${app.origin}/api/projects`, {
        headers: { ...headers, Origin: "https://evil.example" },
      })
    ).status,
    403,
  );
  const hostileHost = await new Promise<number>((resolve, reject) => {
    const req = request(
      `${app.origin}/api/projects`,
      { headers: { ...headers, Host: "evil.example" } },
      (response) => {
        response.resume();
        resolve(response.statusCode!);
      },
    );
    req.on("error", reject);
    req.end();
  });
  assert.equal(hostileHost, 403);
  assert.equal(
    (await fetch(`${app.origin}/api/context?project=unknown`, { headers }))
      .status,
    404,
  );
  const good = await fetch(`${app.origin}/api/projects`, { headers });
  assert.equal(good.status, 200);
  assert.equal((await good.json())[0].id, bound.project.id);
  const args = {
    project: bound.project.id,
    operation: "project.rename",
    args: { name: "已修改" },
    expectedRevision: 0,
    key: crypto.randomUUID(),
  };
  assert.equal(
    (
      await fetch(`${app.origin}/api/mutate`, {
        method: "POST",
        headers,
        body: JSON.stringify(args),
      })
    ).status,
    200,
  );
  assert.equal(
    (
      await fetch(`${app.origin}/api/mutate`, {
        method: "POST",
        headers,
        body: JSON.stringify({ ...args, key: crypto.randomUUID() }),
      })
    ).status,
    409,
  );
  const context = await (
    await fetch(`${app.origin}/api/context?project=${bound.project.id}`, {
      headers,
    })
  ).json();
  assert.deepEqual(context.state.receipts, {});
  assert.equal((await fetch(`${app.origin}/`)).status, 200);
  assert.equal(
    (await fetch(`${app.origin}/%2e%2e%2fpackage.json`)).status,
    403,
  );
});
