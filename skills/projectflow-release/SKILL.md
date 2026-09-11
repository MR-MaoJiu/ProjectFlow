---
name: projectflow-release
description: "为 ProjectFlow 整理发布候选、授权检查、上线证据与回滚方案。"
---

# ProjectFlow · 发布

在当前 Codex 执行此阶段。先读 [工具契约](../../references/contracts.md) 中相关部分；初次进入项目使用 projectflow_bind，再 read summary 定位当前迭代和版本。用户的明确范围与已有授权优先。

先核对发布范围、当前代码与有效测试结论。编写 release，记录目标环境、配置/数据变化与回滚边界。在用户明确授权目标内容与环境后使用现有工具发布，查询实际状态和关键路径，记录 evidence；仅提交部署任务不算发布成功。工具缺失就阻塞，不假成功。

写入使用实际返回的 ID、最新 expectedRevision 和唯一请求 key。上游变化时复核，不静默覆盖。记录产物 refs，保留未确认问题。关键基线确认必须对应用户已确认的版本；普通草稿操作不用反复请求确认。

需要工作台时调用 projectflow_workbench 并用当前宿主可用的浏览器入口打开。UI 请求不会自动唤醒 Codex。没有相关能力时说明缺口并保留资产，不切换到未授权供应商或模型 API。
