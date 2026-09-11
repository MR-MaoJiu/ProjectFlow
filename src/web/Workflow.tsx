import { useState } from "react";
import {
  Check,
  Copy,
  Download,
  Plus,
  ArrowUpRight,
  AlertTriangle,
  FileCheck2,
} from "lucide-react";
import {
  latestArtifacts,
  staleRefs,
  labels,
  type State,
  type Stage,
  type Ref,
  type ArtifactVersion,
} from "../shared/model";
import { api, download, type Context } from "./api";
import { Empty, Modal, Status } from "./ui";
export type Mutate = (op: string, args: unknown) => Promise<any>;
export function RequestForm({
  stage,
  state,
  iterationId,
  selected,
  mutate,
  onClose,
}: {
  stage: Stage;
  state: State;
  iterationId: string;
  selected?: ArtifactVersion;
  mutate: Mutate;
  onClose: () => void;
}) {
  const [title, setTitle] = useState(
      `${labels[stage]}：${selected?.title ?? "继续本次迭代"}`,
    ),
    [instruction, setInstruction] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [bundle, setBundle] = useState(
      state.bundles.filter((b) => b.iterationId === iterationId).at(-1)?.id ??
        "",
    );
  const create = async () => {
    setBusy(true);
    try {
      const request = await mutate("request.create", {
        iterationId,
        stage,
        title,
        instruction,
        refs: selected
          ? [{ id: selected.id, version: selected.version }]
          : latestArtifacts(state, iterationId).map((a) => ({
              id: a.id,
              version: a.version,
            })),
        bundleId: stage === "coding" ? bundle : undefined,
      });
      if (window.projectflowDesktop)
        window.dispatchEvent(
          new CustomEvent("projectflow:execute", {
            detail: `继续处理 ProjectFlow 请求 ${request.id}。读取请求与固定上下文，按已授权范围执行并回写结果。`,
          }),
        );
      onClose();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal title="交给 Codex" onClose={onClose}>
      <p className="muted">
        保存需求后，回到当前 Codex 任务发送“继续”。这里不会启动新的 Agent
        或额外模型调用。
      </p>
      <label>
        任务标题
        <input
          autoFocus
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
      </label>
      <label>
        希望完成什么
        <textarea
          rows={6}
          value={instruction}
          onChange={(e) => setInstruction(e.target.value)}
          placeholder="说明目标、范围，以及必须保留的内容…"
        />
      </label>
      {stage === "coding" && (
        <label>
          固定版本交付包
          <select value={bundle} onChange={(e) => setBundle(e.target.value)}>
            <option value="">请选择</option>
            {state.bundles
              .filter((b) => b.iterationId === iterationId)
              .map((b) => (
                <option key={b.id} value={b.id}>
                  {b.title}
                </option>
              ))}
          </select>
        </label>
      )}
      {error && <div className="error">{error}</div>}
      <footer>
        <button onClick={onClose}>取消</button>
        <button
          className="primary"
          disabled={!instruction.trim() || busy}
          onClick={() => void create()}
        >
          保存待执行请求
        </button>
      </footer>
    </Modal>
  );
}
export function Requests({
  state,
  iterationId,
  mutate,
  root,
}: {
  state: State;
  iterationId: string;
  mutate: Mutate;
  root: string;
}) {
  const rows = state.requests.filter((r) => r.iterationId === iterationId);
  const [message, setMessage] = useState("");
  const update = async (id: string, status: "accepted" | "cancelled") => {
    const r = rows.find((r) => r.id === id)!;
    try {
      await mutate("request.update", {
        id,
        expectedVersion: r.version,
        status,
        progress:
          status === "accepted"
            ? "用户核对结果后验收"
            : "用户取消；已发生的外部修改不自动回滚",
        results: r.results,
      });
      setMessage("");
    } catch (e) {
      setMessage((e as Error).message);
    }
  };
  const copy = async (id: string) => {
    await navigator.clipboard.writeText(
      `使用 ProjectFlow 插件继续处理项目 ${root} 中的请求 ${id}。先绑定项目、读取请求和固定版本上下文，检查项目规则与当前能力，按授权执行并回写产物及真实验证结果；不要自动确认基线或发布。`,
    );
    setMessage("执行指令已复制，粘贴到当前 Codex 任务即可。");
  };
  if (!rows.length)
    return (
      <Empty title="把下一步交给 Codex">
        创建一个待执行请求，Codex
        会读取相应需求与设计版本。任务结果将在这里等待评审。
      </Empty>
    );
  return (
    <section className="workflow-content">
      <header className="section-heading">
        <div>
          <h2>执行与交付</h2>
          <p>只显示已回写的状态与结果</p>
        </div>
        <span>{rows.length} 项请求</span>
      </header>
      {message && <div className="notice">{message}</div>}
      <div className="request-list">
        {rows
          .slice()
          .reverse()
          .map((r) => (
            <article key={r.id} className="request-row">
              <div className="request-top">
                <Status value={r.status} />
                <span>
                  {labels[r.stage]} · v{r.version}
                </span>
              </div>
              <h3>{r.title}</h3>
              <p>{r.instruction}</p>
              <div className="request-progress">{r.progress}</div>
              {staleRefs(state, r).length > 0 && (
                <div className="warning">
                  <AlertTriangle size={14} />
                  上游已经变化，需要复核或重新创建请求
                </div>
              )}
              <div className="ref-list">
                {r.results.map((ref) => (
                  <span key={ref.id}>
                    <FileCheck2 size={14} />
                    {state.artifacts.find(
                      (a) => a.id === ref.id && a.version === ref.version,
                    )?.title ?? ref.id}{" "}
                    · v{ref.version}
                  </span>
                ))}
              </div>
              <footer>
                <button onClick={() => void copy(r.id)}>
                  <Copy size={14} />
                  复制执行指令
                </button>
                {["running", "blocked"].includes(r.status) && (
                  <button
                    onClick={async () => {
                      try {
                        await mutate("request.recover", {
                          id: r.id,
                          expectedVersion: r.version,
                          reason: "用户在工作台确认接管，保留已有代码与产物",
                        });
                        setMessage(
                          "请求已重新排队。旧执行者不能再回写，请回到 Codex 继续。",
                        );
                      } catch (e) {
                        setMessage((e as Error).message);
                      }
                    }}
                  >
                    接管并重新排队
                  </button>
                )}
                {r.status === "submitted" && (
                  <button
                    className="primary"
                    onClick={() => void update(r.id, "accepted")}
                  >
                    <Check size={14} />
                    验收结果
                  </button>
                )}
                {!["accepted", "cancelled"].includes(r.status) && (
                  <button onClick={() => void update(r.id, "cancelled")}>
                    取消请求
                  </button>
                )}
              </footer>
            </article>
          ))}
      </div>
    </section>
  );
}
export function Handoff({
  state,
  iterationId,
  project,
  mutate,
}: {
  state: State;
  iterationId: string;
  project: string;
  mutate: Mutate;
}) {
  const [title, setTitle] = useState("开发交付包"),
    [error, setError] = useState("");
  const list = latestArtifacts(state, iterationId).filter((a) =>
    ["brief", "requirement", "prd", "design"].includes(a.kind),
  );
  const bundles = state.bundles.filter((b) => b.iterationId === iterationId);
  return (
    <section className="workflow-content">
      <header className="section-heading">
        <div>
          <h2>让设计准确进入代码</h2>
          <p>锁定需求、PRD、设计、素材与仓库约束。</p>
        </div>
      </header>
      <div className="handoff-compose">
        <label>
          交付包名称
          <input value={title} onChange={(e) => setTitle(e.target.value)} />
        </label>
        <div className="handoff-items">
          {list.map((a) => (
            <div key={a.id}>
              <span>{a.title}</span>
              <span>v{a.version}</span>
            </div>
          ))}
        </div>
        {!list.length && (
          <p className="muted">先完成并确认需求、PRD 与页面设计。</p>
        )}
        <button
          className="primary"
          disabled={!list.length}
          onClick={async () => {
            try {
              await mutate("bundle.create", {
                iterationId,
                title,
                refs: list.map((a) => ({ id: a.id, version: a.version })),
              });
              setError("");
            } catch (e) {
              setError((e as Error).message);
            }
          }}
        >
          生成固定版本交付包
        </button>
        {error && <div className="error">{error}</div>}
      </div>
      <h3>交付历史</h3>
      {bundles.map((b) => (
        <article className="bundle-row" key={b.id}>
          <div>
            <h3>{b.title}</h3>
            <p>
              {b.artifacts.length} 项产物 · {b.assets.length} 个素材 ·{" "}
              {new Date(b.createdAt).toLocaleString("zh-CN")}
            </p>
            <code>{b.hash.slice(0, 16)}</code>
          </div>
          <button
            onClick={async () => {
              try {
                const data = await api(
                  `bundle&id=${b.id}`.replace("bundle&", "bundle?"),
                  project,
                );
                download(
                  `${b.title}.json`,
                  "application/json",
                  JSON.stringify(data, null, 2),
                );
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            <Download size={14} />
            离线交付包
          </button>
        </article>
      ))}
    </section>
  );
}
export function EvidencePanel({
  context,
  iterationId,
  mutate,
  stage,
}: {
  context: Context;
  iterationId: string;
  mutate: Mutate;
  stage: Stage;
}) {
  const type =
    stage === "release"
      ? "release"
      : stage === "operations"
        ? "operations"
        : "test";
  const [open, setOpen] = useState(false),
    [status, setStatus] = useState("not_run"),
    [summary, setSummary] = useState(""),
    [commit, setCommit] = useState(context.repository.commit),
    [environment, setEnvironment] = useState(""),
    [error, setError] = useState(""),
    [reference, setReference] = useState("");
  const rows = context.state.evidence.filter(
    (e) => e.iterationId === iterationId && e.type === type,
  );
  const artifacts = latestArtifacts(context.state, iterationId);
  return (
    <section className="evidence-panel">
      <header className="section-heading">
        <div>
          <h2>
            {type === "release"
              ? "发布验证"
              : type === "operations"
                ? "运营观察证据"
                : "测试执行记录"}
          </h2>
          <p>结果绑定实际代码版本与执行环境</p>
        </div>
        <button onClick={() => setOpen(true)}>
          <Plus size={14} />
          登记结果
        </button>
      </header>
      {!rows.length ? (
        <p className="quiet-empty">
          尚无执行记录。未执行的检查不会被标记为通过。
        </p>
      ) : (
        <div className="evidence-table">
          <div className="table-header">
            <span>结果与说明</span>
            <span>环境 / 版本</span>
            <span>来源</span>
          </div>
          {rows
            .slice()
            .reverse()
            .map((e) => (
              <div className="evidence-row" key={e.id}>
                <div>
                  <Status
                    value={
                      context.staleEvidence.includes(e.id)
                        ? "结果过期"
                        : e.status
                    }
                  />
                  <p>{e.summary}</p>
                </div>
                <div>
                  {e.environment || "未提供"}
                  <code>{e.commit.slice(0, 12) || "未绑定代码"}</code>
                </div>
                <span>{e.source === "codex" ? "Codex 回写" : "人工记录"}</span>
              </div>
            ))}
        </div>
      )}
      {open && (
        <Modal title="登记验证证据" onClose={() => setOpen(false)}>
          <label>
            关联产物
            <select
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            >
              <option value="">请选择</option>
              {artifacts.map((a) => (
                <option value={a.id} key={a.id}>
                  {a.title} v{a.version}
                </option>
              ))}
            </select>
          </label>
          <label>
            结果
            <select value={status} onChange={(e) => setStatus(e.target.value)}>
              {["not_run", "passed", "failed", "blocked", "skipped"].map(
                (s) => (
                  <option key={s} value={s}>
                    {
                      (
                        {
                          not_run: "未执行",
                          passed: "通过",
                          failed: "失败",
                          blocked: "受阻",
                          skipped: "跳过",
                        } as any
                      )[s]
                    }
                  </option>
                ),
              )}
            </select>
          </label>
          <label>
            执行环境
            <input
              value={environment}
              onChange={(e) => setEnvironment(e.target.value)}
              placeholder="例如：Chrome / 预生产环境"
            />
          </label>
          <label>
            代码 commit / 构建版本
            <input value={commit} onChange={(e) => setCommit(e.target.value)} />
          </label>
          <label>
            证据、实际结果与限制
            <textarea
              rows={5}
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </label>
          {error && <div className="error">{error}</div>}
          <footer>
            <button
              className="primary"
              disabled={!summary.trim()}
              onClick={async () => {
                try {
                  const a = artifacts.find((a) => a.id === reference);
                  await mutate("evidence.add", {
                    iterationId,
                    type,
                    status,
                    summary,
                    source: "manual",
                    commit,
                    environment,
                    refs: a ? [{ id: a.id, version: a.version }] : [],
                    attachments: [],
                  });
                  setOpen(false);
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            >
              保存结果
            </button>
          </footer>
        </Modal>
      )}
    </section>
  );
}
export function VisualCompare({
  state,
  project,
  iterationId,
}: {
  state: State;
  project: string;
  iterationId: string;
}) {
  const designs = latestArtifacts(state, iterationId).filter(
    (a) => a.kind === "design",
  );
  const [design, setDesign] = useState(designs[0]?.id ?? ""),
    [preview, setPreview] = useState(""),
    [actual, setActual] = useState(""),
    [message, setMessage] = useState("");
  return (
    <section className="visual-compare">
      <h3>设计与实际界面对照</h3>
      <div className="inline-fields">
        <select value={design} onChange={(e) => setDesign(e.target.value)}>
          <option value="">选择设计版本</option>
          {designs.map((d) => (
            <option key={d.id} value={d.id}>
              {d.title} v{d.version}
            </option>
          ))}
        </select>
        <button
          disabled={!design}
          onClick={async () => {
            try {
              const a = designs.find((a) => a.id === design)!;
              const r = await api<{ base64: string }>("export", project, {
                ref: { id: a.id, version: a.version },
              });
              setPreview(`data:image/png;base64,${r.base64}`);
            } catch (e) {
              setMessage((e as Error).message);
            }
          }}
        >
          加载设计
        </button>
        <label className="upload-button">
          选择实际截图
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) {
                const reader = new FileReader();
                reader.onload = () => setActual(String(reader.result));
                reader.readAsDataURL(f);
              }
            }}
          />
        </label>
      </div>
      <p className="muted">
        并排检查；选择截图仅用于本次查看，需保留的截图请导入素材并在证据中引用。
      </p>
      {message && <p className="error">{message}</p>}
      <div className="comparison">
        <div>
          {preview ? (
            <img src={preview} alt="设计预览" />
          ) : (
            <span>设计预览</span>
          )}
        </div>
        <div>
          {actual ? (
            <img src={actual} alt="实际界面截图" />
          ) : (
            <span>实际界面</span>
          )}
        </div>
      </div>
    </section>
  );
}
