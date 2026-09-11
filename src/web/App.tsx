import { useEffect, useState, useCallback, lazy, Suspense } from "react";
import {
  Box,
  Flag,
  Search,
  ListChecks,
  FileText,
  PenTool,
  Package,
  Code2,
  FlaskConical,
  Rocket,
  ChartNoAxesCombined,
  Plus,
  ArrowRight,
  Check,
  ChevronRight,
  PanelRight,
  Clock3,
  AlertCircle,
  MessageSquare,
  Link,
  Upload,
  Activity,
  FolderOpen,
  Settings2,
} from "lucide-react";
import {
  stages,
  labels,
  stageKinds,
  kindLabels,
  templates,
  latestArtifacts,
  confirmed,
  staleRefs,
  blankDesign,
  type ArtifactVersion,
  type Stage,
  type Kind,
  type Ref,
} from "../shared/model";
import { api, type Context } from "./api";
import { Busy, Empty, Modal } from "./ui";
const DocumentEditor = lazy(() =>
  import("./DocumentEditor").then((m) => ({ default: m.DocumentEditor })),
);
const DesignEditor = lazy(() =>
  import("./DesignEditor").then((m) => ({ default: m.DesignEditor })),
);
import {
  RequestForm,
  Requests,
  Handoff,
  EvidencePanel,
  VisualCompare,
} from "./Workflow";
const DesktopPanel = lazy(() =>
  import("./DesktopPanel").then((m) => ({ default: m.DesktopPanel })),
);
const icons = {
  init: Flag,
  research: Search,
  requirements: ListChecks,
  prd: FileText,
  design: PenTool,
  handoff: Package,
  coding: Code2,
  testing: FlaskConical,
  release: Rocket,
  operations: ChartNoAxesCombined,
};
export function App() {
  const [projects, setProjects] = useState<
      { id: string; name: string; root: string }[]
    >([]),
    [project, setProject] = useState(
      new URLSearchParams(location.search).get("project") ?? "",
    ),
    [ctx, setCtx] = useState<Context>(),
    [iteration, setIteration] = useState(""),
    [stage, setStage] = useState<Stage>("init"),
    [selected, setSelected] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [modal, setModal] = useState(""),
    [name, setName] = useState(""),
    [kind, setKind] = useState<Kind>("brief"),
    [filter, setFilter] = useState(""),
    [inspector, setInspector] = useState(window.innerWidth > 960),
    [tab, setTab] = useState("assets"),
    [busy, setBusy] = useState(false),
    [targetIteration, setTargetIteration] = useState("");
  useEffect(() => {
    const media = window.matchMedia("(min-width: 961px)");
    const onChange = (event: MediaQueryListEvent) => {
      if (!event.matches) setInspector(false);
    };
    media.addEventListener("change", onChange);
    return () => media.removeEventListener("change", onChange);
  }, []);
  const [desktopOpen, setDesktopOpen] = useState(false);
  const [desktopText, setDesktopText] = useState("");
  useEffect(() => {
    const handler = (event: Event) => {
      setDesktopText((event as CustomEvent<string>).detail);
      setDesktopOpen(true);
    };
    window.addEventListener("projectflow:execute", handler);
    return () => window.removeEventListener("projectflow:execute", handler);
  }, []);
  const refresh = useCallback(async () => {
    if (!project) return;
    const data = await api<Context>("context", project);
    setCtx(data);
    setIteration((i) =>
      data.state.iterations.some((x) => x.id === i)
        ? i
        : data.state.iterations[0].id,
    );
  }, [project]);
  useEffect(() => {
    api<typeof projects>("projects")
      .then((rows) => {
        setProjects(rows);
        setProject((p) =>
          rows.some((x) => x.id === p) ? p : (rows[0]?.id ?? ""),
        );
      })
      .catch((e) => setError(e.message));
  }, []);
  useEffect(() => {
    setCtx(undefined);
    setIteration("");
    setSelected("");
    void refresh().catch((e) => setError(e.message));
    const timer = setInterval(
      () => void refresh().catch((e) => setError(e.message)),
      5000,
    );
    return () => clearInterval(timer);
  }, [refresh]);
  const mutate = async (op: string, args: unknown) => {
    if (!ctx) throw new Error("项目未加载");
    const result = await api<any>("mutate", project, {
      project,
      operation: op,
      args,
      expectedRevision: ctx.state.revision,
      key: crypto.randomUUID(),
    });
    await refresh();
    return result;
  };
  const navigate = (s: Stage) => {
    setStage(s);
    setInspector(s !== "design" && window.innerWidth > 960);
    setSelected("");
    setTab("assets");
    setFilter("");
  };
  if (!ctx)
    return (
      <div className="boot">
        <Box size={36} />
        <h1>ProjectFlow</h1>
        <p>从想法，到持续迭代。</p>
        {window.projectflowDesktop && (
          <div className="desktop-boot-actions">
            <button
              className="primary"
              onClick={() =>
                window
                  .projectflowDesktop!.openProject()
                  .catch((e) => setError(e.message))
              }
            >
              选择项目文件夹
            </button>
          </div>
        )}
        {error ? (
          <div className="error">{error}</div>
        ) : project ? (
          <Busy />
        ) : (
          <p>
            {window.projectflowDesktop
              ? "选择一个项目文件夹，开始新项目或恢复已有资产。"
              : "请在 Codex 中使用 ProjectFlow 绑定你的本地项目，然后打开工作台。"}
          </p>
        )}
      </div>
    );
  const state = ctx.state;
  const current =
    state.iterations.find((i) => i.id === iteration) ?? state.iterations[0];
  const all = latestArtifacts(state, iteration);
  const available = all.filter((a) => stageKinds[stage].includes(a.kind));
  const list = available.filter((a) =>
    a.title.toLowerCase().includes(filter.toLowerCase()),
  );
  const a = all.find((a) => a.id === selected);
  const pending = state.requests.filter(
    (r) =>
      r.iterationId === iteration &&
      !["accepted", "cancelled"].includes(r.status),
  ).length;
  const create = async () => {
    setBusy(true);
    try {
      const row = await mutate("artifact.save", {
        expectedVersion: 0,
        iterationId: iteration,
        kind,
        title: name,
        body: templates[kind],
        data: kind === "design" ? blankDesign : {},
        refs: [],
      });
      setSelected(row.id);
      setModal("");
      setNotice("草稿已创建。可以直接编辑，或交给 Codex 完善。");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const save = async (args: Record<string, unknown>) =>
    mutate("artifact.save", args) as Promise<ArtifactVersion>;
  return (
    <div className={`app-shell ${inspector ? "" : "inspector-hidden"}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">
            <Box size={23} />
          </div>
          <strong>ProjectFlow</strong>
          <span>本地</span>
        </div>
        <div className="project-switch">
          <FolderOpen size={16} />
          <select
            aria-label="切换项目"
            value={project}
            onChange={(e) => setProject(e.target.value)}
          >
            {projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>
        <div className="nav-label">项目流程</div>
        <nav>
          {stages.map((s, i) => {
            const Icon = icons[s];
            const count = all.filter((a) =>
              stageKinds[s].includes(a.kind),
            ).length;
            return (
              <button
                key={s}
                aria-label={labels[s]}
                title={labels[s]}
                className={stage === s ? "active" : ""}
                onClick={() => navigate(s)}
              >
                <Icon size={17} />
                <span>{labels[s]}</span>
                {stages.indexOf(current.stage) > i ? (
                  <Check className="done" size={14} />
                ) : count > 0 ? (
                  <small>{count}</small>
                ) : null}
              </button>
            );
          })}
        </nav>
        <div className="iteration-section">
          <div className="nav-label">
            当前迭代
            <button
              className="icon"
              title="创建迭代"
              onClick={() => {
                setName("");
                setModal("iteration");
              }}
            >
              <Plus size={14} />
            </button>
          </div>
          <select
            aria-label="切换迭代"
            value={iteration}
            onChange={(e) => {
              setIteration(e.target.value);
              setSelected("");
            }}
          >
            {state.iterations.map((i) => (
              <option key={i.id} value={i.id}>
                {i.name}
              </option>
            ))}
          </select>
          <p>
            <span className="dot" />
            {labels[current.stage]}阶段
          </p>
        </div>
        <footer className="sidebar-footer">
          <button onClick={() => setModal("settings")}>
            <Settings2 size={17} />
            工具与项目设置
          </button>
          <div className="local-user">
            <div className="avatar">你</div>
            <div>
              <strong>本地工作区</strong>
              <span>Codex 主导执行</span>
            </div>
          </div>
        </footer>
      </aside>
      <header className="topbar">
        <div className="breadcrumb">
          {state.project.name}
          <ChevronRight size={14} />
          <strong>{current.name}</strong>
          <span className="version-label">r{state.revision}</span>
        </div>
        <div className="top-actions">
          {window.projectflowDesktop && (
            <>
              <button
                onClick={() =>
                  window
                    .projectflowDesktop!.openProject()
                    .catch((e) => setError(e.message))
                }
              >
                <FolderOpen size={15} />
                打开项目
              </button>
              <button onClick={() => setDesktopOpen(!desktopOpen)}>
                Codex 执行台
              </button>
            </>
          )}
          <span className="sync">
            <span className="dot" />
            本地已同步
          </span>
          <button
            onClick={() => {
              setTab("requests");
              setSelected("");
            }}
          >
            <Activity size={15} />
            待处理 {pending}
          </button>
          <button
            className="icon"
            aria-label="切换侧栏"
            onClick={() => setInspector(!inspector)}
          >
            <PanelRight size={18} />
          </button>
        </div>
      </header>
      <main className="main">
        <div className="stage-header">
          <div>
            <div className="stage-counter">
              {String(stages.indexOf(stage) + 1).padStart(2, "0")} / 10
            </div>
            <h1>{labels[stage]}</h1>
            <p>
              {stage === "design"
                ? "让需求成为可以查看、调整和交付的界面。"
                : stage === "prd"
                  ? "把问题、规则与验收标准写清楚，再进入设计。"
                  : stage === "operations"
                    ? "用真实反馈和数据，开启下一轮迭代。"
                    : "项目资产、执行上下文与决策，都在这里衔接。"}
            </p>
          </div>
          <div className="stage-actions">
            {stageKinds[stage].length > 0 && (
              <button
                onClick={() => {
                  setKind(stageKinds[stage][0]);
                  setName("");
                  setModal("artifact");
                }}
              >
                <Plus size={15} />
                新建{stage === "prd" ? " PRD" : "产物"}
              </button>
            )}
            <button className="primary" onClick={() => setModal("request")}>
              交给 Codex
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
        <div className="stage-tabs">
          <button
            className={tab === "assets" ? "active" : ""}
            onClick={() => setTab("assets")}
          >
            阶段产物 <span>{available.length}</span>
          </button>
          <button
            className={tab === "requests" ? "active" : ""}
            onClick={() => setTab("requests")}
          >
            执行请求 <span>{pending}</span>
          </button>
          {["testing", "release", "operations"].includes(stage) && (
            <button
              className={tab === "evidence" ? "active" : ""}
              onClick={() => setTab("evidence")}
            >
              证据与结果
            </button>
          )}
          <div className="stage-tabs-end">
            {stage === current.stage && stage !== "operations" && (
              <button onClick={() => setModal("advance")}>
                检查下一阶段
                <ChevronRight size={14} />
              </button>
            )}
          </div>
        </div>
        {error && (
          <div className="error">
            <AlertCircle size={15} />
            {error}
            <button onClick={() => setError("")}>关闭</button>
          </div>
        )}
        {notice && (
          <div className="notice">
            {notice}
            <button onClick={() => setNotice("")}>关闭</button>
          </div>
        )}
        <Suspense fallback={<Busy />}>
          <div className="stage-body">
            {tab === "requests" ? (
              <Requests
                state={state}
                iterationId={iteration}
                mutate={mutate}
                root={ctx.root}
              />
            ) : tab === "evidence" ? (
              <>
                <EvidencePanel
                  context={ctx}
                  iterationId={iteration}
                  mutate={mutate}
                  stage={stage}
                />
                {stage === "testing" && (
                  <VisualCompare
                    state={state}
                    iterationId={iteration}
                    project={project}
                  />
                )}
              </>
            ) : stage === "handoff" ? (
              <Handoff
                state={state}
                iterationId={iteration}
                project={project}
                mutate={mutate}
              />
            ) : a ? (
              <>
                <div className="asset-breadcrumb">
                  <button
                    className="text-button"
                    onClick={() => setSelected("")}
                  >
                    {labels[stage]}产物
                  </button>
                  <ChevronRight size={13} />
                  <strong>{a.title}</strong>
                  <span>v{a.version}</span>
                  {staleRefs(state, a).length > 0 && (
                    <span className="warning">上游已更新</span>
                  )}
                </div>
                {a.kind === "design" ? (
                  <DesignEditor
                    key={a.id}
                    project={project}
                    artifact={a}
                    isConfirmed={confirmed(state, a)}
                    onConfirm={() => { setName("已审阅当前设计，同意作为开发交付基线"); setModal("confirm"); }}
                    assets={state.assets}
                    onSave={save}
                    mutate={mutate}
                  />
                ) : (
                  <DocumentEditor
                    key={a.id}
                    artifact={a}
                    history={state.artifacts.filter((x) => x.id === a.id)}
                    onSave={save}
                  />
                )}
              </>
            ) : (
              <div className="asset-list-wrap">
                <div className="list-controls">
                  <label className="search-field">
                    <Search size={15} />
                    <input
                      placeholder="搜索当前阶段产物"
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                    />
                  </label>
                  {stage === "operations" && (
                    <label className="upload-button">
                      <Upload size={14} />
                      导入运营 CSV
                      <input
                        type="file"
                        accept=".csv"
                        onChange={async (e) => {
                          const f = e.target.files?.[0];
                          if (f)
                            try {
                              if (f.size > 1000000)
                                throw new Error("CSV 请控制在 1MB 内");
                              const csv = await f.text();
                              const row = await mutate("artifact.save", {
                                expectedVersion: 0,
                                iterationId: iteration,
                                kind: "metric",
                                title: f.name,
                                body: `# ${f.name}\n\n来源：用户导入 CSV\n\n收录时间：${new Date().toISOString()}\n\n## 数据\n\n\`\`\`csv\n${csv}\n\`\`\`\n\n## 指标口径与时间窗\n待用户补充；不得依据未定义口径推断。`,
                                data: { csv },
                                refs: [],
                              });
                              setSelected(row.id);
                            } catch (err) {
                              setError((err as Error).message);
                            }
                          e.target.value = "";
                        }}
                      />
                    </label>
                  )}
                </div>
                {list.length ? (
                  <div className="asset-table">
                    <div className="table-header">
                      <span>名称</span>
                      <span>状态</span>
                      <span>最近更新</span>
                    </div>
                    {list.map((row) => (
                      <button
                        key={row.id}
                        className="artifact-row"
                        onClick={() => setSelected(row.id)}
                      >
                        <div>
                          <div className={`file-symbol ${row.kind}`}>
                            <FileText size={18} />
                          </div>
                          <div>
                            <strong>{row.title}</strong>
                            <small>
                              {kindLabels[row.kind]} · v{row.version} ·{" "}
                              {row.refs.length} 个关联
                            </small>
                          </div>
                        </div>
                        <span
                          className={`status ${confirmed(state, row) ? "passed" : "draft"}`}
                        >
                          {staleRefs(state, row).length
                            ? "待复核"
                            : confirmed(state, row)
                              ? "已确认"
                              : "草稿"}
                        </span>
                        <time>
                          {new Date(row.createdAt).toLocaleDateString("zh-CN")}
                        </time>
                      </button>
                    ))}
                  </div>
                ) : (
                  <Empty
                    title={filter ? "没有匹配的产物" : `从${labels[stage]}开始`}
                    action={
                      !filter && (
                        <button onClick={() => setModal("request")}>
                          让 Codex 帮我整理
                          <ArrowRight size={14} />
                        </button>
                      )
                    }
                  >
                    在这里创建可编辑的产物，或把目标交给
                    Codex。所有内容都保存在当前项目中。
                  </Empty>
                )}
              </div>
            )}
          </div>
        </Suspense>
      </main>
      {inspector && (
        <aside className="inspector">
          <header>
            <strong>{a ? "产物详情" : "项目上下文"}</strong>
            <span>本地资产</span>
          </header>
          {a ? (
            <>
              <section>
                <h3>{a.title}</h3>
                <p className="muted">
                  {kindLabels[a.kind]} · v{a.version}
                </p>
                <div className="detail-row">
                  <span>确认状态</span>
                  <strong>{confirmed(state, a) ? "已确认" : "待确认"}</strong>
                </div>
                <div className="detail-row">
                  <span>上游关联</span>
                  <strong>{a.refs.length} 项</strong>
                </div>
                <div className="detail-row">
                  <span>影响下游</span>
                  <strong>{ctx.affected[a.id]?.length ?? 0} 项</strong>
                </div>
                {a.kind === "design" ? <p className="muted">请使用画布顶部的“确认设计”按钮完成审阅。</p> : <button
                  className="wide"
                  disabled={confirmed(state, a)}
                  onClick={() => {
                    setName("");
                    setModal("confirm");
                  }}
                >
                  <Check size={15} />
                  确认当前版本
                </button>}
              </section>
              <section>
                <h4>
                  <Link size={14} />
                  关联产物
                </h4>
                {a.refs.map((r) => (
                  <div className="reference" key={r.id}>
                    {
                      state.artifacts.find(
                        (x) => x.id === r.id && x.version === r.version,
                      )?.title
                    }{" "}
                    <small>v{r.version}</small>
                  </div>
                ))}
                <button
                  className="text-button"
                  onClick={() => setModal("refs")}
                >
                  编辑来源与依赖
                </button>
              </section>
              <section>
                <h4>
                  <MessageSquare size={14} />
                  评论与决策
                </h4>
                {state.events
                  .filter(
                    (e) =>
                      e.action === "artifact.comment" &&
                      JSON.parse(e.detail).args.ref.id === a.id,
                  )
                  .slice(-5)
                  .map((e) => (
                    <p className="comment" key={e.id}>
                      {JSON.parse(e.detail).args.body}
                      <small>{e.actor}</small>
                    </p>
                  ))}
                <button
                  className="text-button"
                  onClick={() => {
                    setName("");
                    setModal("comment");
                  }}
                >
                  添加评论
                </button>
                {["feedback", "review"].includes(a.kind) && (
                  <button
                    onClick={() => {
                      setName(`改进：${a.title}`);
                      setTargetIteration(iteration);
                      setModal("convert");
                    }}
                  >
                    转为下一轮需求
                  </button>
                )}
              </section>
            </>
          ) : (
            <>
              <section>
                <h3>{current.name}</h3>
                <p className="muted">
                  {current.goal || "先明确目标，再逐步交付。"}
                </p>
                <div className="detail-row">
                  <span>当前阶段</span>
                  <strong>{labels[current.stage]}</strong>
                </div>
                <div className="detail-row">
                  <span>项目产物</span>
                  <strong>{all.length} 项</strong>
                </div>
                <div className="detail-row">
                  <span>待处理请求</span>
                  <strong>{pending} 项</strong>
                </div>
              </section>
              <section>
                <h4>下一步准备情况</h4>
                {ctx.checks[iteration]?.issues.length ? (
                  ctx.checks[iteration].issues.map((issue, i) => (
                    <p className="check-item" key={i}>
                      <Clock3 size={14} />
                      {issue}
                    </p>
                  ))
                ) : (
                  <p className="check-item">
                    <Check size={14} />
                    已具备下一阶段所需产物
                  </p>
                )}
              </section>
              <section>
                <h4>执行方式</h4>
                <p className="muted">
                  在工作台编辑与确认，在 Codex
                  中继续执行。工作台不会自动唤起新的任务。
                </p>
                <button className="wide" onClick={() => setModal("request")}>
                  创建待执行请求
                </button>
              </section>
            </>
          )}
          <div className="inspector-bottom">
            <span className="dot" />
            资产在本地，执行在 Codex
          </div>
        </aside>
      )}
      {desktopOpen && window.projectflowDesktop && (
        <Suspense fallback={<Busy />}>
          <DesktopPanel
            project={project}
            initialText={desktopText}
            onClose={() => setDesktopOpen(false)}
          />
        </Suspense>
      )}
      {modal === "request" && (
        <RequestForm
          state={state}
          stage={stage}
          iterationId={iteration}
          selected={a}
          mutate={mutate}
          onClose={() => {
            setModal("");
            setTab("requests");
          }}
        />
      )}
      {["artifact", "iteration", "confirm", "comment", "convert"].includes(
        modal,
      ) && (
        <Modal
          title={
            (
              {
                artifact: "新建阶段产物",
                iteration: "创建迭代",
                confirm: "确认当前版本",
                comment: "添加评论",
                convert: "反馈转需求",
              } as any
            )[modal]
          }
          onClose={() => setModal("")}
        >
          {modal === "artifact" && (
            <label>
              产物类型
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as Kind)}
              >
                {stageKinds[stage].map((k) => (
                  <option key={k} value={k}>
                    {kindLabels[k]}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label>
            {["confirm", "comment"].includes(modal) ? "说明" : "名称"}
            <input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </label>
          {modal === "confirm" && (
            <p className="muted">
              确认 {a?.title} v{a?.version}{" "}
              已经完成审阅。后续修改将创建新版本，不复用此次确认。
            </p>
          )}
          {modal === "convert" && (
            <label>
              目标迭代
              <select
                value={targetIteration}
                onChange={(e) => setTargetIteration(e.target.value)}
              >
                {state.iterations.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </select>
              <span>保留原反馈引用，需求可进入下一轮迭代。</span>
            </label>
          )}
          <footer>
            <button onClick={() => setModal("")}>取消</button>
            <button
              className="primary"
              disabled={!name.trim() || busy}
              onClick={async () => {
                try {
                  if (modal === "artifact") {
                    await create();
                    return;
                  }
                  if (modal === "iteration") {
                    const i = await mutate("iteration.create", {
                      name,
                      goal: "",
                    });
                    setIteration(i.id);
                    navigate("init");
                  } else if (modal === "confirm")
                    await mutate("artifact.confirm", {
                      ref: { id: a!.id, version: a!.version },
                      reason: name,
                    });
                  else if (modal === "comment")
                    await mutate("artifact.comment", {
                      ref: { id: a!.id, version: a!.version },
                      body: name,
                    });
                  else if (modal === "convert") {
                    const row = await mutate("feedback.convert", {
                      ref: { id: a!.id, version: a!.version },
                      iterationId: targetIteration,
                      title: name,
                    });
                    setIteration(targetIteration);
                    navigate("requirements");
                    setSelected(row.id);
                  }
                  setModal("");
                } catch (e) {
                  setError((e as Error).message);
                  setModal("");
                }
              }}
            >
              {modal === "confirm" ? "确认当前版本" : "保存"}
            </button>
          </footer>
        </Modal>
      )}
      {modal === "refs" && a && (
        <ReferenceModal
          artifact={a}
          all={latestArtifacts(state)}
          onClose={() => setModal("")}
          onSave={async (refs) => {
            try {
              await save({ ...a, expectedVersion: a.version, refs });
              setModal("");
            } catch (e) {
              setError((e as Error).message);
              setModal("");
            }
          }}
        />
      )}
      {modal === "advance" && (
        <Modal title="进入下一阶段" onClose={() => setModal("")}>
          <p>
            从 {labels[current.stage]} 进入{" "}
            {labels[stages[Math.min(stages.indexOf(current.stage) + 1, 9)]]}
          </p>
          {ctx.checks[iteration]?.issues.map((issue, i) => (
            <p className="warning" key={i}>
              {issue}
            </p>
          ))}
          {current.stage === "design" && latestArtifacts(state, iteration).filter((row) => row.kind === "design" && !confirmed(state, row)).length > 0 && (
            <div className="confirmation-links">
              <p className="muted">逐份查看设计，并在画布顶部确认当前版本。</p>
              {latestArtifacts(state, iteration).filter((row) => row.kind === "design" && !confirmed(state, row)).map((row) => (
                <button key={row.id} className="wide" onClick={() => {
                  navigate("design"); setSelected(row.id); setModal(""); setDesktopOpen(false);
                }}>
                  <span>{row.title} · v{row.version}</span><span>查看并确认 <ArrowRight size={14} /></span>
                </button>
              ))}
            </div>
          )}
          <footer>
            <button onClick={() => setModal("")}>稍后</button>
            <button
              className="primary"
              disabled={!ctx.checks[iteration]?.ready}
              onClick={async () => {
                try {
                  const target = stages[stages.indexOf(current.stage) + 1];
                  await mutate("stage.advance", {
                    iterationId: iteration,
                    target,
                    reason: "用户在工作台确认进入下一阶段",
                  });
                  navigate(target);
                  setModal("");
                } catch (e) {
                  setError((e as Error).message);
                  setModal("");
                }
              }}
            >
              确认推进
            </button>
          </footer>
        </Modal>
      )}
      {modal === "settings" && (
        <Modal title="工具与项目设置" onClose={() => setModal("")}>
          <p className="muted">当前项目：{ctx.root}</p>
          <label>
            项目名称
            <input
              defaultValue={state.project.name}
              onBlur={async (e) => {
                if (
                  e.target.value.trim() &&
                  e.target.value !== state.project.name
                )
                  try {
                    await mutate("project.rename", { name: e.target.value });
                  } catch (error) {
                    setError((error as Error).message);
                  }
              }}
            />
          </label>
          <p>以下状态由 Codex 根据实际可用工具登记。</p>
          {Object.entries(state.capabilities).map(([key, v]) => (
            <div className="capability-row" key={key}>
              <strong>
                {
                  (
                    {
                      search: "调研检索",
                      image: "图片生成",
                      browser: "浏览器测试",
                      deploy: "部署发布",
                      analytics: "运营数据",
                    } as any
                  )[key]
                }
              </strong>
              <span>{v.available ? "可用" : "未确认 / 不可用"}</span>
              <small>{v.note}</small>
            </div>
          ))}
          <p className="muted">
            插件不配置独立模型密钥。工具缺失时可导入资料，或回到 Codex 配置。
          </p>
        </Modal>
      )}
    </div>
  );
}
function ReferenceModal({
  artifact,
  all,
  onSave,
  onClose,
}: {
  artifact: ArtifactVersion;
  all: ArtifactVersion[];
  onSave: (refs: Ref[]) => Promise<void>;
  onClose: () => void;
}) {
  const [ids, setIds] = useState(artifact.refs.map((r) => r.id));
  return (
    <Modal title="关联来源与依赖" onClose={onClose}>
      <p className="muted">关联会锁定当前版本；上游变化后将提示复核。</p>
      <div className="reference-options">
        {all
          .filter((a) => a.id !== artifact.id)
          .map((a) => (
            <label key={a.id}>
              <input
                type="checkbox"
                checked={ids.includes(a.id)}
                onChange={(e) =>
                  setIds(
                    e.target.checked
                      ? [...ids, a.id]
                      : ids.filter((id) => id !== a.id),
                  )
                }
              />
              {a.title}
              <span>v{a.version}</span>
            </label>
          ))}
      </div>
      <footer>
        <button
          className="primary"
          onClick={() =>
            void onSave(
              all
                .filter((a) => ids.includes(a.id))
                .map((a) => ({ id: a.id, version: a.version })),
            )
          }
        >
          保存关联
        </button>
      </footer>
    </Modal>
  );
}
