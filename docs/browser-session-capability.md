# CHAT 登录记忆：插件授权保存与宿主会话能力

状态：2026-10-11，W024 / 0.1.8。首次正常官网登录后保存完成，前三次完整退出重开验证同账号和中文恢复；13b2随后出现CHAT闪烁，界面稳定性失败。现已由b4bb修正版替代，另一次完整退出确认进程结束后重开，官网恢复同账号，CHAT设置显示“已登录”“已记住网页登录”“简体中文”。限定标题/置顶区域20次与关闭设置后10次采样均保持一致，标题展示/编辑和模式往返实机正常；不扩大为长期或全场景保证。第二次早期恢复出现官网“使用环境异常”说明，正常点X关闭后登录成立，该提示仍可能出现。产物与分层证据见handoff/worklog。

## 更正此前结论

DSH Browser 的内存分区不会跨进程保留 Cookie 和网页存储，这项观察仍成立；此前由此推断“插件无法保存登录授权，必须修改 DSH”范围过大。官方 Host `ctx.credentials` 已提供 `readRecord/modifyRecord/deleteRecord` 和持久 grant record。插件可以保存自己获得的服务授权，完整 Electron Session 的持久化是另一项能力。

[dsh-codex-subscription 2.3.0 的 DshOAuthAccountVault](https://github.com/WSL043/dsh-codex-subscription/blob/a3e1fc1f771b31348d8966439b4379c5e52f0a53/lib/index.js#L2119)通过该服务保存自己的 OAuth access/refresh 等授权，支持再次使用；它不内嵌 ChatGPT 官网，也不证明 DSH 平台 token 可用于 DeepSeek Chat。新路线保存的是用户在 CHAT 官网上正常登录后产生的官网授权，不复用 DSH 或 Codex 的 token。

## 当前插件候选

1. 仅在插件持有、当前 URL origin 为 `https://chat.deepseek.com` 的批准 guest 中，正常官网登录后采集官网自己的最小授权。
2. `src/website-session.ts` 只处理三个固定 localStorage key：`userToken`、`__appKit_userInfo` 中的 id、`deepseek-device-id:chat`。接受有界、严格格式的 token/id/UUID；当前 JSON wrapper 的 `__version` 必须为 `'0'`。不枚举或复制其他 storage。
3. Host 用已确认的 DSH 账号与授权 epoch 栅栏操作插件自有 grant：`credentialKey('dsh-chat', 'website-<DSH账号SHA256>')`。Client 不能提供别人的 record key；授权字段只在 guest、内部 Client bridge 和 Host 凭据服务之间传递，不进入 UI 快照、Config、日志或错误文本。
4. 下次同一 DSH 账号创建原内存 Browser lease，打开官网 origin 后恢复这三项并 reload 一次。官网自己的 bootstrap/current-user 流程负责验证授权与加载历史；插件不调用私有认证接口。不覆写已经存在且格式有效的官网 token。
5. 官网拒绝或过期后回到正常登录；当前账号显式退出先删除这份保存的 grant，再通过官网公开退出控件执行。账号/代次变化禁止旧保存或恢复迟到结果污染新容器。

默认 `credentials-local` Provider 写权限为 0600 的本地文件；没有证据表明该默认 Provider 使用 Keychain 或文件加密，不作此承诺。非敏感语言偏好仍由官方 Config/configForms 保存，与登录授权分别验证。

## 证据与限制

依据是官方凭据 API 和官网公开静态 bundle 的 storage/bootstrap 实现，详见 [references](references.md)。这些 key/shape 不是稳定的官方 OAuth 契约；尚未确认它们覆盖服务端 Cookie、风控、挑战或所有设备策略。保存完成不代表官网一定接受恢复，不承诺永久免登录。

不读取密码、Cookie、IndexedDB、MFA 私钥、聊天正文/缓存、其他 origin 或系统浏览器数据。DSH 授权仅作为插件门槛与保存记录的隔离身份，不用它冒充网页登录身份；没有面向 Chat 的公开 DSH→CHAT 会话兑换契约。

## 实机验收

- 在插件真实官网正常登录，确认保存完成；完整退出 DSH 后重开，同一账号进入 CHAT，由官网确认已登录并加载真实服务器历史。
- 授权已过期、被撤销或格式不匹配时显示正常官网登录，不循环注入失效 grant。
- 当前 CHAT 退出后保存记录失效，下一次不能自动恢复；退出失败与普通网络故障有明确反馈。
- DSH 账号切换与授权代次变化隔离记录及迟到结果，不读取其他账号 grant。
- 语言恢复、同进程草稿保活、跨重启登录分别验证；禁用/卸载后的界面恢复和保存记录清理策略另行确认。

已通过正常登录保存与连续三次完整退出重开的本机验收：`/private/tmp/dsh-chat-auth-saved-before-restart-018.png`、`dsh-chat-full-restart-1-ready-018.png`、`dsh-chat-full-restart-2-after-notice-018.png`、`dsh-chat-final-package-confirmed-018.png` 为限定账号/保存状态/语言的证据；未读取实际授权记录。这些前三次结果只证明认证/中文恢复；13b2主区稳定性随后失败。b4bb修正主文档加载筛选、偏好重放、公开设置重复点击与同文档失配回退后，新增一次完整重启及受限连续观察通过，证据为 `/private/tmp/dsh-chat-flashfix-account-language-018.png` 和相关标题/采样文件。设置错误、超时与失配故障分支仅源码/构建/静态复核，没有故障注入。未测试过期授权、真实退出清除、切换账号、卸载或其他机器，不扩大结论。

官方 PluginManager 对已有依赖返回 `restart-required`，默认 HMR 仅刷新配置、module roots 为 `[]`；安装到磁盘后需重启加载新 Host。最早未重启前的保存失败不是凭据服务不能保存的证据。固定方法缺失错误显示重启升级提示，不展示动态错误细节。新设置同步错误会解除页面遮罩并保留错误/重试；不伪造暗色完成，也不隐藏或自动关闭官网安全与环境提示。

## 可选宿主方案

完整 Cookie/Session 持久化仍需要宿主公开受限的 persistent Browser 能力。已保留 [宿主源码草案](proposals/persistent-browser/DESIGN.md)，固定 master 基线 `d743267388641bc76f17c45ce8b4c231aed1d32c`；未构建、部署或验证，也未获得部署独立定制 DSH 的授权。它是插件 grant 路线无法覆盖官网认证策略时可评估的备用方案，不是当前必选路线。原草案的逐插件身份、卸载清理、退出顺序等缺口仍须补齐。
