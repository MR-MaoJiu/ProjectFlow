---
name: projectflow-requirements
description: "将 ProjectFlow 调研与反馈整理为需求、依赖和迭代范围。"
---

# ProjectFlow · 需求整理

在当前 Codex 执行此阶段。先读 [工具契约](../../references/contracts.md) 中相关部分；初次进入项目使用 projectflow_bind，再 read summary 定位当前迭代和版本。用户的明确范围与已有授权优先。

读取研究与反馈，先提出去重合并建议。每项 requirement 包含用户场景、价值、优先级、业务行为、边界和可验收条件；refs 保留来源。只有纳入当前迭代的需求放入该迭代。

写入使用实际返回的 ID、最新 expectedRevision 和唯一请求 key。上游变化时复核，不静默覆盖。记录产物 refs，保留未确认问题。关键基线确认必须对应用户已确认的版本；普通草稿操作不用反复请求确认。

需要工作台时调用 projectflow_workbench 并用当前宿主可用的浏览器入口打开。UI 请求不会自动唤醒 Codex。没有相关能力时说明缺口并保留资产，不切换到未授权供应商或模型 API。
