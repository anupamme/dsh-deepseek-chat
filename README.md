# dsh-chat

在 **DeepSeek Harness（DSH）桌面版**里，用 `CHAT | HARNESS` 一键切换网页聊天与原工作区。

CHAT模式 加载真实的 [DeepSeek Chat 官网](https://chat.deepseek.com/)，使用官网的聊天功能和账号历史；HARNESS模式 为原 DSH 工作区。

当前版本 **0.1.8** · 适配 **DSH 0.2.0-rc.2 桌面版** · 默认语言为简体中文。

## 功能预览

### 在 DSH 里使用 DeepSeek 网页聊天

![CHAT 模式：DSH 原侧栏与 DeepSeek 官网聊天页面](docs/images/chat-overview.png)

- 共用 DSH 原侧栏，显示官网对话标题、置顶和日期分组。
- 点击历史对话继续聊天；顶部“新会话”和列表旁的＋用于新建官网对话。
- 搜索筛选已加载的对话标题，聊天正文和输入框由官网提供。
- 对话标题位于左上角，点击标题使用官网原有的名称编辑功能。

### 随时切回 HARNESS

![品牌行中的 CHAT 与 HARNESS 模式切换器](docs/images/mode-switch.png)

切换器位于左侧顶部的 DeepSeek 品牌旁。白色圆角表示当前模式；切回 HARNESS 会恢复进入 CHAT 前的主面板，再进入 CHAT 时回到刚才的网页。折叠侧栏后，可通过原展开按钮回到切换器。

### 中文设置与网页登录记忆

![CHAT 设置：网页登录记忆、登录状态与简体中文选项](docs/images/chat-settings.png)

在 DSH 原生 **设置 → CHAT设置** 中查看官网账号状态、退出登录和切换语言。

- 默认简体中文，也可选择 English 或跟随系统；主动选择的语言会保存。
- 首次在插件内正常登录官网后，出现 **“已记住网页登录”** 即表示插件已保存本次授权。
- 下次使用同一 DSH 账号进入 CHAT，插件恢复授权并由官网验证；授权失效时仍需重新登录。

## 安装

### 使用仓库地址安装（推荐）

在 DSH 的插件安装输入框中粘贴：

```text
https://github.com/xingxingbk-git/dsh-chat
```

仓库同时提供源码和编译好的 `lib`，安装直接加载编译产物，无需运行构建脚本或修改 `allowBuilds`。

使用命令行也可以安装：

```bash
dsh plugin --profile desktop add https://github.com/xingxingbk-git/dsh-chat
```

**请使用完整仓库地址。** npm 中的 `dsh-chat` 已被另一款群聊插件占用，单独输入这个名称会安装其他项目。

### 本地安装包

将构建生成的 `.tgz` 文件交给 DSH 官方插件管理器安装，或使用 CLI：

```bash
dsh plugin --profile desktop add /absolute/path/dsh-chat-0.1.8.tgz
```

将路径替换成你的实际安装包；使用其他 profile 时替换 `desktop`。**安装或更新后，完整退出并重新打开 DSH**，让新插件生效。

如果之前安装过旧名称的插件，先禁用并移除旧插件，再安装 `dsh-chat`，避免重复接管界面。

安装规则参见 [DSH 官方插件安装文档](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/publish)。

## 开始使用

1. 在 DSH 原账号入口完成 DeepSeek 账号授权。授权尚未确认时，模式切换器禁用。
2. 手动选择 **CHAT**，首次使用在插件中的真实官网页面正常登录。**DSH 授权与网页登录独立**；升级后首次使用可能需要登录一次。
3. 打开 **设置 → CHAT设置**，确认出现“已记住网页登录”，按需选择语言。之后从左侧选择历史对话或新建对话即可。

页面加载失败时，可在故障提示中重试；授权检查失败时，切换器旁会显示原因和重试入口。插件会自动收起官网固定的“使用环境异常”说明，其他提示、验证码和认证错误仍由官网处理。

## 使用限制

- **兼容范围：**目前针对 DSH 0.2.0-rc.2 桌面版适配，其他版本和平台待验证；DSH Web版暂不支持本插件的 CHAT 模式。
- **官网导航：**左侧列表依赖官网页面结构，只镜像已加载的导航，不是官方历史 API。结构不匹配时恢复官网原导航并提示。
- **新建快捷键：**本版适配顶部“新会话”的鼠标/Enter 点击；原 Harness 快捷键和菜单仍执行 Harness 行为，可能创建 Harness 会话并退出 CHAT。
- **登录记忆：**不共享 Safari/Chrome 登录。授权过期、撤销或官网实现变化时需要重新登录；账号切换、退出清理及完整卸载仍待独立实机验证。
- **网页状态：**手动模式切换保留网页；插件卸载、DSH 授权失效或账号变化会销毁容器，插件不备份未发送草稿，也不能代替官网停止生成。
- **网页能力：**下载、设备权限和部分弹窗受 DSH Browser 安全策略限制。消息发送、上传、另一浏览器历史一致性及长期使用仍需扩大验证。

## 隐私与数据

聊天和账号历史由 DeepSeek 官网处理。插件为界面适配读取公开的导航标题、分组、链接、昵称与语言设置；导航资料只留在当前授权期间的内存中，语言偏好通过 DSH 官方配置服务保存。

网页登录记忆仅处理插件自身 `chat.deepseek.com` 页面的最小授权数据，通过 DSH 官方凭据服务保存，并按已确认的 DSH 账号隔离。这依赖官网当前实现，并非稳定的官方 OAuth 接口；不承诺永久免登录。

插件不保存密码、Cookie 或聊天正文，不读取 DSH/其他插件令牌或其他浏览器的登录数据，不调用私有认证接口，不修改 DSH 安装包或关闭网页安全策略。数据流和授权边界详见 [架构说明](docs/architecture.md) 与 [网页登录说明](docs/browser-session-capability.md)。

## 开发与打包

环境：Node.js 22（22.19 及以上）或 24 及以上、pnpm 10.33.2。运行依赖目标为 Cordis 4.0.4 / React 18.3.1。

```bash
git clone https://github.com/xingxingbk-git/dsh-chat.git
cd dsh-chat
pnpm install --frozen-lockfile
pnpm package:plugin
```

生成 `artifacts/dsh-chat-0.1.8.tgz`，包含 Host、Client、类型声明、图标和 bundle patch。插件管理列表的图标位于 `assets/icon.svg`，替换后重新打包安装即可；SVG 须自包含且不超过 256 KiB。

修改源码后执行 `pnpm release:prepare`，并将源码与整个 `lib/` 一起提交。`pnpm check:distribution` 会检查编译产物与源码、版本及安装入口是否一致；旧产物或缺失文件会使检查失败。安装用户不需要执行这些开发命令。

卸载插件：

```bash
dsh plugin --profile desktop remove dsh-chat
```
