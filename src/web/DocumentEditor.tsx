import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { Save, Eye, Pencil, Download, History, GitCompare } from "lucide-react";
import type { ArtifactVersion, Ref } from "../shared/model";
import { download } from "./api";
interface Props {
  artifact: ArtifactVersion;
  history: ArtifactVersion[];
  onSave: (args: Record<string, unknown>) => Promise<ArtifactVersion>;
}
export function DocumentEditor({ artifact: a, history, onSave }: Props) {
  const key = `projectflow-draft:${a.id}`;
  const restored = useRef<null | {
    title: string;
    body: string;
    version: number;
  }>(null);
  if (restored.current === null) {
    try {
      restored.current = JSON.parse(localStorage.getItem(key) ?? "null") ?? {
        title: a.title,
        body: a.body,
        version: a.version,
      };
    } catch {
      restored.current = { title: a.title, body: a.body, version: a.version };
    }
  }
  const [title, setTitle] = useState(restored.current!.title),
    [body, setBody] = useState(restored.current!.body),
    [mode, setMode] = useState<"edit" | "preview" | "history">("edit"),
    [version, setVersion] = useState(restored.current!.version),
    [error, setError] = useState(""),
    [saving, setSaving] = useState(false),
    [selected, setSelected] = useState(a.version);
  const saved = useRef(JSON.stringify({ title: a.title, body: a.body }));
  const dirty = JSON.stringify({ title, body }) !== saved.current;
  const save = async () => {
    if (saving || !dirty) return;
    setSaving(true);
    setError("");
    try {
      const r = await onSave({
        id: a.id,
        expectedVersion: version,
        iterationId: a.iterationId,
        kind: a.kind,
        title,
        body,
        data: a.data,
        refs: a.refs,
      });
      saved.current = JSON.stringify({ title, body });
      setVersion(r.version);
      localStorage.removeItem(key);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSaving(false);
    }
  };
  useEffect(() => {
    if (dirty) {
      localStorage.setItem(key, JSON.stringify({ title, body, version }));
      const timer = setTimeout(() => void save(), 1500);
      return () => clearTimeout(timer);
    }
  }, [title, body]);
  useEffect(() => {
    if (a.version !== version && !dirty && !saving) {
      setTitle(a.title);
      setBody(a.body);
      setVersion(a.version);
      saved.current = JSON.stringify({ title: a.title, body: a.body });
    }
  }, [a.version]);
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (dirty) {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty]);
  const previous = history.find((h) => h.version === selected) ?? a;
  return (
    <div className="document">
      <div className="document-tools">
        <div className="segments">
          <button
            className={mode === "edit" ? "selected" : ""}
            onClick={() => setMode("edit")}
          >
            <Pencil size={14} />
            编辑
          </button>
          <button
            className={mode === "preview" ? "selected" : ""}
            onClick={() => setMode("preview")}
          >
            <Eye size={14} />
            预览
          </button>
          <button
            className={mode === "history" ? "selected" : ""}
            onClick={() => setMode("history")}
          >
            <History size={14} />
            版本
          </button>
        </div>
        <span className="save-state">
          {saving
            ? "保存中…"
            : error
              ? "保存未完成"
              : dirty
                ? "草稿已保存在本机"
                : `已保存 · v${version}`}
        </span>
        <button
          className="icon"
          title="导出 Markdown"
          onClick={() => download(`${title}.md`, "text/markdown", body)}
        >
          <Download size={16} />
        </button>
        <button disabled={!dirty || saving} onClick={() => void save()}>
          <Save size={14} />
          保存
        </button>
      </div>
      {error && (
        <div className="error">
          {error}
          <button onClick={() => void save()}>重试保存</button>
          <button
            onClick={() => download(`${title}-草稿.md`, "text/markdown", body)}
          >
            导出本地草稿
          </button>
        </div>
      )}
      <div className="paper">
        <input
          className="document-title"
          aria-label="文档标题"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <div className="document-meta">
          {a.author} · {new Date(a.createdAt).toLocaleString("zh-CN")} ·{" "}
          {body.length.toLocaleString()} 字符
        </div>
        {mode === "edit" ? (
          <textarea
            className="markdown-input"
            aria-label="文档正文"
            spellCheck={false}
            value={body}
            onChange={(e) => setBody(e.target.value)}
          />
        ) : mode === "preview" ? (
          <article className="prose">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{body}</ReactMarkdown>
          </article>
        ) : (
          <div className="history">
            <label>
              历史版本
              <select
                value={selected}
                onChange={(e) => setSelected(Number(e.target.value))}
              >
                {history.map((h) => (
                  <option key={h.version} value={h.version}>
                    v{h.version} ·{" "}
                    {new Date(h.createdAt).toLocaleString("zh-CN")}
                  </option>
                ))}
              </select>
            </label>
            <button
              disabled={selected === a.version}
              onClick={() => {
                setBody(previous.body);
                setTitle(previous.title);
                setMode("edit");
              }}
            >
              <History size={14} />
              将此内容还原为新版本
            </button>
            <div className="diff">
              <div>
                <h4>
                  <GitCompare size={14} />v{previous.version}
                </h4>
                <pre>{previous.body}</pre>
              </div>
              <div>
                <h4>当前草稿</h4>
                <pre>{body}</pre>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
