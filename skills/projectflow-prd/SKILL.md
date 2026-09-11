---
name: projectflow-prd
description: "在 ProjectFlow 中编写、局部修订和检查有版本的 PRD。"
---

# ProjectFlow · PRD

在当前 Codex 执行此阶段。先读 [工具契约](../../references/contracts.md) 中相关部分；初次进入项目使用 projectflow_bind，再 read summary 定位当前迭代和版本。用户的明确范围与已有授权优先。

读取已确认需求与对应 refs。以 templates/prd.md 起草正文，覆盖流程、规则、权限、异常、页面状态、数据、验收、埋点、发布和待澄清问题。只改用户要求的部分；通过 artifact.save 写入新版本，不覆盖历史。

写入使用实际返回的 ID、最新 expectedRevision 和唯一请求 key。上游变化时复核，不静默覆盖。记录产物 refs，保留未确认问题。关键基线确认必须对应用户已确认的版本；普通草稿操作不用反复请求确认。

需要工作台时调用 projectflow_workbench 并用当前宿主可用的浏览器入口打开。UI 请求不会自动唤醒 Codex。没有相关能力时说明缺口并保留资产，不切换到未授权供应商或模型 API。
