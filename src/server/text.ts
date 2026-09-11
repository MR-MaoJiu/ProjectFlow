import { openSync, type Font } from "fontkit";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { DesignNode } from "../shared/model.js";
const here = path.dirname(fileURLToPath(import.meta.url));
const faces = new Map<number, Font>();
function face(weight: number) {
  if (faces.has(weight)) return faces.get(weight)!;
  const filename = [
    path.resolve(here, "../assets/fonts/NotoSansSC.ttf"),
    path.resolve(here, "../../assets/fonts/NotoSansSC.ttf"),
  ].find(existsSync);
  if (!filename)
    throw new Error(
      "缺少随项目分发的 Noto Sans SC 字体，无法保证设计排版一致。",
    );
  let base = faces.get(0);
  if (!base) {
    base = openSync(filename) as Font;
    faces.set(0, base);
  }
  const font = base.getVariation({ wght: weight });
  faces.set(weight, font);
  return font;
}
const segmenter = new Intl.Segmenter("zh-CN", { granularity: "word" });
const graphemes = new Intl.Segmenter("zh-CN", { granularity: "grapheme" });
export function layoutText(n: DesignNode) {
  const font = face(n.fontWeight ?? 400),
    size = n.fontSize ?? 16,
    scale = size / font.unitsPerEm,
    spacing = n.letterSpacing ?? 0;
  const cache = new Map<string, ReturnType<Font["layout"]>>();
  const run = (s: string) => {
    let value = cache.get(s);
    if (!value) {
      value = font.layout(s);
      cache.set(s, value);
    }
    return value;
  };
  const width = (s: string) => {
    const r = run(s);
    return (
      r.positions.reduce((sum, p) => sum + p.xAdvance, 0) * scale +
      Math.max(0, r.glyphs.length - 1) * spacing
    );
  };
  const lines: string[] = [];
  for (const paragraph of (n.text ?? "").split("\n")) {
    let line = "";
    for (const { segment: token } of segmenter.segment(paragraph)) {
      if (width(line + token) <= n.width) {
        line += token;
        continue;
      }
      if (line.trim()) {
        lines.push(line.trimEnd());
        line = "";
      }
      if (!token.trim()) continue;
      if (width(token) <= n.width) {
        line = token;
        continue;
      }
      for (const { segment: char } of graphemes.segment(token)) {
        if (line && width(line + char) > n.width) {
          lines.push(line);
          line = "";
        }
        line += char;
      }
    }
    lines.push(line.trimEnd());
  }
  const lineHeight = n.lineHeight ?? size * 1.45;
  const allowed = Math.min(
    n.maxLines ?? 200,
    Math.max(1, Math.floor((n.height + 0.01) / lineHeight)),
  );
  const clipped = lines.length > allowed;
  const visible = lines.slice(0, allowed);
  if (clipped && n.textOverflow === "ellipsis" && visible.length) {
    let last = visible.at(-1)!;
    while (last && width(last + "…") > n.width)
      last = Array.from(last).slice(0, -1).join("");
    visible[visible.length - 1] = last + "…";
  }
  const natural = (font.ascent - font.descent) * scale;
  const baseline = (lineHeight - natural) / 2 + font.ascent * scale;
  const blockHeight = visible.length * lineHeight;
  const top =
    n.verticalAlign === "middle"
      ? (n.height - blockHeight) / 2
      : n.verticalAlign === "bottom"
        ? n.height - blockHeight
        : 0;
  let paths = "";
  let outside = false;
  const missing = new Set<string>();
  for (const ch of n.text ?? "")
    if (ch !== "\n" && !font.hasGlyphForCodePoint(ch.codePointAt(0)!))
      missing.add(ch);
  visible.forEach((line, index) => {
    const shaped = run(line),
      lineWidth = width(line);
    let cursor =
      n.textAlign === "center"
        ? (n.width - lineWidth) / 2
        : n.textAlign === "right"
          ? n.width - lineWidth
          : 0;
    shaped.glyphs.forEach((glyph, i) => {
      const p = shaped.positions[i];
      const x = cursor + p.xOffset * scale,
        y = top + baseline + index * lineHeight - p.yOffset * scale;
      const bbox = glyph.bbox;
      if (glyph.path.commands.length) {
        if (
          x + bbox.minX * scale < -0.5 ||
          x + bbox.maxX * scale > n.width + 0.5 ||
          y - bbox.maxY * scale < -0.5 ||
          y - bbox.minY * scale > n.height + 0.5
        )
          outside = true;
        paths += `<path transform="translate(${x.toFixed(3)},${y.toFixed(3)}) scale(${scale},${-scale})" d="${glyph.path.toSVG()}"/>`;
      }
      cursor += p.xAdvance * scale + spacing;
    });
  });
  return {
    paths,
    lines: visible,
    lineCount: lines.length,
    overflow: outside || (clipped && n.textOverflow !== "ellipsis"),
    clipped,
    missingGlyphs: [...missing],
    widths: visible.map(width),
  };
}
