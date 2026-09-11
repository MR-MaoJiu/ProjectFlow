# 高保真 UI 交付规范

目标是交付具有真实素材、细致排版与明确交互的产品界面。除非用户明确要求线框图，设计任务按高保真处理。

## 工作顺序

1. 读取 PRD、目标设备、必要页面与状态，检查项目已有品牌和组件约束。
2. 规划视觉方向和素材：列出产品图、背景、插画、品牌与全部图标，description 写清用途、风格、显示尺寸、宽高比和透明要求。先保存 fidelity=draft 与 assetRequirements 草稿；未生成的条目不填 assetId。
3. 使用当前 Codex 图片生成工具生成完整高保真 UI 效果图；已有用户指定效果图则复用。真正查看效果图，必要时修正后登记为 referenceAssetId。完整图负责确定页面构图、图标语言、排版、配色与质感。
4. 按参考图拆解页面、文字、容器、控件、交互与独立视觉素材。自动盘点参考图中的全部图标；缺失图标与素材立即使用同一参考风格生成，逐项生成透明独立文件，不用含多个图标的整张图集充当单个图标。
5. 使用 projectflow_asset_import 导入每项素材，将返回的真实 assetId 写入 assetRequirements 并装配 image 节点。生成图中出现的文案用 PRD 校正；文字必须重建为 text 节点。不得直接把整张参考图当作设计节点。
6. 每轮导入和重建后保存草稿版本；不重复生成已有可用素材。缺失图标自动补齐，无需用户逐项指示；工具缺失/失败时记录 capability.set 与请求阻塞原因，保留已有参考图和素材，不静默降级成线框。
7. 调用 projectflow_preview，实际查看参考图与重建预览。逐页对照构图、图片、图标、字号、间距和状态，修正差异。记录 visualReview，明确哪些差异已修正、哪些因渲染能力限制仍保留，不提前写“已通过”。
8. 设置 fidelity=high，读取 quality 并解决全部 error；确认设计版本后创建交付包，包中包含完整参考图和独立素材，Coding 可直接读取并实现。

## 不可使用的替代方案

- 不用色块、几何拼图或随手画的书本/人物来替代产品摄影和插画。
- 不把 Emoji、汉字或箭头字符冒充图标；需要图标时生成独立图片，并在实际显示尺寸查看清晰度。
- 不以整张生成的 UI 图片代替结构化设计。整图可作为方向参考，真实交付仍需分层文字、控件和素材。
- 不将十几张相同卡片堆在一起作为“完整设计”；先完成一页主场景的视觉质量，再扩展到详情、空态和错误态。
- 不为了填满界面伪造企业认证、价格、统计数字或核实结论。
- 图片工具不可用时，保留素材待办并说明缺口，不能把简化占位图标记为高保真完成。

## 支持的样式

文字固定使用随应用分发的 Noto Sans SC，按真实字形排版并以路径导出，避免不同操作系统换字体导致布局变化。文字原文仍保存在节点 text 中供代码实现。

- fontWeight：100–900；lineHeight：像素；letterSpacing：像素。
- textAlign：left / center / right；verticalAlign：top / middle / bottom。
- maxLines 与 textOverflow=ellipsis 用于明确需要省略的文案；不要用省略号掩盖标题放不下的问题。
- stroke / strokeWidth、opacity、shadow={color,blur,x,y,opacity}。
- gradient={angle,stops:[{offset,color}]}，色标 offset 按 0–1 递增；angle=0 为横向。
- imageFit：cover / contain / fill；imagePosition：center / top / bottom / left / right。
- frame 支持 alignItems 和 justifyContent；clipContent=false 可让明确需要外溢的内容显示，默认裁切。
- role 标注 heading / body / button / surface / icon / product-image / illustration。其中后三种需要真实 image 节点，不接受色块或文字替身。

## 高保真文档字段

设置 fidelity="high"。assetRequirements 记录计划素材及已登记的 assetId，例如：

```json
{
  "fidelity": "high",
  "referenceAssetId": "完整效果图导入返回的 ID",
  "assetRequirements": [
    {"id":"product-photo","role":"product-image","description":"日常手帐真实质感产品摄影","assetId":"使用实际导入返回的 ID"},
    {"id":"bookmark-icon","role":"icon","description":"透明背景收藏图标","assetId":"使用实际导入返回的 ID"}
  ],
  "visualReview":"实际查看预览后填写检查结果，不提前声称通过。"
}
```

纯文字设置页等确实不需要图片时，可使用 noAssetsReason 说明原因；产品展示页不能借此省略商品素材。

质量报告是可计算的交付检查，不是审美评分。没有报错不代表设计完美，必须继续查看真实截图。检查至少覆盖：

- 标题/正文/辅助信息的字号、字重、行距和对比。
- 图片占比、裁切焦点、透明图标边缘及小尺寸清晰度。
- 对齐、内外间距、触控区域、导航与主操作优先级。
- 真实设备尺寸下的阅读效果，不只看缩小后的总览。
- 与 PRD 的必要状态、文案、信息来源及交互保持一致。

新渲染字段需要 ProjectFlow 0.4.0 或更新版本。旧设计仍可打开；旧版本应用不能保证读取新样式，更新代码后应构建新版应用/插件。
