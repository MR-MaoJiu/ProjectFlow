import {
  Store,
  baseNode,
  renderDesign,
  reviewDesign,
} from "../../dist/core.mjs";
import { promises as fs } from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const project = await fs.mkdtemp(path.join(os.tmpdir(), "projectflow-hifi-"));
const store = await Store.bind(project, "高保真视觉验证（虚构示例）");
const mutation = async (operation, args) =>
  store.mutate(
    operation,
    args,
    (await store.read()).revision,
    crypto.randomUUID(),
    "视觉验证样例",
  );
const photo = await mutation("asset.import", {
  name: "日常手帐产品摄影",
  source: "imagegen 生成；虚构产品演示",
  base64: (await fs.readFile(path.join(here, "assets/notebook.png"))).toString(
    "base64",
  ),
});
const bookmark = await mutation("asset.import", {
  name: "收藏图标",
  source: "imagegen 生成；透明独立图标",
  base64: (await fs.readFile(path.join(here, "assets/bookmark.png"))).toString(
    "base64",
  ),
});
const reference = await mutation("asset.import", {
  name: "完整高保真 UI 参考图",
  source: "imagegen 根据初版布局生成的完整视觉参考；后续节点重建对照",
  base64: (await fs.readFile(path.join(here, "assets/reference.png"))).toString("base64"),
});
let counter = 0;
const color = "#173f32",
  muted = "#78877d";
const node = (name, type, x, y, width, height, extra = {}) => ({
  ...baseNode,
  id: `element_${++counter}`,
  name,
  type,
  x,
  y,
  width,
  height,
  fill: "#ffffff",
  ...extra,
});
const text = (name, value, x, y, width, size = 14, extra = {}) =>
  node(name, "text", x, y, width, Math.ceil(size * 1.5), {
    text: value,
    fontSize: size,
    lineHeight: size * 1.5,
    fill: color,
    verticalAlign: "middle",
    role: "body",
    ...extra,
  });
const rect = (name, x, y, w, h, fill, extra = {}) =>
  node(name, "rect", x, y, w, h, { fill, ...extra });
const group = (name, x, y, w, h, children, extra = {}) =>
  node(name, "frame", x, y, w, h, { children, fill: "transparent", ...extra });
const image = (name, x, y, w, h, asset, extra = {}) =>
  node(name, "image", x, y, w, h, {
    assetId: asset.id,
    imageFit: "cover",
    fill: "transparent",
    role: "product-image",
    ...extra,
  });
const icon = (x, y) =>
  group(
    "收藏按钮",
    x,
    y,
    40,
    40,
    [
      image("生成的收藏图标", -20, -20, 80, 80, bookmark, {
        role: "icon",
        imageFit: "contain",
      }),
    ],
    {
      fill: "#ffffff",
      radius: 12,
      shadow: { color: "#102b20", x: 0, y: 3, blur: 12, opacity: 0.08 },
      role: "button",
    },
  );
const button = (label, x, y, w = 342) =>
  group(
    label,
    x,
    y,
    w,
    52,
    [
      text(label, label, 12, 13, w - 24, 15, {
        fontWeight: 600,
        fill: "#ffffff",
        textAlign: "center",
        role: "button",
      }),
    ],
    {
      fill: color,
      radius: 16,
      gradient: {
        angle: 0,
        stops: [
          { offset: 0, color: "#183f32" },
          { offset: 1, color: "#35634b" },
        ],
      },
      shadow: { color: "#173f32", x: 0, y: 7, blur: 20, opacity: 0.16 },
      role: "button",
    },
  );
const tabs = () =>
  group(
    "底部导航",
    0,
    786,
    390,
    74,
    [
      rect("导航分隔线", 0, 0, 390, 1, "#e8eae2"),
      ...["发现", "企业", "收藏"].map((t, i) =>
        text(t, t, 16 + i * 125, 17, 108, 13, {
          fontWeight: i === 0 ? 600 : 400,
          fill: i === 0 ? color : "#8e988e",
          textAlign: "center",
        }),
      ),
      rect("选中标记", 60, 51, 20, 3, color, { radius: 1.5 }),
    ],
    { fill: "#ffffff" },
  );
