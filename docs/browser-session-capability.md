# CHAT 登录记忆：插件授权保存与宿主会话能力

当前状态（2026-10-11）：W025 / 0.1.9，基线f2c1277。CHAT与DSH账号独立；退出或未登录不禁用模式、不强制HARNESS。设置与对话页共用认证status、revision和同一guest，未登录显示明确登录按钮。可信Host profile派生记忆key及退出barrier已实现，最终候选构建/类型/产物/分发及fresh Git检查通过；npm正式0.1.9/latest已发布。DSH pnpm11.7.0裸名空consumer/空store安装12包、23文件与发布tgz一致及Host/lazy Client通过，fixture已清理；本机CLI已换npm裸名^0.1.9、旧插件不存在且23文件一致。默认pnpm自动增加minimumReleaseAgeExclude，无人为allowBuilds/ignore-scripts/bypass；详见[handoff](handoff.md)。尚未重启/GUI验收，未运行本轮单元/浏览器/GUI回归。完整官网登录、退出/重登、迁移及重启仍待实机，旧0.1.8证据不能代替。

历史固定环境说明续步：f3修正版仅精确识别并点击用户指定说明自身正常X，由官网记录关闭；不改UA/检测或授权存储白名单。0.1.8两次完整重开有限观察通过，其他验证/认证提示仍正常显示。历史产物和实机证据见handoff/worklog。

历史状态：W024 / 0.1.8首次正常官网登录后保存完成，前三次完整退出重开验证同账号和中文恢复；13b2随后闪烁失败，由b4bb修正版替代。b4另一次完整重开与限定短时标题/置顶观察通过，不扩大为长期或全场景保证。该阶段的DSH账号隔离方式由W025独立profile取代，产物与分层证据见handoff/worklog。

## 更正此前结论

DSH Browser 的内存分区不会跨进程保留 Cookie 和网页存储，这项观察仍成立；此前由此推断“插件无法保存登录授权，必须修改 DSH”范围过大。官方 Host `ctx.credentials` 已提供 `readRecord/modifyRecord/deleteRecord` 和持久 grant record。插件可以保存自己获得的服务授权，完整 Electron Session 的持久化是另一项能力。

