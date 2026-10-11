var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __knownSymbol = (name2, symbol) => (symbol = Symbol[name2]) ? symbol : Symbol.for("Symbol." + name2);
var __typeError = (msg) => {
  throw TypeError(msg);
};
var __defNormalProp = (obj, key, value) => key in obj ? __defProp(obj, key, { enumerable: true, configurable: true, writable: true, value }) : obj[key] = value;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });
var __decoratorStart = (base) => [, , , __create(base?.[__knownSymbol("metadata")] ?? null)];
var __decoratorStrings = ["class", "method", "getter", "setter", "accessor", "field", "value", "get", "set"];
var __expectFn = (fn) => fn !== void 0 && typeof fn !== "function" ? __typeError("Function expected") : fn;
var __decoratorContext = (kind, name2, done, metadata, fns) => ({ kind: __decoratorStrings[kind], name: name2, metadata, addInitializer: (fn) => done._ ? __typeError("Already initialized") : fns.push(__expectFn(fn || null)) });
var __decoratorMetadata = (array, target) => __defNormalProp(target, __knownSymbol("metadata"), array[3]);
var __runInitializers = (array, flags, self, value) => {
  for (var i = 0, fns = array[flags >> 1], n = fns && fns.length; i < n; i++) flags & 1 ? fns[i].call(self) : value = fns[i].call(self, value);
  return value;
};
var __decorateElement = (array, flags, name2, decorators, target, extra) => {
  var fn, it, done, ctx, access, k = flags & 7, s = !!(flags & 8), p = !!(flags & 16);
  var j = k > 3 ? array.length + 1 : k ? s ? 1 : 2 : 0, key = __decoratorStrings[k + 5];
  var initializers = k > 3 && (array[j - 1] = []), extraInitializers = array[j] || (array[j] = []);
  var desc = k && (!p && !s && (target = target.prototype), k < 5 && (k > 3 || !p) && __getOwnPropDesc(k < 4 ? target : { get [name2]() {
    return __privateGet(this, extra);
  }, set [name2](x) {
    return __privateSet(this, extra, x);
  } }, name2));
  k ? p && k < 4 && __name(extra, (k > 2 ? "set " : k > 1 ? "get " : "") + name2) : __name(target, name2);
  for (var i = decorators.length - 1; i >= 0; i--) {
    ctx = __decoratorContext(k, name2, done = {}, array[3], extraInitializers);
    if (k) {
      ctx.static = s, ctx.private = p, access = ctx.access = { has: p ? (x) => __privateIn(target, x) : (x) => name2 in x };
      if (k ^ 3) access.get = p ? (x) => (k ^ 1 ? __privateGet : __privateMethod)(x, target, k ^ 4 ? extra : desc.get) : (x) => x[name2];
      if (k > 2) access.set = p ? (x, y) => __privateSet(x, target, y, k ^ 4 ? extra : desc.set) : (x, y) => x[name2] = y;
    }
    it = (0, decorators[i])(k ? k < 4 ? p ? extra : desc[key] : k > 4 ? void 0 : { get: desc.get, set: desc.set } : target, ctx), done._ = 1;
    if (k ^ 4 || it === void 0) __expectFn(it) && (k > 4 ? initializers.unshift(it) : k ? p ? extra = it : desc[key] = it : target = it);
    else if (typeof it !== "object" || it === null) __typeError("Object expected");
    else __expectFn(fn = it.get) && (desc.get = fn), __expectFn(fn = it.set) && (desc.set = fn), __expectFn(fn = it.init) && initializers.unshift(fn);
  }
  return k || __decoratorMetadata(array, target), desc && __defProp(target, name2, desc), p ? k ^ 4 ? extra : desc : target;
};
var __publicField = (obj, key, value) => __defNormalProp(obj, typeof key !== "symbol" ? key + "" : key, value);
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateIn = (member, obj) => Object(obj) !== obj ? __typeError('Cannot use the "in" operator on this value') : member.has(obj);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var __privateMethod = (obj, member, method) => (__accessCheck(obj, member, "access private method"), method);

// src/index.ts
import schema from "@deepseek-ai/schemastery";

