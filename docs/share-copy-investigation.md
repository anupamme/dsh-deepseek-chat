# 分享链接与消息复制差异调查

日期：2026-10-18。插件0.2.3，DSH桌面版0.2.1-rc.2。本轮研究与对照验证，不修改插件运行代码。

## 结论与证据边界

当前官网的两个按钮使用不同复制实现。消息复制先调用浏览器Clipboard API，失败后用临时textarea和document.execCommand('copy')后备；分享链接只调用Clipboard API，失败后直接显示“复制失败”。DSH自有网页guest的权限检查/请求处理明确拒绝权限。因此“消息可以复制、分享失败”与现有代码一致，不能据此推断网页的所有复制都应当失败。

当前插件的src/website-conversation-actions.ts仅点击官网对话菜单中的分享项，弹窗、链接生成和复制由官网负责；源码中没有自己接一套分享链接复制接口。之前只说“权限限制”缺少了两套复制分支的差异，解释不完整。

这是当前官网公开代码、DSH安装产物和独立浏览器的证据；本轮尚未在用户真实分享弹窗挂接诊断，也未读取真实链接、正文或原剪贴板，不能把独立实验写成真实插件已修复。

## 当前公开脚本

匿名curl首页只得到限制页面，随后独立、无账号正常浏览器访问首页获得HTTP200和实际script src，不绕过验证或使用登录数据。当前资源为：

- [main.a0ce88b684.js](https://fe-static.deepseek.com/chat/static/main.a0ce88b684.js)，1,588,100字节，SHA256 `0e8404fe887a47ac947b018d35b42ae67f0c9a4babdb1ec65170f02c404ec4cc`。
- [default-vendors.3473f64207.js](https://fe-static.deepseek.com/chat/static/default-vendors.3473f64207.js)，SHA256 `2b0a5517ea9651adfdc364d01f2a46a5459c1db5c0056886823da43c54c71451`。
- [87321.87453ce690.js](https://fe-static.deepseek.com/chat/static/87321.87453ce690.js)，SHA256 `97f97c2c390028dd7ae09840d07f3ad98cc733eb1d51be2d004e160ebe31425f`。

main中aY为消息/代码块共用后备函数（Clipboard调用约字符偏移290018）；copyBotResponse跟踪项附近约432302，onCopy调用aY。分享弹窗的m函数约811121，仅零延时后writeText，catch记录copyShareLinkError并warning，没有后备调用。零延时本身没有被确认为根因，不把定时器简单等同于丢失用户激活。

此前已知旧main.8d6a4f4bfa.js也重新匿名下载，hash与历史一致；旧aB/helper和当前aY仅名称不同，分享函数仅tracker变量k/P重命名。最终对照使用的是今天首页确认的当前函数，并非只验证旧缓存。

## DSH安装产物与接口

app.asar中的DesktopBrowserService.configureSession对网页guest设置PermissionRequestHandler callback(false)、PermissionCheckHandler false及DevicePermissionHandler false。该会话策略不同于宿主主页面。已发布的DesktopBrowserBridge只有acquire/release/onOpenRequested，未提供剪贴板授权配置。本轮没有改DSH安装包、权限策略或使用私有宿主API。

官方参考：[Electron session permissions](https://www.electronjs.org/docs/latest/api/session#sessetpermissionrequesthandlerhandler)、[Clipboard.writeText](https://developer.mozilla.org/en-US/docs/Web/API/Clipboard/writeText)。网页按钮外观相同不意味着它们使用同一API或后备路径。

## 独立浏览器原生拒权对照

使用Playwright独立空白浏览器、虚构HTTPS页面和同一条固定example.invalid测试URL。复制函数取自当前官网原文；只替换UI提示/埋点依赖为计数器。Clipboard.writeText和document.execCommand保持调用浏览器原实现，未模拟其成功/失败。通过正确browserContextId设置原生clipboard-write拒绝，先确认Permissions API返回denied再执行真实按钮点击。

| 场景 | writeText | 后备命令 | 临时textarea获得焦点 | 返回/提示 |
| --- | --- | --- | --- | --- |
| 官网分享函数 | NotAllowedError | 无 | 不适用 | 复制失败 |
| 官网消息函数 | NotAllowedError | 实际调用copy | 是 | 命令返回true |
| 原生模态框内点击，临时框放body | NotAllowedError | 实际调用copy | 否 | 仍可能返回true |
| 原生模态框内点击，临时框放弹窗内部 | NotAllowedError | 实际调用copy | 是 | 命令返回true |

关键：最后两行是独立原生dialog实验，不证明当前官网自定义弹窗一定采用同样的焦点约束。它证明了命令返回true不足以证明目标链接已复制。没有读取系统原剪贴板、自动粘贴或声称OS实际文本已核对；消息实际可复制来自用户反馈，与后备机制一致。初次实验未指定browserContextId，Permissions API仍为granted，已舍弃该结果；更正后对当前官网函数和同一虚构URL重复得到上表。

本机临时复现脚本：/private/tmp/dsh-copy-compare-run.py。复现需要当前官网函数片段和Playwright CLI，临时目录可能清理，不作为仓库唯一证据。没有自动创建公开分享、访问真实对话或操作登录。

## 后续最小修复方向（尚未实现）

1. 先在真实、已存在的分享弹窗确认可见链接元素、复制按钮及焦点边界，只记录结构/焦点/错误名等元数据；旧候选曾未识别到实际弹窗，不能复用那个假设。
2. 仅给该分享复制动作补上与消息一致的后备机制，选区/临时元素必须处于正确弹窗边界；这指复用机制，不通过webpack私有状态调用官网闭包函数。
3. 保留官网创建链接流程，不重建链接生成API、不放开整个guest权限，不追加原生Copy/模拟快捷键桥接。
4. 实际点击复制后仍需在真实环境粘贴确认完整链接，再确认“创建并复制”这条异步路径；不能只凭返回true、模拟页面通过或自造成功提示验收。

本轮不改版本、源码、编译产物或当前安装，不发布npm或Git提交推送。
