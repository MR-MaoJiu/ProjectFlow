import { formReply } from "./forms.js";
import { spawn, type ChildProcessWithoutNullStreams } from "node:child_process";
import { createInterface } from "node:readline";
import { EventEmitter } from "node:events";
export interface RuntimeEvent {
  sequence: number;
  method: string;
  params: any;
}
export class CodexRuntime extends EventEmitter {
  private process?: ChildProcessWithoutNullStreams;
  private nextId = 1;
  private pending = new Map<
    number,
    {
      resolve: (value: any) => void;
      reject: (error: Error) => void;
      timer: NodeJS.Timeout;
    }
  >();
  private approvals = new Map<
    string,
    { id: string | number; method: string; params: any }
  >();
  private sequence = 0;
  events: RuntimeEvent[] = [];
  connected = false;
  private starting?: Promise<void>;
  constructor(
    private executable: string,
    private mcpCommand: string,
    private serverFile: string,
    private mcpEnv: Record<string, string> = {},
  ) {
    super();
  }
  async start() {
    if (this.connected) return;
    if (this.starting) return this.starting;
    this.starting = this.connect().finally(() => {
      this.starting = undefined;
    });
    return this.starting;
  }
  private async connect() {
    const config = [
      "-c",
      `mcp_servers.projectflow_desktop.command=${JSON.stringify(this.mcpCommand)}`,
      "-c",
      `mcp_servers.projectflow_desktop.args=${JSON.stringify([this.serverFile])}`,
    ];
    for (const [key, value] of Object.entries(this.mcpEnv))
      config.push(
        "-c",
        `mcp_servers.projectflow_desktop.env.${key}=${JSON.stringify(value)}`,
      );
    const child = spawn(this.executable, ["app-server", ...config], {
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
      env: { ...process.env },
    });
    this.process = child;
    const lines = createInterface({ input: child.stdout });
    lines.on("line", (line) => {
      try {
        this.receive(JSON.parse(line));
      } catch {
        /* 非协议行不进入用户日志。 */
      }
    });
    child.stderr.on("data", () => {});
    child.on("error", (error) => this.disconnected(error));
    child.on("exit", (code) =>
      this.disconnected(
        new Error(`Codex 服务已退出（${code ?? "已停止"}），请重新连接。`),
      ),
    );
    try {
      await this.call("initialize", {
        clientInfo: {
          name: "projectflow_desktop",
          title: "ProjectFlow",
          version: "0.4.1",
        },
        capabilities: { experimentalApi: false },
      });
      this.notify("initialized", {});
      this.connected = true;
    } catch (error) {
      child.kill();
      throw error;
    }
  }
  private disconnected(error: Error) {
    this.connected = false;
    for (const p of this.pending.values()) {
      clearTimeout(p.timer);
      p.reject(error);
    }
    this.pending.clear();
    this.approvals.clear();
    this.push("projectflow/disconnected", { message: error.message });
  }
  private push(method: string, params: any) {
    this.events.push({ sequence: ++this.sequence, method, params });
    if (this.events.length > 500)
      this.events.splice(0, this.events.length - 500);
    this.emit("event", { method, params });
  }
  private receive(message: any) {
    if (message.method) {
      if (message.id !== undefined) {
        const supported = [
          "item/commandExecution/requestApproval",
          "item/fileChange/requestApproval",
          "item/permissions/requestApproval",
          "item/tool/requestUserInput",
          "mcpServer/elicitation/request",
        ];
        if (supported.includes(message.method)) {
          this.approvals.set(String(message.id), {
            id: message.id,
            method: message.method,
            params: message.params,
          });
          this.push("projectflow/approval", {
            requestId: String(message.id),
            method: message.method,
            params: message.params,
          });
        } else
          this.respond(message.id, undefined, {
            code: -32601,
            message: "ProjectFlow 暂不支持此交互；未自动批准。",
          });
      } else {
        if (message.method === "serverRequest/resolved")
          this.approvals.delete(String(message.params.requestId));
        this.push(message.method, message.params);
      }
    } else if (this.pending.has(message.id)) {
      const pending = this.pending.get(message.id)!;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    }
  }
  private write(message: unknown) {
    if (!this.process?.stdin.writable) throw new Error("Codex 服务未连接");
    this.process.stdin.write(JSON.stringify(message) + "\n");
  }
  notify(method: string, params: unknown) {
    this.write({ method, params });
  }
  call(method: string, params: unknown, timeout = 60000): Promise<any> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${method} 响应超时。请检查实际状态，勿重复执行。`));
      }, timeout);
      this.pending.set(id, { resolve, reject, timer });
      try {
        this.write({ id, method, params });
      } catch (error) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(error);
      }
    });
  }
  private respond(id: string | number, result?: unknown, error?: unknown) {
    this.write(error ? { id, error } : { id, result });
  }
  getApprovals() {
    return [...this.approvals.entries()].map(([requestId, value]) => ({
      requestId,
      method: value.method,
      params: value.params,
    }));
  }
  answer(
    requestId: string,
    decision: "accept" | "decline",
    answers: Record<string, string> = {},
  ) {
    const req = this.approvals.get(requestId);
    if (!req) throw new Error("请求已结束或失效");
    let result: unknown;
    if (
      req.method === "item/commandExecution/requestApproval" ||
      req.method === "item/fileChange/requestApproval"
    )
      result = { decision };
    else if (req.method === "item/permissions/requestApproval")
      result = {
        permissions: decision === "accept" ? req.params.permissions : {},
        scope: "turn",
      };
    else if (req.method === "item/tool/requestUserInput") {
      const questions = req.params.questions ?? [];
      if (
        decision === "accept" &&
        questions.some((q: any) => !answers[q.id]?.trim())
      )
        throw new Error("请回答每个问题");
      result = {
        answers: Object.fromEntries(
          questions.map((q: any) => [
            q.id,
            {
              answers:
                decision === "accept"
                  ? [answers[q.id]]
                  : ["用户未提供答案，请暂停此步骤。"],
            },
          ]),
        ),
      };
    } else {
      if (decision === "accept") {
        if (req.params.mode === "url")
          throw new Error("请先在浏览器完成授权，等待工具返回结果");
        result = {
          action: "accept",
          content: formReply(req.params.requestedSchema, answers),
          _meta: null,
        };
      } else result = { action: "cancel", content: null, _meta: null };
    }
    this.respond(req.id, result);
    this.approvals.delete(requestId);
  }
  restoreHistory(threadId: string, turns: any[]) {
    for (const turn of turns ?? [])
      for (const item of turn.items ?? [])
        if (item.type === "agentMessage" || item.type === "userMessage") {
          if (!this.events.some((e) => e.params?.item?.id === item.id))
            this.push("item/completed", { threadId, item });
        }
  }
  stop() {
    this.process?.kill();
    this.process = undefined;
    this.connected = false;
  }
}
