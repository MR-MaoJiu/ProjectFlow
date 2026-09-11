import { useEffect, useState } from "react";
import {
  X,
  Send,
  Square,
  PlugZap,
  LogIn,
  MessageSquarePlus,
  ShieldCheck,
  LoaderCircle,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
interface Props {
  project: string;
  onClose: () => void;
  initialText?: string;
}
export function DesktopPanel({ project, onClose, initialText = "" }: Props) {
  const [state, setState] = useState<any>({ events: [], approvals: [] }),
    [text, setText] = useState(initialText),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [answers, setAnswers] = useState<Record<string, string>>({}),
    [sent, setSent] = useState<string[]>([]);
  const bridge = window.projectflowDesktop!;
  const refresh = async () => {
    try {
      setState(await bridge.status(project));
    } catch (e) {
      setError((e as Error).message);
    }
  };
  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 800);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (initialText) setText(initialText);
  }, [initialText]);
  const action = async (fn: () => Promise<unknown>) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const events = state.events ?? [];
  const completed = events.filter(
    (e: any) =>
      e.method === "item/completed" && e.params.item?.type === "agentMessage",
  );
  const finishedIds = new Set(completed.map((e: any) => e.params.item.id));
  const streaming: Record<string, string> = {};
  for (const e of events)
    if (
      e.method === "item/agentMessage/delta" &&
      !finishedIds.has(e.params.itemId)
    )
      streaming[e.params.itemId] =
        (streaming[e.params.itemId] ?? "") + e.params.delta;
  const toolItems = events
    .filter(
      (e: any) =>
        e.method === "item/completed" &&
        ["commandExecution", "fileChange", "mcpToolCall"].includes(
          e.params.item?.type,
        ),
    )
    .slice(-8);
  const running = state.busy || state.active?.status === "running";
  return (
    <aside className="codex-panel">
      <header>
        <div>
          <strong>Codex 执行台</strong>
          <span>
            {state.connected ? "运行服务已连接" : "尚未连接"} · 独立运行
          </span>
        </div>
        <button className="icon" aria-label="关闭执行台" onClick={onClose}>
          <X size={18} />
        </button>
      </header>
      <div className="codex-controls">
        <button
          disabled={busy || running}
          onClick={() => void action(() => bridge.connect(project))}
        >
          <PlugZap size={14} />
          {state.connected ? "检查连接" : "连接 Codex"}
        </button>
        <button
          disabled={busy || running}
          onClick={() => void action(() => bridge.login())}
        >
          <LogIn size={14} />
          登录
        </button>
        <button
          title="新建 Codex 对话"
          disabled={busy || running}
          onClick={() =>
            void action(async () => {
              await bridge.newConversation(project);
              setSent([]);
            })
          }
        >
          <MessageSquarePlus size={15} />
        </button>
      </div>
      <div className="codex-account">
        {state.account?.account
          ? `已登录 · ${state.account.account.type === "chatgpt" ? "ChatGPT 账户" : state.account.account.type}`
          : state.connected
            ? state.account?.requiresOpenaiAuth === false
              ? "当前提供方无需 OpenAI 登录"
              : "请登录，或检查现有 Codex 配置"
            : "无需打开官方 Codex 桌面端"}
        {state.active && (
          <small>
            当前项目：{state.active.project === project ? "本项目" : "其他项目"}{" "}
            · {state.active.status}
          </small>
        )}
      </div>
      {error && <div className="error">{error}</div>}
      <div className="codex-messages">
        {sent.map((m, i) => (
          <div key={i} className="user-message">
            {m}
          </div>
        ))}
        {completed.map((e: any) => (
          <article className="agent-message prose" key={e.sequence}>
            <ReactMarkdown>{e.params.item.text ?? ""}</ReactMarkdown>
          </article>
        ))}
        {Object.entries(streaming).map(([id, t]) => (
          <article className="agent-message prose" key={id}>
            <ReactMarkdown>{t}</ReactMarkdown>
          </article>
        ))}
        {!completed.length &&
          !Object.keys(streaming).length &&
          !sent.length && (
            <div className="codex-intro">
              <h3>在这里继续整个项目</h3>
              <p>
                立项、PRD、设计、编码与测试，都交给
                Codex。项目选择、授权和结果会留在 ProjectFlow 中。
              </p>
              <p>工具能力以当前运行服务实际提供的为准。</p>
            </div>
          )}
        {toolItems.length > 0 && (
          <details>
            <summary>最近的工具执行 · {toolItems.length}</summary>
            {toolItems.map((e: any) => (
              <pre key={e.sequence}>
                {e.params.item.type}:{" "}
                {String(
                  e.params.item.command ??
                    e.params.item.tool ??
                    e.params.item.status ??
                    "已结束",
                ).slice(0, 600)}
              </pre>
            ))}
          </details>
        )}
        {events
          .filter(
            (e: any) =>
              e.method === "error" || e.method === "projectflow/disconnected",
          )
          .slice(-2)
          .map((e: any) => (
            <div className="error" key={e.sequence}>
              {e.params.error?.message ??
                e.params.message ??
                "执行出现错误，请检查连接"}
            </div>
          ))}
        {state.approvals?.map((r: any) => (
          <div className="approval" key={r.requestId}>
            <h4>
              <ShieldCheck size={16} />
              需要你的处理
            </h4>
            <p>
              {r.params.reason ?? r.params.message ?? "Codex 请求执行以下操作"}
            </p>
            {r.params.command && <pre>{r.params.command}</pre>}
            {r.method === "item/fileChange/requestApproval" && (
              <pre>
                {JSON.stringify(
                  events.find(
                    (e: any) =>
                      e.method === "item/started" &&
                      e.params.item?.id === r.params.itemId,
                  )?.params.item?.changes ?? { grantRoot: r.params.grantRoot },
                  null,
                  2,
                )}
              </pre>
            )}
            {r.params.cwd && <small>目录：{r.params.cwd}</small>}
            {r.params.permissions && (
              <pre>{JSON.stringify(r.params.permissions, null, 2)}</pre>
            )}
            {r.params.questions?.map((q: any) => (
              <label key={q.id}>
                {q.question}
                <input
                  value={answers[q.id] ?? ""}
                  onChange={(e) =>
                    setAnswers({ ...answers, [q.id]: e.target.value })
                  }
                />
                {q.options?.length > 0 && (
                  <small>
                    {q.options.map((o: any) => o.label).join(" / ")}
                  </small>
                )}
              </label>
            ))}
            {r.params.requestedSchema && (
              <>
                <small>服务：{r.params.serverName}</small>
                {Object.entries(r.params.requestedSchema.properties ?? {}).map(
                  ([key, definition]) => {
                    const f = definition as any;
                    const choices = f.enum?.map((value:any,index:number)=>({value,label:f.enumNames?.[index]??String(value)})) ?? f.oneOf?.filter((option:any)=>option.const!==undefined).map((option:any)=>({value:option.const,label:option.title??String(option.const)}));
                    return (
                      <label key={key}>
                        {f.title ?? key}
                        {f.description && <small>{f.description}</small>}
                        {choices?.length ? (
                          <select
                            value={answers[key] ?? ""}
                            onChange={(e) =>
                              setAnswers({ ...answers, [key]: e.target.value })
                            }
                          >
                            <option value="">请选择</option>
                            {choices.map((option: any) => (
                              <option key={String(option.value)} value={String(option.value)}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        ) : f.type === "boolean" ? (
                          <select
                            value={answers[key] ?? ""}
                            onChange={(e) =>
                              setAnswers({ ...answers, [key]: e.target.value })
                            }
                          >
                            <option value="">请选择</option>
                            <option value="true">是</option>
                            <option value="false">否</option>
                          </select>
                        ) : (
                          <input
                            value={answers[key] ?? ""}
                            onChange={(e) =>
                              setAnswers({ ...answers, [key]: e.target.value })
                            }
                            placeholder={
                              ["array", "object"].includes(f.type)
                                ? "输入 JSON"
                                : undefined
                            }
                          />
                        )}
                      </label>
                    );
                  },
                )}
              </>
            )}
            {r.params.mode === "url" && (
              <a href={r.params.url} target="_blank" rel="noreferrer">
                在浏览器完成授权
              </a>
            )}
            <footer>
              <button
                disabled={busy}
                onClick={() =>
                  void action(() => bridge.answer(r.requestId, "decline", {}))
                }
              >
                拒绝 / 暂停
              </button>
              {(r.method !== "mcpServer/elicitation/request" ||
                (r.params.mode !== "url" &&
                  r.params.requestedSchema?.type === "object")) && (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() =>
                    void action(() =>
                      bridge.answer(r.requestId, "accept", answers),
                    )
                  }
                >
                  {r.params.questions ? "提交回答" : "允许本次操作"}
                </button>
              )}
            </footer>
          </div>
        ))}
      </div>
      <footer className="codex-composer">
        <textarea
          aria-label="发送给 Codex"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="描述你希望完成的任务…"
          rows={4}
        />
        <div>
          <span>
            {running ? (
              <>
                <LoaderCircle className="spin" size={13} />
                执行中
              </>
            ) : (
              "使用当前 Codex 配置与登录"
            )}
          </span>
          {running ? (
            <button onClick={() => void action(() => bridge.interrupt())}>
              <Square size={13} />
              停止
            </button>
          ) : (
            <button
              className="primary"
              disabled={busy || !text.trim() || !project}
              onClick={() =>
                void action(async () => {
                  const message = text;
                  await bridge.send(project, message);
                  setSent((prev) => [...prev, message]);
                  setText("");
                })
              }
            >
              <Send size={14} />
              发送
            </button>
          )}
        </div>
      </footer>
    </aside>
  );
}
