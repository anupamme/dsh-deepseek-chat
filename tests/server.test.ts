import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { createHash } from 'node:crypto'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import type { DshChatUIBridge } from '../src/ui.js'

// Compile only our Service; load the real packages from the project so Cordis,
// its registry, and the Gateway keep their published runtime identities.
const require = createRequire(path.join(process.cwd(), 'package.json'))
const { build } = require('esbuild')
const { Context, Service } = require('@deepseek-ai/cordis')
const { default: TypertRegistry } = require('@deepseek-ai/dsh-typert-registry')
const { default: TypertGateway } = require('@deepseek-ai/dsh-api-gateway')
const metadata = { version: '0.2.0-rc.2', locale: 'zh-CN', timezoneOffsetSeconds: 28_800 }
function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(done => { resolve = done })
  return { promise, resolve }
}
const fictionalSession = {
  token: 'fictional-website-token', userId: 'fictional-website-user',
  deviceId: '00000000-0000-4000-8000-000000000001',
}


test('published Cordis and Typert Host/Client bind strict methods and withdraw them on disposal', async t => {
  const cache = path.join(process.cwd(), 'node_modules', '.cache')
  await mkdir(cache, { recursive: true })
  const output = await mkdtemp(path.join(cache, 'dsh-chat-service-test-'))
  const artifact = path.join(output, 'server.mjs')
  t.after(async () => { await rm(output, { recursive: true, force: true }) })
  await build({
    absWorkingDir: process.cwd(), entryPoints: ['src/server.ts'], outfile: artifact,
    bundle: true, packages: 'external', format: 'esm', platform: 'node', target: 'es2022',
  })
  const { DshChatController } = await import(pathToFileURL(artifact).href)
  const protocolArtifact = path.join(output, 'protocol.mjs')
  await build({
    absWorkingDir: process.cwd(), entryPoints: ['src/protocol.ts'], outfile: protocolArtifact,
    bundle: true, packages: 'external', format: 'esm', platform: 'node', target: 'es2022',
  })
  const { DSH_CHAT_REMOTE_CONTRIBUTION } = await import(pathToFileURL(protocolArtifact).href)
  // Published Client artifacts use DSH's lazyCJS loader. Run the actual
  // published factory with the same shared Cordis module supplied above.
  let ClientGateway: object | undefined
  const clientArtifact = await readFile(require.resolve('@deepseek-ai/dsh-api-gateway/client'), 'utf8')
  new Function('window', clientArtifact)({
    __ModuleLoader__: { load: (contribution: { factory: (load: typeof require) => object }) => {
      ClientGateway = contribution.factory(require)
    } },
  })
  assert.ok(ClientGateway)
  let accountStatus = 'credential-stored'
  let accountId = 'fixture-account'
  const account = {
    getState: async () => ({ status: accountStatus }),
    getProfile: async () => ({ status: 'ready', value: { id: accountId } }),
    async *watch(signal: AbortSignal) {
      yield { status: accountStatus }
      if (!signal.aborted) await new Promise<void>(resolve => { signal.addEventListener('abort', () => { resolve() }, { once: true }) })
    },
  }
  const ctx = new Context()
  ctx.provide('deepseekAccount', account)
  // Isolated in-memory records only; this never instantiates a real vault provider.
  type Record = { kind: 'grant'; payload: unknown }
  const officialKey = 'deepseek-account-platform/default'
  const officialRecord: Record = { kind: 'grant', payload: { marker: 'fictional-official-grant' } }
  const records = new Map<string, Record>([[officialKey, officialRecord]])
  const credentialCalls: { method: 'read' | 'modify' | 'delete'; key: string }[] = []
  let failWrite = false
  let failDelete = false
  let modifyGate: { entered: () => void; wait: Promise<void> } | undefined
  ctx.provide('credentials', {
    readRecord: async (key: string) => {
      credentialCalls.push({ method: 'read', key })
      return records.get(key)
    },
    modifyRecord: async (key: string, mutate: (current: Record | undefined) => Promise<Record | undefined>) => {
      credentialCalls.push({ method: 'modify', key })
      const gate = modifyGate; modifyGate = undefined
      if (gate) { gate.entered(); await gate.wait }
      if (failWrite) throw new Error('fictional-vault-write-detail')
      const replacement = await mutate(records.get(key))
      // Match the official seam: undefined is a declined mutation, not deletion.
      if (replacement !== undefined) records.set(key, replacement)
      return records.get(key)
    },
    deleteRecord: async (key: string) => {
      credentialCalls.push({ method: 'delete', key })
      if (failDelete) throw new Error('fictional-vault-delete-detail')
      records.delete(key)
    },
  })
  const registry = ctx.plugin(TypertRegistry)
  await registry
  const gateway = ctx.plugin(TypertGateway)
  await gateway
  const controller = ctx.plugin(DshChatController)
  await controller
  let disposed = false
  t.after(async () => {
    if (!disposed) await controller.dispose()
    await gateway.dispose()
    await registry.dispose()
  })
  assert.equal(ctx.typert.local.get('dshChat/authorization').parameters[0].codec.mode, 'strict')
  const authorized = await ctx.typertGateway.invoke({ namespace: 'dshChat', method: 'authorization', args: { metadata } })
  assert.equal(authorized.status, 'authorized')
  assert.equal(authorized.accountId, 'fixture-account')
  assert.ok(authorized.epoch)
  assert.equal('token' in authorized, false)
  ctx.emit('credentials/record-updated', 'fixture-unrelated/default')
  assert.equal(ctx.dshChat.authority.getSnapshot().epoch, authorized.epoch)
  ctx.emit('credentials/record-updated', 'deepseek-account-platform/default')
  const replacing = ctx.dshChat.authority.getSnapshot()
  assert.equal(replacing.status, 'pending')
  assert.equal(replacing.accountId, null)
  assert.notEqual(replacing.epoch, authorized.epoch)
  const reauthorized = await ctx.typertGateway.invoke({ namespace: 'dshChat', method: 'authorization', args: { metadata } })
  assert.equal(reauthorized.status, 'authorized')
  assert.notEqual(reauthorized.epoch, authorized.epoch)

  await assert.rejects(ctx.typertGateway.invoke({
    namespace: 'dshChat', method: 'authorization', args: { metadata: { ...metadata, cookie: 'fixture-only' } },
  }), (error: { code?: string }) => error.code === 'gateway/input-invalid')
  await assert.rejects(ctx.typertGateway.invoke({
    namespace: 'dshChat', method: 'authorization', args: { metadata }, signal: AbortSignal.abort(),
  }), (error: { code?: string }) => error.code === 'gateway/cancelled')

  const invokeSession = (method: string, epoch: string, session?: object) => ctx.typertGateway.invoke({
    namespace: 'dshChat', method, args: { metadata, epoch, ...(session ? { session } : {}) },
  })
  const ownKey = (id: string) => `dsh-chat/website-${createHash('sha256').update(id, 'utf8').digest('hex')}`
  const keyA = ownKey('fixture-account')
  let sessionAuthorization = reauthorized

  await t.test('website grants use only their own account key, strict three-value payload, and official origin', async () => {
    assert.equal(await invokeSession('loadWebsiteSession', sessionAuthorization.epoch), null)
    assert.equal(await invokeSession('saveWebsiteSession', sessionAuthorization.epoch, fictionalSession), true)
    const expectedRecord = { kind: 'grant', payload: {
      version: 1, origin: 'https://chat.deepseek.com', fencedDSHaccountId: 'fixture-account', session: fictionalSession,
    } }
    assert.deepEqual(records.get(keyA), expectedRecord)
    assert.deepEqual(await invokeSession('loadWebsiteSession', sessionAuthorization.epoch), fictionalSession)
    assert.deepEqual(records.get(officialKey), officialRecord)
    for (const extra of ['cookie', 'password', 'origin', 'accountId', 'credentialKey']) {
      await assert.rejects(invokeSession('saveWebsiteSession', sessionAuthorization.epoch, {
        ...fictionalSession, [extra]: 'fixture-only',
      }), (error: { code?: string }) => error.code === 'gateway/input-invalid')
    }
    await assert.rejects(ctx.typertGateway.invoke({ namespace: 'dshChat', method: 'clearWebsiteSession', args: {
      metadata, epoch: sessionAuthorization.epoch, accountId: 'fixture-other-account', credentialKey: officialKey,
    } }), (error: { code?: string }) => error.code === 'gateway/arguments-invalid')
    for (const payload of [
      { ...expectedRecord.payload, origin: 'https://example.invalid' },
      { ...expectedRecord.payload, fencedDSHaccountId: 'fixture-other-account' },
      { ...expectedRecord.payload, cookie: 'fixture-only' },
    ]) {
      records.set(keyA, { kind: 'grant', payload })
      assert.equal(await invokeSession('loadWebsiteSession', sessionAuthorization.epoch), null)
    }
    records.set(keyA, expectedRecord as Record)
    assert.equal(credentialCalls.every(call => /^dsh-chat\/website-[a-f0-9]{64}$/.test(call.key)), true)
  })

  await t.test('stale epochs and another DSH account cannot load, overwrite, or clear the old account grant', async () => {
    const staleCalls = credentialCalls.length
    assert.equal(await invokeSession('loadWebsiteSession', authorized.epoch), null)
    assert.equal(await invokeSession('saveWebsiteSession', authorized.epoch, fictionalSession), false)
    assert.equal(await invokeSession('clearWebsiteSession', authorized.epoch), false)
    assert.equal(credentialCalls.length, staleCalls)
    const recordA = records.get(keyA)
    const epochA = sessionAuthorization.epoch
    accountId = 'fixture-other-account'
    ctx.emit('credentials/record-updated', officialKey)
    sessionAuthorization = await ctx.typertGateway.invoke({ namespace: 'dshChat', method: 'authorization', args: { metadata } })
    assert.notEqual(sessionAuthorization.epoch, epochA)
    assert.equal(await invokeSession('loadWebsiteSession', epochA), null)
    assert.equal(await invokeSession('clearWebsiteSession', epochA), false)
    assert.equal(await invokeSession('loadWebsiteSession', sessionAuthorization.epoch), null)
    const otherSession = { ...fictionalSession, token: 'fictional-other-website-token', userId: 'fictional-other-website-user' }
    assert.equal(await invokeSession('saveWebsiteSession', sessionAuthorization.epoch, otherSession), true)
    assert.deepEqual(await invokeSession('loadWebsiteSession', sessionAuthorization.epoch), otherSession)
    const keyB = ownKey(accountId)
    assert.notEqual(keyA, keyB)
    assert.equal(await invokeSession('clearWebsiteSession', sessionAuthorization.epoch), true)
    assert.equal(records.has(keyB), false)
    assert.deepEqual(records.get(keyA), recordA)
    assert.deepEqual(records.get(officialKey), officialRecord)
    accountId = 'fixture-account'
    ctx.emit('credentials/record-updated', officialKey)
    sessionAuthorization = await ctx.typertGateway.invoke({ namespace: 'dshChat', method: 'authorization', args: { metadata } })
    assert.notEqual(sessionAuthorization.epoch, epochA)
    assert.deepEqual(await invokeSession('loadWebsiteSession', sessionAuthorization.epoch), fictionalSession)
  })

  await t.test('renewed authorization fences a write waiting for the credential lock before its mutation callback', async () => {
    const entered = deferred<void>()
    const release = deferred<void>()
    modifyGate = { entered: () => entered.resolve(), wait: release.promise }
    const recordBefore = records.get(keyA)
    const epochBefore = sessionAuthorization.epoch
    const saving = invokeSession('saveWebsiteSession', epochBefore, { ...fictionalSession, token: 'fictional-stale-write-token' })
    await entered.promise
    ctx.emit('credentials/record-updated', officialKey)
    sessionAuthorization = await ctx.typertGateway.invoke({ namespace: 'dshChat', method: 'authorization', args: { metadata } })
    assert.notEqual(sessionAuthorization.epoch, epochBefore)
    release.resolve()
    assert.equal(await saving, false)
    assert.deepEqual(records.get(keyA), recordBefore)
    assert.deepEqual(await invokeSession('loadWebsiteSession', sessionAuthorization.epoch), fictionalSession)
  })

  await t.test('provider write and clear failures keep the grant and expose only fixed gateway errors', async () => {
    const retained = records.get(keyA)
    failWrite = true
    await assert.rejects(invokeSession('saveWebsiteSession', sessionAuthorization.epoch, {
      ...fictionalSession, token: 'fictional-rejected-write-token',
    }), (error: { code?: string; message?: string }) => error.code === 'gateway/internal'
      && !String(error.message).includes('fictional-vault-write-detail'))
    failWrite = false
    assert.deepEqual(records.get(keyA), retained)
    failDelete = true
    await assert.rejects(invokeSession('clearWebsiteSession', sessionAuthorization.epoch),
      (error: { code?: string; message?: string }) => error.code === 'gateway/internal'
        && !String(error.message).includes('fictional-vault-delete-detail'))
    failDelete = false
    assert.deepEqual(records.get(keyA), retained)
    assert.deepEqual(await invokeSession('loadWebsiteSession', sessionAuthorization.epoch), fictionalSession)
    assert.equal(await invokeSession('clearWebsiteSession', sessionAuthorization.epoch), true)
    assert.equal(await invokeSession('loadWebsiteSession', sessionAuthorization.epoch), null)
    assert.deepEqual(records.get(officialKey), officialRecord)
    assert.equal(credentialCalls.every(call => /^dsh-chat\/website-[a-f0-9]{64}$/.test(call.key)), true)
  })

  // Only the Connection carrier is a local fixture: the Client Remote, its
  // registry, namespace mounting, cancellation, and Host dispatch are real.
  const clientCtx = new Context()
  let carrierStopped = false
  let carrierCalls = 0
  clientCtx.provide('connection', {
    start: () => ({ stop: () => { carrierStopped = true } }),
    registerGenerationSource: () => () => {},
    rpc: {
      call: async (_path: string, endpoint: string, payload: { args: object }, signal: AbortSignal) => {
        carrierCalls++
        const [namespace, method] = endpoint.split('/')
        const value = await ctx.typertGateway.invoke({ namespace, method, args: payload.args, signal })
        return { ok: true, value }
      },
      async *open(_path: string, endpoint: string, payload: { args: object }, signal: AbortSignal) {
        const [namespace, method] = endpoint.split('/')
        yield* await ctx.typertGateway.stream({ namespace, method, args: payload.args, signal })
      },
    },
  })
  const clientRegistry = clientCtx.plugin(TypertRegistry)
  await clientRegistry
  const clientGateway = clientCtx.plugin(ClientGateway)
  await clientGateway
  t.after(async () => { await clientGateway.dispose(); await clientRegistry.dispose() })
  const unmountClient = await clientCtx.remote.$mount(DSH_CHAT_REMOTE_CONTRIBUTION)
  t.after(unmountClient)
  const clientAuthorization = await clientCtx.remote.dshChat.authorization(metadata)
  assert.equal(clientAuthorization.ok, true)
  assert.equal(clientAuthorization.value.accountId, authorized.accountId)
  assert.deepEqual(await clientCtx.remote.dshChat.loadWebsiteSession(metadata, clientAuthorization.value.epoch), { ok: true, value: null })
  assert.deepEqual(await clientCtx.remote.dshChat.saveWebsiteSession(metadata, clientAuthorization.value.epoch, fictionalSession), { ok: true, value: true })
  assert.deepEqual(await clientCtx.remote.dshChat.clearWebsiteSession(metadata, clientAuthorization.value.epoch), { ok: true, value: true })
  const capturedSessionMethod = clientCtx.remote.dshChat.loadWebsiteSession
  // A root Context bypasses plugin dependency enforcement. Keep the failing
  // shape covered explicitly so the integration cannot accidentally miss it.
  const missingDependency = clientCtx.plugin({
    name: 'fixture-missing-namespace-dependency', inject: ['remote'],
    apply: (child: typeof clientCtx) => child.remote.dshChat.authorization(metadata),
  })
  await assert.rejects(Promise.resolve(missingDependency), /remote\.dshChat.*without inject/)
  await missingDependency.dispose()
  const capturedMethod = clientCtx.remote.dshChat.authorization
  const clientStream = clientCtx.remote.dshChat.watchAuthorization(metadata)
  const clientIterator = clientStream[Symbol.asyncIterator]()
  assert.equal((await clientIterator.next()).value.status, 'authorized')

  const abort = new AbortController()
  const stream = await ctx.typertGateway.stream({
    namespace: 'dshChat', method: 'watchAuthorization', args: { metadata }, signal: abort.signal,
  })
  const iterator = stream[Symbol.asyncIterator]()
  const opening = await iterator.next()
  assert.equal(opening.value.status, 'authorized')
  accountStatus = 'signed-out'
  ctx.emit('deepseek-account/signed-out')
  const signedOut = await iterator.next()
  assert.equal(signedOut.value.status, 'unauthorized')
  assert.notEqual(signedOut.value.epoch, authorized.epoch)
  assert.equal((await clientIterator.next()).value.status, 'unauthorized')
  clientStream.dispose()
  await clientIterator.return?.()
  abort.abort()
  await iterator.return?.()

  await unmountClient()
  assert.equal(clientCtx.get('remote.dshChat'), undefined)
  const callsBeforeWithdrawal = carrierCalls
  assert.equal((await capturedMethod(metadata)).ok, false)
  assert.equal((await capturedSessionMethod(metadata, clientAuthorization.value.epoch)).ok, false)
  assert.equal(carrierCalls, callsBeforeWithdrawal)

  // Exercise the production Client as an actual plugin, including dynamic
  // namespace injection. Only Slot presentation/layout and the carrier are fixtures.
  const productionArtifact = path.join(output, 'client.mjs')
  await build({
    absWorkingDir: process.cwd(), entryPoints: ['src/client.ts'], outfile: productionArtifact,
    bundle: true, packages: 'external', format: 'esm', platform: 'node', target: 'es2022',
    plugins: [{ name: 'presentation-fixtures', setup(plugin: any) {
      plugin.onResolve({ filter: /^\.\/(?:ui|web-surface)\.js$/ }, (args: { importer: string; path: string }) => {
        if (path.resolve(args.importer) === path.join(process.cwd(), 'src/client.ts')) return { path: args.path, namespace: 'fixture' }
      })
      plugin.onLoad({ filter: /.*/, namespace: 'fixture' }, (args: { path: string }) => ({
        contents: args.path === './ui.js'
          ? 'export const DshChatBrandName=()=>null, DshChatBrandControl=()=>null, DshChatChatNavigation=()=>null, DshChatChatPanel=()=>null, DshChatLeadingControls=()=>null, DshChatChatSettings=()=>null;'
          : 'export const DshChatWebSurface=()=>null;', loader: 'js',
      }))
    } }],
  })
  const clientPlugin = await import(pathToFileURL(productionArtifact).href)
  const product = globalThis as typeof globalThis & { dshDesktop?: unknown }
  const priorDesktop = product.dshDesktop
  const priorAdd = globalThis.addEventListener
  const priorRemove = globalThis.removeEventListener
  product.dshDesktop = { protocolVersion: 1, browser: { acquire: () => {}, release: () => {}, onOpenRequested: () => {} } }
  globalThis.addEventListener = () => {}
  globalThis.removeEventListener = () => {}
  t.after(() => {
    if (priorDesktop === undefined) delete product.dshDesktop
    else product.dshDesktop = priorDesktop
    globalThis.addEventListener = priorAdd
    globalThis.removeEventListener = priorRemove
  })
  let bridge!: DshChatUIBridge
  let panel: string | null = 'plugins'
  const panelListeners = new Set<() => void>()
  const slotKeys = new Set<string>()
  class FixtureSlots extends Service {
    constructor(context: typeof clientCtx) { super(context, 'slots') }
    inject(_name: string, callback: () => unknown) { return this.ctx.effect(callback) }
    register(options: { name: string; key?: string; id?: string; inject: () => { bridge: DshChatUIBridge } }) {
      const key = `${options.name}:${options.key ?? options.id ?? ''}`
      slotKeys.add(key)
      if (options.name === 'main') bridge = options.inject().bridge
      return this.ctx.effect(() => () => { slotKeys.delete(key) })
    }
  }
  const fixtureSlots = clientCtx.plugin(FixtureSlots)
  await fixtureSlots
  t.after(() => fixtureSlots.dispose())
  clientCtx.provide('layout', {
    panelInfo: { getSnapshot: () => ({ activePanelId: panel }), subscribe: (listener: () => void) => {
      panelListeners.add(listener); return () => { panelListeners.delete(listener) }
    } },
    selectPanel: (next: string | null) => { panel = next; for (const listener of panelListeners) listener() },
    toggleSidebar: () => {},
  })
  const production = clientCtx.plugin(clientPlugin)
  t.after(() => production.dispose())
  await production
  const until = async (predicate: () => boolean) => {
    for (let index = 0; index < 100; index++) {
      if (predicate()) return
      await new Promise<void>(resolve => { setImmediate(resolve) })
    }
    assert.fail('production Client state did not settle')
  }
  await until(() => bridge.getSnapshot().authorizationStatus === 'unauthorized')
  assert.equal(bridge.getSnapshot().modeEnabled, false)
  accountStatus = 'credential-stored'
  ctx.emit('credentials/record-updated', 'deepseek-account-platform/default')
  bridge.refreshAuthorization()
  await until(() => bridge.getSnapshot().modeEnabled)
  assert.equal(bridge.getSnapshot().mode, 'harness')
  assert.equal(bridge.getSnapshot().error, null)
  bridge.selectMode('chat')
  await until(() => bridge.getSnapshot().mode === 'chat')
  accountStatus = 'signed-out'
  ctx.emit('deepseek-account/signed-out')
  await until(() => bridge.getSnapshot().authorizationStatus === 'unauthorized')
  assert.equal(bridge.getSnapshot().mode, 'harness')
  assert.equal(panel, 'plugins')
  await production.dispose()
  assert.equal(slotKeys.size, 0)
  assert.equal(clientCtx.get('remote.dshChat'), undefined)
  await clientGateway.dispose()
  assert.equal(carrierStopped, true)

  await controller.dispose()
  disposed = true
  for (const method of ['authorization', 'watchAuthorization', 'loadWebsiteSession', 'saveWebsiteSession', 'clearWebsiteSession']) {
    assert.equal(ctx.typert.local.get(`dshChat/${method}`), undefined)
  }
  await assert.rejects(ctx.typertGateway.invoke({
    namespace: 'dshChat', method: 'authorization', args: { metadata },
  }), (error: { code?: string }) => error.code === 'gateway/definition-unavailable')
})
