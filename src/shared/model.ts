import { z } from "zod";
export const stages = [
  "init",
  "research",
  "requirements",
  "prd",
  "design",
  "handoff",
  "coding",
  "testing",
  "release",
  "operations",
] as const;
export type Stage = (typeof stages)[number];
export const labels: Record<Stage, string> = {
  init: "立项",
  research: "调研",
  requirements: "需求整理",
  prd: "PRD",
  design: "UI 设计",
  handoff: "开发交付",
  coding: "Coding",
  testing: "测试",
  release: "发布",
  operations: "运营",
};
export const kinds = [
  "brief",
  "research",
  "requirement",
  "prd",
  "design",
  "code",
  "test",
  "release",
  "metric",
  "feedback",
  "review",
] as const;
export type Kind = (typeof kinds)[number];
export const stageKinds: Record<Stage, Kind[]> = {
  init: ["brief"],
  research: ["research"],
  requirements: ["requirement"],
  prd: ["prd"],
  design: ["design"],
  handoff: [],
  coding: ["code"],
  testing: ["test"],
  release: ["release"],
  operations: ["metric", "feedback", "review"],
};
export const kindLabels: Record<Kind, string> = {
  brief: "立项卡",
  research: "调研笔记",
  requirement: "需求",
  prd: "PRD",
  design: "页面设计",
  code: "实现记录",
  test: "测试用例",
  release: "发布记录",
  metric: "指标观察",
  feedback: "用户反馈",
  review: "版本复盘",
};
export const templates: Record<Kind, string> = {
  brief:
    "# 项目立项\n\n## 要解决的问题\n\n## 目标用户\n\n## 成功指标\n\n## 范围与不做事项\n\n## 关键假设与验证方法\n\n## 资源与风险\n",
  research:
    "# 调研记录\n\n## 研究问题\n\n## 来源与收录时间\n\n## 原文摘录\n\n## 事实与结论\n\n## 推断、反证与待验证假设\n",
  requirement:
    "# 需求\n\n## 用户与场景\n\n## 预期行为\n\n## 异常与边界\n\n## 验收标准\n\n## 来源与依赖\n",
  prd: "# 产品需求文档\n\n## 背景与目标\n\n## 用户与范围\n\n## 用户流程\n\n## 功能与业务规则\n\n## 页面与状态\n\n## 权限、异常与边界\n\n## 数据与外部依赖\n\n## 验收标准\n\n## 埋点与运营观察\n\n## 发布与回滚\n\n## 待澄清问题\n",
  design: "# 页面说明\n\n## 关联需求\n\n## 交互与页面状态\n\n## 响应式约束\n",
  code: "# 实现记录\n\n## 对应任务与交付包\n\n## 实现范围\n\n## 提交或代码差异\n\n## 自测与未验证事项\n",
  test: "# 测试用例\n\n## 关联验收标准\n\n## 前置条件与测试数据\n\n## 操作步骤\n\n## 预期结果\n\n## 实际结果与缺陷\n",
  release:
    "# 发布记录\n\n## 发布范围与构建\n\n## 环境与检查\n\n## 实际部署结果\n\n## 回滚方案\n\n## 已知问题\n",
  metric:
    "# 指标观察\n\n## 指标定义与分子分母\n\n## 数据来源与时间范围\n\n## 观察结果\n\n## 推断与限制\n",
  feedback:
    "# 用户反馈\n\n## 原文、来源与时间\n\n## 对应版本与用户场景\n\n## 影响与期望\n\n## 后续行动\n",
  review:
    "# 迭代复盘\n\n## 目标与实际\n\n## 证据与数据缺口\n\n## 结论与假设\n\n## 下一轮需求\n",
};
export const refSchema = z.object({
  id: z.string().regex(/^[a-z]+_[a-f0-9-]+$/),
  version: z.number().int().positive(),
});
export type Ref = z.infer<typeof refSchema>;
const color = z
  .string()
  .regex(
    /^(#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})|none|transparent)$/,
  );
export const gradientSchema = z
  .object({
    angle: z.number().min(-360).max(360),
    stops: z
      .array(z.object({ offset: z.number().min(0).max(1), color }))
      .min(2)
      .max(8),
  })
  .strict();
export const shadowSchema = z
  .object({
    color,
    blur: z.number().min(0).max(100),
    x: z.number().min(-100).max(100),
    y: z.number().min(-100).max(100),
    opacity: z.number().min(0).max(1).default(0.15),
  })
  .strict();
export const nodeSchema: z.ZodType<DesignNode, z.ZodTypeDef, unknown> = z.lazy(
  () =>
    z
      .object({
        id: z.string().regex(/^[a-zA-Z][\w-]{0,80}$/),
        name: z.string().max(160),
        type: z.enum(["frame", "rect", "text", "image", "vector"]),
        x: z.number().min(-10000).max(10000).default(0),
        y: z.number().min(-10000).max(10000).default(0),
        width: z.number().positive().max(4096),
        height: z.number().positive().max(4096),
        fill: color.default("#ffffff"),
        radius: z.number().min(0).max(256).default(0),
        text: z.string().max(10000).optional(),
        fontSize: z.number().min(6).max(256).optional(),
        fontWeight: z.number().int().min(100).max(900).optional(),
        lineHeight: z.number().positive().max(512).optional(),
        letterSpacing: z.number().min(-10).max(40).optional(),
        textAlign: z.enum(["left", "center", "right"]).optional(),
        verticalAlign: z.enum(["top", "middle", "bottom"]).optional(),
        maxLines: z.number().int().min(1).max(200).optional(),
        textOverflow: z.enum(["clip", "ellipsis"]).optional(),
        stroke: color.optional(),
        strokeWidth: z.number().min(0).max(32).optional(),
        opacity: z.number().min(0).max(1).optional(),
        shadow: shadowSchema.optional(),
        gradient: gradientSchema.optional(),
        imageFit: z.enum(["cover", "contain", "fill"]).optional(),
        imagePosition: z
          .enum(["center", "top", "bottom", "left", "right"])
          .optional(),
        clipContent: z.boolean().optional(),
        alignItems: z.enum(["start", "center", "end", "stretch"]).optional(),
        justifyContent: z
          .enum(["start", "center", "end", "space-between"])
          .optional(),
        role: z
          .enum([
            "surface",
            "heading",
            "body",
            "button",
            "icon",
            "product-image",
            "illustration",
          ])
          .optional(),
        assetId: z
          .string()
          .regex(/^asset_[a-f0-9-]+$/)
          .optional(),
        path: z
          .string()
          .regex(/^[MmLlHhVvCcSsQqTtAaZz0-9eE.,+\s-]+$/)
          .max(10000)
          .optional(),
        layout: z
          .enum(["absolute", "vertical", "horizontal"])
          .default("absolute"),
        gap: z.number().min(0).max(500).default(0),
        padding: z.number().min(0).max(500).default(0),
        children: z.array(nodeSchema).max(500).default([]),
      })
      .strict(),
);
export interface DesignNode {
  id: string;
  name: string;
  type: "frame" | "rect" | "text" | "image" | "vector";
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
  radius: number;
  text?: string;
  fontSize?: number;
  fontWeight?: number;
  lineHeight?: number;
  letterSpacing?: number;
  textAlign?: "left" | "center" | "right";
  verticalAlign?: "top" | "middle" | "bottom";
  maxLines?: number;
  textOverflow?: "clip" | "ellipsis";
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  shadow?: z.infer<typeof shadowSchema>;
  gradient?: z.infer<typeof gradientSchema>;
  imageFit?: "cover" | "contain" | "fill";
  imagePosition?: "center" | "top" | "bottom" | "left" | "right";
  clipContent?: boolean;
  alignItems?: "start" | "center" | "end" | "stretch";
  justifyContent?: "start" | "center" | "end" | "space-between";
  role?:
    | "surface"
    | "heading"
    | "body"
    | "button"
    | "icon"
    | "product-image"
    | "illustration";
  assetId?: string;
  path?: string;
  layout: "absolute" | "vertical" | "horizontal";
  gap: number;
  padding: number;
  children: DesignNode[];
}
export const designSchema = z
  .object({
    viewport: z.object({
      width: z.number().int().positive().max(4096),
      height: z.number().int().positive().max(4096),
    }),
    nodes: z.array(nodeSchema).max(500),
    interactions: z.string().max(30000).default(""),
    states: z.array(z.string()).default(["默认"]),
    tokens: z.record(z.string()).default({}),
    fidelity: z.enum(["draft", "high"]).optional(),
    assetRequirements: z
      .array(
        z.object({
          id: z.string().min(1),
          role: z.enum(["product-image", "illustration", "icon", "hero"]),
          description: z.string().min(1),
          assetId: z.string().optional(),
        }),
      )
      .max(100)
      .optional(),
    referenceAssetId: z.string().min(1).optional(),
    visualReview: z.string().max(10000).optional(),
    noAssetsReason: z.string().max(1000).optional(),
  })
  .strict();
export type DesignDocument = z.infer<typeof designSchema>;
export interface ArtifactVersion extends Ref {
  iterationId: string;
  kind: Kind;
  title: string;
  body: string;
  data: Record<string, unknown>;
  refs: Ref[];
  author: string;
  createdAt: string;
  hash: string;
}
export interface Asset {
  id: string;
  name: string;
  file: string;
  mime: string;
  width: number;
  height: number;
  hash: string;
  source: string;
  createdAt: string;
}
export interface ActionRequest {
  id: string;
  iterationId: string;
  version: number;
  stage: Stage;
  title: string;
  instruction: string;
  refs: Ref[];
  bundleId?: string;
  status:
    "pending" | "running" | "blocked" | "submitted" | "accepted" | "cancelled";
  lease?: { token: string; owner: string; expiresAt: string };
  progress: string;
  results: Ref[];
  createdAt: string;
  updatedAt: string;
}
export interface Evidence {
  id: string;
  iterationId: string;
  type: "code" | "test" | "release" | "operations";
  status: "not_run" | "passed" | "failed" | "blocked" | "skipped";
  summary: string;
  source: "manual" | "codex";
  commit: string;
  environment: string;
  refs: Ref[];
  attachments: string[];
  createdAt: string;
}
export interface Confirmation {
  ref: Ref;
  actor: string;
  reason: string;
  at: string;
}
export interface HandoffBundle {
  id: string;
  iterationId: string;
  title: string;
  artifacts: ArtifactVersion[];
  assets: Asset[];
  commit: string;
  rules: { path: string; body: string }[];
  createdAt: string;
  hash: string;
}
export interface Iteration {
  id: string;
  name: string;
  goal: string;
  stage: Stage;
}
export interface State {
  schemaVersion: 1;
  revision: number;
  project: { id: string; name: string; createdAt: string };
  iterations: Iteration[];
  artifacts: ArtifactVersion[];
  assets: Asset[];
  requests: ActionRequest[];
  evidence: Evidence[];
  confirmations: Confirmation[];
  bundles: HandoffBundle[];
  capabilities: Record<string, { available: boolean; note: string }>;
  events: {
    id: string;
    at: string;
    action: string;
    actor: string;
    detail: string;
  }[];
  receipts: Record<string, { digest: string; result: unknown }>;
}
export const baseNode: DesignNode = {
  id: "page",
  name: "页面",
  type: "frame",
  x: 0,
  y: 0,
  width: 390,
  height: 760,
  fill: "#ffffff",
  radius: 0,
  layout: "absolute",
  gap: 0,
  padding: 0,
  children: [],
};
export const blankDesign: DesignDocument = {
  viewport: { width: 390, height: 760 },
  nodes: [baseNode],
  interactions: "",
  states: ["默认"],
  tokens: { primary: "#2563eb", text: "#172033" },
};
export function latestArtifacts(state: State, iterationId?: string) {
  const map = new Map<string, ArtifactVersion>();
  for (const a of state.artifacts)
    if (!iterationId || a.iterationId === iterationId) map.set(a.id, a);
  return [...map.values()];
}
export function latestRef(state: State, id: string) {
  return state.artifacts.filter((a) => a.id === id).at(-1);
}
export function refKey(ref: Ref) {
  return `${ref.id}@${ref.version}`;
}
export function sameRef(a: Ref, b: Ref) {
  return a.id === b.id && a.version === b.version;
}
export function affected(state: State, id: string) {
  const ids = new Set([id]);
  let changed = true;
  while (changed) {
    changed = false;
    for (const a of latestArtifacts(state))
      if (!ids.has(a.id) && a.refs.some((r) => ids.has(r.id))) {
        ids.add(a.id);
        changed = true;
      }
  }
  ids.delete(id);
  return latestArtifacts(state).filter((a) => ids.has(a.id));
}
export function staleRefs(state: State, a: { refs: Ref[] }) {
  return a.refs.filter((r) => latestRef(state, r.id)?.version !== r.version);
}
export function confirmed(state: State, a: Ref) {
  return state.confirmations.some((c) => sameRef(c.ref, a));
}
export function layoutNodes(
  nodes: DesignNode[],
  parent?: DesignNode,
): DesignNode[] {
  const flow = parent && parent.layout !== "absolute";
  const horizontal = parent?.layout === "horizontal";
  const padding = parent?.padding ?? 0;
  let gap = parent?.gap ?? 0;
  const total = nodes.reduce(
    (sum, n) => sum + (horizontal ? n.width : n.height),
    0,
  );
  const available = parent
    ? (horizontal ? parent.width : parent.height) - padding * 2
    : 0;
  const free = available - total - gap * Math.max(0, nodes.length - 1);
  if (parent?.justifyContent === "space-between" && nodes.length > 1)
    gap += Math.max(0, free) / (nodes.length - 1);
  let cursor =
    padding +
    (parent?.justifyContent === "center"
      ? Math.max(0, free) / 2
      : parent?.justifyContent === "end"
        ? Math.max(0, free)
        : 0);
  return nodes.map((n) => {
    let { x, y, width, height } = n;
    if (flow && parent) {
      const cross = (horizontal ? parent.height : parent.width) - padding * 2;
      if (parent.alignItems === "stretch") {
        if (horizontal) height = Math.max(1, cross);
        else width = Math.max(1, cross);
      }
      const space = cross - (horizontal ? height : width);
      const crossOffset =
        padding +
        (parent.alignItems === "center"
          ? space / 2
          : parent.alignItems === "end"
            ? space
            : 0);
      x = horizontal ? cursor : crossOffset;
      y = horizontal ? crossOffset : cursor;
      cursor += (horizontal ? width : height) + gap;
    }
    const positioned = { ...n, x, y, width, height };
    return { ...positioned, children: layoutNodes(n.children, positioned) };
  });
}
