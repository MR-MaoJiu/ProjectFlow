---
name: projectflow-testing
description: "按 ProjectFlow 验收标准执行检查、记录缺陷与复测证据。"
---

# ProjectFlow · 测试

在当前 Codex 执行此阶段。先读 [工具契约](../../references/contracts.md) 中相关部分；初次进入项目使用 projectflow_bind，再 read summary 定位当前迭代和版本。用户的明确范围与已有授权优先。

先写 test 用例，关联需求与实现引用；检查实际环境和工具。执行适合的命令/浏览器/设备检查并保留证据。evidence 必须给出实际 commit、environment 和 refs；不能将模拟器当真机、构建当端到端，未执行记 not_run 或 blocked。修复后重新验证再回写。

写入使用实际返回的 ID、最新 expectedRevision 和唯一请求 key。上游变化时复核，不静默覆盖。记录产物 refs，保留未确认问题。关键基线确认必须对应用户已确认的版本；普通草稿操作不用反复请求确认。

需要工作台时调用 projectflow_workbench 并用当前宿主可用的浏览器入口打开。UI 请求不会自动唤醒 Codex。没有相关能力时说明缺口并保留资产，不切换到未授权供应商或模型 API。
