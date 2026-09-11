import { promises as fs } from "node:fs";
import sharp from "sharp";
import { layoutNodes, type DesignNode, type Ref } from "../shared/model.js";
import { Store, hash } from "./store.js";
import { ensure } from "./errors.js";
import { layoutText } from "./text.js";
const esc = (s: string) =>
  s.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c]!,
  );
export async function renderDesign(
  store: Store,
  ref: Ref,
  nodeId?: string,
  format: "png" | "svg" = "png",
  scale = 1,
) {
  const state = await store.read();
  const artifact = state.artifacts.find(
    (a) => a.id === ref.id && a.version === ref.version,
  );
  ensure(artifact?.kind === "design", "DESIGN", "设计版本不存在", 404);
  return renderDocument(store, artifact.data, nodeId, format, scale);
}
export async function renderDocument(
  store: Store,
  data: unknown,
  nodeId?: string,
  format: "png" | "svg" = "png",
  scale = 1,
) {
  const state = await store.read();
  const d = store.validateDesign(data, state);
  let nodes = layoutNodes(d.nodes),
    width = d.viewport.width,
    height = d.viewport.height;
  if (nodeId) {
    const find = (ns: DesignNode[]): DesignNode | undefined => {
      for (const n of ns) {
        if (n.id === nodeId) return n;
        const child = find(n.children);
        if (child) return child;
      }
    };
    const n = find(nodes);
    ensure(n, "NODE", "节点不存在", 404);
    width = n.width;
    height = n.height;
    nodes = [{ ...n, x: 0, y: 0 }];
  }
  ensure([1, 2, 3].includes(scale), "SCALE", "倍率仅支持 1/2/3");
  ensure(
    width * height * scale * scale <= 33554432,
    "PIXELS",
    "导出像素过大，请降低倍率",
  );
  const imageCache = new Map<string, string>();
  let raster = false;
  const textIssues: {
    nodeId: string;
    overflow: boolean;
    missingGlyphs: string[];
  }[] = [];
  const node = async (n: DesignNode): Promise<string> => {
    const uid = n.id;
    let defs = "",
      shape = "",
      fill = esc(n.fill);
    if (n.gradient) {
      const theta = (n.gradient.angle * Math.PI) / 180;
      const x = Math.cos(theta) / 2,
        y = Math.sin(theta) / 2;
      defs += `<linearGradient id="gradient-${uid}" x1="${0.5 - x}" y1="${0.5 - y}" x2="${0.5 + x}" y2="${0.5 + y}">${n.gradient.stops.map((s) => `<stop offset="${s.offset}" stop-color="${esc(s.color)}"/>`).join("")}</linearGradient>`;
      fill = `url(#gradient-${uid})`;
    }
    if (n.type === "image") {
      raster = true;
      const asset = state.assets.find((a) => a.id === n.assetId);
      ensure(asset, "ASSET", "素材不存在");
      let uri = imageCache.get(asset.id);
      if (!uri) {
        const bytes = await fs.readFile(await store.safe(asset.file));
        ensure(hash(bytes) === asset.hash, "ASSET_CORRUPT", "素材校验失败");
        uri = `data:image/png;base64,${bytes.toString("base64")}`;
        imageCache.set(asset.id, uri);
      }
      const align = {
        center: "xMidYMid",
        top: "xMidYMin",
        bottom: "xMidYMax",
        left: "xMinYMid",
        right: "xMaxYMid",
      }[n.imagePosition ?? "center"];
      const preserve =
        n.imageFit === "fill"
          ? "none"
          : `${align} ${n.imageFit === "contain" ? "meet" : "slice"}`;
      shape = `<image width="${n.width}" height="${n.height}" preserveAspectRatio="${preserve}" href="${uri}"/>`;
    } else if (n.type === "text") {
      const text = layoutText(n);
      if (text.overflow || text.missingGlyphs.length)
        textIssues.push({
          nodeId: n.id,
          overflow: text.overflow,
          missingGlyphs: text.missingGlyphs,
        });
      // 可读内容保留在 title，字形转路径保证不同系统和导出倍率的排版一致。
      shape = `<g fill="${fill}"><title>${esc(n.text ?? "")}</title>${text.paths}</g>`;
    } else if (n.type === "vector")
      shape = `<path d="${esc(n.path ?? "")}" fill="${fill}" stroke="${esc(n.stroke ?? "none")}" stroke-width="${n.strokeWidth ?? 0}" stroke-linecap="round" stroke-linejoin="round"/>`;
    else
      shape = `<rect width="${n.width}" height="${n.height}" rx="${n.radius}" fill="${fill}"/>`;
    const clip = n.clipContent !== false;
    if (clip)
      defs += `<clipPath id="clip-${uid}"><rect width="${n.width}" height="${n.height}" rx="${n.radius}"/></clipPath>`;
    let filter = "";
    if (n.shadow) {
      const s = n.shadow;
      const expand = Math.ceil(s.blur * 3 + Math.abs(s.x) + Math.abs(s.y) + 8);
      defs += `<filter id="shadow-${uid}" filterUnits="userSpaceOnUse" x="${-expand}" y="${-expand}" width="${n.width + expand * 2}" height="${n.height + expand * 2}" color-interpolation-filters="sRGB"><feGaussianBlur in="SourceAlpha" stdDeviation="${s.blur / 2}"/><feOffset dx="${s.x}" dy="${s.y}"/><feFlood flood-color="${esc(s.color)}" flood-opacity="${s.opacity}"/><feComposite operator="in" in2="SourceAlpha"/><feMerge><feMergeNode/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
      // feComposite 必须使用偏移后的模糊遮罩，否则阴影会退化成内部色块。
      defs = defs
        .replace("<feOffset dx=", '<feOffset result="blurred" dx=')
        .replace('in2="SourceAlpha"', 'in2="blurred"');
      filter = ` filter="url(#shadow-${uid})"`;
    }
    const children = (await Promise.all(n.children.map(node))).join("");
    const stroke =
      n.type !== "vector" && n.stroke && n.strokeWidth
        ? `<rect x="${n.strokeWidth / 2}" y="${n.strokeWidth / 2}" width="${Math.max(0, n.width - n.strokeWidth)}" height="${Math.max(0, n.height - n.strokeWidth)}" rx="${Math.max(0, n.radius - n.strokeWidth / 2)}" fill="none" stroke="${esc(n.stroke)}" stroke-width="${n.strokeWidth}"/>`
        : "";
    return `<g transform="translate(${n.x},${n.y})" opacity="${n.opacity ?? 1}"${filter}><defs>${defs}</defs><g${clip ? ` clip-path="url(#clip-${uid})"` : ""}>${shape}${children}</g>${stroke}</g>`;
  };
  const body = (await Promise.all(nodes.map(node))).join("");
  ensure(
    !(format === "svg" && raster),
    "NOT_VECTOR",
    "该模块含位图，请导出 PNG；SVG 仅提供真实矢量内容",
  );
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
  // 先按目标密度栅格化，避免把 1× 预览放大成模糊的 2×/3× 图片。
  const bytes =
    format === "svg"
      ? Buffer.from(svg)
      : await sharp(Buffer.from(svg), { density: 72 * scale })
          .resize(Math.round(width * scale), Math.round(height * scale))
          .png()
          .toBuffer();
  return {
    bytes,
    mime: format === "svg" ? "image/svg+xml" : "image/png",
    width: width * scale,
    height: height * scale,
    svg,
    textIssues,
  };
}
