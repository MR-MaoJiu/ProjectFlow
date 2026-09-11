import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";

// 存入应用本机目录，项目仓库中的文件不能开启自动审批。
export class ExecutionSettings {
  constructor(private directory: string) {}
  private filename(root: string) {
    return path.join(this.directory, createHash("sha256").update(root).digest("hex") + ".json");
  }
  async get(root: string): Promise<boolean> {
    try {
      return JSON.parse(await fs.readFile(this.filename(root), "utf8")).autoRun === true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT" || error instanceof SyntaxError) return false;
      throw error;
    }
  }
  async set(root: string, enabled: unknown) {
    if (typeof enabled !== "boolean") throw new Error("自动运行参数必须为布尔值");
    await fs.mkdir(this.directory, { recursive: true });
    const filename = this.filename(root);
    const temporary = filename + "." + crypto.randomUUID() + ".tmp";
    try {
      await fs.writeFile(temporary, JSON.stringify({ autoRun: enabled }), { mode: 0o600 });
      await fs.rename(temporary, filename);
    } finally { await fs.rm(temporary, { force: true }); }
    return enabled;
  }
}
export function executionPolicy(autoRun: boolean) {
  return { approvalPolicy: "on-request" as const, approvalsReviewer: autoRun ? "auto_review" as const : "user" as const };
}
