import { reviewDesign } from "./design-quality.js";
import http from "node:http";
import path from "node:path";
import { promises as fs } from "node:fs";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { fileURLToPath } from "node:url";
import { Store, hash } from "./store.js";
import { renderDesign, renderDocument } from "./render.js";
import { ensure, AppError } from "./errors.js";
export class Workspace {
  stores = new Map<string, Store>();
  async bind(root: string, name?: string) {
    const s = await Store.bind(root, name);
    const state = await s.read();
    const existing = this.stores.get(state.project.id);
    ensure(
      !existing || existing.root === s.root,
      "PROJECT_COLLISION",
      "发现复制的项目 ID；请避免同时绑定原项目与它的副本",
    );
    this.stores.set(state.project.id, s);
    return { project: state.project, root: s.root, revision: state.revision };
  }
  get(id: string) {
    const s = this.stores.get(id);
    ensure(s, "PROJECT", "项目未绑定，请先通过 Codex 绑定", 404);
    return s;
  }
  async list() {
    return Promise.all(
      [...this.stores.values()].map(async (s) => ({
        ...(await s.read()).project,
        root: s.root,
      })),
    );
  }
}
export async function startWeb(
  workspace: Workspace,
  webRoot = path.join(path.dirname(fileURLToPath(import.meta.url)), "web"),
  port = 0,
) {
  const token = randomBytes(32).toString("hex");
  let origin = "";
  const server = http.createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "no-referrer");
    res.setHeader("Cache-Control", "no-store");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'",
    );
    try {
      ensure(
        req.headers.host === new URL(origin).host,
        "HOST",
        "非法主机",
        403,
      );
      if (req.headers.origin)
        ensure(req.headers.origin === origin, "ORIGIN", "不允许跨站请求", 403);
      const url = new URL(req.url ?? "/", origin);
      if (url.pathname.startsWith("/api/")) {
        const auth = req.headers.authorization?.replace(/^Bearer /, "") ?? "";
        ensure(
          auth.length === token.length &&
            timingSafeEqual(Buffer.from(auth), Buffer.from(token)),
          "AUTH",
          "工作台会话已过期，请从 Codex 重新打开",
          401,
        );
        let body: any = {};
        if (req.method === "POST") {
          ensure(
            req.headers["content-type"]?.startsWith("application/json"),
            "TYPE",
            "只接受 JSON",
          );
          const chunks: Buffer[] = [];
          let size = 0;
          for await (const chunk of req) {
            size += chunk.length;
            ensure(size <= 25000000, "SIZE", "请求过大", 413);
            chunks.push(chunk);
          }
          body = JSON.parse(Buffer.concat(chunks).toString());
        }
        const route = url.pathname.slice(5);
        let result: unknown;
        if (route === "projects" && req.method === "GET")
          result = await workspace.list();
        else {
          const project = url.searchParams.get("project") ?? body.project;
          const store = workspace.get(project);
          if (route === "context" && req.method === "GET") {
            const c = await store.context();
            c.state.receipts = {};
            c.state.events = c.state.events.slice(-100);
            result = c;
          } else if (route === "mutate" && req.method === "POST")
            result = await store.mutate(
              body.operation,
              body.args,
              body.expectedRevision,
              body.key,
              "用户",
            );
          else if (route === "preview" && req.method === "POST") {
            const state = await store.read();
            const design = store.validateDesign(body.design, state);
            const rendered = await renderDocument(store, design);
            result = {
              base64: rendered.bytes.toString("base64"),
              mime: rendered.mime,
              quality: reviewDesign(design, state.assets),
            };
          } else if (route === "export" && req.method === "POST") {
            if (body.assetId) {
              const s = await store.read();
              const a = s.assets.find((a) => a.id === body.assetId);
              ensure(a, "ASSET", "素材不存在", 404);
              const b = await fs.readFile(await store.safe(a.file));
              ensure(hash(b) === a.hash, "ASSET_CORRUPT", "素材已损坏");
              result = {
                base64: b.toString("base64"),
                mime: a.mime,
                name: a.name.replace(/\.[^.]+$/, "") + ".png",
              };
            } else {
              const r = await renderDesign(
                store,
                body.ref,
                body.nodeId,
                body.format ?? "png",
                body.scale ?? 1,
              );
              result = {
                base64: r.bytes.toString("base64"),
                mime: r.mime,
                name: `${body.ref.id}-${body.nodeId ?? "page"}.${body.format ?? "png"}`,
              };
            }
          } else if (route === "bundle" && req.method === "GET") {
            const s = await store.read();
            const b = s.bundles.find(
              (b) => b.id === url.searchParams.get("id"),
            );
            ensure(b, "BUNDLE", "交付包不存在", 404);
            result = {
              ...b,
              files: await Promise.all(
                b.assets.map(async (a) => {
                  const bytes = await fs.readFile(await store.safe(a.file));
                  ensure(
                    hash(bytes) === a.hash,
                    "ASSET_CORRUPT",
                    "交付包素材校验失败",
                  );
                  return { ...a, base64: bytes.toString("base64") };
                }),
              ),
            };
          } else throw new AppError("ROUTE", "接口不存在", 404);
        }
        res.setHeader("Content-Type", "application/json; charset=utf-8");
        res.end(JSON.stringify(result));
        return;
      }
      ensure(req.method === "GET", "METHOD", "请求方法不允许", 405);
      const relative =
        url.pathname === "/"
          ? "index.html"
          : decodeURIComponent(url.pathname).slice(1);
      const full = path.resolve(webRoot, relative);
      ensure(
        full.startsWith(path.resolve(webRoot) + path.sep),
        "PATH",
        "路径无效",
        403,
      );
      const ext = path.extname(full);
      res.setHeader(
        "Content-Type",
        (
          {
            ".html": "text/html; charset=utf-8",
            ".js": "text/javascript",
            ".css": "text/css",
            ".svg": "image/svg+xml",
          } as Record<string, string>
        )[ext] ?? "application/octet-stream",
      );
      res.end(await fs.readFile(full));
    } catch (e) {
      res.statusCode = e instanceof AppError ? e.status : 400;
      res.setHeader("Content-Type", "application/json");
      res.end(
        JSON.stringify({
          error: {
            code: e instanceof AppError ? e.code : "INVALID",
            message: (e as Error).message,
          },
        }),
      );
    }
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", () => resolve());
  });
  origin = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  return {
    server,
    origin,
    token,
    url: (project?: string) =>
      `${origin}/#token=${token}${project ? `&project=${project}` : ""}`,
  };
}
