![DeepSeek Chat：CHAT 与 HARNESS 一键切换](docs/images/readme-cover.png)

<h1 align="center">DeepSeek Chat</h1>

<p align="center"><strong>在 DeepSeek Harness 中，一键切换网页聊天与原工作区。</strong></p>

<p align="center"><strong>简体中文</strong> · <a href="README.en.md">English</a></p>

---

CHAT模式 加载真实的 [DeepSeek Chat 官网](https://chat.deepseek.com/)，使用官网的聊天功能和账号历史；HARNESS模式 为原 DSH 工作区。

当前版本 **0.2.8** · 适配 **DSH 桌面版** · CHAT 网页的语言、外观和字号跟随 DSH。

0.2.8 以 0.2.7 为基线重做拖窗：仅在 CHAT 挂载稳定的顶部拖动层，按真实标题和控件边界留出可操作区域，不新增顶栏高度；离开 CHAT 同步撤回，不向 HARNESS 添加拖动节点。标题编辑、分享、弹窗及原生窗口控件受保护，跨模式原生拖动效果需以实际桌面环境为准。官网账号或布局暂无法识别时，保留 CHAT 自有导航并显示错误/重新识别；无法安全呈现的网页会被遮蔽，不会显示官网原侧栏，也不刷新或退出登录。主区镜像失败不再阻断已严格确认账号的登录保存，不保证任意官网布局都能镜像。

## 功能预览

### 在 DSH 里使用 DeepSeek 网页聊天

![CHAT 模式：DSH 原侧栏与 DeepSeek 官网聊天页面](docs/images/chat-overview.png)

- 共用 DSH 原侧栏，显示官网对话标题、置顶和日期分组；列表滚动条沿用 HARNESS 的宿主样式与主题。
- 每条对话右侧提供“更多操作”：重命名、置顶／取消置顶、分享、删除；菜单和重命名弹窗与 HARNESS 共用 DSH 原生组件，修改由官网保存；分享、删除保留官网确认流程。
- 点击历史对话继续聊天；顶部“新会话”用于新建官网对话。
- 点击“对话”右侧的刷新图标，重新加载官网当前页面并更新列表。在其他网页端新建对话后，可用它同步，无需退出 DSH。
- 搜索筛选已加载的对话标题，聊天正文和输入框由官网提供。
- 正文、输入文字和占位提示跟随 HARNESS 正文字号，默认 14px；在 DSH 中调整正文字号时，CHAT 同步更新。
- CHAT 对话页面的明暗主题跟随 HARNESS；HARNESS 使用“跟随系统”时，CHAT 同步采用当前实际主题，无需刷新页面。
- 对话标题位于左上角，点击标题使用官网原有的名称编辑功能。

### 随时切回 HARNESS

![品牌行中的 CHAT 与 HARNESS 模式切换器](docs/images/mode-switch.png)

切换器位于左侧顶部的 DeepSeek 品牌旁。白色圆角表示当前模式；切回 HARNESS 会恢复进入 CHAT 前的主面板，再进入 CHAT 时回到刚才的网页。折叠侧栏后，可通过原展开按钮回到切换器。

### 官网账号与网页登录记忆

在 DSH 原生 **设置 → Chat 设置** 中查看官网账号、登录记忆，或退出登录。设置页签使用聊天气泡图标；宿主结构不匹配时保留原图标，不影响入口。

- 语言在 **DSH 设置 → 通用设置** 中选择：DSH 为中文时，官网语言自动设为简体中文；DSH 为英文时，官网自动设为 English。插件的菜单、提示和 Chat 设置也同步切换中英文，不设独立语言或默认中文规则。
- 外观和内容字号也自动跟随 DSH，无需在插件内另行调整。
- CHAT 使用独立的官网登录，DSH 账号退出或 CHAT 退出都不禁用模式切换器。
- 设置与对话页面使用同一个网页登录；登录后自动更新账号和列表，登录记忆在后台保存。
- 首次在插件内正常登录官网后，出现 **“已记住网页登录”** 即表示插件已保存本次授权。
- 重开同一个 DSH 配置环境后，插件恢复授权并由官网验证；授权失效时仍需重新登录。

## 安装

### 按名称安装（推荐）

在 DSH 的插件安装输入框中输入下方名称和版本号，安装当前最新发布版本：

```text
dsh-deepseek-chat@0.2.8
```

也可以使用命令行：

```bash
dsh plugin --profile desktop add dsh-deepseek-chat@0.2.8
```

首次安装和更新已有插件均使用这一方式。若新版本被 DSH 的发布时间策略暂时拦截，可稍后重试，或使用下方 GitHub 安装方式。

### GitHub 地址安装

在 DSH 的插件安装输入框中粘贴：

```text
https://github.com/xingxingbk-git/dsh-deepseek-chat
```

也可以使用命令行：

```bash
dsh plugin --profile desktop add https://github.com/xingxingbk-git/dsh-deepseek-chat
```

此方式安装已推送到仓库的版本，仓库包含构建文件，无需手动构建。需要系统已安装 Git，且 `git --version` 能正常运行；Windows 可先安装 [Git for Windows](https://git-scm.com/install/windows)，再重开 DSH。

### 本地安装包

将 `.tgz` 安装包交给 DSH 插件管理器安装，或使用命令行：

```bash
dsh plugin --profile desktop add /absolute/path/dsh-deepseek-chat-0.2.8.tgz
```

将路径替换为实际安装包位置。

**安装完成后，完整退出并重新打开 DSH，在插件管理页确认版本与所选安装包一致。** 使用其他 profile 时，将命令中的 `desktop` 替换为对应名称。

更多说明参见 [DSH 官方插件安装文档](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/publish)。

## 开始使用

1. 选择 **CHAT**。未登录时点击 **登录 DeepSeek**；也可在 **设置 → Chat 设置** 点击同一个登录入口。
2. 登录统一在 CHAT 主页面的真实官网中完成。Chat 设置只显示账号和登录状态；点击其中的登录按钮会关闭设置并进入 CHAT，登录后自动同步，无需刷新。
3. 打开 **设置 → Chat 设置**，确认出现“已记住网页登录”。语言、外观和文字大小统一在 DSH 通用设置调整。退出登录会清除本插件的登录记忆并正常退出官网；模式切换器继续可用。

当前登录在插件网页中完成。外部浏览器登录后自动授权回跳需要官网提供面向 Chat 的授权交换接口，目前未确认可用；直接在其他浏览器登录不会自动登录本插件。

页面加载失败时，可在故障提示中重试；登录保存服务连接失败时，会显示原因和重试入口。插件会自动收起官网固定的“使用环境异常”说明，其他提示、验证码和认证错误仍由官网处理。

刷新列表会重新加载当前官网页面，并保留当前对话地址。检测到未发送的输入或正在生成等状态时，会提示先完成当前操作；插件不会保存草稿。刷新中请稍候；官网加载失败或超时后，可点击右侧提示中的“重试网页”。

## 使用限制

- **兼容范围：**0.2.7 面向 DSH 桌面版，保留 0.2.0-rc.2，并允许 0.2.1-rc.1 起的同一 0.2.1 发布线（含后续 RC 与 0.2.1 正式版），不再逐个枚举 RC。0.2.2 的预发布版及以上仍须重新核对；版本范围不能自动修复接口变化。暂不支持 DSH Web版的 CHAT 模式。
- **官网导航：**左侧列表依赖官网页面结构，只镜像已加载的导航，不是官方历史 API。结构不匹配时恢复官网原导航并自动重新识别；恢复后同步左侧列表和 CHAT设置。
- **新建快捷键：**本版适配顶部“新会话”的鼠标/Enter 点击；原 Harness 快捷键和菜单仍执行 Harness 行为，可能创建 Harness 会话并退出 CHAT。
- **登录记忆：**不共享 Safari/Chrome 登录，独立于 DSH 平台账号。授权过期、撤销或官网实现变化时需要重新登录；新版独立登录、退出重登、完整卸载和其他平台仍需扩大实机验证。
- **网页状态：**手动模式切换保留网页；插件停用、卸载或 DSH 完全退出会销毁容器，插件不备份未发送草稿，也不能代替官网停止生成。
- **网页能力：**下载、设备权限和部分弹窗受 DSH Browser 安全策略限制。消息发送、上传、另一浏览器历史一致性及长期使用仍需扩大验证。

## 隐私与数据

聊天和账号历史由 DeepSeek 官网处理。插件为界面适配读取公开的导航标题、分组、链接、昵称与语言设置；导航资料只留在当前授权期间的内存中。插件只读 DSH 已解析的语言、主题与内容字号；官网语言和主题通过原有公开设置控件同步，不另存一份插件语言偏好。

网页登录记忆仅处理插件自身 `chat.deepseek.com` 页面的最小授权数据，通过 DSH 官方凭据服务保存。插件根据 DSH 启动器提供的配置路径生成独立记录标识，使不同配置的登录记忆分开，记录对应的官网账号；退出时清除旧授权并隔离迟到保存。缺少可信配置上下文时，仍可正常网页登录，但不能保存登录记忆。这依赖官网当前实现，并非稳定的官方 OAuth 接口；不承诺永久免登录。

插件不保存密码、Cookie 或聊天正文，不读取 DSH/其他插件令牌或其他浏览器的登录数据，不调用私有认证接口，不修改 DSH 安装包或关闭网页安全策略。数据流和授权边界详见 [架构说明](docs/architecture.md) 与 [网页登录说明](docs/browser-session-capability.md)。

## 开发与打包

环境：Node.js 22（22.19 及以上）或 24 及以上、pnpm 10.33.2。开发 SDK 为 DSH 0.2.1-rc.3 / Cordis 4.0.5 / React 18.3.1。

```bash
git clone https://github.com/xingxingbk-git/dsh-deepseek-chat.git
cd dsh-deepseek-chat
pnpm install --frozen-lockfile
pnpm package:plugin
```

生成 `artifacts/dsh-deepseek-chat-0.2.8.tgz`，包含 Host、Client、类型声明、图标和 bundle patch。插件管理列表的图标位于 `assets/icon.svg`，替换后重新打包安装即可；SVG 须自包含且不超过 256 KiB。

修改源码后执行 `pnpm release:prepare`，并将源码与整个 `lib/` 一起提交。`pnpm check:distribution` 会检查编译产物与源码、版本及安装入口是否一致；旧产物或缺失文件会使检查失败。安装用户不需要执行这些开发命令。

卸载插件：

```bash
dsh plugin --profile desktop remove dsh-deepseek-chat
```