// src/server.ts
import "@deepseek-ai/cordis";
import { Remote, RemoteError, TypertRemoteService } from "@deepseek-ai/dsh-typert-protocol";

// src/authorization.ts
import { randomUUID } from "node:crypto";
var AuthorizationAuthority = class {
  constructor(account, issueEpoch = randomUUID) {
    this.account = account;
    this.issueEpoch = issueEpoch;
    this.state = { status: "pending", accountId: null, epoch: issueEpoch(), error: null };
  }
  state;
  lifetime = new AbortController();
  listeners = /* @__PURE__ */ new Set();
  revision = 0;
  started = false;
  closed = false;
  metadata;
  refreshing;
  getSnapshot() {
    return { ...this.state };
  }
  subscribe(listener) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  publish(next) {
    this.state = next;
    for (const listener of this.listeners) listener();
  }
  unavailable(error) {
    this.publish(this.state.status === "authorized" ? { ...this.state, error } : { status: "unavailable", accountId: null, epoch: this.state.epoch, error });
  }
  /** DSH signed-out/expiry is synchronous: UI observers run before any network refresh. */
  invalidate() {
    this.revision++;
    const alreadyClosed = this.state.status === "unauthorized";
    this.publish({
      status: "unauthorized",
      accountId: null,
      epoch: alreadyClosed ? this.state.epoch : this.issueEpoch(),
      error: null
    });
  }
  /** Public credential-record change supplies only a key; no credential record is read. */
  grantChanged() {
    this.revision++;
    this.publish({ status: "pending", accountId: null, epoch: this.issueEpoch(), error: null });
    if (this.metadata && !this.closed) void this.refresh(this.metadata).catch(() => void 0);
  }
  start(metadata) {
    this.metadata = { ...metadata };
    if (this.started || this.closed) return;
    this.started = true;
    void (async () => {
      for await (const view of this.account.watch(this.lifetime.signal)) {
        if (this.closed) break;
        if (view.status === "signed-out") this.invalidate();
        else void this.refresh(this.metadata).catch(() => void 0);
      }
      if (!this.closed) this.unavailable("account-watch-ended");
    })().catch(() => {
      if (!this.closed) this.unavailable("account-watch-unavailable");
    });
  }
  refresh(metadata) {
    this.start(metadata);
    if (this.closed) return Promise.reject(new Error("Account observation is disposed."));
    if (this.refreshing?.revision === this.revision) return this.refreshing.promise;
    const promise = this.refreshOnce(metadata);
    const current = { revision: this.revision, promise };
    this.refreshing = current;
    void promise.finally(() => {
      if (this.refreshing === current) this.refreshing = void 0;
    }).catch(() => void 0);
    return promise;
  }
  async refreshOnce(metadata) {
    const beforeRead = this.revision;
    let view;
    try {
      view = await this.account.getState();
    } catch {
      if (beforeRead === this.revision) this.unavailable("account-state-unavailable");
      return this.getSnapshot();
    }
    if (beforeRead !== this.revision || this.closed) return this.getSnapshot();
    if (view.status === "signed-out") {
      this.invalidate();
      return this.getSnapshot();
    }
    const generation = this.revision;
    let profile;
    try {
      profile = await this.account.getProfile(metadata);
    } catch {
      profile = { status: "failed" };
    }
    if (generation !== this.revision || this.closed) return this.getSnapshot();
    if (profile?.status !== "ready" || !profile.value.id) {
      if (profile === null) {
        let current;
        try {
          current = await this.account.getState();
        } catch {
        }
        if (generation !== this.revision || this.closed) return this.getSnapshot();
        if (current?.status === "signed-out") {
          this.invalidate();
          return this.getSnapshot();
        }
      }
      this.unavailable(profile?.status === "ready" ? "account-identity-unavailable" : "account-profile-unavailable");
      return this.getSnapshot();
    }
    const sameAccount = this.state.status === "authorized" && this.state.accountId === profile.value.id;
    this.publish({
      status: "authorized",
      accountId: profile.value.id,
      epoch: sameAccount ? this.state.epoch : this.issueEpoch(),
      error: null
    });
    return this.getSnapshot();
  }
  async *watch(metadata, signal) {
    this.start(metadata);
    let dirty = true;
    let wake;
    const changed = () => {
      dirty = true;
      wake?.();
    };
    const unsubscribe = this.subscribe(changed);
    signal.addEventListener("abort", changed, { once: true });
    this.lifetime.signal.addEventListener("abort", changed, { once: true });
    void this.refresh(metadata).catch(() => void 0);
    try {
      while (!signal.aborted && !this.closed) {
        if (dirty) {
          dirty = false;
          yield this.getSnapshot();
          continue;
        }
        await new Promise((resolve) => {
          wake = resolve;
        });
      }
    } finally {
      unsubscribe();
      signal.removeEventListener("abort", changed);
      this.lifetime.signal.removeEventListener("abort", changed);
    }
  }
  dispose() {
    if (this.closed) return;
    this.closed = true;
    this.invalidate();
    this.lifetime.abort();
    this.listeners.clear();
  }
};

