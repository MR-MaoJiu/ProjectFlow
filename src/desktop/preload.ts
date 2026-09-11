import { contextBridge, ipcRenderer } from "electron";
const invoke = (method: string, args: unknown = {}) =>
  ipcRenderer.invoke("projectflow:desktop", { method, args });
contextBridge.exposeInMainWorld("projectflowDesktop", {
  openProject: () => invoke("openProject"),
  connect: (project: string) => invoke("connect", { project }),
  status: (project: string) => invoke("status", { project }),
  setAutoRun: (project: string, enabled: boolean) => invoke("setAutoRun", { project, enabled }),
  login: () => invoke("login"),
  send: (project: string, text: string) => invoke("send", { project, text }),
  interrupt: () => invoke("interrupt"),
  answer: (
    requestId: string,
    decision: string,
    answers: Record<string, string>,
  ) => invoke("answer", { requestId, decision, answers }),
  newConversation: (project: string) => invoke("newConversation", { project }),
});
