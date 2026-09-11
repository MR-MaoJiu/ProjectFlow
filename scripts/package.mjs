import { cp, mkdir, readFile, writeFile, rm, mkdtemp } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import path from "node:path";
import os from "node:os";
const source = process.cwd();
const staging = await mkdtemp(path.join(os.tmpdir(), "projectflow-package-"));
const target = path.join(staging, "projectflow");
await mkdir(target);
try {
  await mkdir(path.join(target, "scripts"), { recursive: true });
  for (const file of [
    ".codex-plugin",
    ".mcp.json",
    "skills",
    "references",
    "templates",
    "assets",
    "dist",
    "package.json",
    "package-lock.json",
    "README.md",
    "LICENSE",
    "NOTICE",
    "licenses",
    "scripts/register-personal.py",
  ])
    await cp(path.join(source, file), path.join(target, file), {
      recursive: true,
    });
  // 只装运行依赖。使用已下载缓存，避免打包时隐式新增联网动作。
  execFileSync(
    "npm",
    ["ci", "--omit=dev", "--offline", "--no-audit", "--no-fund"],
    { cwd: target, stdio: "inherit" },
  );
  const output = path.resolve(
    source,
    "..",
    `projectflow-${JSON.parse(await readFile(path.join(source, "package.json"), "utf8")).version}-${process.platform}-${process.arch}.zip`,
  );
  await rm(output, { force: true });
  execFileSync("/usr/bin/zip", ["-qr", output, "projectflow"], {
    cwd: staging,
  });
  console.log(output);
} finally {
  await rm(staging, { recursive: true, force: true });
}
