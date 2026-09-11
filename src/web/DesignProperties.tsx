import type { DesignNode, DesignDocument } from "../shared/model";
export function RichStyles({
  node: n,
  onChange,
}: {
  node: DesignNode;
  onChange: (patch: Partial<DesignNode>) => void;
}) {
  return (
    <div className="rich-styles">
      <h4>视觉样式</h4>
      <label>
        不透明度
        <input
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={n.opacity ?? 1}
          onChange={(e) => onChange({ opacity: Number(e.target.value) })}
        />
      </label>
      <div className="field-grid">
        <label>
          描边颜色
          <input
            type="color"
            value={n.stroke?.slice(0, 7) ?? "#e3e8e5"}
            onChange={(e) =>
              onChange({
                stroke: e.target.value,
                strokeWidth: n.strokeWidth ?? 1,
              })
            }
          />
        </label>
        <label>
          描边宽度
          <input
            type="number"
            min="0"
            max="32"
            value={n.strokeWidth ?? 0}
            onChange={(e) => onChange({ strokeWidth: Number(e.target.value) })}
          />
        </label>
      </div>
      <label>
        投影
        <select
          value={n.shadow ? "on" : "off"}
          onChange={(e) =>
            onChange({
              shadow:
                e.target.value === "on"
                  ? { color: "#102f25", blur: 24, x: 0, y: 8, opacity: 0.12 }
                  : undefined,
            })
          }
        >
          <option value="off">无投影</option>
          <option value="on">柔和投影</option>
        </select>
      </label>
      {n.shadow && (
        <div className="field-grid">
          <label>
            模糊
            <input
              type="number"
              min="0"
              max="100"
              value={n.shadow.blur}
              onChange={(e) =>
                onChange({
                  shadow: { ...n.shadow!, blur: Number(e.target.value) },
                })
              }
            />
          </label>
          <label>
            透明度
            <input
              type="number"
              min="0"
              max="1"
              step="0.05"
              value={n.shadow.opacity}
              onChange={(e) =>
                onChange({
                  shadow: { ...n.shadow!, opacity: Number(e.target.value) },
                })
              }
            />
          </label>
          <label>
            偏移 X
            <input
              type="number"
              min="-100"
              max="100"
              value={n.shadow.x}
              onChange={(e) =>
                onChange({
                  shadow: { ...n.shadow!, x: Number(e.target.value) },
                })
              }
            />
          </label>
          <label>
            偏移 Y
            <input
              type="number"
              min="-100"
              max="100"
              value={n.shadow.y}
              onChange={(e) =>
                onChange({
                  shadow: { ...n.shadow!, y: Number(e.target.value) },
                })
              }
            />
          </label>
        </div>
      )}
      <label>
        渐变
        <select
          value={n.gradient ? "on" : "off"}
          onChange={(e) =>
            onChange({
              gradient:
                e.target.value === "on"
                  ? {
                      angle: 90,
                      stops: [
                        { offset: 0, color: "#f6f8f2" },
                        { offset: 1, color: "#e3ebe0" },
                      ],
                    }
                  : undefined,
            })
          }
        >
          <option value="off">纯色</option>
          <option value="on">线性渐变</option>
        </select>
      </label>
      {n.gradient && (
        <>
          <label>
            渐变角度
            <input
              type="number"
              min="-360"
              max="360"
              value={n.gradient.angle}
              onChange={(e) =>
                onChange({
                  gradient: { ...n.gradient!, angle: Number(e.target.value) },
                })
              }
            />
          </label>
          <div className="field-grid">
            {n.gradient.stops.map((stop, index) => (
              <label key={index}>
                色标 {index + 1}
                <input
                  type="color"
                  value={stop.color.slice(0, 7)}
                  onChange={(e) =>
                    onChange({
                      gradient: {
                        ...n.gradient!,
                        stops: n.gradient!.stops.map((s, i) =>
                          i === index ? { ...s, color: e.target.value } : s,
                        ),
                      },
                    })
                  }
                />
              </label>
            ))}
          </div>
        </>
      )}
      {n.type === "text" && (
        <>
          <h4>文字排版</h4>
          <p className="muted">内置 Noto Sans SC · 实际字形测量</p>
          <label>
            字重
            <select
              value={n.fontWeight ?? 400}
              onChange={(e) => onChange({ fontWeight: Number(e.target.value) })}
            >
              {[...new Set([100, 200, 300, 400, 500, 600, 700, 800, 900, n.fontWeight ?? 400])].sort((a, b) => a - b).map((w) => (
                <option key={w} value={w}>
                  {w}
                </option>
              ))}
            </select>
          </label>
          <div className="field-grid">
            <label>
              行高
              <input
                type="number"
                min="1"
                max="512"
                value={
                  n.lineHeight ?? Number(((n.fontSize ?? 16) * 1.45).toFixed(1))
                }
                onChange={(e) =>
                  onChange({ lineHeight: Number(e.target.value) })
                }
              />
            </label>
            <label>
              字间距
              <input
                type="number"
                min="-10"
                max="40"
                step="0.1"
                value={n.letterSpacing ?? 0}
                onChange={(e) =>
                  onChange({ letterSpacing: Number(e.target.value) })
                }
              />
            </label>
          </div>
          <label>
            水平对齐
            <select
              value={n.textAlign ?? "left"}
              onChange={(e) =>
                onChange({
                  textAlign: e.target.value as DesignNode["textAlign"],
                })
              }
            >
              <option value="left">左对齐</option>
              <option value="center">居中</option>
              <option value="right">右对齐</option>
            </select>
          </label>
          <label>
            垂直对齐
            <select
              value={n.verticalAlign ?? "top"}
              onChange={(e) =>
                onChange({
                  verticalAlign: e.target.value as DesignNode["verticalAlign"],
                })
              }
            >
              <option value="top">顶部</option>
              <option value="middle">居中</option>
              <option value="bottom">底部</option>
            </select>
          </label>
          <label>
            溢出方式
            <select
              value={n.textOverflow ?? "clip"}
              onChange={(e) =>
                onChange({
                  textOverflow: e.target.value as DesignNode["textOverflow"],
                })
              }
            >
              <option value="clip">保留内容（检查裁切）</option>
              <option value="ellipsis">尾部省略号</option>
            </select>
          </label>
        </>
      )}
      {n.type === "image" && (
        <>
          <h4>图片适配</h4>
          <label>
            填充方式
            <select
              value={n.imageFit ?? "cover"}
              onChange={(e) =>
                onChange({ imageFit: e.target.value as DesignNode["imageFit"] })
              }
            >
              <option value="cover">铺满并裁切</option>
              <option value="contain">完整显示</option>
              <option value="fill">拉伸填满</option>
            </select>
          </label>
          <label>
            焦点
            <select
              value={n.imagePosition ?? "center"}
              onChange={(e) =>
                onChange({
                  imagePosition: e.target.value as DesignNode["imagePosition"],
                })
              }
            >
              {[
                ["center", "居中"],
                ["top", "顶部"],
                ["bottom", "底部"],
                ["left", "左侧"],
                ["right", "右侧"],
              ].map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      {n.type === "frame" && (
        <>
          <h4>自动布局</h4>
          <label>
            排列方向
            <select
              value={n.layout}
              onChange={(e) =>
                onChange({ layout: e.target.value as DesignNode["layout"] })
              }
            >
              <option value="absolute">自由定位</option>
              <option value="vertical">纵向</option>
              <option value="horizontal">横向</option>
            </select>
          </label>
          <div className="field-grid">
            <label>
              内边距
              <input
                type="number"
                min="0"
                max="500"
                value={n.padding}
                onChange={(e) => onChange({ padding: Number(e.target.value) })}
              />
            </label>
            <label>
              间距
              <input
                type="number"
                min="0"
                max="500"
                value={n.gap}
                onChange={(e) => onChange({ gap: Number(e.target.value) })}
              />
            </label>
          </div>
          <label>
            交叉轴对齐
            <select
              value={n.alignItems ?? "start"}
              onChange={(e) =>
                onChange({
                  alignItems: e.target.value as DesignNode["alignItems"],
                })
              }
            >
              {[
                ["start", "起点"],
                ["center", "居中"],
                ["end", "末端"],
                ["stretch", "拉伸"],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label>
            主轴分布
            <select
              value={n.justifyContent ?? "start"}
              onChange={(e) =>
                onChange({
                  justifyContent: e.target
                    .value as DesignNode["justifyContent"],
                })
              }
            >
              {[
                ["start", "起点"],
                ["center", "居中"],
                ["end", "末端"],
                ["space-between", "两端对齐"],
              ].map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
        </>
      )}
      <label>
        元素用途
        <select
          value={n.role ?? ""}
          onChange={(e) =>
            onChange({
              role: (e.target.value || undefined) as DesignNode["role"],
            })
          }
        >
          {[
            ["", "普通元素"],
            ["surface", "容器"],
            ["heading", "标题"],
            ["body", "正文"],
            ["button", "按钮"],
            ["icon", "图片图标"],
            ["product-image", "产品照片"],
            ["illustration", "插画素材"],
          ].map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}
export interface QualityReport {
  ready: boolean;
  issues: {
    code: string;
    message: string;
    severity: string;
    nodeId?: string;
  }[];
}
export function QualityInspector({
  design,
  quality,
  onChange,
  onSelect,
}: {
  design: DesignDocument;
  quality?: QualityReport;
  onChange: (patch: Partial<DesignDocument>) => void;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="quality-inspector">
      <h4>高保真交付检查</h4>
      <label>
        设计阶段
        <select
          value={design.fidelity ?? "draft"}
          onChange={(e) =>
            onChange({ fidelity: e.target.value as DesignDocument["fidelity"] })
          }
        >
          <option value="draft">结构草稿</option>
          <option value="high">高保真交付</option>
        </select>
      </label>
      {quality && (
        <>
          <p className={quality.ready ? "muted" : "warning"}>
            {quality.ready
              ? "技术检查通过，仍需视觉复核"
              : `${quality.issues.filter((i) => i.severity === "error").length} 项需要修正`}
          </p>
          {quality.issues.map((issue, i) => (
            <button
              key={i}
              className={`quality-issue ${issue.severity}`}
              onClick={() => issue.nodeId && onSelect(issue.nodeId)}
            >
              {issue.message}
            </button>
          ))}
        </>
      )}
      <label>
        视觉复核记录
        <textarea
          value={design.visualReview ?? ""}
          placeholder="对照完整参考图与真实预览，记录排版、素材、图标、对齐差异及修正结论。"
          onChange={(e) => onChange({ visualReview: e.target.value })}
        />
      </label>
      <label>
        无需图片的原因（适用时）
        <textarea
          value={design.noAssetsReason ?? ""}
          placeholder="仅用于确实无需图片或图标的页面。"
          onChange={(e) => onChange({ noAssetsReason: e.target.value })}
        />
      </label>
    </div>
  );
}
