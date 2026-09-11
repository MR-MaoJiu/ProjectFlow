import sharp from "sharp";
import { readFile } from "node:fs/promises";
import { blankDesign } from "../src/shared/model";
import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
async function connect() {
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.resolve("dist/server.mjs")],
    stderr: "pipe",
  });
  const client = new Client({
    name: "projectflow-contract-test",
    version: "1.0.0",
  });
  await client.connect(transport);
  return client;
}
const parsed = (r: any) =>
  JSON.parse(r.content.find((c: any) => c.type === "text").text);
test("标准 MCP 客户端完成绑定、请求、工具图像、UI 资源和新进程恢复", async (t) => {
  const root = await mkdtemp(path.join(os.tmpdir(), "projectflow-mcp-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const c = await connect();
  t.after(() => c.close());
  const list = await c.listTools();
  assert.equal(list.tools.length, 8);
  const bound = parsed(
    await c.callTool({
      name: "projectflow_bind",
      arguments: { root, name: "协议验收项目" },
    }),
  );
  const project = bound.project.id;
  let summary = parsed(
    await c.callTool({
      name: "projectflow_read",
      arguments: { project, section: "summary" },
    }),
  );
  assert.equal(summary.revision, 0);
  const result = parsed(
    await c.callTool({
      name: "projectflow_mutate",
      arguments: {
        project,
        operation: "artifact.save",
        expectedRevision: 0,
        key: crypto.randomUUID(),
        args: {
          iterationId: summary.iterations[0].id,
          kind: "brief",
          expectedVersion: 0,
          title: "从想法开始",
          body: "# 目标\n验证插件通过 MCP 保留真实项目数据。",
        },
      },
    }),
  );
  assert.equal(result.version, 1);
  const workbench: any = await c.callTool({
    name: "projectflow_workbench",
    arguments: { project },
  });
  assert.ok(workbench.structuredContent.url.startsWith("http://127.0.0.1:"));
  const resources = await c.listResources();
  assert.equal(resources.resources[0].uri, "ui://projectflow/summary.html");
  const ui = await c.readResource({ uri: resources.resources[0].uri });
  assert.match((ui.contents[0] as any).text, /ProjectFlow/);
  const bad = await c.callTool({
    name: "projectflow_mutate",
    arguments: {
      project,
      operation: "project.rename",
      expectedRevision: 0,
      key: crypto.randomUUID(),
      args: { name: "旧版" },
    },
  });
  assert.equal(bad.isError, true);
  const design = parsed(
    await c.callTool({
      name: "projectflow_mutate",
      arguments: {
        project,
        operation: "artifact.save",
        expectedRevision: 1,
        key: crypto.randomUUID(),
        args: {
          iterationId: summary.iterations[0].id,
          kind: "design",
          expectedVersion: 0,
          title: "协议图像验证",
          body: "验证真实图像返回和本地文件导出。",
          data: blankDesign,
        },
      },
    }),
  );
  const image: any = await c.callTool({
    name: "projectflow_preview",
    arguments: { project, ref: { id: design.id, version: 1 } },
  });
  assert.equal(image.content[0].type, "image");
  assert.equal(
    (await sharp(Buffer.from(image.content[0].data, "base64")).metadata())
      .width,
    390,
  );
  const exported = parsed(
    await c.callTool({
      name: "projectflow_export",
      arguments: {
        project,
        ref: { id: design.id, version: 1 },
        nodeId: "page",
        format: "png",
        scale: 2,
      },
    }),
  );
  assert.equal(
    (await sharp(await readFile(exported.path)).metadata()).width,
    780,
  );
  await c.close();
  const next = await connect();
  t.after(() => next.close());
  await next.callTool({ name: "projectflow_bind", arguments: { root } });
  summary = parsed(
    await next.callTool({
      name: "projectflow_read",
      arguments: { project, section: "summary" },
    }),
  );
  assert.equal(summary.artifacts[0].id, result.id);
  assert.equal(summary.revision, 2);
});
