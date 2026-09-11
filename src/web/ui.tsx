import type { ReactNode } from "react";
import { X, LoaderCircle } from "lucide-react";
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="modal-shade" onClick={onClose}>
      <section
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <header>
          <h2>{title}</h2>
          <button className="icon" aria-label="关闭" onClick={onClose}>
            <X size={18} />
          </button>
        </header>
        {children}
      </section>
    </div>
  );
}
export function Empty({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-symbol">◇</div>
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Busy() {
  return (
    <div className="loading">
      <LoaderCircle size={20} className="spin" /> 正在读取项目资产
    </div>
  );
}
export const statusLabels: Record<string, string> = {
  pending: "待 Codex 执行",
  running: "执行中",
  blocked: "受阻",
  submitted: "待评审",
  accepted: "已验收",
  cancelled: "已取消",
  passed: "通过",
  failed: "失败",
  not_run: "未执行",
  skipped: "跳过",
};
export function Status({ value }: { value: string }) {
  return (
    <span className={`status ${value}`}>{statusLabels[value] ?? value}</span>
  );
}
