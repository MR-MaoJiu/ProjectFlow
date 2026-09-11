import type { State } from "../shared/model";
const fragment = new URLSearchParams(location.hash.slice(1));
if (fragment.get("token")) {
  sessionStorage.setItem("projectflow-token", fragment.get("token")!);
  history.replaceState(
    null,
    "",
    location.pathname +
      (fragment.get("project") ? `?project=${fragment.get("project")}` : ""),
  );
}
export interface Context {
  state: State;
  root: string;
  repository: { commit: string; rules: { path: string; body: string }[] };
  affected: Record<string, string[]>;
  checks: Record<string, { ready: boolean; issues: string[] }>;
  staleEvidence: string[];
}
export async function api<T>(
  route: string,
  project?: string,
  body?: unknown,
): Promise<T> {
  const response = await fetch(
    `/api/${route}${project ? `${route.includes("?") ? "&" : "?"}project=${encodeURIComponent(project)}` : ""}`,
    {
      method: body ? "POST" : "GET",
      headers: {
        Authorization: `Bearer ${sessionStorage.getItem("projectflow-token") ?? ""}`,
        "Content-Type": "application/json",
      },
      body: body ? JSON.stringify(body) : undefined,
    },
  );
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      `${data.error?.message ?? "请求失败"}${data.error?.code === "VERSION_CONFLICT" ? "（本地草稿仍保留）" : ""}`,
    );
  return data;
}
export function download(
  name: string,
  mime: string,
  data: string,
  base64 = false,
) {
  const bytes = base64
    ? Uint8Array.from(atob(data), (c) => c.charCodeAt(0))
    : data;
  const url = URL.createObjectURL(new Blob([bytes], { type: mime }));
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function exportFile(project: string, args: unknown) {
  const r = await api<{ name: string; mime: string; base64: string }>(
    "export",
    project,
    args,
  );
  download(r.name, r.mime, r.base64, true);
}
export function fileBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