// src/protocol.ts
import { z } from "zod";
var WEBSITE_SESSION_ORIGIN = "https://chat.deepseek.com";
var identifier = z.string().min(1).max(512);
var authorizationEpochSchema = identifier;
var clientMetadataSchema = z.strictObject({
  version: z.string().min(1).max(100),
  locale: z.string().min(1).max(100),
  timezoneOffsetSeconds: z.number().int().min(-86400).max(86400)
});
var authorizationSchema = z.strictObject({
  status: z.enum(["pending", "authorized", "unauthorized", "unavailable"]),
  accountId: identifier.nullable(),
  epoch: authorizationEpochSchema,
  error: z.string().max(100).nullable()
});
var websiteSessionSchema = z.strictObject({
  token: z.string().min(1).max(16384),
  userId: identifier,
  deviceId: z.string().uuid()
});
var strict = (name2, schema2) => ({
  mode: "strict",
  typeSymbol: `dsh-chat#${name2}`,
  create: () => schema2
});
var metadataParameter = {
  name: "metadata",
  wire: "metadata",
  source: "json",
  codec: strict("DshChatClientMetadata", clientMetadataSchema)
};
var epochParameter = {
  name: "epoch",
  wire: "epoch",
  source: "json",
  codec: strict("AuthorizationEpoch", authorizationEpochSchema)
};
var descriptor = (method, stream = false) => ({
  id: `dsh-chat#dshChat/${method}`,
  service: "dshChat",
  namespace: "dshChat",
  method,
  invocation: { kind: "direct" },
  parameters: [metadataParameter],
  cancellation: { parameter: "signal" },
  result: strict("AuthorizationState", authorizationSchema),
  ...stream ? { mode: "stream" } : {}
});
var websiteDescriptor = (method, save = false) => ({
  id: `dsh-chat#dshChat/${method}`,
  service: "dshChat",
  namespace: "dshChat",
  method,
  invocation: { kind: "direct" },
  parameters: [metadataParameter, epochParameter, ...save ? [{
    name: "session",
    wire: "session",
    source: "json",
    codec: strict("WebsiteSession", websiteSessionSchema)
  }] : []],
  cancellation: { parameter: "signal" },
  result: method === "loadWebsiteSession" ? strict("OptionalWebsiteSession", websiteSessionSchema.nullable()) : strict("WebsiteSessionOperationResult", z.boolean())
});
var DSH_CHAT_DESCRIPTORS = [
  descriptor("authorization"),
  descriptor("watchAuthorization", true),
  websiteDescriptor("loadWebsiteSession"),
  websiteDescriptor("saveWebsiteSession", true),
  websiteDescriptor("clearWebsiteSession")
];
var DSH_CHAT_HOST_CONTRIBUTION = {
  package: "dsh-chat",
  face: "host",
  schemas: [],
  // Website credentials are never model-callable services or objects.
  model: { services: [], events: [], objects: [] },
  invocations: DSH_CHAT_DESCRIPTORS
};

