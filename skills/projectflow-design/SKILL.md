---
name: projectflow-design
description: "在 ProjectFlow 中从 PRD 创建可查看、切图与直接编码的结构化 UI。"
---

# ProjectFlow · UI 设计

在当前 Codex 执行此阶段。先读 [工具契约](../../references/contracts.md) 中相关部分；初次进入项目使用 projectflow_bind，再 read summary 定位当前迭代和版本。用户的明确范围与已有授权优先。

读取 PRD 和项目视觉约束；参考 references/design-example.json。先设计节点与文案，图片使用当前 Codex 可用生成工具；缺少工具则标记能力缺失并使用用户导入素材。图像复制进项目后登记 asset。保存 design，调用 preview 查看并修正。整图不等于结构化交付；覆盖必要的空/加载/错误状态。

写入使用实际返回的 ID、最新 expectedRevision 和唯一请求 key。上游变化时复核，不静默覆盖。记录产物 refs，保留未确认问题。关键基线确认必须对应用户已确认的版本；普通草稿操作不用反复请求确认。

需要工作台时调用 projectflow_workbench 并用当前宿主可用的浏览器入口打开。UI 请求不会自动唤醒 Codex。没有相关能力时说明缺口并保留资产，不切换到未授权供应商或模型 API。
