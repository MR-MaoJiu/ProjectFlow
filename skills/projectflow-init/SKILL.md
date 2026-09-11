---
name: projectflow-init
description: "创建或完善 ProjectFlow 立项卡，澄清目标用户、问题、范围、成功指标与关键假设。"
---

# ProjectFlow · 立项

在当前 Codex 执行此阶段。先读 [工具契约](../../references/contracts.md) 中相关部分；初次进入项目使用 projectflow_bind，再 read summary 定位当前迭代和版本。用户的明确范围与已有授权优先。

读取已有 brief 和用户陈述。产物 brief 写清问题、用户、可测目标、不做事项、假设与验证方法。用户确认方向后才确认该版本。

写入使用实际返回的 ID、最新 expectedRevision 和唯一请求 key。上游变化时复核，不静默覆盖。记录产物 refs，保留未确认问题。关键基线确认必须对应用户已确认的版本；普通草稿操作不用反复请求确认。

需要工作台时调用 projectflow_workbench 并用当前宿主可用的浏览器入口打开。UI 请求不会自动唤醒 Codex。没有相关能力时说明缺口并保留资产，不切换到未授权供应商或模型 API。
