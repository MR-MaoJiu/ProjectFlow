import { app, BrowserWindow, ipcMain, dialog, shell, Menu } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promises as fs } from "node:fs";
import { Workspace, startWeb } from "../server/http.js";
import { CodexRuntime } from "./codex.js";
const here = path.dirname(fileURLToPath(import.meta.url));
let window: BrowserWindow | undefined;
const workspace = new Workspace();
let web: Awaited<ReturnType<typeof startWeb>>;
let runtime: CodexRuntime;
let account: any = null;
let active:
  | { project: string; threadId: string; turnId?: string; status: string }
  | undefined;
let sending = false;
const sessions = new Map<string, { threadId: string; restored: boolean }>();
const pluginRoot = app.isPackaged ? app.getAppPath() : path.resolve(here, "..");
const runtimeRoot = app.isPackaged
  ? path.join(process.resourcesPath, "codex-runtime")
  : path.join(
      pluginRoot,
      "desktop-resources",
      `${process.platform}-${process.arch}`,
    );
const triple =
  process.platform === "win32"
    ? "x86_64-pc-windows-msvc"
    : "aarch64-apple-darwin";
const executable =
  process.env.PROJECTFLOW_CODEX_PATH ??
  path.join(
    runtimeRoot,
    "vendor",
    triple,
    "bin",
    process.platform === "win32" ? "codex.exe" : "codex",
  );
