import {
  layoutNodes,
  type DesignDocument,
  type DesignNode,
  type Asset,
} from "../shared/model.js";
import { layoutText } from "./text.js";
export interface DesignIssue {
  code: string;
  severity: "error" | "warning";
  message: string;
  nodeId?: string;
}
export function reviewDesign(design: DesignDocument, assets: Asset[]) {
  const issues: DesignIssue[] = [];
  const nodes: DesignNode[] = [];
  const flatten = (list: DesignNode[]) => {
    for (const n of list) {
      nodes.push(n);
      flatten(n.children);
    }
  };
  flatten(layoutNodes(design.nodes));
  const issue = (
    code: string,
    message: string,
    nodeId?: string,
    severity: "error" | "warning" = "error",
  ) => issues.push({ code, message, nodeId, severity });
  const imageNodes = nodes.filter((n) => n.type === "image");
  const usedAssets = new Set(imageNodes.map((n) => n.assetId));
  for (const n of nodes) {
    if (n.type === "text" && n.text) {
      const result = layoutText(n);
      if (result.overflow)
        issue(
          "TEXT_OVERFLOW",
          `${n.name} 的文字被边界裁切，请增加尺寸或调整排版`,
          n.id,
        );
      if (result.missingGlyphs.length)
        issue(
          "MISSING_GLYPH",
          `${n.name} 包含字体不支持的字符；图标请使用图片素材`,
          n.id,
        );
    }
    if (
      ["icon", "product-image", "illustration"].includes(n.role ?? "") &&
      n.type !== "image"
    )
      issue(
        "PLACEHOLDER_ASSET",
        `${n.name} 需要独立图片素材，不能用文字或几何色块代替`,
        n.id,
      );
    if (
      n.gradient &&
      n.gradient.stops.some(
        (stop, i) => i > 0 && stop.offset < n.gradient!.stops[i - 1].offset,
      )
    )
      issue("GRADIENT_ORDER", `${n.name} 的渐变色标需要按位置排列`, n.id);
  }
  for (const requirement of design.assetRequirements ?? []) {
    if (
      !requirement.assetId ||
      !assets.some((a) => a.id === requirement.assetId)
    )
      issue(
        "MISSING_REQUIRED_ASSET",
        `尚未完成素材：${requirement.description}`,
      );
    else if (!usedAssets.has(requirement.assetId))
      issue(
        "UNUSED_REQUIRED_ASSET",
        `素材已登记但尚未装配：${requirement.description}`,
      );
  }
  if (design.fidelity === "high") {
    if (!design.referenceAssetId || !assets.some((a) => a.id === design.referenceAssetId))
      issue("REFERENCE_REQUIRED", "请先生成并登记完整 UI 参考图，再按图重建设计");
    if (design.referenceAssetId && usedAssets.has(design.referenceAssetId))
      issue("FLATTENED_REFERENCE", "完整参考图仅用于对照，不能作为页面图片节点代替可编辑设计");
    if (!imageNodes.length && !design.noAssetsReason?.trim())
      issue(
        "ASSET_PLAN_REQUIRED",
        "高保真设计需要真实图片素材；无素材页面请说明原因",
      );
    if (!design.visualReview?.trim())
      issue(
        "VISUAL_REVIEW_REQUIRED",
        "请先查看整页与关键模块预览，再记录视觉复核结论",
      );
    if (
      nodes.filter((n) => n.type === "text").length >= 5 &&
      new Set(
        nodes
          .filter((n) => n.type === "text")
          .map((n) => `${n.fontSize ?? 16}:${n.fontWeight ?? 400}`),
      ).size < 2
    )
      issue(
        "TEXT_HIERARCHY",
        "当前文字缺少字号或字重层级",
        undefined,
        "warning",
      );
  } else
    issue(
      "DRAFT_FIDELITY",
      "当前为结构草稿，尚未按高保真标准交付",
      undefined,
      "warning",
    );
  return {
    fidelity: design.fidelity ?? "draft",
    ready: !issues.some((i) => i.severity === "error"),
    issues,
    stats: {
      nodes: nodes.length,
      imageNodes: imageNodes.length,
      uniqueAssets: usedAssets.size,
    },
  };
}
