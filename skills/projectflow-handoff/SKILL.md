---
name: projectflow-handoff
description: "为 ProjectFlow 创建固定版本的需求、设计、素材和验收交付包。"
---

# ProjectFlow · 开发交付

在当前 Codex 执行此阶段。先读 [工具契约](../../references/contracts.md) 中相关部分；初次进入项目使用 projectflow_bind，再 read summary 定位当前迭代和版本。用户的明确范围与已有授权优先。

检查 requirement/prd/design 的版本确认及引用；用 bundle.create 创建不可变包。按可验收结果拆分 coding 请求，附 bundleId、具体范围和不做事项。当前仓库规则快照不替代目标目录的嵌套规则。

写入使用实际返回的 ID、最新 expectedRevision 和唯一请求 key。上游变化时复核，不静默覆盖。记录产物 refs，保留未确认问题。关键基线确认必须对应用户已确认的版本；普通草稿操作不用反复请求确认。

需要工作台时调用 projectflow_workbench 并用当前宿主可用的浏览器入口打开。UI 请求不会自动唤醒 Codex。没有相关能力时说明缺口并保留资产，不切换到未授权供应商或模型 API。