function safeExternal(url: string) {
  const u = new URL(url);
  if (!["https:", "http:"].includes(u.protocol))
    throw new Error("不支持的链接类型");
  return shell.openExternal(u.href);
}
async function openProject() {
  if (active?.status === "running" || sending)
    throw new Error("请等待当前任务结束或先停止");
  const picked = await dialog.showOpenDialog(window!, {
    title: "选择项目文件夹",
    properties: ["openDirectory", "createDirectory"],
  });
  if (picked.canceled) return null;
  const root = picked.filePaths[0];
  const result = await workspace.bind(root, path.basename(root));
  await fs.writeFile(
    path.join(app.getPath("userData"), "last-project.json"),
    JSON.stringify({ root }),
  );
  await window!.loadURL(
    web.url(result.project.id).replace("/#", `/?open=${Date.now()}#`),
  );
  return result;
}
async function getSession(project: string) {
  const store = workspace.get(project);
  let saved = sessions.get(project);
  if (!saved) {
    try {
      const data = JSON.parse(
        await fs.readFile(
          await store.safe("runtime/desktop-session.json"),
          "utf8",
        ),
      );
      if (typeof data.threadId === "string")
        saved = { threadId: data.threadId, restored: false };
    } catch {}
  }
  const params = {
    cwd: store.root,
    approvalPolicy: "on-request",
    approvalsReviewer: "user",
    sandbox: "workspace-write",
  };
  const sandboxParams = params;
  if (saved && !saved.restored) {
    const result = await runtime.call("thread/resume", {
      ...sandboxParams,
      threadId: saved.threadId,
    });
    runtime.restoreHistory(result.thread.id, result.thread.turns ?? []);
    saved = { threadId: result.thread.id, restored: true };
  }
  if (!saved) {
    const result = await runtime.call("thread/start", {
      ...sandboxParams,
    });
    saved = { threadId: result.thread.id, restored: true };
  }
  sessions.set(project, saved);
  await fs.writeFile(
    await store.safe("runtime/desktop-session.json"),
    JSON.stringify({ threadId: saved.threadId }),
  );
  return saved;
}
async function command(method: string, args: any) {
  if (method === "openProject") return openProject();
  if (method === "status") {
    const threadId = sessions.get(args.project)?.threadId;
    return {
      connected: runtime.connected,
      account,
      active,
      events: runtime.events.filter(
        (e) =>
          e.method === "projectflow/disconnected" ||
          (threadId &&
            (e.params.threadId === threadId ||
              e.params.params?.threadId === threadId)),
      ),
      approvals: runtime
        .getApprovals()
        .filter((r) => r.params.threadId === threadId),
      busy: sending,
      version: "0.4.0",
    };
  }
  if (method === "connect") {
    await fs.access(executable);
    await runtime.start();
    account = await runtime.call("account/read", { refreshToken: false });
    if (args.project) {
      const store = workspace.get(args.project);
      try {
        await fs.access(await store.safe("runtime/desktop-session.json"));
        await getSession(args.project);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    return { connected: true, account };
  }
  if (method === "login") {
    await runtime.start();
    const r = await runtime.call("account/login/start", { type: "chatgpt" });
    if (r.authUrl) {
      const u = new URL(r.authUrl);
      if (
        u.protocol !== "https:" ||
        !(
          u.hostname === "auth.openai.com" || u.hostname.endsWith(".openai.com")
        )
      )
        throw new Error("登录返回了非预期地址");
      await shell.openExternal(r.authUrl);
    }
    return { loginStarted: true };
  }
  if (method === "answer") {
    if (!["accept", "decline"].includes(args.decision))
      throw new Error("无效决策");
    runtime.answer(String(args.requestId), args.decision, args.answers ?? {});
    return { ok: true };
  }
  if (method === "interrupt") {
    if (active?.turnId)
      await runtime.call("turn/interrupt", {
        threadId: active.threadId,
        turnId: active.turnId,
      });
    return { requested: true };
  }
  if (method === "newConversation") {
    workspace.get(args.project);
    if (active?.status === "running" || sending)
      throw new Error("请先停止当前任务");
    sessions.delete(args.project);
    const store = workspace.get(args.project);
    await fs.rm(await store.safe("runtime/desktop-session.json"), {
      force: true,
    });
    return { ok: true };
  }
  if (method === "send") {
    if (
      typeof args.text !== "string" ||
      !args.text.trim() ||
      args.text.length > 100000
    )
      throw new Error("请输入有效任务内容");
    if (
      sending ||
      active?.status === "running" ||
      runtime.getApprovals().length
    )
      throw new Error("已有任务运行或等待回答");
    const store = workspace.get(args.project);
    sending = true;
    try {
      await runtime.start();
      const auth = await runtime.call("account/read", { refreshToken: false });
      account = auth;
      if (auth.requiresOpenaiAuth && !auth.account)
        throw new Error("请先登录 Codex");
      const session = await getSession(args.project);
      active = {
        project: args.project,
        threadId: session.threadId,
        status: "running",
      };
      const context = `你正在独立的 ProjectFlow 桌面应用中工作，不依赖官方 Codex 桌面端。用户已选择项目目录：${store.root}。\n先读取 ${path.join(pluginRoot, "skills/projectflow/SKILL.md")} 及适用的项目规则，再通过 projectflow_bind 绑定上述目录，按需读取项目资产。需要生成、检索或浏览器能力时只使用本次实际可用工具。不要假设桌面插件工具存在，不要另行调用付费模型 API。普通草稿可以执行；确认基线、发布与外部发送必须有用户的明确授权。\n用户请求：\n${args.text}`;
      const result = await runtime.call("turn/start", {
        threadId: session.threadId,
        input: [{ type: "text", text: context, text_elements: [] }],
        cwd: store.root,
      });
      active.turnId = result.turn.id;
      return { threadId: session.threadId, turnId: result.turn.id };
    } catch (error) {
      if (active) active.status = "failed";
      throw error;
    } finally {
      sending = false;
    }
  }
  throw new Error("不支持的桌面操作");
}
console.error("[ProjectFlow] 启动桌面主进程");
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app
    .whenReady()
    .then(async () => {
      console.error("[ProjectFlow] Electron 就绪");
      web = await startWeb(workspace, path.join(pluginRoot, "dist/web"));
      process.env.PATH =
        path.join(runtimeRoot, "vendor", triple, "codex-path") +
        path.delimiter +
        (process.env.PATH ?? "");
      runtime = new CodexRuntime(
        executable,
        process.execPath,
        path.join(pluginRoot, "dist/server.mjs"),
        { ELECTRON_RUN_AS_NODE: "1" },
      );
      runtime.on("event", ({ method, params }) => {
        if (
          method === "turn/completed" &&
          active &&
          active.threadId === params.threadId
        ) {
          active.status = params.turn.status;
          active.turnId = undefined;
        }
        if (method === "projectflow/disconnected") {
          if (active) active.status = "disconnected";
          for (const s of sessions.values()) s.restored = false;
        }
        if (
          method === "account/updated" ||
          method === "account/login/completed"
        )
          void runtime
            .call("account/read", { refreshToken: false })
            .then((a) => {
              account = a;
            })
            .catch(() => {});
      });
      const createWindow = async () => {
        window = new BrowserWindow({
          width: 1480,
          height: 940,
          minWidth: 800,
          minHeight: 620,
          title: "ProjectFlow",
          icon: path.join(pluginRoot, "assets/app-icon.png"),
          backgroundColor: "#f7f8fb",
          webPreferences: {
            preload: path.join(here, "preload.cjs"),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
          },
        });
        window.webContents.setWindowOpenHandler(({ url }) => {
          void safeExternal(url).catch(() => {});
          return { action: "deny" };
        });
        window.webContents.on("will-navigate", (event, url) => {
          if (new URL(url).origin !== web.origin) {
            event.preventDefault();
            void safeExternal(url).catch(() => {});
          }
        });
        window.webContents.session.setPermissionRequestHandler(
          (_webContents, _permission, callback) => callback(false),
        );
        window.on("close", (event) => {
          if (active?.status === "running" || sending) {
            const choice = dialog.showMessageBoxSync(window!, {
              type: "question",
              buttons: ["留在应用", "停止并退出"],
              defaultId: 0,
              cancelId: 0,
              message: "Codex 仍在执行，关闭应用将停止本次服务。",
            });
            if (choice === 0) event.preventDefault();
          }
        });
        let projectId: string | undefined;
        try {
          const previous = JSON.parse(
            await fs.readFile(
              path.join(app.getPath("userData"), "last-project.json"),
              "utf8",
            ),
          );
          projectId = (await workspace.bind(previous.root)).project.id;
        } catch {}
        await window.loadURL(web.url(projectId));
        console.error("[ProjectFlow] 工作台加载完成");
      };
      ipcMain.handle("projectflow:desktop", async (event, { method, args }) => {
        if (
          !window ||
          event.sender !== window.webContents ||
          event.senderFrame?.url.split("/").slice(0, 3).join("/") !== web.origin
        )
          throw new Error("非法调用来源");
        return command(method, args ?? {});
      });
      Menu.setApplicationMenu(
        Menu.buildFromTemplate([
          {
            label: "ProjectFlow",
            submenu: [
              {
                label: "打开项目…",
                accelerator: "CmdOrCtrl+O",
                click: () =>
                  void openProject().catch((e) =>
                    dialog.showErrorBox("打开项目失败", e.message),
                  ),
              },
              { type: "separator" },
              { role: "quit" },
            ],
          },
          {
            label: "编辑",
            submenu: [
              { role: "undo" },
              { role: "redo" },
              { type: "separator" },
              { role: "cut" },
              { role: "copy" },
              { role: "paste" },
              { role: "selectAll" },
            ],
          },
          {
            label: "视图",
            submenu: [
              { role: "reload" },
              { role: "toggleDevTools" },
              { role: "resetZoom" },
              { role: "zoomIn" },
              { role: "zoomOut" },
            ],
          },
        ]),
      );
      app.on("second-instance", () => {
        window?.show();
        window?.focus();
      });
      app.on("activate", () => {
        if (BrowserWindow.getAllWindows().length === 0) void createWindow();
      });
      app.on("window-all-closed", () => app.quit());
      app.on("before-quit", () => {
        runtime?.stop();
        web?.server.close();
      });
      await createWindow();
    })
    .catch((error) => {
      console.error("[ProjectFlow]", error);
      dialog.showErrorBox("ProjectFlow 启动失败", String(error));
      app.quit();
    });
}
