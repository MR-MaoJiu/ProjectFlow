# ProjectFlow 本地工具契约

所有动作在用户已授权的项目内进行。工具没有任何模型 API、自动发送消息或启动 Codex 的能力。

## 会话启动

1. `projectflow_bind {root: 绝对路径, name?: 新项目名称}`：目录必须已存在。新项目提供名称。返回 project.id、revision 和工作台 URL。
2. `projectflow_read {project, section:"summary"}`：获取当前 revision、迭代 ID、产物索引、确认与请求；按需读取指定版本。
3. 使用 `projectflow_workbench {project}`，在宿主可用的浏览器中打开 URL。URL 含本机令牌，不应公开。
4. 当前服务可绑定多个根目录。进程重启后重新 bind 原路径；不用依赖旧对话恢复资产。

## 写入通用参数

`projectflow_mutate {project, operation, args, expectedRevision, key, actor}`。key 为请求 UUID；超时重试复用同一个 key，内容变化必须换 key。每次成功写入后重新读取 summary 获取 revision。发生 VERSION_CONFLICT 时先读最新产物，不自动重试覆盖。

引用统一使用 `{id, version}`，id 从实际工具结果取得。产物 kind 不能更改，已保存版本不可覆盖。

## 操作参数

| operation | args |
|---|---|
| project.rename | name |
| iteration.create | name, goal（可空） |
| artifact.save | id（新建省略）, expectedVersion（新建 0）, iterationId, kind, title, body, data（默认 {}）, refs（默认 []） |
| artifact.confirm | ref, reason；只有用户明确确认具体版本后调用 |
| artifact.comment | ref, body |
| request.create | iterationId, stage, title, instruction, refs, bundleId（coding 必填） |
| request.claim | id, expectedVersion, owner；返回 lease.token；30 分钟租约 |
| request.recover | id, expectedVersion, reason；用户明确接管失联任务后重新排队，废止旧租约，保留已有产物 |
| request.update | id, expectedVersion, status, progress, results；执行中更新需要 leaseToken；running 延长租约 |
| evidence.add | iterationId, type, status, summary, source, commit, environment, refs, attachments |
| bundle.create | iterationId, title, refs；递归包含来源，必须有已确认 requirement/prd/design |
| stage.advance | iterationId, target, reason；一次前进一阶段，服务端检查条件 |
| capability.set | name, available, note；由当前 Codex 根据实际工具声明 |
| feedback.convert | ref（feedback/review）, iterationId（目标迭代）, title |

kind：brief / research / requirement / prd / design / code / test / release / metric / feedback / review。

stage：init / research / requirements / prd / design / handoff / coding / testing / release / operations。

请求状态：pending → running → blocked 或 submitted；submitted 经用户验收后 accepted。cancelled 不会回滚已经发生的代码或外部操作。过期租约可重新 claim，旧 token 不能写入。不要因进程结束直接提交成功。

证据 type：code / test / release / operations。status：not_run / passed / failed / blocked / skipped。source：manual / codex。test/release 的 passed 必须提供 environment、commit 与 refs。summary 写明真实命令、结果、证据位置与未验证范围。attachments 是 `.projectflow/` 内相对文件引用。这里只登记证据，不自动执行测试或部署。

能力 name：search / image / browser / deploy / analytics。尚未核实时保持不可用。不要将插件自身的工具存在误认为具备外部检索或生成能力。

## 读取与上下文

`projectflow_read` 的 section 可选 summary / artifact / request / bundle / evidence / impact / events。
- artifact 使用 id、可选 version，不指定时取最新。
- request 使用 id，返回固定引用产物和绑定交付包，继续前检查是否已过期。
- bundle 使用 id，返回版本化上下文、素材索引、仓库 HEAD 和根目录规则快照。Codex 还应检查实际要修改路径的嵌套 AGENTS.md。
- evidence/events 支持 offset、limit（1–100），返回 total 与 nextOffset。
- impact 使用产物 id 返回关联下游，不承诺穷尽代码影响。

## 图片与设计

图片工具输出先经授权复制到项目目录，再调用：
`projectflow_asset_import {project, relativePath, name, source, expectedRevision, key}`。

支持 PNG/JPEG/WebP，最多 16MB，规范化保存为 PNG；文件使用内容哈希，导出历史版本不会被替换。

kind=design 时 data 使用 [design-example.json](design-example.json) 的结构：viewport、nodes、interactions、states、tokens。
节点 type：frame/rect/text/image/vector。每个节点有唯一 id/name/x/y/width/height/fill/radius/layout/gap/padding/children。
- text：text、fontSize。多行文本按宽度换行，溢出被裁剪，预览后调整尺寸。
- image：assetId 引用已登记图片，居中裁切填充。
- vector：path 仅支持 SVG path 几何命令，不支持任意 SVG/HTML/脚本。
- frame：layout 为 absolute/vertical/horizontal；流式布局使用 padding 与 gap。首版不支持完整约束求解或复杂组件变体。
- 单页最多 500 节点、20 层；视口最大 4096×4096。

`projectflow_preview {project, ref, nodeId?}` 返回图像，必须查看真实预览再声称视觉检查完成。
`projectflow_export {project, ref?, nodeId?, assetId?, format:"png"|"svg", scale:1|2|3}` 返回 `.projectflow/exports` 内绝对路径。位图节点拒绝矢量 SVG；PNG 倍率不增加原始细节。独立图片优先按 assetId 导出，避免混入 UI 文案。

## 交付与恢复

bundle.create 锁定递归产物版本、所用素材、代码基准和规则；不上传代码，不提交 Git。新版本不改变旧包。

MCP read bundle + export assetId 可直接用于 Coding。工作台也可下载带内嵌素材的离线 JSON 包。用户在工作台创建请求后回到 Codex 继续；不依赖 UI 自动向宿主发送消息。

不直接编辑 state.json。Markdown 是版本化投影，手工编辑 Markdown 不会隐式覆盖资产；通过 artifact.save 导入新版本。
