import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
const svg =
  '<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024"><rect x="32" y="32" width="960" height="960" rx="216" fill="#2563eb"/><g fill="none" stroke="#ffffff" stroke-width="35" stroke-linejoin="round"><path d="M512 214 770 362 770 659 512 810 254 659 254 362Z"/><path d="M254 362 512 514 770 362M512 514V810M382 289 640 438"/></g></svg>';
await writeFile("assets/app-icon.svg", svg);
await mkdir("build/icon.iconset", { recursive: true });
for (const size of [16, 32, 128, 256, 512]) {
  for (const scale of [1, 2])
    await sharp(Buffer.from(svg))
      .resize(size * scale)
      .png()
      .toFile(
        `build/icon.iconset/icon_${size}x${size}${scale === 2 ? "@2x" : ""}.png`,
      );
}
const chunks = [];
for (const [type, size] of [
  ["ic07", 128],
  ["ic08", 256],
  ["ic09", 512],
  ["ic10", 1024],
]) {
  const data = await sharp(Buffer.from(svg)).resize(size).png().toBuffer();
  const head = Buffer.alloc(8);
  head.write(type, 0);
  head.writeUInt32BE(data.length + 8, 4);
  chunks.push(head, data);
}
const icnsHeader = Buffer.alloc(8);
icnsHeader.write("icns", 0);
icnsHeader.writeUInt32BE(8 + chunks.reduce((sum, c) => sum + c.length, 0), 4);
await writeFile("build/icon.icns", Buffer.concat([icnsHeader, ...chunks]));
const png = await sharp(Buffer.from(svg)).resize(256).png().toBuffer();
const header = Buffer.alloc(22);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(1, 4);
header.writeUInt16LE(1, 10);
header.writeUInt16LE(32, 12);
header.writeUInt32LE(png.length, 14);
header.writeUInt32LE(22, 18);
await writeFile("build/icon.ico", Buffer.concat([header, png]));