// src/website-session-store.ts
import { createHash } from "node:crypto";
import { credentialKey } from "@deepseek-ai/dsh-credentials";
import { z as z2 } from "zod";
var grantSchema = z2.strictObject({
  version: z2.literal(1),
  origin: z2.literal(WEBSITE_SESSION_ORIGIN),
  fencedDSHaccountId: z2.string().min(1).max(512),
  session: websiteSessionSchema
});
var WebsiteSessionStore = class {
  constructor(credentials, authority) {
    this.credentials = credentials;
    this.authority = authority;
  }
  pending = Promise.resolve();
  current(fence, signal) {
    const state = this.authority.getSnapshot();
    return !signal.aborted && state.status === "authorized" && state.error === null && state.accountId === fence.accountId && state.epoch === fence.epoch;
  }
  key(fence) {
    const digest = createHash("sha256").update(fence.accountId, "utf8").digest("hex");
    return credentialKey("dsh-chat", `website-${digest}`);
  }
  /** Keep delayed clearing/writing ordered; a new generation rechecks its fence after waiting. */
  async exclusive(operation) {
    const previous = this.pending;
    let release;
    this.pending = new Promise((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }
  async load(fence, signal) {
    try {
      return await this.exclusive(async () => {
        if (!this.current(fence, signal)) return null;
        const record = await this.credentials.readRecord(this.key(fence));
        if (!this.current(fence, signal) || record?.kind !== "grant") return null;
        const grant = grantSchema.safeParse(record.payload);
        if (!grant.success || grant.data.fencedDSHaccountId !== fence.accountId) return null;
        return this.current(fence, signal) ? { ...grant.data.session } : null;
      });
    } catch {
      throw new Error("\u65E0\u6CD5\u8BFB\u53D6 CHAT \u767B\u5F55\u3002");
    }
  }
  async save(fence, session, signal) {
    try {
      const parsed = websiteSessionSchema.safeParse(session);
      if (!parsed.success) return false;
      return await this.exclusive(async () => {
        if (!this.current(fence, signal)) return false;
        let accepted = false;
        await this.credentials.modifyRecord(this.key(fence), async () => {
          if (!this.current(fence, signal)) return void 0;
          accepted = true;
          return { kind: "grant", payload: {
            version: 1,
            origin: WEBSITE_SESSION_ORIGIN,
            fencedDSHaccountId: fence.accountId,
            session: parsed.data
          } };
        });
        return accepted && this.current(fence, signal);
      });
    } catch {
      throw new Error("\u65E0\u6CD5\u4FDD\u5B58 CHAT \u767B\u5F55\u3002");
    }
  }
  async clear(fence, signal) {
    try {
      return await this.exclusive(async () => {
        if (!this.current(fence, signal)) return false;
        await this.credentials.deleteRecord(this.key(fence));
        return this.current(fence, signal);
      });
    } catch {
      throw new Error("\u65E0\u6CD5\u6E05\u9664 CHAT \u767B\u5F55\u3002");
    }
  }
};

// src/server.ts
var ACCOUNT_RECORD_KEY = "deepseek-account-platform/default";
var _clearWebsiteSession_dec, _saveWebsiteSession_dec, _loadWebsiteSession_dec, _watchAuthorization_dec, _authorization_dec, _a, _init;
var DshChatController = class extends (_a = TypertRemoteService, _authorization_dec = [Remote], _watchAuthorization_dec = [Remote({ mode: "stream" })], _loadWebsiteSession_dec = [Remote], _saveWebsiteSession_dec = [Remote], _clearWebsiteSession_dec = [Remote], _a) {
  constructor(ctx) {
    super(ctx, "dshChat");
    __runInitializers(_init, 5, this);
    __publicField(this, "authority");
    __publicField(this, "websiteSessions");
    this.authority = new AuthorizationAuthority(ctx.deepseekAccount);
    this.websiteSessions = new WebsiteSessionStore(ctx.credentials, this.authority);
    ctx.typert.register(DSH_CHAT_HOST_CONTRIBUTION);
    ctx.on("deepseek-account/signed-out", () => {
      this.authority.invalidate();
    });
    ctx.on("deepseek-account/session-expired", () => {
      this.authority.invalidate();
    });
    ctx.on("credentials/record-updated", (key) => {
      if (String(key) === ACCOUNT_RECORD_KEY) this.authority.grantChanged();
    });
    ctx.effect(() => () => {
      this.authority.dispose();
    }, "dsh-chat safe account observation lifetime");
  }
  async authorization(metadata, signal) {
    try {
      signal.throwIfAborted();
      const state = await this.authority.refresh(clientMetadataSchema.parse(metadata));
      signal.throwIfAborted();
      return state;
    } catch {
      throw new RemoteError("gateway/internal", "\u65E0\u6CD5\u786E\u8BA4 DSH \u8D26\u53F7\u72B6\u6001\uFF0C\u8BF7\u68C0\u67E5 DSH \u670D\u52A1\u3002", {});
    }
  }
  async *watchAuthorization(metadata, signal) {
    try {
      yield* this.authority.watch(clientMetadataSchema.parse(metadata), signal);
    } catch {
      throw new RemoteError("gateway/internal", "\u65E0\u6CD5\u786E\u8BA4 DSH \u8D26\u53F7\u72B6\u6001\uFF0C\u8BF7\u68C0\u67E5 DSH \u670D\u52A1\u3002", {});
    }
  }
  async websiteFence(metadata, epoch, signal) {
    signal.throwIfAborted();
    const expectedEpoch = authorizationEpochSchema.parse(epoch);
    const state = await this.authority.refresh(clientMetadataSchema.parse(metadata));
    signal.throwIfAborted();
    const current = this.authority.getSnapshot();
    if (state.status !== "authorized" || state.error !== null || !state.accountId || state.accountId.length > 512 || state.epoch !== expectedEpoch || current.status !== "authorized" || current.error !== null || current.accountId !== state.accountId || current.epoch !== expectedEpoch) return null;
    return { accountId: state.accountId, epoch: expectedEpoch };
  }
  async loadWebsiteSession(metadata, epoch, signal) {
    try {
      const fence = await this.websiteFence(metadata, epoch, signal);
      return fence ? await this.websiteSessions.load(fence, signal) : null;
    } catch {
      throw new RemoteError("gateway/internal", "\u65E0\u6CD5\u6062\u590D CHAT \u767B\u5F55\uFF0C\u8BF7\u91CD\u8BD5\u3002", {});
    }
  }
  async saveWebsiteSession(metadata, epoch, session, signal) {
    try {
      const parsed = websiteSessionSchema.parse(session);
      const fence = await this.websiteFence(metadata, epoch, signal);
      return fence ? await this.websiteSessions.save(fence, parsed, signal) : false;
    } catch {
      throw new RemoteError("gateway/internal", "\u65E0\u6CD5\u4FDD\u5B58 CHAT \u767B\u5F55\uFF0C\u8BF7\u91CD\u8BD5\u3002", {});
    }
  }
  async clearWebsiteSession(metadata, epoch, signal) {
    try {
      const fence = await this.websiteFence(metadata, epoch, signal);
      return fence ? await this.websiteSessions.clear(fence, signal) : false;
    } catch {
      throw new RemoteError("gateway/internal", "\u65E0\u6CD5\u6E05\u9664 CHAT \u767B\u5F55\uFF0C\u8BF7\u91CD\u8BD5\u3002", {});
    }
  }
};
_init = __decoratorStart(_a);
__decorateElement(_init, 1, "authorization", _authorization_dec, DshChatController);
__decorateElement(_init, 1, "watchAuthorization", _watchAuthorization_dec, DshChatController);
__decorateElement(_init, 1, "loadWebsiteSession", _loadWebsiteSession_dec, DshChatController);
__decorateElement(_init, 1, "saveWebsiteSession", _saveWebsiteSession_dec, DshChatController);
__decorateElement(_init, 1, "clearWebsiteSession", _clearWebsiteSession_dec, DshChatController);
__decoratorMetadata(_init, DshChatController);
__publicField(DshChatController, "inject", ["deepseekAccount", "credentials", "typert"]);

// src/index.ts
var Config = schema.object({
  language: schema.union(["", "system", "zh-CN", "en"]).default("zh-CN").volatile()
});
var name = "dsh-chat";
var inject = ["deepseekAccount", "typert", "credentials"];
function apply(ctx) {
  new DshChatController(ctx);
  ctx.inject(["settings"], (child) => {
    child.effect(() => child.settings.configure({ auto: false }, ctx.fiber));
  });
}
export {
  Config,
  apply,
  inject,
  name
};
