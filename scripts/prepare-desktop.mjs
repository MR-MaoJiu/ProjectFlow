import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const catalog = JSON.parse(
  await fs.readFile(
    path.join(root, "build/codex-runtime-checksums.json"),
    "utf8",
  ),
);
const flags = new Set(process.argv.slice(2));
const targets = flags.has("--all")
  ? Object.keys(catalog)
  : [`${process.platform}-${process.arch}`];
if (targets.some((target) => !catalog[target]))
  throw new Error(
    "当前支持 macOS ARM64 和 Windows x64；可使用 --all 准备两个平台。",
  );
const digest = (buffer) => createHash("sha256").update(buffer).digest("hex");
async function verify(directory, entries) {
  for (const [file, expected] of Object.entries(entries)) {
    try {
      if (digest(await fs.readFile(path.join(directory, file))) !== expected)
        return false;
    } catch {
      return false;
    }
  }
  return true;
}
const npmCLI = process.env.npm_execpath;
async function fetchPackage(spec, target) {
  if (!npmCLI)
    throw new Error(
      "请通过 npm run desktop:prepare 运行，以获得跨平台 npm 路径。",
    );
  const temporary = await fs.mkdtemp(
    path.join(os.tmpdir(), "projectflow-runtime-"),
  );
  try {
    const args = [
      npmCLI,
      "pack",
      spec,
      "--json",
      "--pack-destination",
      temporary,
      "--registry=https://registry.npmjs.org",
    ];
    if (flags.has("--offline")) args.push("--offline");
    const output = execFileSync(process.execPath, args, {
      cwd: root,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "inherit"],
      maxBuffer: 10 * 1024 * 1024,
    });
    const packs = JSON.parse(output);
    const archive = path.join(temporary, path.basename(packs[0].filename));
    const extracted = path.join(temporary, "extracted");
    await fs.mkdir(extracted);
    execFileSync(
      "tar",
      ["-xzf", archive, "-C", extracted, "--strip-components=1"],
      { stdio: "inherit" },
    );
    // 校验通过后才替换已有运行文件。
    if (target in catalog && !(await verify(extracted, catalog[target].files)))
      throw new Error(`Codex ${target} 校验和不匹配`);
    const destination = path.join(root, "desktop-resources", target);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.rm(destination, { recursive: true, force: true });
    await fs.cp(extracted, destination, { recursive: true });
  } finally {
    await fs.rm(temporary, { recursive: true, force: true });
  }
}
for (const target of targets) {
  const destination = path.join(root, "desktop-resources", target);
  const valid = await verify(destination, catalog[target].files);
  if (flags.has("--check")) {
    console.log(`${target}: ${valid ? "校验通过" : "缺少文件或校验失败"}`);
    if (!valid) process.exitCode = 1;
    continue;
  }
  if (!valid)
    await fetchPackage(`@openai/codex@${catalog[target].package}`, target);
  await fs.copyFile(
    path.join(root, "licenses/CODEX-LICENSE.txt"),
    path.join(destination, "LICENSE.txt"),
  );
  await fs.writeFile(
    path.join(destination, "SOURCE.txt"),
    `Codex ${catalog[target].package}\nhttps://github.com/openai/codex\nApache-2.0\n`,
  );
  console.log(`${target}: Codex 已就绪`);
}
if (targets.includes("win32-x64")) {
  const destination = path.join(root, "desktop-resources/sharp-win32-x64");
  const required = [
    "package.json",
    "lib/sharp-win32-x64.node",
    "lib/libvips-cpp-8.17.3.dll",
  ];
  let valid = true;
  for (const file of required)
    try {
      await fs.access(path.join(destination, file));
    } catch {
      valid = false;
    }
  if (flags.has("--check")) {
    console.log(`Windows 图像库: ${valid ? "已就绪" : "缺少文件"}`);
    if (!valid) process.exitCode = 1;
  } else if (!valid)
    await fetchPackage("@img/sharp-win32-x64@0.34.5", "sharp-win32-x64");
}
