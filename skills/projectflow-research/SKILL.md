---
name: projectflow-research
description: "在 ProjectFlow 项目中收集调研来源、摘录与可追溯结论。"
---

# ProjectFlow · 调研

在当前 Codex 执行此阶段。先读 [工具契约](../../references/contracts.md) 中相关部分；初次进入项目使用 projectflow_bind，再 read summary 定位当前迭代和版本。用户的明确范围与已有授权优先。

先确定研究问题，检查当前检索工具能力。用现有授权工具检索或读取用户资料。research 分开事实、来源观点、推断与假设，保留链接、日期及具体摘录。不可访问的资料标为未核实。

写入使用实际返回的 ID、最新 expectedRevision 和唯一请求 key。上游变化时复核，不静默覆盖。记录产物 refs，保留未确认问题。关键基线确认必须对应用户已确认的版本；普通草稿操作不用反复请求确认。

需要工作台时调用 projectflow_workbench 并用当前宿主可用的浏览器入口打开。UI 请求不会自动唤醒 Codex。没有相关能力时说明缺口并保留资产，不切换到未授权供应商或模型 API。
