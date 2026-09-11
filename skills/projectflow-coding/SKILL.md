---
name: projectflow-coding
description: "在当前 Codex 中按照 ProjectFlow 固定交付包实现真实项目代码。"
---

# ProjectFlow · 编码

在当前 Codex 执行此阶段。先读 [工具契约](../../references/contracts.md) 中相关部分；初次进入项目使用 projectflow_bind，再 read summary 定位当前迭代和版本。用户的明确范围与已有授权优先。

领取指定请求，保存 lease.token。读取 request/bundle、预览图与真实仓库规则，用 export 导出素材后按项目技术栈实现。只在授权仓库范围改代码，不另开模型服务。运行必要验证，保存 code 产物和 evidence，再 submitted；等待用户验收，不自行 accepted。超过租约前报告 running 延长。

写入使用实际返回的 ID、最新 expectedRevision 和唯一请求 key。上游变化时复核，不静默覆盖。记录产物 refs，保留未确认问题。关键基线确认必须对应用户已确认的版本；普通草稿操作不用反复请求确认。

需要工作台时调用 projectflow_workbench 并用当前宿主可用的浏览器入口打开。UI 请求不会自动唤醒 Codex。没有相关能力时说明缺口并保留资产，不切换到未授权供应商或模型 API。
