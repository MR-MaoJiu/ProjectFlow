import test from "node:test";
import assert from "node:assert/strict";
import {
  mkdtemp,
  writeFile,
  readFile,
  symlink,
  mkdir,
  rm,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { Store, hash } from "../src/server/store";
import {
  blankDesign,
  baseNode,
  affected,
  type ArtifactVersion,
  type Ref,
} from "../src/shared/model";
import { renderDesign } from "../src/server/render";
async function fixture(t: any) {
  const root = await mkdtemp(path.join(os.tmpdir(), "projectflow-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = await Store.bind(root, "测试项目");
  const iterationId = (await store.read()).iterations[0].id;
  const mutate = async (op: string, args: any, key = crypto.randomUUID()) =>
    store.mutate(op, args, (await store.read()).revision, key, "测试用户");
  const save = async (
    kind: string,
    title: string,
    refs: Ref[] = [],
    data: Record<string, unknown> = {},
  ) =>
    mutate("artifact.save", {
      iterationId,
      expectedVersion: 0,
      kind,
      title,
      body: `# ${title}\n\n明确目标、行为与验收标准。`,
      refs,
      data,
    }) as Promise<ArtifactVersion>;
  return { root, store, iterationId, mutate, save };
}
async function baseline(f: Awaited<ReturnType<typeof fixture>>) {
  const brief = await f.save("brief", "立项");
  const req = await f.save("requirement", "需求", [brief]);
  const prd = await f.save("prd", "PRD", [req]);
  const design = await f.save("design", "设计", [prd], blankDesign as any);
  for (const ref of [brief, req, prd, design])
    await f.mutate("artifact.confirm", { ref, reason: "人工确认测试基线" });
  const bundle: any = await f.mutate("bundle.create", {
    iterationId: f.iterationId,
    title: "交付包",
    refs: [design],
  });
  return { brief, req, prd, design, bundle };
}
test("不可变版本、文档投影、旧版本冲突与跨实例恢复", async (t) => {
  const f = await fixture(t);
  const a = await f.save("prd", "登录需求");
  const b: any = await f.mutate("artifact.save", {
    ...a,
    expectedVersion: 1,
    body: "更新后的用户需求与验收条件",
  });
  assert.equal(b.version, 2);
  assert.equal((await f.store.read()).artifacts[0].body, a.body);
  assert.equal(
    await readFile(
      path.join(f.root, ".projectflow/documents", `${b.id}-v2.md`),
      "utf8",
    ),
    b.body,
  );
  await assert.rejects(
    () => f.mutate("artifact.save", { ...a, expectedVersion: 1 }),
    /版本不一致/,
  );
  const restored = await Store.bind(f.root);
  assert.equal((await restored.read()).revision, 2);
});
test("幂等重试返回同一结果，不同请求不可复用标识", async (t) => {
  const f = await fixture(t);
  const key = crypto.randomUUID();
  const args = { name: "第二迭代", goal: "" };
  const a = await f.store.mutate("iteration.create", args, 0, key, "用户");
  const b = await f.store.mutate("iteration.create", args, 0, key, "用户");
  assert.deepEqual(a, b);
  assert.equal((await f.store.read()).iterations.length, 2);
  await assert.rejects(
    () =>
      f.store.mutate(
        "iteration.create",
        { ...args, name: "第三轮" },
        1,
        key,
        "用户",
      ),
    /不同内容/,
  );
});
test("并发写入只有一个成功，失败不覆盖状态", async (t) => {
  const f = await fixture(t);
  const other = await Store.bind(f.root);
  const results = await Promise.allSettled([
    f.store.mutate(
      "project.rename",
      { name: "甲" },
      0,
      crypto.randomUUID(),
      "甲",
    ),
    other.mutate(
      "project.rename",
      { name: "乙" },
      0,
      crypto.randomUUID(),
      "乙",
    ),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
  assert.equal((await f.store.read()).revision, 1);
});
test("项目目录与素材路径拒绝符号链接逃逸", async (t) => {
  const f = await fixture(t);
  await symlink("/etc", path.join(f.root, ".projectflow/assets/escape"));
  await assert.rejects(() => f.store.safe("assets/escape/passwd"), /符号链接/);
  await assert.rejects(() => f.store.safe("../state.json"), /越界/);
  await symlink("/etc/passwd", path.join(f.root, "outside.txt"));
  await assert.rejects(
    () =>
      f.store.importPath(
        "outside.txt",
        "x",
        "测试",
        0,
        crypto.randomUUID(),
        "用户",
      ),
    /项目内/,
  );
});
test("上游变更可追踪下游，确认与交付不能混用旧版", async (t) => {
  const f = await fixture(t);
  const b = await baseline(f);
  await f.mutate("artifact.save", {
    ...b.req,
    expectedVersion: 1,
    body: "新需求：增加明确的错误提示",
  });
  assert.equal(affected(await f.store.read(), b.req.id).length, 2);
  await assert.rejects(
    () => f.mutate("artifact.confirm", { ref: b.prd, reason: "再次确认" }),
    /上游已变化/,
  );
  await assert.rejects(
    () =>
      f.mutate("bundle.create", {
        iterationId: f.iterationId,
        title: "错误交付",
        refs: [b.design],
      }),
    /旧版本/,
  );
  assert.equal(
    (await f.store.read()).bundles[0].artifacts.find((a) => a.id === b.req.id)
      ?.body,
    b.req.body,
  );
});
test("拒绝循环来源关系与跨产物类型改写", async (t) => {
  const f = await fixture(t);
  const a = await f.save("requirement", "A");
  const b = await f.save("prd", "B", [a]);
  await assert.rejects(
    () => f.mutate("artifact.save", { ...a, expectedVersion: 1, refs: [b] }),
    /循环/,
  );
  await assert.rejects(
    () =>
      f.mutate("artifact.save", { ...a, expectedVersion: 1, kind: "design" }),
    /类型/,
  );
});
test("请求租约隔离、结果待评审、不能假完成", async (t) => {
  const f = await fixture(t);
  const b = await baseline(f);
  let r: any = await f.mutate("request.create", {
    iterationId: f.iterationId,
    stage: "coding",
    title: "实现页面",
    instruction: "按交付包实现",
    refs: [b.design],
    bundleId: b.bundle.id,
  });
  r = await f.mutate("request.claim", {
    id: r.id,
    expectedVersion: r.version,
    owner: "Codex",
  });
  await assert.rejects(
    () =>
      f.mutate("request.claim", {
        id: r.id,
        expectedVersion: r.version,
        owner: "其他",
      }),
    /已被领取/,
  );
  await assert.rejects(
    () =>
      f.mutate("request.update", {
        id: r.id,
        expectedVersion: r.version,
        leaseToken: "wrong",
        status: "submitted",
        progress: "完成",
        results: [b.design],
      }),
    /租约/,
  );
  await assert.rejects(
    () =>
      f.mutate("request.update", {
        id: r.id,
        expectedVersion: r.version,
        leaseToken: r.lease.token,
        status: "submitted",
        progress: "完成",
        results: [],
      }),
    /产物引用/,
  );
  const code = await f.save("code", "实现证据", [b.design]);
  r = await f.mutate("request.update", {
    id: r.id,
    expectedVersion: r.version,
    leaseToken: r.lease.token,
    status: "submitted",
    progress: "代码提交待评审",
    results: [code],
  });
  assert.equal(r.status, "submitted");
  r = await f.mutate("request.update", {
    id: r.id,
    expectedVersion: r.version,
    status: "accepted",
    progress: "人工检查通过",
    results: [code],
  });
  assert.equal(r.status, "accepted");
});
test("在途请求固定基线，上游变更后不能验收", async (t) => {
  const f = await fixture(t);
  const a = await f.save("prd", "原需求");
  let r: any = await f.mutate("request.create", {
    iterationId: f.iterationId,
    stage: "prd",
    title: "修改",
    instruction: "完善需求",
    refs: [a],
  });
  r = await f.mutate("request.claim", {
    id: r.id,
    expectedVersion: 1,
    owner: "Codex",
  });
  await f.mutate("artifact.save", {
    ...a,
    expectedVersion: 1,
    body: "用户在其他界面改变了需求",
  });
  r = await f.mutate("request.update", {
    id: r.id,
    expectedVersion: r.version,
    leaseToken: r.lease.token,
    status: "submitted",
    progress: "已按旧版完成",
    results: [a],
  });
  await assert.rejects(
    () =>
      f.mutate("request.update", {
        id: r.id,
        expectedVersion: r.version,
        status: "accepted",
        progress: "验收",
        results: [a],
      }),
    /过期/,
  );
});
test("安全渲染、真实 PNG 倍率、位图不得冒充矢量", async (t) => {
  const f = await fixture(t);
  const raw = await sharp({
    create: { width: 12, height: 8, channels: 4, background: "#eeccaa" },
  })
    .png()
    .toBuffer();
  const asset: any = await f.mutate("asset.import", {
    name: "照片",
    base64: raw.toString("base64"),
    source: "测试生成的色块，不是真实产品素材",
  });
  const d = await f.save("design", "页面", [], {
    ...blankDesign,
    nodes: [
      {
        ...baseNode,
        id: "photo",
        type: "image",
        assetId: asset.id,
        width: 120,
        height: 80,
      },
    ],
  });
  const png = await renderDesign(f.store, d, "photo", "png", 2);
  assert.equal((await sharp(png.bytes).metadata()).width, 240);
  await assert.rejects(
    () => renderDesign(f.store, d, undefined, "svg"),
    /含位图/,
  );
  await assert.rejects(() =>
    f.save("design", "非法节点", [], {
      ...blankDesign,
      nodes: [
        {
          ...baseNode,
          id: "bad",
          type: "vector",
          path: "<script>alert(1)</script>",
        },
      ],
    }),
  );
  const vector = await f.save("design", "文字矢量", [], {
    ...blankDesign,
    nodes: [
      {
        ...baseNode,
        id: "title",
        type: "text",
        text: "<script>alert(1)</script>",
        fill: "#172033",
      },
    ],
  });
  assert.match(
    (await renderDesign(f.store, vector, undefined, "svg")).bytes.toString(),
    /&lt;script&gt;/,
  );
});
test("重复节点与缺失素材阻止设计保存", async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    () =>
      f.save("design", "重复", [], {
        ...blankDesign,
        nodes: [baseNode, baseNode],
      }),
    /重复/,
  );
  await assert.rejects(
    () =>
      f.save("design", "缺图", [], {
        ...blankDesign,
        nodes: [{ ...baseNode, type: "image" }],
      }),
    /已登记素材/,
  );
});
test("通过结果必须有环境、代码与引用，缺失数据不当作通过", async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    () =>
      f.mutate("evidence.add", {
        iterationId: f.iterationId,
        type: "test",
        status: "passed",
        source: "codex",
        summary: "测试通过",
        refs: [],
      }),
    /绑定环境/,
  );
  const a = await f.save("test", "测试用例");
  const e: any = await f.mutate("evidence.add", {
    iterationId: f.iterationId,
    type: "test",
    status: "blocked",
    source: "manual",
    summary: "设备不可用",
    refs: [a],
  });
  assert.equal(e.status, "blocked");
  assert.equal(
    f.store.stageCheck(await f.store.read(), f.iterationId, "release").ready,
    false,
  );
});
test("反馈转入新迭代保留原文与来源", async (t) => {
  const f = await fixture(t);
  const feedback = await f.save("feedback", "用户建议");
  const next: any = await f.mutate("iteration.create", {
    name: "下一轮",
    goal: "修复反馈",
  });
  const req: any = await f.mutate("feedback.convert", {
    ref: feedback,
    iterationId: next.id,
    title: "改进体验",
  });
  assert.equal(req.iterationId, next.id);
  assert.equal(req.refs[0].id, feedback.id);
  assert.match(req.body, /用户建议/);
  assert.equal((await f.store.read()).artifacts[0].kind, "feedback");
});
test("顺序阶段门禁与关键基线确认", async (t) => {
  const f = await fixture(t);
  await assert.rejects(
    () =>
      f.mutate("stage.advance", {
        iterationId: f.iterationId,
        target: "research",
        reason: "继续",
      }),
    /brief/,
  );
  await assert.rejects(
    () =>
      f.mutate("stage.advance", {
        iterationId: f.iterationId,
        target: "coding",
        reason: "跳过",
      }),
    /逐阶段/,
  );
  const b = await baseline(f);
  for (const target of [
    "research",
    "requirements",
    "prd",
    "design",
    "handoff",
    "coding",
    "testing",
  ])
    await f.mutate("stage.advance", {
      iterationId: f.iterationId,
      target,
      reason: "测试流程条件",
    });
  assert.equal((await f.store.read()).iterations[0].stage, "testing");
  await assert.rejects(
    () =>
      f.mutate("stage.advance", {
        iterationId: f.iterationId,
        target: "release",
        reason: "尝试发布",
      }),
    /测试用例/,
  );
});

test("人工接管撤销旧租约，并保留已经保存的产物", async (t) => {
  const f = await fixture(t);
  const a = await f.save("prd", "可恢复任务");
  let r: any = await f.mutate("request.create", {
    iterationId: f.iterationId,
    stage: "prd",
    title: "继续整理",
    instruction: "完善文档",
    refs: [a],
  });
  r = await f.mutate("request.claim", {
    id: r.id,
    expectedVersion: 1,
    owner: "旧执行者",
  });
  const oldToken = r.lease.token;
  r = await f.mutate("request.recover", {
    id: r.id,
    expectedVersion: r.version,
    reason: "用户明确接管失联任务",
  });
  assert.equal(r.status, "pending");
  r = await f.mutate("request.claim", {
    id: r.id,
    expectedVersion: r.version,
    owner: "新执行者",
  });
  await assert.rejects(
    () =>
      f.mutate("request.update", {
        id: r.id,
        expectedVersion: r.version,
        leaseToken: oldToken,
        status: "running",
        progress: "旧请求重试",
        results: [],
      }),
    /租约/,
  );
  assert.equal((await f.store.read()).artifacts.length, 1);
});

test("完整阶段状态闭环：立项至发布证据与运营回流", async (t) => {
  const f = await fixture(t);
  const b = await baseline(f);
  await f.save("research", "研究来源与结论", [b.brief]);
  for (const target of [
    "research",
    "requirements",
    "prd",
    "design",
    "handoff",
    "coding",
  ])
    await f.mutate("stage.advance", {
      iterationId: f.iterationId,
      target,
      reason: "已核对该阶段的测试基线",
    });
  let r: any = await f.mutate("request.create", {
    iterationId: f.iterationId,
    stage: "coding",
    title: "实现交付",
    instruction: "契约测试中的实现请求",
    refs: [b.design],
    bundleId: b.bundle.id,
  });
  r = await f.mutate("request.claim", {
    id: r.id,
    expectedVersion: 1,
    owner: "契约测试客户端",
  });
  const code = await f.save("code", "测试实现记录", [b.design]);
  r = await f.mutate("request.update", {
    id: r.id,
    expectedVersion: r.version,
    leaseToken: r.lease.token,
    status: "submitted",
    progress: "提交测试产物",
    results: [code],
  });
  await f.mutate("request.update", {
    id: r.id,
    expectedVersion: r.version,
    status: "accepted",
    progress: "测试用户确认",
    results: [code],
  });
  await f.mutate("stage.advance", {
    iterationId: f.iterationId,
    target: "testing",
    reason: "测试准备",
  });
  const tc = await f.save("test", "验收用例", [code, b.req]);
  await f.mutate("evidence.add", {
    iterationId: f.iterationId,
    type: "test",
    status: "passed",
    summary: "此证据仅为契约状态测试，不代表生产项目已验证",
    source: "manual",
    commit: "contract-fixture-v1",
    environment: "隔离契约测试",
    refs: [tc],
  });
  await f.mutate("stage.advance", {
    iterationId: f.iterationId,
    target: "release",
    reason: "验证门禁状态转换",
  });
  const release = await f.save("release", "发布候选记录", [code, tc]);
  await f.mutate("artifact.confirm", {
    ref: release,
    reason: "确认测试发布记录",
  });
  await f.mutate("evidence.add", {
    iterationId: f.iterationId,
    type: "release",
    status: "passed",
    summary: "契约测试的发布报告；没有执行生产部署",
    source: "manual",
    commit: "contract-fixture-v1",
    environment: "隔离契约测试",
    refs: [release],
  });
  await f.mutate("stage.advance", {
    iterationId: f.iterationId,
    target: "operations",
    reason: "验证回流阶段",
  });
  const feedback = await f.save("feedback", "发布后的反馈", [release]);
  const iteration: any = await f.mutate("iteration.create", {
    name: "下一轮",
    goal: "改进反馈",
  });
  await f.mutate("feedback.convert", {
    iterationId: iteration.id,
    ref: feedback,
    title: "新的改进需求",
  });
  assert.equal((await f.store.read()).iterations[0].stage, "operations");
  assert.equal((await f.store.read()).iterations.length, 2);
});

test("文档修改请求可验收自己产生的紧接新版本，外部后续修改仍阻止验收", async (t) => {
  const f = await fixture(t);
  const a = await f.save("prd", "需求草稿");
  let r: any = await f.mutate("request.create", {
    iterationId: f.iterationId,
    stage: "prd",
    title: "改写需求",
    instruction: "完善需求文档",
    refs: [a],
  });
  r = await f.mutate("request.claim", {
    id: r.id,
    expectedVersion: 1,
    owner: "Codex",
  });
  const b: any = await f.mutate("artifact.save", {
    ...a,
    expectedVersion: 1,
    body: "Codex 按照要求完善后的需求内容",
  });
  r = await f.mutate("request.update", {
    id: r.id,
    expectedVersion: r.version,
    leaseToken: r.lease.token,
    status: "submitted",
    progress: "提交修改结果",
    results: [b],
  });
  r = await f.mutate("request.update", {
    id: r.id,
    expectedVersion: r.version,
    status: "accepted",
    progress: "用户确认文档修改",
    results: [b],
  });
  assert.equal(r.status, "accepted");
});
