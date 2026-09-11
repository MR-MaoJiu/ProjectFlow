import { reviewDesign } from "./design-quality.js";
import { promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID, createHash } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import sharp from "sharp";
import { AppError, ensure } from "./errors.js";
import {
  stages,
  kinds,
  designSchema,
  refSchema,
  stageKinds,
  latestArtifacts,
  latestRef,
  confirmed,
  staleRefs,
  sameRef,
  affected,
  type State,
  type Ref,
  type ArtifactVersion,
  type Stage,
  type DesignDocument,
  type DesignNode,
  type HandoffBundle,
} from "../shared/model.js";
const run = promisify(execFile);
export const id = (prefix: string) => `${prefix}_${randomUUID()}`;
export const hash = (data: string | Buffer) =>
  createHash("sha256").update(data).digest("hex");
const now = () => new Date().toISOString();
const text = z.string().trim().min(1).max(100000);
const refs = z.array(refSchema).max(1000).default([]);
const schemas = {
  "iteration.create": z.object({ name: text, goal: z.string().default("") }),
  "project.rename": z.object({ name: text }),
  "artifact.save": z.object({
    id: z.string().optional(),
    expectedVersion: z.number().int().nonnegative(),
    iterationId: text,
    kind: z.enum(kinds),
    title: text,
    body: z.string().max(200000),
    data: z.record(z.unknown()).default({}),
    refs,
  }),
  "artifact.confirm": z.object({ ref: refSchema, reason: text }),
  "artifact.comment": z.object({ ref: refSchema, body: text }),
  "request.create": z.object({
    iterationId: text,
    stage: z.enum(stages),
    title: text,
    instruction: text,
    refs,
    bundleId: z.string().optional(),
  }),
  "request.recover": z.object({
    id: text,
    expectedVersion: z.number().int(),
    reason: text,
  }),
  "request.claim": z.object({
    id: text,
    expectedVersion: z.number().int(),
    owner: text,
  }),
  "request.update": z.object({
    id: text,
    expectedVersion: z.number().int(),
    leaseToken: z.string().optional(),
    status: z.enum([
      "running",
      "blocked",
      "submitted",
      "accepted",
      "cancelled",
    ]),
    progress: text,
    results: refs,
  }),
  "evidence.add": z.object({
    iterationId: text,
    type: z.enum(["code", "test", "release", "operations"]),
    status: z.enum(["not_run", "passed", "failed", "blocked", "skipped"]),
    summary: text,
    source: z.enum(["manual", "codex"]),
    commit: z.string().default(""),
    environment: z.string().default(""),
    refs,
    attachments: z.array(z.string()).default([]),
  }),
  "bundle.create": z.object({
    iterationId: text,
    title: text,
    refs: z.array(refSchema).min(1),
  }),
  "stage.advance": z.object({
    iterationId: text,
    target: z.enum(stages),
    reason: text,
  }),
  "asset.import": z.object({
    name: z.string().min(1).max(160),
    base64: z.string().max(24000000),
    source: text,
  }),
  "capability.set": z.object({
    name: z.enum(["search", "image", "browser", "deploy", "analytics"]),
    available: z.boolean(),
    note: text,
  }),
  "feedback.convert": z.object({
    ref: refSchema,
    iterationId: text,
    title: text,
  }),
};
export type Operation = keyof typeof schemas;
export class Store {
  private constructor(
    public root: string,
    public directory: string,
  ) {}
  static async bind(root: string, name?: string) {
    const real = await fs.realpath(root);
    ensure((await fs.stat(real)).isDirectory(), "ROOT", "项目根目录无效");
    const dir = path.join(real, ".projectflow");
    await fs.mkdir(dir, { recursive: true });
    ensure(
      (await fs.lstat(dir)).isDirectory() &&
        !(await fs.lstat(dir)).isSymbolicLink(),
      "PATH",
      "拒绝符号链接资产目录",
    );
    for (const sub of ["runtime", "assets", "documents", "exports"]) {
      const p = path.join(dir, sub);
      await fs.mkdir(p, { recursive: true });
      ensure(
        !(await fs.lstat(p)).isSymbolicLink(),
        "PATH",
        "拒绝符号链接子目录",
      );
    }
    const store = new Store(real, dir);
    await store.lock(async () => {
      try {
        await store.read();
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
        ensure(name, "NOT_INITIALIZED", "项目尚未初始化，请提供名称");
        const state: State = {
          schemaVersion: 1,
          revision: 0,
          project: { id: id("project"), name, createdAt: now() },
          iterations: [
            { id: id("iteration"), name: "首版迭代", goal: "", stage: "init" },
          ],
          artifacts: [],
          assets: [],
          requests: [],
          evidence: [],
          confirmations: [],
          bundles: [],
          events: [],
          receipts: {},
          capabilities: Object.fromEntries(
            ["search", "image", "browser", "deploy", "analytics"].map((k) => [
              k,
              { available: false, note: "尚未检查当前 Codex 工具" },
            ]),
          ),
        };
        await store.atomic("state.json", JSON.stringify(state, null, 2));
      }
    });
    await fs.writeFile(
      await store.safe(".gitignore"),
      "runtime/\nexports/\n*.tmp\n",
    );
    return store;
  }
  async safe(relative: string) {
    ensure(
      !path.isAbsolute(relative) && !relative.split(/[\\/]/).includes(".."),
      "PATH",
      "路径越界",
      403,
    );
    const full = path.resolve(this.directory, relative);
    ensure(full.startsWith(this.directory + path.sep), "PATH", "路径越界", 403);
    let current = this.directory;
    ensure(
      !(await fs.lstat(current)).isSymbolicLink(),
      "PATH",
      "资产目录被替换为符号链接",
      403,
    );
    for (const part of relative.split("/")) {
      current = path.join(current, part);
      try {
        ensure(
          !(await fs.lstat(current)).isSymbolicLink(),
          "PATH",
          "拒绝符号链接",
          403,
        );
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      }
    }
    return full;
  }
  async read(): Promise<State> {
    const s = JSON.parse(
      await fs.readFile(await this.safe("state.json"), "utf8"),
    );
    ensure(s.schemaVersion === 1, "SCHEMA", "不支持的项目数据版本");
    return s;
  }
  private async atomic(relative: string, body: string | Buffer) {
    const target = await this.safe(relative);
    const temp = `${target}.${randomUUID()}.tmp`;
    const f = await fs.open(temp, "wx", 0o600);
    try {
      await f.writeFile(body);
      await f.sync();
    } finally {
      await f.close();
    }
    await fs.rename(temp, target);
  }
  private async lock<T>(fn: () => Promise<T>): Promise<T> {
    const lock = await this.safe("runtime/write.lock");
    for (let attempt = 0; attempt < 100; attempt++) {
      try {
        const f = await fs.open(lock, "wx", 0o600);
        await f.writeFile(JSON.stringify({ pid: process.pid, at: Date.now() }));
        await f.close();
        try {
          return await fn();
        } finally {
          await fs.unlink(lock).catch(() => {});
        }
      } catch (e) {
        if ((e as NodeJS.ErrnoException).code !== "EEXIST") throw e;
        try {
          const owner = JSON.parse(await fs.readFile(lock, "utf8"));
          try {
            process.kill(owner.pid, 0);
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "ESRCH") {
              await fs.unlink(lock).catch(() => {});
              continue;
            }
          }
        } catch {
          try {
            const stat = await fs.stat(lock);
            if (Date.now() - stat.mtimeMs > 30000) await fs.unlink(lock);
          } catch {}
        }
        await new Promise((r) => setTimeout(r, 25));
      }
    }
    throw new AppError("BUSY", "另一个写入尚未结束，请稍后重试", 409);
  }
  async repository() {
    let commit = "";
    try {
      commit = (
        await run("git", ["-C", this.root, "rev-parse", "HEAD"])
      ).stdout.trim();
    } catch {}
    const rules: { path: string; body: string }[] = [];
    for (const name of ["AGENTS.md", "package.json", "README.md"]) {
      try {
        const f = await fs.realpath(path.join(this.root, name));
        if (f.startsWith(this.root + path.sep)) {
          const stat = await fs.stat(f);
          if (stat.size <= 100000)
            rules.push({ path: name, body: await fs.readFile(f, "utf8") });
        }
      } catch {}
    }
    return { commit, rules };
  }
  private resolve(s: State, ref: Ref) {
    const a = s.artifacts.find((a) => sameRef(a, ref));
    ensure(a, "NOT_FOUND", `产物不存在：${ref.id}@${ref.version}`, 404);
    return a;
  }
  private validateRefs(s: State, list: Ref[]) {
    for (const ref of list) this.resolve(s, ref);
  }
  private addArtifact(
    s: State,
    a: Omit<ArtifactVersion, "version" | "hash" | "createdAt">,
    version = 1,
  ) {
    const createdAt = now();
    const row = {
      ...a,
      version,
      createdAt,
      hash: hash(JSON.stringify({ ...a, version, createdAt })),
    };
    s.artifacts.push(row);
    return row;
  }
  validateDesign(data: unknown, s: State) {
    const d = designSchema.parse(data);
    if (d.referenceAssetId)
      ensure(s.assets.some((a) => a.id === d.referenceAssetId), "MISSING_ASSET", "参考图必须引用已登记素材");
    let count = 0;
    let textLength = 0;
    const seen = new Set<string>();
    const walk = (n: DesignNode, depth: number) => {
      ensure(
        depth <= 20 && ++count <= 500,
        "DESIGN_LIMIT",
        "设计超过 500 节点或 20 层",
      );
      ensure(!seen.has(n.id), "DUPLICATE_NODE", "节点 ID 重复");
      seen.add(n.id);
      textLength += (n.text ?? "").length;
      ensure(
        textLength <= 50000,
        "DESIGN_LIMIT",
        "单页文字总量不能超过 50000 字符",
      );
      if (n.type === "image")
        ensure(
          n.assetId && s.assets.some((a) => a.id === n.assetId),
          "MISSING_ASSET",
          "图片节点必须引用已登记素材",
        );
      if (n.type === "vector")
        ensure(n.path, "VECTOR", "矢量节点必须包含 path");
      n.children.forEach((c) => walk(c, depth + 1));
    };
    d.nodes.forEach((n) => walk(n, 0));
    return d;
  }
  stageCheck(s: State, iterationId: string, target: Stage) {
    const list = latestArtifacts(s, iterationId);
    const issues: string[] = [];
    const required = (kind: (typeof kinds)[number], approve = false) => {
      const rows = list.filter((a) => a.kind === kind);
      if (!rows.length) issues.push(`缺少 ${kind} 产物`);
      for (const a of rows) {
        if (approve && !confirmed(s, a))
          issues.push(`${a.title} v${a.version} 尚未确认`);
        if (staleRefs(s, a).length) issues.push(`${a.title} 引用了旧版上游`);
      }
    };
    if (stages.indexOf(target) >= 1) required("brief", true);
    if (stages.indexOf(target) >= 3) required("requirement", true);
    if (stages.indexOf(target) >= 4) required("prd", true);
    if (stages.indexOf(target) >= 5) required("design", true);
    if (
      stages.indexOf(target) >= 6 &&
      !s.bundles.some(
        (b) =>
          b.iterationId === iterationId &&
          b.artifacts.every((a) => latestRef(s, a.id)?.version === a.version),
      )
    )
      issues.push("缺少当前版本开发交付包");
    if (target === "release" || target === "operations") {
      const evidence = s.evidence.filter(
        (e) => e.iterationId === iterationId && e.type === "test",
      );
      const cases = list.filter((a) => a.kind === "test");
      if (!cases.length) issues.push("缺少测试用例");
      for (const c of cases) {
        const e = evidence
          .filter((e) => e.refs.some((r) => sameRef(r, c)))
          .at(-1);
        if (!e || e.status !== "passed" || staleRefs(s, e).length)
          issues.push(`${c.title} 没有有效通过结果`);
      }
      const requests = s.requests.filter(
        (r) => r.iterationId === iterationId && r.stage === "coding",
      );
      if (
        !requests.length ||
        requests.some(
          (r) => r.status !== "accepted" && r.status !== "cancelled",
        )
      )
        issues.push("编码任务尚未全部验收");
    }
    if (target === "operations") {
      required("release", true);
      const e = s.evidence
        .filter((e) => e.iterationId === iterationId && e.type === "release")
        .at(-1);
      if (!e || e.status !== "passed") issues.push("缺少发布成功证据");
    }
    return { ready: issues.length === 0, issues };
  }
  async context() {
    const s = await this.read();
    const repo = await this.repository();
    return {
      state: s,
      root: this.root,
      repository: repo,
      affected: Object.fromEntries(
        latestArtifacts(s).map((a) => [
          a.id,
          affected(s, a.id).map((x) => x.id),
        ]),
      ),
      checks: Object.fromEntries(
        s.iterations.map((i) => [
          i.id,
          this.stageCheck(
            s,
            i.id,
            stages[Math.min(stages.indexOf(i.stage) + 1, 9)],
          ),
        ]),
      ),
      staleEvidence: s.evidence
        .filter(
          (e) =>
            staleRefs(s, e).length ||
            Boolean(e.commit && repo.commit && e.commit !== repo.commit),
        )
        .map((e) => e.id),
    };
  }
  async mutate(
    operation: string,
    args: unknown,
    expectedRevision: number,
    key: string,
    actor: string,
  ) {
    ensure(operation in schemas, "OPERATION", "未知操作");
    ensure(
      key.length >= 8 && key.length <= 160,
      "IDEMPOTENCY",
      "需要 8–160 字符幂等标识",
    );
    ensure(actor.trim(), "ACTOR", "需要操作者");
    const op = operation as Operation;
    const parsed = schemas[op].parse(args);
    const digest = hash(JSON.stringify({ op, parsed, actor }));
    return this.lock(async () => {
      const s = await this.read();
      const receipt = s.receipts[key];
      if (receipt) {
        ensure(
          receipt.digest === digest,
          "IDEMPOTENCY_CONFLICT",
          "同一请求标识不能用于不同内容",
          409,
        );
        return receipt.result;
      }
      ensure(
        s.revision === expectedRevision,
        "VERSION_CONFLICT",
        "项目已变化，请刷新后重试；草稿尚未覆盖",
        409,
      );
      const p = parsed as any;
      let result: unknown;
      const iteration = () => {
        const i = s.iterations.find((i) => i.id === p.iterationId);
        ensure(i, "ITERATION", "迭代不存在", 404);
        return i;
      };
      switch (op) {
        case "project.rename":
          s.project.name = p.name;
          result = s.project;
          break;
        case "iteration.create": {
          const i = {
            id: id("iteration"),
            name: p.name,
            goal: p.goal,
            stage: "init" as Stage,
          };
          s.iterations.push(i);
          result = i;
          break;
        }
        case "artifact.save": {
          iteration();
          this.validateRefs(s, p.refs);
          const prev = p.id ? latestRef(s, p.id) : undefined;
          ensure(
            p.id
              ? prev && prev.version === p.expectedVersion
              : p.expectedVersion === 0,
            "VERSION_CONFLICT",
            "产物版本不一致",
            409,
          );
          if (prev)
            ensure(
              prev.kind === p.kind && prev.iterationId === p.iterationId,
              "IMMUTABLE",
              "不能改变产物类型或迭代",
            );
          ensure(
            !p.refs.some((r: Ref) => r.id === p.id),
            "CYCLE",
            "产物不能引用自身",
          );
          for (const r of p.refs)
            if (p.id)
              ensure(
                !affected(s, p.id).some((a) => a.id === r.id),
                "CYCLE",
                "不允许循环依赖",
              );
          let data = p.data;
          if (p.kind === "design") data = this.validateDesign(data, s);
          const a = this.addArtifact(
            s,
            {
              id: prev?.id ?? id("artifact"),
              iterationId: p.iterationId,
              kind: p.kind,
              title: p.title,
              body: p.body,
              data,
              refs: p.refs,
              author: actor,
            },
            (prev?.version ?? 0) + 1,
          );
          result = a;
          break;
        }
        case "artifact.confirm": {
          const a = this.resolve(s, p.ref);
          ensure(
            latestRef(s, a.id)?.version === a.version,
            "STALE",
            "只能确认当前版本",
            409,
          );
          ensure(
            !staleRefs(s, a).length,
            "STALE",
            "上游已变化，先复核引用",
            409,
          );
          ensure(a.body.trim().length > 10, "INCOMPLETE", "内容不完整");
          if (a.kind === "design") {
            const design = this.validateDesign(a.data, s);
            if (design.fidelity === "high") {
              const review = reviewDesign(design, s.assets);
              ensure(
                review.ready,
                "DESIGN_QUALITY",
                review.issues
                  .filter((i) => i.severity === "error")
                  .map((i) => i.message)
                  .join("；"),
              );
            }
          }
          const c = { ref: p.ref, actor, reason: p.reason, at: now() };
          s.confirmations.push(c);
          result = c;
          break;
        }
        case "artifact.comment":
          this.resolve(s, p.ref);
          result = { ref: p.ref, body: p.body };
          break;
        case "request.create": {
          iteration();
          this.validateRefs(s, p.refs);
          if (p.bundleId)
            ensure(
              s.bundles.some(
                (b) => b.id === p.bundleId && b.iterationId === p.iterationId,
              ),
              "BUNDLE",
              "交付包不存在",
            );
          if (p.stage === "coding")
            ensure(p.bundleId, "BUNDLE", "编码请求必须绑定交付包");
          const r = {
            id: id("request"),
            iterationId: p.iterationId,
            version: 1,
            stage: p.stage,
            title: p.title,
            instruction: p.instruction,
            refs: p.refs,
            bundleId: p.bundleId,
            status: "pending" as const,
            progress: "等待在 Codex 中继续",
            results: [],
            createdAt: now(),
            updatedAt: now(),
          };
          s.requests.push(r);
          result = r;
          break;
        }
        case "request.recover": {
          const r = s.requests.find((r) => r.id === p.id);
          ensure(r, "NOT_FOUND", "请求不存在", 404);
          ensure(
            r.version === p.expectedVersion,
            "VERSION_CONFLICT",
            "请求版本变化",
            409,
          );
          ensure(
            ["running", "blocked"].includes(r.status),
            "STATE",
            "只能接管运行或受阻请求",
          );
          r.status = "pending";
          delete r.lease;
          r.version++;
          r.progress = `人工接管：${p.reason}`;
          r.updatedAt = now();
          result = r;
          break;
        }
        case "request.claim": {
          const r = s.requests.find((r) => r.id === p.id);
          ensure(r, "NOT_FOUND", "请求不存在", 404);
          ensure(
            r.version === p.expectedVersion,
            "VERSION_CONFLICT",
            "请求版本变化",
            409,
          );
          ensure(
            ["pending", "blocked", "running"].includes(r.status),
            "STATE",
            "请求不能领取",
          );
          ensure(
            !r.lease ||
              new Date(r.lease.expiresAt).getTime() < Date.now() ||
              r.status === "blocked",
            "LEASE",
            "请求已被领取",
            409,
          );
          if (staleRefs(s, r).length)
            throw new AppError(
              "STALE",
              "请求上游已变化，请创建新版本请求",
              409,
            );
          if (r.bundleId) {
            const b = s.bundles.find((b) => b.id === r.bundleId)!;
            ensure(
              b.artifacts.every(
                (a) => latestRef(s, a.id)?.version === a.version,
              ),
              "STALE",
              "交付包已过期，请复核后重新创建",
              409,
            );
          }
          if (r.stage === "coding")
            ensure(
              this.stageCheck(s, r.iterationId, "coding").ready,
              "GATE",
              "编码前需要确认立项、需求、PRD、设计与交付包",
              409,
            );
          r.lease = {
            token: randomUUID(),
            owner: p.owner,
            expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
          };
          r.status = "running";
          r.version++;
          r.updatedAt = now();
          result = r;
          break;
        }
        case "request.update": {
          const r = s.requests.find((r) => r.id === p.id);
          ensure(r, "NOT_FOUND", "请求不存在", 404);
          ensure(
            r.version === p.expectedVersion,
            "VERSION_CONFLICT",
            "请求版本变化",
            409,
          );
          if (p.status === "accepted") {
            ensure(r.status === "submitted", "STATE", "只有已提交结果可以验收");
            const unresolved = staleRefs(s, r).filter(
              (input) =>
                !r.results.some(
                  (output) =>
                    output.id === input.id &&
                    output.version === input.version + 1 &&
                    latestRef(s, output.id)?.version === output.version,
                ),
            );
            ensure(!unresolved.length, "STALE", "请求引用已过期");
            if (r.bundleId)
              ensure(
                s.bundles
                  .find((b) => b.id === r.bundleId)!
                  .artifacts.every(
                    (a) => latestRef(s, a.id)?.version === a.version,
                  ),
                "STALE",
                "交付包已过期",
              );
          } else if (p.status !== "cancelled") {
            ensure(
              r.status === "running" || r.status === "blocked",
              "STATE",
              "请求未运行",
            );
            ensure(
              r.lease &&
                r.lease.token === p.leaseToken &&
                new Date(r.lease.expiresAt).getTime() > Date.now(),
              "LEASE",
              "租约失效或不属于当前执行者",
              409,
            );
          } else
            ensure(
              !["accepted", "cancelled"].includes(r.status),
              "STATE",
              "已完成请求不能取消",
            );
          this.validateRefs(s, p.results);
          if (p.status === "submitted")
            ensure(p.results.length, "RESULT", "提交需要产物引用");
          r.status = p.status;
          r.progress = p.progress;
          if (p.results.length) r.results = p.results;
          r.version++;
          r.updatedAt = now();
          if (r.lease && p.status === "running")
            r.lease.expiresAt = new Date(
              Date.now() + 30 * 60 * 1000,
            ).toISOString();
          result = r;
          break;
        }
        case "evidence.add": {
          iteration();
          this.validateRefs(s, p.refs);
          for (const f of p.attachments)
            ensure(
              (await fs.stat(await this.safe(f))).isFile(),
              "EVIDENCE_FILE",
              "证据附件不存在",
            );
          if (["test", "release"].includes(p.type) && p.status === "passed")
            ensure(
              p.environment.trim() && p.commit.trim() && p.refs.length,
              "EVIDENCE",
              "通过结果必须绑定环境、代码版本和产物",
            );
          const e = { ...p, id: id("evidence"), createdAt: now() };
          s.evidence.push(e);
          result = e;
          break;
        }
        case "bundle.create": {
          iteration();
          this.validateRefs(s, p.refs);
          const selected = new Map<string, ArtifactVersion>();
          const visit = (ref: Ref) => {
            const a = this.resolve(s, ref);
            if (selected.has(a.id)) {
              ensure(
                selected.get(a.id)!.version === a.version,
                "MIXED_VERSION",
                "交付包不能混用同一产物的不同版本",
              );
              return;
            }
            ensure(
              latestRef(s, a.id)?.version === a.version,
              "STALE",
              "交付包包含旧版本",
            );
            selected.set(a.id, a);
            a.refs.forEach(visit);
          };
          p.refs.forEach(visit);
          const artifacts = [...selected.values()];
          for (const k of ["requirement", "prd", "design"])
            ensure(
              artifacts.some((a) => a.kind === k),
              "BUNDLE",
              `交付包缺少 ${k}`,
            );
          for (const a of artifacts)
            if (["brief", "requirement", "prd", "design"].includes(a.kind))
              ensure(confirmed(s, a), "UNCONFIRMED", `${a.title} 尚未确认`);
          const assetIds = new Set<string>();
          const walk = (n: DesignNode) => {
            if (n.assetId) assetIds.add(n.assetId);
            n.children.forEach(walk);
          };
          for (const a of artifacts.filter((a) => a.kind === "design")) {
            const design = this.validateDesign(a.data, s);
            if (design.fidelity === "high") {
              const review = reviewDesign(design, s.assets);
              ensure(
                review.ready,
                "DESIGN_QUALITY",
                review.issues
                  .filter((i) => i.severity === "error")
                  .map((i) => i.message)
                  .join("；"),
              );
            }
            if (design.referenceAssetId) assetIds.add(design.referenceAssetId);
            design.nodes.forEach(walk);
          }
          const assets = s.assets.filter((a) => assetIds.has(a.id));
          for (const a of assets)
            ensure(
              hash(await fs.readFile(await this.safe(a.file))) === a.hash,
              "ASSET_CORRUPT",
              "素材内容已变化",
            );
          const repo = await this.repository();
          const payload = {
            id: id("bundle"),
            iterationId: p.iterationId,
            title: p.title,
            artifacts,
            assets,
            ...repo,
            createdAt: now(),
          };
          const b: HandoffBundle = {
            ...payload,
            hash: hash(JSON.stringify(payload)),
          };
          s.bundles.push(b);
          result = b;
          break;
        }
        case "stage.advance": {
          const i = iteration();
          ensure(
            stages.indexOf(p.target) === stages.indexOf(i.stage) + 1,
            "STAGE",
            "请逐阶段推进",
          );
          const check = this.stageCheck(s, i.id, p.target);
          ensure(check.ready, "GATE", check.issues.join("；"), 409);
          if (["release", "operations"].includes(p.target)) {
            const repo = await this.repository();
            const ev = s.evidence.filter(
              (e) =>
                e.iterationId === i.id && ["test", "release"].includes(e.type),
            );
            ensure(
              !repo.commit ||
                ev
                  .filter((e) => e.status === "passed")
                  .every((e) => e.commit === repo.commit),
              "STALE_EVIDENCE",
              "代码已变化，需要重新验证",
              409,
            );
          }
          i.stage = p.target;
          result = i;
          break;
        }
        case "asset.import": {
          const bytes = Buffer.from(p.base64, "base64");
          ensure(
            bytes.length > 0 && bytes.length <= 16 * 1024 * 1024,
            "ASSET_SIZE",
            "素材必须小于 16MB",
          );
          const meta = await sharp(bytes, {
            limitInputPixels: 16777216,
          }).metadata();
          ensure(
            ["png", "jpeg", "webp"].includes(meta.format ?? ""),
            "FORMAT",
            "图片素材支持 PNG/JPEG/WebP；矢量使用设计 path 节点",
          );
          const normalized = await sharp(bytes).png().toBuffer();
          const checksum = hash(normalized);
          const asset = {
            id: id("asset"),
            name: p.name,
            file: `assets/${checksum}.png`,
            mime: "image/png",
            width: meta.width!,
            height: meta.height!,
            hash: checksum,
            source: p.source,
            createdAt: now(),
          };
          await this.atomic(asset.file, normalized);
          s.assets.push(asset);
          result = asset;
          break;
        }
        case "capability.set":
          s.capabilities[p.name] = { available: p.available, note: p.note };
          result = s.capabilities;
          break;
        case "feedback.convert": {
          iteration();
          const src = this.resolve(s, p.ref);
          ensure(
            src.kind === "feedback" || src.kind === "review",
            "KIND",
            "仅反馈/复盘可转需求",
          );
          result = this.addArtifact(s, {
            id: id("artifact"),
            iterationId: p.iterationId,
            kind: "requirement",
            title: p.title,
            body: `# ${p.title}\n\n## 来源\n${src.title} v${src.version}\n\n${src.body}\n\n## 验收标准\n待整理`,
            data: {},
            refs: [p.ref],
            author: actor,
          });
          break;
        }
      }
      s.revision++;
      s.events.push({
        id: id("event"),
        at: now(),
        action: op,
        actor,
        detail: JSON.stringify({
          args: op === "asset.import" ? { name: p.name } : p,
          result,
        }),
      });
      s.receipts[key] = { digest, result };
      // 文档是可恢复的投影，状态文件为唯一事务提交点。
      if (op === "artifact.save" || op === "feedback.convert") {
        const a = result as ArtifactVersion;
        await this.atomic(`documents/${a.id}-v${a.version}.md`, a.body);
      }
      await this.atomic("state.json", JSON.stringify(s, null, 2));
      return result;
    });
  }
  async importPath(
    relative: string,
    name: string,
    source: string,
    revision: number,
    key: string,
    actor: string,
  ) {
    const full = await fs.realpath(path.resolve(this.root, relative));
    ensure(
      full.startsWith(this.root + path.sep),
      "PATH",
      "只能导入已绑定项目内的素材；请先复制图片到项目",
      403,
    );
    ensure(
      (await fs.stat(full)).size <= 16 * 1024 * 1024,
      "ASSET_SIZE",
      "素材过大",
    );
    return this.mutate(
      "asset.import",
      { name, source, base64: (await fs.readFile(full)).toString("base64") },
      revision,
      key,
      actor,
    );
  }
}
