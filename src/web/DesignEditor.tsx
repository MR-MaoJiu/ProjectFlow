import { useState, useEffect, useRef } from "react";
import {
  Square,
  Type,
  Image,
  Download,
  Plus,
  Layers,
  ZoomIn,
  ZoomOut,
  Upload,
  MousePointer2,
  Save,
  Code2,
} from "lucide-react";
import {
  designSchema,
  layoutNodes,
  baseNode,
  type ArtifactVersion,
  type Asset,
  type DesignDocument,
  type DesignNode,
} from "../shared/model";
import { api, exportFile, download, fileBase64 } from "./api";
interface Props {
  project: string;
  artifact: ArtifactVersion;
  assets: Asset[];
  onSave: (args: Record<string, unknown>) => Promise<ArtifactVersion>;
  mutate: (op: string, args: unknown) => Promise<any>;
}
function flatten(nodes: DesignNode[], x = 0, y = 0): DesignNode[] {
  return nodes.flatMap((n) => [
    { ...n, x: n.x + x, y: n.y + y },
    ...flatten(n.children, x + n.x, y + n.y),
  ]);
}
export function DesignEditor({
  project,
  artifact: a,
  assets,
  onSave,
  mutate,
}: Props) {
  const draftKey = `projectflow-design:${a.id}`;
  const initial = useRef<{
    data: DesignDocument;
    version: number;
    dirty: boolean;
  } | null>(null);
  if (!initial.current) {
    try {
      const cached = JSON.parse(localStorage.getItem(draftKey) ?? "null");
      initial.current = cached
        ? {
            data: designSchema.parse(cached.data),
            version: cached.version,
            dirty: true,
          }
        : {
            data: a.data as unknown as DesignDocument,
            version: a.version,
            dirty: false,
          };
    } catch {
      initial.current = {
        data: a.data as unknown as DesignDocument,
        version: a.version,
        dirty: false,
      };
    }
  }
  const canvas = useRef<HTMLDivElement>(null);
  const [d, setD] = useState(initial.current.data),
    [selected, setSelected] = useState(""),
    [zoom, setZoom] = useState(0.7),
    [error, setError] = useState(""),
    [preview, setPreview] = useState(""),
    [json, setJson] = useState(false),
    [raw, setRaw] = useState(""),
    [dirty, setDirty] = useState(initial.current.dirty),
    [base, setBase] = useState(initial.current.version),
    [scale, setScale] = useState(2),
    [exportNotice, setExportNotice] = useState("");
  const fit = () => {
    if (canvas.current)
      setZoom(
        Math.max(
          0.15,
          Math.min(
            1,
            (canvas.current.clientWidth - 48) / d.viewport.width,
            (canvas.current.clientHeight - 48) / d.viewport.height,
          ),
        ),
      );
  };
  useEffect(fit, [a.id]);
  useEffect(() => {
    if (dirty)
      localStorage.setItem(
        draftKey,
        JSON.stringify({ data: d, version: base }),
      );
  }, [d, dirty, base]);
  const nodes = flatten(layoutNodes(d.nodes));
  const target = nodes.find((n) => n.id === selected);
  useEffect(() => {
    let live = true;
    api<{ base64: string; mime: string }>("export", project, {
      ref: { id: a.id, version: a.version },
      format: "png",
    })
      .then((r) => {
        if (live) setPreview(`data:${r.mime};base64,${r.base64}`);
      })
      .catch((e) => setError(e.message));
    return () => {
      live = false;
    };
  }, [a.version, project]);
  useEffect(() => {
    if (!dirty) {
      setD(a.data as unknown as DesignDocument);
      setBase(a.version);
    }
  }, [a.version]);
  const update = (nodeId: string, patch: Partial<DesignNode>) => {
    const walk = (ns: DesignNode[]): DesignNode[] =>
      ns.map((n) => ({
        ...n,
        ...(n.id === nodeId ? patch : {}),
        children: walk(n.children),
      }));
    setD({ ...d, nodes: walk(d.nodes) });
    setDirty(true);
  };
  const save = async () => {
    try {
      const row = await onSave({
        id: a.id,
        expectedVersion: base,
        iterationId: a.iterationId,
        kind: a.kind,
        title: a.title,
        body: a.body,
        data: d,
        refs: a.refs,
      });
      setBase(row.version);
      setDirty(false);
      localStorage.removeItem(draftKey);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const add = (type: DesignNode["type"], assetId?: string) => {
    const n: DesignNode = {
      ...baseNode,
      id: `node_${crypto.randomUUID()}`,
      name: type === "text" ? "文字" : type === "image" ? "图片" : "矩形",
      type,
      x: 24,
      y: 40 + nodes.length * 16,
      width: type === "text" ? 280 : 160,
      height: type === "text" ? 48 : 120,
      fill: type === "text" ? "#172033" : "#e9eef8",
      text: type === "text" ? "输入标题" : undefined,
      fontSize: 24,
      assetId,
    };
    setD({ ...d, nodes: [...d.nodes, n] });
    setSelected(n.id);
    setDirty(true);
  };
  const safeExport = async (format: "png" | "svg") => {
    try {
      if (dirty) throw new Error("请先保存设计再导出");
      await exportFile(project, {
        ref: { id: a.id, version: a.version },
        nodeId: selected || undefined,
        format,
        scale,
      });
      setExportNotice(`已生成 ${format.toUpperCase()}，已向浏览器发起下载。`);
      setError("");
    } catch (e) {
      setError((e as Error).message);
    }
  };
  return (
    <div className="design">
      <div className="design-toolbar">
        <div className="toolgroup">
          <MousePointer2 size={16} />
          <button
            className="icon"
            title="缩小"
            onClick={() => setZoom(Math.max(0.15, zoom - 0.1))}
          >
            <ZoomOut size={16} />
          </button>
          <span>{Math.round(zoom * 100)}%</span>
          <button onClick={fit}>适应</button>
          <button
            className="icon"
            title="放大"
            onClick={() => setZoom(Math.min(1.5, zoom + 0.1))}
          >
            <ZoomIn size={16} />
          </button>
        </div>
        <div className="toolgroup">
          <button onClick={() => add("text")}>
            <Type size={15} />
            文字
          </button>
          <button onClick={() => add("rect")}>
            <Square size={15} />
            形状
          </button>
          <button
            onClick={() => {
              setRaw(JSON.stringify(d, null, 2));
              setJson(!json);
            }}
          >
            <Code2 size={15} />
            结构
          </button>
          <button
            className="primary"
            disabled={!dirty}
            onClick={() => void save()}
          >
            <Save size={15} />
            保存设计
          </button>
        </div>
      </div>
      {error && <div className="error">{error}</div>}
      {exportNotice && <div className="notice">{exportNotice}</div>}
      <div className="design-body">
        <div className="layers">
          <h4>
            <Layers size={14} />
            页面模块
          </h4>
          {nodes.map((n) => (
            <button
              className={selected === n.id ? "active" : ""}
              key={n.id}
              onClick={() => setSelected(n.id)}
            >
              {n.type === "text" ? (
                <Type size={13} />
              ) : n.type === "image" ? (
                <Image size={13} />
              ) : (
                <Square size={13} />
              )}
              <span>{n.name}</span>
            </button>
          ))}
          <button onClick={() => setSelected("")}>选择整个页面</button>
        </div>
        <div className="canvas" ref={canvas}>
          {json ? (
            <div className="json-edit">
              <textarea
                aria-label="设计 JSON"
                value={raw}
                onChange={(e) => setRaw(e.target.value)}
              />
              <button
                onClick={() => {
                  try {
                    const v = designSchema.parse(JSON.parse(raw));
                    if (!v.viewport || !Array.isArray(v.nodes))
                      throw new Error("需要 viewport 与 nodes");
                    setD(v);
                    setDirty(true);
                    setJson(false);
                  } catch (e) {
                    setError((e as Error).message);
                  }
                }}
              >
                应用结构
              </button>
            </div>
          ) : (
            <div
              className="artboard"
              style={{
                width: d.viewport.width * zoom,
                height: d.viewport.height * zoom,
              }}
            >
              <div
                style={{
                  width: d.viewport.width,
                  height: d.viewport.height,
                  transform: `scale(${zoom})`,
                  transformOrigin: "top left",
                  position: "relative",
                }}
              >
                {preview && !dirty ? (
                  <img className="design-render" src={preview} alt={a.title} />
                ) : (
                  <DraftNodes
                    nodes={layoutNodes(d.nodes)}
                    assets={assets}
                    project={project}
                  />
                )}
                {nodes.map((n) => (
                  <button
                    key={n.id}
                    aria-label={`选择模块 ${n.name}`}
                    className={`node-hit ${selected === n.id ? "picked" : ""}`}
                    style={{
                      left: n.x,
                      top: n.y,
                      width: n.width,
                      height: n.height,
                      zIndex: nodes.indexOf(n) + 1,
                    }}
                    onClick={() => setSelected(n.id)}
                  >
                    {selected === n.id && (
                      <span>
                        {n.width} × {n.height}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
        <div className="design-properties">
          <h4>{target?.name ?? "整个页面"}</h4>
          <p className="muted">
            {target
              ? `${target.type} · ${target.id.slice(0, 14)}`
              : `${d.viewport.width} × ${d.viewport.height}`}
          </p>
          {target && (
            <>
              <label>
                模块名称
                <input
                  value={target.name}
                  onChange={(e) => update(target.id, { name: e.target.value })}
                />
              </label>
              <div className="field-grid">
                {(["x", "y", "width", "height", "radius"] as const).map((k) => (
                  <label key={k}>
                    {
                      {
                        x: "X",
                        y: "Y",
                        width: "宽度",
                        height: "高度",
                        radius: "圆角",
                      }[k]
                    }
                    <input
                      type="number"
                      value={target[k]}
                      onChange={(e) =>
                        update(target.id, { [k]: Number(e.target.value) })
                      }
                    />
                  </label>
                ))}
                <label>
                  颜色
                  <input
                    type="color"
                    value={
                      target.fill.startsWith("#") ? target.fill : "#ffffff"
                    }
                    onChange={(e) =>
                      update(target.id, { fill: e.target.value })
                    }
                  />
                </label>
              </div>
              {target.type === "text" && (
                <>
                  <label>
                    文字
                    <textarea
                      value={target.text ?? ""}
                      onChange={(e) =>
                        update(target.id, { text: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    字号
                    <input
                      type="number"
                      value={target.fontSize ?? 16}
                      onChange={(e) =>
                        update(target.id, { fontSize: Number(e.target.value) })
                      }
                    />
                  </label>
                </>
              )}
            </>
          )}
          <label>
            导出倍率
            <select
              value={scale}
              onChange={(e) => setScale(Number(e.target.value))}
            >
              <option value={1}>1×</option>
              <option value={2}>2×</option>
              <option value={3}>3×</option>
            </select>
          </label>
          <button onClick={() => void safeExport("png")}>
            <Download size={14} />
            导出 PNG
          </button>
          <button onClick={() => void safeExport("svg")}>导出矢量 SVG</button>
          <label>
            页面状态
            <input
              value={d.states.join("、")}
              onChange={(e) => {
                setD({ ...d, states: e.target.value.split("、") });
                setDirty(true);
              }}
            />
          </label>
          <label>
            交互说明
            <textarea
              value={d.interactions}
              onChange={(e) => {
                setD({ ...d, interactions: e.target.value });
                setDirty(true);
              }}
            />
          </label>
        </div>
      </div>
      <div className="asset-tray">
        <header>
          <strong>
            页面素材 <span>{assets.length}</span>
          </strong>
          <label className="upload-button">
            <Upload size={14} />
            导入图片
            <input
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f)
                  try {
                    await mutate("asset.import", {
                      name: f.name,
                      base64: await fileBase64(f),
                      source: "用户上传",
                    });
                  } catch (err) {
                    setError((err as Error).message);
                  }
                e.target.value = "";
              }}
            />
          </label>
        </header>
        <div className="asset-strip">
          {assets.map((asset) => (
            <AssetTile
              key={asset.id}
              asset={asset}
              project={project}
              add={() => add("image", asset.id)}
            />
          ))}
          {!assets.length && (
            <span className="muted">
              导入独立图片，或回到 Codex 使用现有图片工具生成素材。
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
function AssetTile({
  asset,
  project,
  add,
}: {
  asset: Asset;
  project: string;
  add: () => void;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    api<{ base64: string }>("export", project, { assetId: asset.id }).then(
      (r) => setUrl(`data:image/png;base64,${r.base64}`),
    );
  }, [asset.id]);
  return (
    <div className="asset-tile">
      <button onClick={add} title="插入画布">
        {url ? <img src={url} alt={asset.name} /> : <Image size={24} />}
      </button>
      <strong>{asset.name}</strong>
      <span>
        {asset.width} × {asset.height}
      </span>
      <button
        className="text-button"
        onClick={() => void exportFile(project, { assetId: asset.id })}
      >
        下载素材
      </button>
    </div>
  );
}
function DraftNodes({
  nodes,
  assets,
  project,
}: {
  nodes: DesignNode[];
  assets: Asset[];
  project: string;
}) {
  return (
    <>
      {nodes.map((n) => (
        <div
          key={n.id}
          style={{
            position: "absolute",
            left: n.x,
            top: n.y,
            width: n.width,
            height: n.height,
            borderRadius: n.radius,
            overflow: "hidden",
            background: ["rect", "frame"].includes(n.type) ? n.fill : undefined,
            color: n.fill,
            fontSize: n.fontSize ?? 16,
            whiteSpace: "pre-wrap",
            lineHeight: 1.45,
          }}
        >
          {n.type === "text" ? (
            n.text
          ) : n.type === "vector" ? (
            <svg width={n.width} height={n.height}>
              <path d={n.path} fill={n.fill} />
            </svg>
          ) : n.type === "image" ? (
            <AssetImage project={project} assetId={n.assetId!} />
          ) : null}
          <DraftNodes nodes={n.children} assets={assets} project={project} />
        </div>
      ))}
    </>
  );
}
function AssetImage({
  project,
  assetId,
}: {
  project: string;
  assetId: string;
}) {
  const [url, setUrl] = useState("");
  useEffect(() => {
    api<{ base64: string }>("export", project, { assetId }).then((r) =>
      setUrl(`data:image/png;base64,${r.base64}`),
    );
  }, [assetId]);
  return url ? (
    <img
      style={{ width: "100%", height: "100%", objectFit: "cover" }}
      src={url}
      alt="设计素材"
    />
  ) : null;
}
