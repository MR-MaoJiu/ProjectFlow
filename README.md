# ProjectFlow

[GitHub](https://github.com/MR-MaoJiu/ProjectFlow) · [MIT License](LICENSE) · [工具契约](references/contracts.md)

以 Codex 为执行核心的本地项目工作台，支持独立桌面应用、浏览器工作台和 Codex 插件三种使用方式。

**立项 → 调研 → 需求整理 → PRD → UI 设计与切图 → 编码 → 测试 → 发布 → 运营与复盘。**

ProjectFlow 是独立开源项目，不隶属于 OpenAI。Codex、Electron 和其他依赖保留各自的许可与服务条款。

## 能做什么

- 版本化项目资产：Markdown 文档、来源引用、评审确认、历史版本与影响追溯。
- UI 工作台：结构化页面、文字/形状/图片节点、属性修改、预览和 PNG/SVG 导出。
- 固定开发交付包：绑定需求、PRD、设计、素材和验收版本。
- Codex 执行协作：保存请求、领取与续租、报告进度、提交结果、人工验收和接管。
- 测试及运营：证据登记、视觉对照、CSV 导入、反馈与下一轮需求。
- 独立桌面端：项目文件夹选择、内置 Codex 运行服务、登录、对话、执行中断和授权表单。
- 插件端：11 个 Skill、8 个 MCP 工具，以及可选的项目摘要 UI。

项目资产保存在用户项目的 `.projectflow/` 中，不需要注册 ProjectFlow 云端账户。AI 任务需要网络和可用的 Codex 登录/配置；本项目不提供模型额度，不另建模型计费层。

## 快速开始

### 开发环境

- Node.js **22.12 或更高版本**，推荐 Node.js 24。
- npm。
- 准备桌面运行程序时需要网络和 `tar` 命令。
- 独立桌面端当前支持 **macOS ARM64（Apple Silicon）** 和 **Windows x64**。

```sh
git clone https://github.com/MR-MaoJiu/ProjectFlow.git
cd ProjectFlow
npm ci
npm run build
```

### 独立桌面应用

首次从源码运行时准备匹配平台的 Codex 二进制：

```sh
npm run desktop:prepare
npm run desktop
```

然后：

1. 点击“选择项目文件夹”，打开空文件夹或已有项目。
2. 打开“Codex 执行台”并连接。已有可用的 Codex 登录会被复用，否则点击“登录”。
3. 描述任务并发送；出现工具或操作授权时，查看内容后按需确认。

应用不依赖官方 Codex 桌面端。项目自身的编译环境（例如 Xcode、Android SDK、Node.js 工具链）仍需按项目需要准备。

运行文件固定为官方 Codex **0.154.0**，准备脚本验证其 SHA-256，校验值记录在 [build/codex-runtime-checksums.json](build/codex-runtime-checksums.json)。运行二进制不提交到 Git。

### 浏览器工作台

```sh
npm start -- --project /path/to/your-project --name "我的项目"
```

项目目录需已存在；已有 ProjectFlow 数据时可以省略名称。终端会输出本机访问地址。浏览器版可以独立编辑文档、查看设计与切图；AI 执行可交给 Codex 插件，或使用独立桌面版。

访问地址包含本机会话令牌，不要公开分享。服务重启后使用新地址。

### Codex 插件与 MCP

插件入口是 `.codex-plugin/plugin.json`，MCP 配置是 `.mcp.json`。构建完成后，可直接启动 MCP 服务：

```sh
npm run mcp
```

在安装有 Codex 官方 plugin-creator 脚手架的机器上，可注册到个人 marketplace：

```sh
python3 scripts/register-personal.py --dry-run
python3 scripts/register-personal.py
```

第二条命令会修改个人插件目录；目标已存在时停止，不覆盖旧安装。之后在 Codex 插件页面安装 ProjectFlow，并新开任务加载 Skill 与工具。脚手架不存在时，按宿主当前支持的插件安装流程接入。

使用示例：

- “使用 ProjectFlow 初始化当前项目。”
- “整理调研证据，起草 PRD。”
- “按已确认 PRD 创建设计并导出独立素材。”
- “继续这条待执行请求，完成后提交代码与测试证据。”

## 构建安装包

```sh
# 准备两个平台；只构建本机平台时省略 --all
npm run desktop:prepare -- --all
npm run build
npm run desktop:mac
npm run desktop:win
```

安装包输出到项目内的 `desktop-installers/`。macOS DMG 需要在 macOS 构建。Windows NSIS 安装包可以准备构建，但运行效果仍应在 Windows 环境验证。

默认构建没有发行签名：macOS 未配置 Developer ID 与公证，Windows 未配置发行证书。正式发行时需配置自己的签名，不建议关闭操作系统安全保护。

插件分发包可通过 `npm run package` 生成，包含当前平台的运行依赖。安装包、构建目录和平台二进制均不进入源码仓库。

## 结构

| 目录 | 内容 |
|---|---|
| `src/server` | 本地资产、流程、HTTP、MCP 与设计渲染 |
| `src/shared` | 共享类型、Schema、模板与布局逻辑 |
| `src/web` | React 工作台与桌面执行台 |
| `src/desktop` | Electron 主进程、IPC、Codex RPC 和授权处理 |
| `skills` | 入口与各阶段工作流 |
| `references` / `templates` | 工具契约、设计示例和文档模板 |
| `scripts` | 准备运行文件、打包、图标与插件注册 |
| `tests` | 核心、HTTP、MCP 和桌面协议验证 |
| `docs` | 历史 PRD 与需求迁移说明 |

## 数据与执行边界

- `.projectflow/state.json` 是本地事务事实来源；Markdown 是按版本生成的投影。
- 已确认版本与交付包不会原地覆盖。旧版本写入、重复请求和无效租约会被校验。
- 手工编辑投影文件不会自动覆盖项目状态，应通过工作台或 MCP 保存新版本。
- 工作台请求不等于完成；Codex 提交结果后仍可由用户评审。
- 桌面应用处理授权请求，不自动通过命令、文件修改或 MCP 表单确认。
- 退出应用会停止其运行服务，不等于撤销已经发生的外部操作。
- 图像、检索、部署等能力取决于当前 Codex 实际提供的工具；缺失时如实报告。
- 测试证据标注来源与环境，登记报告不等于系统独立复现了验证。
- 用户项目数据、会话、凭证、依赖目录和安装包不会随此源码公开。

## 验证状态

```sh
npm run build
npm test
npm run desktop:prepare -- --all --check
```

已有 22 项自动化测试，覆盖版本、并发、幂等、租约、路径限制、渲染、MCP、桌面 RPC 和授权表单。

macOS 分发版已验证项目/会话恢复、登录状态读取、Codex 调用、单次 MCP 授权、草稿保存与回读。Windows 安装包已构建并检查 x64 运行文件，但尚无 Windows 实机启动验证。详细边界应随后续验证更新，不能将打包成功等同于运行通过。

复杂设计组件、实时多人协作、云端同步、其他 Agent 调度和无人值守执行不属于当前版本。

## 开源许可与署名

采用 [MIT License](LICENSE)，允许使用、修改、商用、分发和闭源二次开发。

请保留许可证与版权声明中的原项目地址：

**https://github.com/MR-MaoJiu/ProjectFlow**

无需在产品界面强制展示标识，也不要求公开衍生项目源码；复制或分发本项目的全部或实质部分时，应按 MIT 条款保留版权与许可文本。第三方许可证见 [NOTICE](NOTICE) 与 [licenses](licenses)。
