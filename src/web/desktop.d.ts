export {};
declare global {
  interface Window {
    projectflowDesktop?: {
      openProject: () => Promise<unknown>;
      connect: (project: string) => Promise<any>;
      status: (project: string) => Promise<any>;
      setAutoRun: (project: string, enabled: boolean) => Promise<{ autoRun: boolean }>;
      login: () => Promise<any>;
      send: (project: string, text: string) => Promise<any>;
      interrupt: () => Promise<any>;
      answer: (
        requestId: string,
        decision: string,
        answers: Record<string, string>,
      ) => Promise<any>;
      newConversation: (project: string) => Promise<any>;
    };
  }
}