const header = (label, back = false) => [
  text("顶部导航", back ? "返回" : label, 24, 22, 260, back ? 13 : 20, {
    fontWeight: back ? 500 : 650,
    role: "heading",
  }),
  icon(326, 18),
];
const discover = [
  ...header("不加班企业"),
  text("主题", "WORK WELL · LIVE WELL", 24, 86, 330, 10, {
    letterSpacing: 1.8,
    fill: muted,
    fontWeight: 500,
  }),
  text("主标题", "让好好生活的企业\n被更多人看见。", 24, 116, 342, 30, {
    height: 94,
    lineHeight: 43,
    fontWeight: 650,
    role: "heading",
  }),
  text("说明", "发现用心的产品，也看见背后的工作方式。", 24, 219, 342, 12, {
    height: 40,
    lineHeight: 20,
    fill: muted,
  }),
  group(
    "搜索框",
    24,
    280,
    342,
    49,
    [text("搜索提示", "搜索产品或企业", 18, 14, 292, 13, { fill: "#98a198" })],
    { fill: "#ffffff", radius: 15, stroke: "#e3e7de", strokeWidth: 1 },
  ),
  ...["推荐", "日常", "食品", "数字产品"].map((label, i) =>
    group(
      label,
      24 + i * 87,
      352,
      i === 3 ? 81 : 75,
      33,
      [
        text(label, label, 3, 6, i === 3 ? 75 : 69, 12, {
          textAlign: "center",
          fill: i === 0 ? "#ffffff" : muted,
          fontWeight: 500,
        }),
      ],
      { fill: i === 0 ? color : "#f0f2eb", radius: 16 },
    ),
  ),
  image("真实产品主图", 24, 410, 342, 228, photo, { radius: 20 }),
  icon(312, 424),
  text("分类", "日常好物 / 产品故事", 24, 655, 330, 10, {
    letterSpacing: 0.8,
    fill: muted,
  }),
  text("产品名", "留白 · 日常手帐", 24, 683, 342, 22, {
    fontWeight: 600,
    role: "heading",
  }),
  text("产品副标题", "慢慢造物  ·  为生活留下更多可能", 24, 727, 342, 12, {
    fill: muted,
  }),
  ...tabs().children.map((n) => ({ ...n, y: n.y + 786 })),
];
const company = [
  ...header("", true),
  text("页名", "企业档案", 127, 22, 134, 15, {
    textAlign: "center",
    fontWeight: 550,
  }),
  image("企业产品视觉", 24, 86, 342, 204, photo, {
    radius: 20,
    imagePosition: "right",
  }),
  text("企业名", "慢慢造物", 24, 310, 342, 30, {
    fontWeight: 650,
    role: "heading",
  }),
  text("位置与类型", "杭州 · 设计团队", 24, 362, 342, 12, { fill: muted }),
  group(
    "资料标签",
    24,
    405,
    94,
    28,
    [
      text("资料标签", "工作方式资料", 8, 4, 78, 10, {
        textAlign: "center",
        fill: "#557859",
      }),
    ],
    { fill: "#eaf0e4", radius: 14 },
  ),
  text("企业主张", "工作之外，\n也有自己的生活。", 24, 451, 342, 27, {
    height: 87,
    lineHeight: 39,
    fontWeight: 550,
    role: "heading",
  }),
  text("资料标题", "资料与来源", 24, 561, 342, 14, { fontWeight: 600 }),
  group(
    "资料入口",
    24,
    601,
    342,
    122,
    [
      text("团队介绍", "团队介绍", 18, 15, 290, 13),
      text("团队介绍说明", "了解品牌与产品背后的故事", 18, 45, 290, 11, {
        fill: muted,
      }),
      rect("细分隔线", 18, 75, 306, 1, "#e6e9e0"),
      text("查看资料", "查看公开资料与工作方式", 18, 88, 306, 12, {
        fontWeight: 500,
      }),
    ],
    { fill: "#f0f3e9", radius: 18 },
  ),
  button("查看旗下产品", 24, 768),
];
const product = [
  ...header("", true),
  text("详情导航", "产品详情", 125, 22, 140, 15, {
    textAlign: "center",
    fontWeight: 550,
  }),
  image("产品大图", 0, 83, 390, 333, photo, { imagePosition: "center" }),
  group(
    "图片标签",
    24,
    365,
    88,
    29,
    [
      text("图片标签", "日常好物", 6, 5, 76, 11, {
        textAlign: "center",
        fontWeight: 500,
      }),
    ],
    { fill: "#ffffff", opacity: 0.94, radius: 14 },
  ),
  text("详情产品名", "留白 · 日常手帐", 24, 437, 342, 27, {
    fontWeight: 650,
    role: "heading",
  }),
  text(
    "详情描述",
    "给日常留一点空白。\n将想法、计划和生活慢慢写下来。",
    24,
    491,
    342,
    13,
    { height: 56, lineHeight: 23, fill: muted },
  ),
  group(
    "产品出处",
    24,
    578,
    342,
    73,
    [
      text("来源标题", "来自慢慢造物", 18, 11, 305, 14, { fontWeight: 550 }),
      text("来源说明", "杭州 · 设计团队", 18, 41, 305, 11, { fill: muted }),
    ],
    { fill: "#f0f3e9", radius: 17 },
  ),
  text("了解更多", "支持前，先了解工作方式", 24, 674, 342, 15, {
    fontWeight: 500,
  }),
  text("了解更多链接", "查看企业资料与公开来源", 24, 706, 342, 12, {
    fill: muted,
  }),
  button("前往官方产品页", 24, 768),
];
const phone = (name, x, children) =>
  group(name, x, 126, 390, 860, children, {
    fill: "#fdfcf8",
    radius: 30,
    shadow: { color: "#123123", x: 0, y: 12, blur: 38, opacity: 0.12 },
  });
