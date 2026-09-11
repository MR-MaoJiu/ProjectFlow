import { promises as fs } from "node:fs";
import sharp from "sharp";
import { layoutNodes, type DesignNode, type Ref } from "../shared/model.js";
import { Store, hash } from "./store.js";
import { ensure } from "./errors.js";
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
  const d = store.validateDesign(artifact.data, state);
  let nodes = layoutNodes(d.nodes),
    width = d.viewport.width,
    height = d.viewport.height;
  if (nodeId) {
    const find = (ns: DesignNode[]): DesignNode | undefined => {
      for (const n of ns) {
        if (n.id === nodeId) return n;
        const c = find(n.children);
        if (c) return c;
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
  let raster = false;
  const node = async (n: DesignNode): Promise<string> => {
    let shape = "";
    const fill = esc(n.fill);
    const clip = `clip-${n.id}`;
    if (n.type === "image") {
      raster = true;
      const a = state.assets.find((a) => a.id === n.assetId);
      ensure(a, "ASSET", "素材不存在");
      const data = await fs.readFile(await store.safe(a.file));
      ensure(hash(data) === a.hash, "ASSET_CORRUPT", "素材校验失败");
      shape = `<image width="${n.width}" height="${n.height}" preserveAspectRatio="xMidYMid slice" href="data:image/png;base64,${data.toString("base64")}"/>`;
    } else if (n.type === "text") {
      const size = n.fontSize ?? 16;
      const chars = Math.max(1, Math.floor(n.width / size));
      const lines = (n.text ?? "").split("\n").flatMap((line) => {
        const out = [];
        let s = "";
        let units = 0;
        for (const ch of line) {
          const unit = ch.charCodeAt(0) > 255 ? 1 : 0.55;
          if (units + unit > chars && s) {
            out.push(s);
            s = "";
            units = 0;
          }
          s += ch;
          units += unit;
        }
        out.push(s);
        return out;
      });
      shape = `<text fill="${fill}" font-family="Arial, sans-serif" font-size="${size}">${lines.map((l, i) => `<tspan x="0" y="${size + i * size * 1.45}">${esc(l)}</tspan>`).join("")}</text>`;
    } else if (n.type === "vector")
      shape = `<path d="${esc(n.path ?? "")}" fill="${fill}"/>`;
    else
      shape = `<rect width="${n.width}" height="${n.height}" rx="${n.radius}" fill="${fill}"/>`;
    return `<g transform="translate(${n.x},${n.y})"><defs><clipPath id="${clip}"><rect width="${n.width}" height="${n.height}" rx="${n.radius}"/></clipPath></defs><g clip-path="url(#${clip})">${shape}${(await Promise.all(n.children.map(node))).join("")}</g></g>`;
  };
  const body = (await Promise.all(nodes.map(node))).join("");
  ensure(
    !(format === "svg" && raster),
    "NOT_VECTOR",
    "该模块含位图，请导出 PNG；SVG 仅提供真实矢量内容",
  );
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${body}</svg>`;
  const bytes =
    format === "svg"
      ? Buffer.from(svg)
      : await sharp(Buffer.from(svg))
          .resize(Math.round(width * scale), Math.round(height * scale))
          .png()
          .toBuffer();
  return {
    bytes,
    mime: format === "svg" ? "image/svg+xml" : "image/png",
    width: width * scale,
    height: height * scale,
    svg,
  };
}