[dsh-codex-subscription 2.3.0 的 DshOAuthAccountVault](https://github.com/WSL043/dsh-codex-subscription/blob/a3e1fc1f771b31348d8966439b4379c5e52f0a53/lib/index.js#L2119)通过该服务保存自己的 OAuth access/refresh 等授权，支持再次使用；它不内嵌 ChatGPT 官网，也不证明 DSH 平台 token 可用于 DeepSeek Chat。新路线保存的是用户在 CHAT 官网上正常登录后产生的官网授权，不复用 DSH 或 Codex 的 token。

## 当前插件候选

1. 仅在插件持有、当前 URL origin 为 `https://chat.deepseek.com` 的批准 guest 中，正常官网登录后采集官网自己的最小授权。
2. `src/website-session.ts` 只处理三个固定 localStorage key：`userToken`、`__appKit_userInfo` 中的 id、`deepseek-device-id:chat`。接受有界、严格格式的 token/id/UUID；当前 JSON wrapper 的 `__version` 必须为 `'0'`。不枚举或复制其他 storage。
3. Host读取启动器公开服务profileContext，验证dir为绝对路径后用SHA256派生scope，操作`credentialKey('dsh-deepseek-chat', 'website-<profile目录SHA256>')`及自身代次栅栏。credentials-local默认全局共享文件，不天然隔离profile；缺少可信profileContext时报告记忆能力不可用，不回退共享固定键或DSH账号键。新记录缺失时，只以DSH官方公开稳定id计算并精确迁移本插件自己的旧`dsh-chat/website-<DSH账号SHA256>`记录；DSH授权失败不阻止进入CHAT，也不枚举其他账号grant。Client仅拿scope哈希，不能提供任意dir或record key；授权字段只在guest、内部Client bridge和Host凭据服务之间传递，不进入UI快照、Config、日志或错误文本。
4. 下次同一插件profile创建内存Browser lease，打开官网origin后恢复这三项并reload一次。官网自己的bootstrap/current-user负责验证与加载历史；插件不调用私有认证接口，不覆写现有格式有效的官网token。官网确认结果先同步到设置/对话页，记忆后台保存，不把写入成功当作登录成功。
5. 官网拒绝或过期后正常登录，模式仍可切换。显式退出先建立保存/恢复barrier、reset旧设置请求、删除保存grant，再操作官网当前会话logout；确认官网结果后同步两处状态。退出后的迟到保存/恢复不能重新登录旧会话，DSH退出不清除独立官网授权或销毁guest。

两处登录入口使用同一guest与认证status/revision，不要求从对话页进入设置刷新才更新。正在加载/正常登录与真正读取失败分别显示；退出操作优先于旧设置读取，不等待后台记忆写入后才呈现官网登录结果。

默认 `credentials-local` Provider 写权限为 0600 的全局共享本地文件`$DSH_HOME/.credentials.yaml`；profile隔离由插件的可信目录派生key实现，不由Provider自动提供。没有证据表明该默认 Provider 使用 Keychain 或文件加密，不作此承诺。非敏感语言偏好仍由官方 Config/configForms 保存，与登录授权分别验证。

## 证据与限制

依据是官方凭据 API 和官网公开静态 bundle 的 storage/bootstrap 实现，详见 [references](references.md)。这些 key/shape 不是稳定的官方 OAuth 契约；尚未确认它们覆盖服务端 Cookie、风控、挑战或所有设备策略。保存完成不代表官网一定接受恢复，不承诺永久免登录。

不读取密码、Cookie、IndexedDB、MFA私钥、聊天正文/缓存、其他origin或系统浏览器数据。DSH公开账号资料仅用于精确迁移本插件旧记录，不作为入口门槛或官网身份。当前公开核查未发现面向Chat的DSH→CHAT兑换或第三方OAuth契约，不能将Platform grant代用。

系统浏览器能正常打开官网，但`dsh://open`只是唤回窗口。官方Platform Provider的PKCE与/oauth/callback面向platform.deepseek.com，不提供Chat网页登录转换。当前落实同一guest正常登录；外部浏览器确认授权后自动带回Chat会话仍缺公开交换契约，不虚构成功，也不宣称服务方永远没有此能力。来源见[references](references.md)。

## 实机验收

- 在插件真实官网正常登录，确认保存完成；完整退出 DSH 后重开，同一账号进入 CHAT，由官网确认已登录并加载真实服务器历史。
- 授权已过期、被撤销或格式不匹配时显示正常官网登录，不循环注入失效 grant。
- 当前 CHAT 退出后保存记录失效，下一次不能自动恢复；退出失败与普通网络故障有明确反馈。
- 设置与对话页登录/退出立即同步，退出后立即重登不会被旧读取或迟到保存覆盖；模式切换始终可用。
- 可信profileContext.dir派生不同scope及凭据key，自身代次隔离旧结果；缺少可信profileContext不落到共享键。旧记录迁移只读取精确本插件key，DSH退出不破坏独立CHAT授权。
- 语言恢复、同进程草稿保活、跨重启登录分别验证；禁用/卸载后的界面恢复和保存记录清理策略另行确认。

以下仅是W024 / 0.1.8历史验收：正常登录保存与连续三次完整退出重开证据为`/private/tmp/dsh-chat-auth-saved-before-restart-018.png`、`dsh-chat-full-restart-1-ready-018.png`、`dsh-chat-full-restart-2-after-notice-018.png`、`dsh-chat-final-package-confirmed-018.png`；未读取实际授权记录。前三次只证明认证/中文恢复，13b2显示随后失败；b4bb新增完整重启与受限短时观察通过。设置错误、超时、退出清除、切换账号、卸载等未独立验收。W025改变profile与同步顺序；当前构建、分发、安装检查和npm发布成功不代替新官网流程实机验收，不沿用旧证据宣称新流程通过。

官方 PluginManager 对已有依赖返回 `restart-required`，默认 HMR 仅刷新配置、module roots 为 `[]`；安装到磁盘后需重启加载新 Host。最早未重启前的保存失败不是凭据服务不能保存的证据。固定方法缺失错误显示重启升级提示，不展示动态错误细节。新设置同步错误会解除页面遮罩并保留错误/重试；不伪造暗色完成。固定环境说明现按用户新请求通过自己的正常X自动收起，其他验证码、认证失败或安全提示仍正常显示。

## 可选宿主方案

完整 Cookie/Session 持久化仍需要宿主公开受限的 persistent Browser 能力。已保留 [宿主源码草案](proposals/persistent-browser/DESIGN.md)，固定 master 基线 `d743267388641bc76f17c45ce8b4c231aed1d32c`；未构建、部署或验证，也未获得部署独立定制 DSH 的授权。它是插件 grant 路线无法覆盖官网认证策略时可评估的备用方案，不是当前必选路线。原草案的逐插件身份、卸载清理、退出顺序等缺口仍须补齐。
