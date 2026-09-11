---
name: projectflow-design
description: "在 ProjectFlow 中从 PRD 创建高保真、可切图和直接编码的 UI，生成真实产品素材与统一图标，检查预览并修正视觉细节。"
---

# ProjectFlow · 高保真 UI 设计

在当前 Codex 执行。首次进入项目先 projectflow_bind，再 read summary 获取当前迭代与版本。读取 [工具契约](../../references/contracts.md) 和 [高保真交付规范](../../references/high-fidelity-ui.md)。

用户未明确要求线框时，默认交付高保真设计。先保存视觉方向与 assetRequirements 素材/图标清单，调用当前 Codex 图片工具生成完整 UI 图；登记为 referenceAssetId 后，按图重建可编辑页面。重建时主动盘点缺失的产品图、插画与图标，自动调用图片工具补齐、导入并绑定 assetId，不等待用户逐个提醒。文字、控件和布局保持可编辑节点。禁止用简单色块、Emoji 或几何拼图替代真实视觉素材。

使用 fontWeight、lineHeight、letterSpacing、投影、描边、图片适配和自动布局等支持字段实现视觉层次，克制使用渐变和装饰。先打磨主页面，再扩展详情与必要状态。不得伪造核实状态或业务数据。

设置 fidelity=high，记录 assetRequirements。保存后调用 projectflow_preview，同时查看完整参考图与重建预览，在相同尺寸对照整页和关键模块，修正裁切、间距、图标与主次关系。读取产物的 quality，解决 error，再填写实际视觉复核结论 visualReview。纯文字页无需图片时说明 noAssetsReason；工具不可用时保留待办，不能伪称高保真完成。

写入使用真实 ID、最新 expectedRevision 和唯一 key，保留 refs；不覆盖历史，不修改未授权范围。用户确认的版本才可进入交付。没有相关生成能力时明确缺口，不静默改用另一个付费 API。

需要查看时用 projectflow_workbench 打开完整工作台。技术检查通过不等于视觉质量完美，仍需真实截图复核与用户确认。

中断恢复时先读已有参考图、素材清单与 quality，只补未完成或需修正的素材，复用内容哈希相同的已登记资产。每轮生成/导入后保存草稿版本，避免中断丢失进度。用户未要求重新设计时，不另起视觉方向。
