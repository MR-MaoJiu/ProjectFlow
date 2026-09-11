---
name: projectflow-operations
description: "在 ProjectFlow 中分析已提供数据、整理反馈、复盘并创建下一轮需求。"
---

# ProjectFlow · 运营

在当前 Codex 执行此阶段。先读 [工具契约](../../references/contracts.md) 中相关部分；初次进入项目使用 projectflow_bind，再 read summary 定位当前迭代和版本。用户的明确范围与已有授权优先。

读取发布版本与实际运营数据，先明确口径、来源、时区、时间窗。分别写 metric/feedback/review，区分观察与原因假设。没有数据不补造。创建下一迭代后用 feedback.convert 保留来源。生成文案不授权对外发送，付费/发送需已有明确授权。

写入使用实际返回的 ID、最新 expectedRevision 和唯一请求 key。上游变化时复核，不静默覆盖。记录产物 refs，保留未确认问题。关键基线确认必须对应用户已确认的版本；普通草稿操作不用反复请求确认。

需要工作台时调用 projectflow_workbench 并用当前宿主可用的浏览器入口打开。UI 请求不会自动唤醒 Codex。没有相关能力时说明缺口并保留资产，不切换到未授权供应商或模型 API。
