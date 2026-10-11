# dsh-chat 官网会话持久化：宿主源码候选

> 2026-10-11 更正：这份草案保留为完整 Browser 会话持久化的可选方案。用户举出 Codex 插件的授权保存后，已确认还可在插件内保存 CHAT 自身授权并恢复给官网验证，见 `../../browser-session-capability.md`。当前主线是插件方案；用户没有批准制作定制 DSH，不能继续把此宿主草案描述为唯一实现路径。

基线：官方 `deepseek-ai/deepseek-harness` master `d743267388641bc76f17c45ce8b4c231aed1d32c`，2026-10-10 通过 `git ls-remote` 再次确认。

**状态：只完成源码草案和人工静态检查。没有编译宿主、安装候选宿主、运行测试或验证官网登录后退出重启。当前已安装 DSH 没有改变，也不能使用本契约。**

## 产品行为

用户第一次在真实 `chat.deepseek.com` 内嵌页面完成官网登录，由 Electron 保存该网页自己的会话。下次启动，同一 DSH 账号获得相同网页 partition，官网自行恢复认证和服务器历史。DSH 账号只用于隔离网页存储，不向官网提供 DSH token，也不模拟官网认证。

这是“记住首次官网登录”的方案，不是已经登录 DSH 后自动交换成 Chat 登录。服务端主动过期、官网退出或清除存储后，仍需官方正常登录。

## 具体改动

补丁文件：`dsh-chat-persistent-browser-candidate.patch`。只修改 5 个上游文件：

1. `packages/client/ui-sidebar-browser/src/types.ts`：给 `acquire` 增加可选 `DesktopBrowserPersistence`；公开明确清理命令 `clearPersistent()`。
2. `apps/desktop/src/preload-browser.ts`：经固定 IPC 传递参数，不暴露 Electron/Session/Cookie 对象。
3. `apps/desktop/src/ipc.ts`：增加唯一清理通道。
4. `apps/desktop/src/main.ts`：保留当前 `assertProductSender` 验证主应用 origin、同一 window 和主 frame；从既有私有 Host IPC 的可信 `PlatformSession` 仅复制 origin/userId；在已存在的明确退出/账号过期事件安排清理。
5. `apps/desktop/src/browser-guests.ts`：主进程验证固定插件名、固定 Chat origin 和 workspace；由可信账号生成稳定 persistent partition；保留现 lease、partition 附着校验和全部 guest sandbox 参数；限制该 guest 的主 frame 导航到固定官网；关闭 guest 后再清数据。

未来插件调用形态（此片段没有加入当前插件）：

```ts
nativeBrowser.acquire(accountStorageKey, {
  plugin: 'dsh-chat',
  origin: 'https://chat.deepseek.com',
})
```

调用者不能指定已有 partition。`accountStorageKey` 必须等于主进程已确认账号的 `dsh-chat:website:<userId>`；partition 用 `SHA256([plugin, chatOrigin, trustedPlatformOrigin, trustedUserId])` 生成，固定 `persist:dsh-chat-` 命名空间。旧的单参数 `acquire(workspace)` 保持原内存行为。

## 生命周期与边界

- 模式切换、视图关闭/释放：关闭 guest、保留该网页 Session。
- 正常退出 DSH 或 Host 停止：主进程收到 null 身份后拒绝新持久 acquire 并关闭持久 guest；保留网页存储供同账号下次打开。
- 明确 DSH 退出登录或认证过期：调用清理，关闭当前进程已知的持久 guest，清掉各自 partition 的网页存储、HTTP/认证缓存。
- 主进程收到不同的已确认账号：关闭并清理之前账号的当前 partition，新账号使用另一 partition。
- 清理中或清理失败：在当前进程阻止该 partition 的新 acquire，避免清理期间又打开旧会话。
- 不读取 Cookie/token/password/localStorage/IndexedDB 值；清理 API 由主进程执行。没有拷贝认证、修改 User-Agent、关闭 webSecurity 或更改已安装宿主。

## 必须在可部署版本补齐

这份草案故意没有扩展为完整权限与存储管理产品，以下仍是部署前的集成工作，不能声称已经解决：

1. **逐插件调用身份**：所有 Client 插件目前共享同一 `dsh-app://app` 主 frame。`plugin: 'dsh-chat'` 是受限功能标记，不是可靠插件身份认证；别的已装 Client 代码也能调用相同公开 bridge。需要由 Host/Main 发放真实插件能力，或把此功能明确作为主应用范围的可信 grant。现草案不能提供真正 per-plugin 隔离。
2. **卸载清理**：已提供清理命令，但尚未连接官方卸载生命周期。当前 `persistentPartitions` 只记录本进程已知 partition，不能清除前几次进程遗留且本次未打开的存储。需由宿主记录非凭据的 partition 索引并在真正卸载时撤销、清理，不能指望插件自身卸载后继续运行。
3. **跨进程清理失败和账号空隙**：清理失败 gate 现在仅在内存；需持久化失败/撤销标记并在下次打开前完成清理。可信账号从 A→null→B 的异步事件应补充完整 generation/前账号索引，避免把正常 Host 停止与退出登录混用。
4. **退出顺序**：当前原宿主的 owner 销毁回调没有等待 Browser 清理/存储 flush；需在正常 quit、更新和 Host 重启里整合待完成操作，验证干净关闭和进程异常退出两种恢复。
5. **官网兼容性**：只允许 `chat.deepseek.com` 的主 frame 导航，保留原生弹窗/权限限制。若官网登录要求外域主 frame 或 popup，不应直接扩大 allowlist；需要确认官方登录链再精确设计。
6. **用户控制与验收**：把“记住登录”和“清除登录”接入真实设置入口，不增加重复确认页面；在独立源码构建的 DSH 中，用官方 UI 首次登录、完整退出重启、账号切换、退出登录、卸载进行实机验证。当前不提供可部署或“已免登录”的结论。

## 官方依据

- [最新 Browser Bridge 类型](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/packages/client/ui-sidebar-browser/src/types.ts)：只有 acquire/release/onOpenRequested，原合同无持久选项。
- [Browser 主进程](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/apps/desktop/src/browser-guests.ts)：随机内存 partition；严格 lease/partition 检查。
- [官方 Browser 限制](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/packages/client/ui-sidebar-browser/README.md#known-limitations-and-deferred-work)：Cookie/Web storage 不跨重启。
- [Platform 原生视图](https://github.com/deepseek-ai/deepseek-harness/blob/d743267388641bc76f17c45ce8b4c231aed1d32c/apps/desktop/src/platform-view.ts)：已有 persistent partition，但只允许 usage/top-up 页面、锁到账号 issuer origin、清除认证；不能替代 Chat 视图。
- [Electron Session](https://www.electronjs.org/docs/latest/api/session#sessionfrompartitionpartition-options)：persist 前缀使用持久 Session，无前缀使用内存 Session。

完整基线和候选文件 SHA256 在 `manifest.json`。研究草案已保存到 dsh-chat 仓库供审查；未修改已安装 DSH 或用户账户数据，未提交外部 issue/PR。
