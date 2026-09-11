import { reviewDesign } from "./design-quality.js";
import { summaryWidget } from "./widget.js";
import { hash } from "./store.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { promises as fs } from "node:fs";
import path from "node:path";
import { Workspace, startWeb } from "./http.js";
import { renderDesign } from "./render.js";
import { refSchema, latestArtifacts, affected } from "../shared/model.js";
import { ensure } from "./errors.js";
const workspace = new Workspace();
const arg = (name: string) => {
  const i = process.argv.indexOf(name);
  return i < 0 ? undefined : process.argv[i + 1];
};
const root = arg("--project");
if (root) await workspace.bind(root, arg("--name"));
const web = await startWeb(workspace, undefined, Number(arg("--port") ?? 0));
const mcp = new McpServer({ name: "projectflow", version: "0.4.0" });
const result = (data: unknown) => ({
  content: [{ type: "text" as const, text: JSON.stringify(data) }],
});
const wrap = (fn: (args: any) => Promise<any>) => async (args: any) => {
  try {
    return await fn(args);
  } catch (e) {
    return {
      isError: true,
      content: [
        {
          type: "text" as const,
          text: JSON.stringify({
            code: (e as any).code ?? "INVALID",
            message: (e as Error).message,
          }),
        },
      ],
    };
  }
};
mcp.registerTool(
  "projectflow_bind",
  {
    description:
      "绑定用户已明确选择的本地项目根目录。新项目需提供 name。不会创建 Codex 会话、调用模型或提交代码。",
    inputSchema: { root: z.string(), name: z.string().optional() },
  },
  wrap(async (a) => {
    const b = await workspace.bind(a.root, a.name);
    return result({ ...b, workbench: web.url(b.project.id) });
  }),
);
mcp.registerTool(
  "projectflow_projects",
  {
    description:
      "列出当前 MCP 服务已绑定项目。新会话需要用项目路径重新绑定，资产不会丢失。",
    inputSchema: {},
  },
  wrap(async () => result(await workspace.list())),
);
mcp.registerTool(
  "projectflow_read",
  {
    description:
      "按需读取项目摘要、指定产物版本、请求及其固定上下文、交付包或证据。summary 返回 revision、阶段、索引及待办，不包含全部文档。完整设计数据用 artifact，图像用 preview。",
    inputSchema: {
      project: z.string(),
      section: z.enum([
        "summary",
        "artifact",
        "request",
        "bundle",
        "evidence",
        "impact",
        "events",
      ]),
      id: z.string().optional(),
      version: z.number().int().positive().optional(),
      offset: z.number().int().nonnegative().default(0),
      limit: z.number().int().min(1).max(100).default(30),
    },
  },
  wrap(async (a) => {
    const store = workspace.get(a.project),
      s = await store.read();
    let data: unknown;
    if (a.section === "summary")
      data = {
        project: s.project,
        root: store.root,
        revision: s.revision,
        iterations: s.iterations,
        capabilities: s.capabilities,
        artifacts: latestArtifacts(s).map(
          ({ id, version, title, kind, iterationId, refs }) => ({
            id,
            version,
            title,
            kind,
            iterationId,
            refs,
          }),
        ),
        requests: s.requests.map(({ lease, ...r }) => ({
          ...r,
          lease: lease
            ? { owner: lease.owner, expiresAt: lease.expiresAt }
            : undefined,
        })),
        bundles: s.bundles.map(({ id, title, hash, iterationId }) => ({
          id,
          title,
          hash,
          iterationId,
        })),
        confirmations: s.confirmations,
        repository: await store.repository(),
      };
    else if (a.section === "artifact") {
      data = s.artifacts.find(
        (x) =>
          x.id === a.id &&
          x.version ===
            (a.version ??
              Math.max(
                ...s.artifacts
                  .filter((x) => x.id === a.id)
                  .map((x) => x.version),
              )),
      );
    } else if (a.section === "request") {
      const r = s.requests.find((x) => x.id === a.id);
      ensure(r, "NOT_FOUND", "请求不存在");
      const { lease, ...request } = r;
      data = {
        request,
        context: r.refs.map((ref) =>
          s.artifacts.find((x) => x.id === ref.id && x.version === ref.version),
        ),
        bundle: r.bundleId
          ? s.bundles.find((b) => b.id === r.bundleId)
          : undefined,
        repository: await store.repository(),
      };
    } else if (a.section === "bundle")
      data = s.bundles.find((x) => x.id === a.id);
    else if (a.section === "impact") data = affected(s, a.id ?? "");
    else {
      const list = a.section === "evidence" ? s.evidence : s.events;
      data = {
        items: list.slice(a.offset, a.offset + a.limit),
        total: list.length,
        nextOffset:
          a.offset + a.limit < list.length ? a.offset + a.limit : null,
      };
    }
    ensure(data, "NOT_FOUND", "对象不存在");
    if (a.section === "artifact" && (data as any).kind === "design")
      data = {
        ...(data as object),
        quality: reviewDesign(
          store.validateDesign((data as any).data, s),
          s.assets,
        ),
      };
    return result(data);
  }),
);
mcp.registerTool(
  "projectflow_mutate",
  {
    description:
      "写入本地项目。先 read summary 取得 expectedRevision，key 使用唯一 UUID，重试复用同一 key。operation: iteration.create/project.rename/artifact.save/artifact.confirm/artifact.comment/request.create/request.claim/request.recover/request.update/evidence.add/bundle.create/stage.advance/capability.set/feedback.convert。详细参数见插件 references/contracts.md。确认操作仅在用户明确确认具体版本后使用。执行结束不等于验收通过。",
    inputSchema: {
      project: z.string(),
      operation: z.string(),
      args: z.record(z.unknown()),
      expectedRevision: z.number().int().nonnegative(),
      key: z.string().min(8),
      actor: z.string().default("Codex"),
    },
  },
  wrap(async (a) =>
    result(
      await workspace
        .get(a.project)
        .mutate(a.operation, a.args, a.expectedRevision, a.key, a.actor),
    ),
  ),
);
mcp.registerTool(
  "projectflow_asset_import",
  {
    description:
      "登记已在用户项目内的 PNG/JPEG/WebP 图片，独立保存为不可变 PNG。生成工具输出在项目外时，请由 Codex 经授权先复制到项目。",
    inputSchema: {
      project: z.string(),
      relativePath: z.string(),
      name: z.string(),
      source: z.string(),
      expectedRevision: z.number().int(),
      key: z.string().min(8),
    },
  },
  wrap(async (a) =>
    result(
      await workspace
        .get(a.project)
        .importPath(
          a.relativePath,
          a.name,
          a.source,
          a.expectedRevision,
          a.key,
          "Codex",
        ),
    ),
  ),
);
mcp.registerTool(
  "projectflow_preview",
  {
    description: "读取指定设计版本/节点的真实渲染预览，返回图片给 Codex 查看。",
    inputSchema: {
      project: z.string(),
      ref: refSchema,
      nodeId: z.string().optional(),
    },
  },
  wrap(async (a) => {
    const r = await renderDesign(workspace.get(a.project), a.ref, a.nodeId);
    return {
      content: [
        {
          type: "image",
          data: r.bytes.toString("base64"),
          mimeType: "image/png",
        },
      ],
    };
  }),
);
mcp.registerTool(
  "projectflow_export",
  {
    description:
      "导出独立素材或设计节点到项目 .projectflow/exports。图片节点不能冒充矢量 SVG；倍率不会增加原图细节。返回本地绝对路径供编码使用。",
    inputSchema: {
      project: z.string(),
      assetId: z.string().optional(),
      ref: refSchema.optional(),
      nodeId: z.string().optional(),
      format: z.enum(["png", "svg"]).default("png"),
      scale: z.union([z.literal(1), z.literal(2), z.literal(3)]).default(1),
    },
  },
  wrap(async (a) => {
    const store = workspace.get(a.project);
    let bytes: Buffer, name: string;
    if (a.assetId) {
      ensure(a.format === "png", "FORMAT", "位图素材仅导出 PNG");
      const asset = (await store.read()).assets.find((x) => x.id === a.assetId);
      ensure(asset, "ASSET", "素材不存在");
      bytes = await fs.readFile(await store.safe(asset.file));
      ensure(hash(bytes) === asset.hash, "ASSET_CORRUPT", "素材内容校验失败");
      name = `${asset.id}.png`;
    } else {
      ensure(a.ref, "REF", "需要 ref 或 assetId");
      bytes = (await renderDesign(store, a.ref, a.nodeId, a.format, a.scale))
        .bytes;
      name = `${a.ref.id}-v${a.ref.version}-${a.nodeId ?? "page"}-${a.scale}x.${a.format}`;
    }
    const file = await store.safe(`exports/${name}`);
    await fs.writeFile(file, bytes);
    return result({ path: file, bytes: bytes.length });
  }),
);
const resource = "ui://projectflow/summary.html";
mcp.registerResource("workbench-summary", resource, {}, async () => ({
  contents: [
    {
      uri: resource,
      mimeType: "text/html;profile=mcp-app",
      text: summaryWidget,
    },
  ],
}));
mcp.registerTool(
  "projectflow_workbench",
  {
    description:
      "打开完整本地工作台。返回项目摘要、浏览器链接和插件 UI。链接包含本地会话令牌，不要发布给外部用户。",
    inputSchema: { project: z.string() },
    _meta: { ui: { resourceUri: resource } },
  },
  wrap(async (a) => {
    const s = await workspace.get(a.project).read();
    const data = {
      project: s.project,
      iterations: s.iterations,
      pending: s.requests.filter((r) => r.status === "pending").length,
      url: web.url(a.project),
    };
    return { ...result(data), structuredContent: data };
  }),
);
if (process.argv.includes("--web")) {
  console.log(
    JSON.stringify({ url: web.url((await workspace.list())[0]?.id) }),
  );
} else {
  await mcp.connect(new StdioServerTransport());
  process.stdin.on("end", () => web.server.close());
}
for (const signal of ["SIGINT", "SIGTERM"] as const)
  process.on(signal, () => web.server.close(() => process.exit(0)));
