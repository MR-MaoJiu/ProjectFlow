import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import sharp from "sharp";
import { Store } from "../src/server/store";
import { renderDesign, renderDocument } from "../src/server/render";
import { layoutText } from "../src/server/text";
import { reviewDesign } from "../src/server/design-quality";
import {
  baseNode,
  blankDesign,
  layoutNodes,
  designSchema,
  type DesignNode,
} from "../src/shared/model";
async function setup(t: any) {
  const root = await mkdtemp(path.join(os.tmpdir(), "pf-hifi-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  const store = await Store.bind(root, "视觉测试");
  const iterationId = (await store.read()).iterations[0].id;
  const mutate = async (operation: string, args: any) =>
    store.mutate(
      operation,
      args,
      (await store.read()).revision,
      crypto.randomUUID(),
      "测试",
    );
  const save = async (data: any) =>
    mutate("artifact.save", {
      iterationId,
      kind: "design",
      title: "设计",
      body: "这是用于检查真实排版与素材的设计。",
      expectedVersion: 0,
      data,
      refs: [],
    }) as Promise<any>;
  return { store, mutate, save };
}
test("真实字体区分窄宽字符，保持英文词组，中文没有缺字", () => {
  const text: DesignNode = {
    ...baseNode,
    type: "text",
    text: "iiii",
    width: 400,
    height: 60,
    fontSize: 24,
    fontWeight: 400,
  };
  const narrow = layoutText(text);
  const wide = layoutText({ ...text, text: "WWWW" });
  assert.ok(wide.widths[0] > narrow.widths[0] * 2);
  const cjk = layoutText({
    ...text,
    text: "让好好生活的企业被更多人看见。",
    width: 200,
    height: 100,
  });
  assert.equal(cjk.missingGlyphs.length, 0);
  assert.ok(cjk.lineCount > 1);
  assert.equal(cjk.overflow, false);
  const words = layoutText({
    ...text,
    text: "Hello world",
    width: 85,
    height: 100,
    fontSize: 20,
  });
  assert.deepEqual(words.lines, ["Hello", "world"]);
});
test("溢出会报告，显式省略保留省略号；字重产生不同真实字形", () => {
  const n: DesignNode = {
    ...baseNode,
    type: "text",
    text: "一个很长的标题需要正确处理",
    width: 80,
    height: 35,
    fontSize: 20,
  };
  assert.equal(layoutText(n).overflow, true);
  const e = layoutText({ ...n, textOverflow: "ellipsis" });
  assert.equal(e.lines.length, 1);
  assert.ok(e.lines[0].endsWith("…"));
  assert.ok(e.widths[0] <= 80);
  assert.notEqual(
    layoutText({ ...n, fontWeight: 400 }).paths,
    layoutText({ ...n, fontWeight: 700 }).paths,
  );
});
test("草稿与保存版本使用同一渲染，SVG 文本为可移植字形路径", async (t) => {
  const f = await setup(t);
  const data = {
    ...blankDesign,
    viewport: { width: 320, height: 160 },
    nodes: [
      {
        ...baseNode,
        width: 320,
        height: 160,
        fill: "#f7f8f0",
        children: [
          {
            ...baseNode,
            id: "heading",
            type: "text",
            x: 20,
            y: 24,
            width: 280,
            height: 52,
            text: "高保真中文 UI",
            fontSize: 28,
            fontWeight: 650,
            fill: "#173f32",
          },
        ],
      },
    ],
  };
  const a = await f.save(data);
  const draft = await renderDocument(f.store, data);
  const saved = await renderDesign(f.store, a);
  assert.deepEqual(draft.bytes, saved.bytes);
  assert.match(saved.svg, /<path transform=/);
  assert.doesNotMatch(saved.svg, /<text[ >]/);
  assert.ok(saved.svg.includes("高保真中文 UI"));
  assert.equal(saved.textIssues.length, 0);
  const retina = await renderDesign(f.store, a, undefined, "png", 2);
  assert.equal((await sharp(retina.bytes).metadata()).width, 640);
  assert.notDeepEqual(
    retina.bytes,
    await sharp(saved.bytes).resize(640, 320).png().toBuffer(),
  );
});
test("投影出现在节点边界外，渐变实际改变像素", async (t) => {
  const f = await setup(t);
  const d = {
    ...blankDesign,
    viewport: { width: 120, height: 100 },
    nodes: [
      {
        ...baseNode,
        id: "card",
        x: 25,
        y: 20,
        width: 60,
        height: 50,
        radius: 8,
        fill: "#ffffff",
        gradient: {
          angle: 0,
          stops: [
            { offset: 0, color: "#ff0000" },
            { offset: 1, color: "#0000ff" },
          ],
        },
        shadow: { x: 0, y: 8, blur: 12, color: "#000000", opacity: 0.5 },
      },
    ],
  };
  const rendered = await renderDocument(f.store, d);
  const { data, info } = await sharp(rendered.bytes)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const pixel = (x: number, y: number) => [
    ...data.slice((y * info.width + x) * 4, (y * info.width + x) * 4 + 4),
  ];
  assert.ok(pixel(35, 35)[0] > pixel(70, 35)[0]);
  assert.ok(pixel(70, 35)[2] > pixel(35, 35)[2]);
  assert.ok(pixel(50, 78)[3] > 0);
});
test("contain 保留图标透明空间，cover 填满容器", async (t) => {
  const f = await setup(t);
  const bytes = await sharp({
    create: { width: 40, height: 20, channels: 4, background: "#ff0000" },
  })
    .png()
    .toBuffer();
  const asset: any = await f.mutate("asset.import", {
    name: "测试素材",
    source: "程序生成测试色块，仅验证图片布局",
    base64: bytes.toString("base64"),
  });
  const node = {
    ...baseNode,
    id: "image",
    type: "image",
    assetId: asset.id,
    width: 100,
    height: 100,
  };
  const contain = await renderDocument(f.store, {
    ...blankDesign,
    viewport: { width: 100, height: 100 },
    nodes: [{ ...node, imageFit: "contain" }],
  });
  const cover = await renderDocument(f.store, {
    ...blankDesign,
    viewport: { width: 100, height: 100 },
    nodes: [{ ...node, imageFit: "cover" }],
  });
  const a = await sharp(contain.bytes).ensureAlpha().raw().toBuffer();
  const b = await sharp(cover.bytes).ensureAlpha().raw().toBuffer();
  assert.equal(a[3], 0);
  assert.equal(b[3], 255);
});
test("未生成的图标、缺失计划素材与未复核设计无法高保真确认", async (t) => {
  const f = await setup(t);
  const design = designSchema.parse({
    ...blankDesign,
    fidelity: "high",
    nodes: [{ ...baseNode, id: "fake-icon", role: "icon", type: "rect" }],
    assetRequirements: [
      { id: "hero", role: "product-image", description: "产品主图" },
    ],
  });
  const report = reviewDesign(design, []);
  assert.equal(report.ready, false);
  for (const code of [
    "PLACEHOLDER_ASSET",
    "MISSING_REQUIRED_ASSET",
    "VISUAL_REVIEW_REQUIRED",
  ])
    assert.ok(report.issues.some((i) => i.code === code));
  const a = await f.save(design);
  await assert.rejects(
    () => f.mutate("artifact.confirm", { ref: a, reason: "尝试确认" }),
    /素材|复核/,
  );
  assert.equal((await f.store.read()).confirmations.length, 0);
});
test("有明确无图原因的文字页可交付，历史草稿仍可保存确认", async (t) => {
  const f = await setup(t);
  const high = designSchema.parse({
    ...blankDesign,
    fidelity: "high",
    noAssetsReason: "该页面仅呈现纯文字设置，不需要插画或图片图标。",
    visualReview: "已查看实际预览，确认字体、留白及文字边界。",
  });
  assert.equal(reviewDesign(high, []).ready, false);
  const ref = await f.mutate("asset.import", { name: "完整参考图", source: "测试生成", base64: (await sharp({create:{width:10,height:10,channels:4,background:"white"}}).png().toBuffer()).toString("base64") }) as any;
  high.referenceAssetId = ref.id;
  assert.equal(reviewDesign(high, (await f.store.read()).assets).ready, true);
  const flattened = { ...high, nodes: [{ ...baseNode, id: "flat", type: "image" as const, assetId: ref.id }] };
  assert.ok(reviewDesign(flattened, (await f.store.read()).assets).issues.some((i) => i.code === "FLATTENED_REFERENCE"));
  await assert.rejects(() => f.save({ ...high, referenceAssetId: "missing" }), /参考图/);
  const legacy = await f.save(blankDesign);
  await f.mutate("artifact.confirm", {
    ref: legacy,
    reason: "确认旧版结构草稿",
  });
  assert.equal((await f.store.read()).confirmations.length, 1);
});
test("主轴分布与交叉轴对齐一致应用于节点与后代", () => {
  const parent: DesignNode = {
    ...baseNode,
    width: 300,
    height: 100,
    padding: 20,
    gap: 10,
    layout: "horizontal",
    alignItems: "center",
    justifyContent: "space-between",
  };
  const nodes = layoutNodes(
    [
      { ...baseNode, id: "a", width: 40, height: 20 },
      { ...baseNode, id: "b", width: 40, height: 20 },
    ],
    parent,
  );
  assert.equal(nodes[0].x, 20);
  assert.equal(nodes[0].y, 40);
  assert.equal(nodes[1].x, 240);
  assert.equal(nodes[1].y, 40);
});