const design = {
  viewport: { width: 1400, height: 1040 },
  nodes: [
    rect("画板背景", 0, 0, 1400, 1040, "#f0f3ed"),
    text("画板标题", "不加班企业", 58, 35, 380, 30, {
      fontWeight: 600,
      role: "heading",
    }),
    text("画板说明", "高保真界面 / 发现 · 企业 · 产品", 440, 48, 820, 13, {
      fill: muted,
    }),
    phone("发现页", 58, discover),
    phone("企业详情", 505, company),
    phone("产品详情", 952, product),
    text(
      "样例说明",
      "虚构示例 · 独立生成素材 · 可编辑文字与布局",
      58,
      1003,
      1250,
      11,
      { fill: muted },
    ),
  ],
  interactions:
    "发现页进入产品或企业详情；详情页支持返回、收藏与查看公开来源。此为虚构视觉验证，不连接真实企业或产品。",
  states: ["默认"],
  tokens: { primary: color, muted, surface: "#fbfaf6" },
  fidelity: "high",
  referenceAssetId: reference.id,
  assetRequirements: [
    {
      id: "photo",
      role: "product-image",
      description: "亚麻手帐真实产品摄影",
      assetId: photo.id,
    },
    {
      id: "bookmark",
      role: "icon",
      description: "生成的透明收藏图标",
      assetId: bookmark.id,
    },
  ],
  visualReview:
    "对照 imagegen 完整效果图：保留三页构图、产品摄影、绿色收藏图标与文字层级；统一两页底部主按钮基线。文字使用可编辑中文节点校正文案，保留示例声明；图片局部构图和字形与生成参考存在差异，不宣称像素一致。",
};
const artifact = await mutation("artifact.save", {
  iterationId: (await store.read()).iterations[0].id,
  kind: "design",
  title: "高保真三页面示例",
  expectedVersion: 0,
  body: "高保真渲染验证，全部业务内容为虚构示例。",
  data: design,
  refs: [],
});
const rendered = await renderDesign(store, artifact);
const quality = reviewDesign(
  store.validateDesign(design, await store.read()),
  (await store.read()).assets,
);
await fs.writeFile(path.join(here, "preview.png"), rendered.bytes);
await fs.writeFile(
  path.join(project, "quality.json"),
  JSON.stringify(quality, null, 2),
);
console.log(
  JSON.stringify(
    {
      project,
      artifact: { id: artifact.id, version: artifact.version },
      preview: path.join(here, "preview.png"),
      quality,
    },
    null,
    2,
  ),
);
