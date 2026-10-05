import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtemp, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

// Compile the small browser modules into a temporary ESM directory.
const dir = await mkdtemp(join(tmpdir(), 'memori-map-test-'))
for (const name of ['settings', 'amap-security', 'amap-loader']) {
  const source = await readFile(`src/map/${name}.ts`, 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
    .replace(/from '(\.\/[^']+)'/g, "from '$1.mjs'")
    .replace("from 'vue'", `from '${import.meta.resolve('vue')}'`)
  await writeFile(join(dir, `${name}.mjs`), compiled)
}
let stored = new Map()
globalThis.localStorage = { getItem: (key) => stored.get(key), setItem: (key, value) => stored.set(key, value) }
globalThis.location = { protocol: 'https:' }
globalThis.window = globalThis
let scripts = []
globalThis.document = {
  createElement: () => ({ remove() { this.removed = true } }),
  head: { appendChild(script) { scripts.push(script) } },
}
const settings = await import(pathToFileURL(join(dir, 'settings.mjs')))
const security = await import(pathToFileURL(join(dir, 'amap-security.mjs')))
const loader = await import(pathToFileURL(join(dir, 'amap-loader.mjs')))
const direct = { key: 'fake-test-key', securityJsCode: 'fake-test-code', serviceHost: '' }
const proxy = { ...direct, serviceHost: 'https://proxy.example/_AMapService' }
function complete(script, api = { Map: class {} }) {
  globalThis.AMap = api
  const callback = new URL(script.src).searchParams.get('callback')
  globalThis[callback]()
  return api
}

test('local configuration is normalized and separate from ordinary backup settings', () => {
  assert.equal(settings.mapSettings.value.key, '')
  settings.saveMapSettings({ ...direct, key: ' fake-test-key ' })
  assert.equal(settings.mapSettings.value.key, direct.key)
  assert.equal(stored.size, 1)
  assert.ok(stored.has('memori.map-service.v1'))
  assert.throws(() => settings.validateMapSettings({ ...direct, key: '' }))
  assert.throws(() => settings.validateMapSettings({ ...direct, securityJsCode: '' }))
  assert.doesNotThrow(() => settings.validateMapSettings({ ...proxy, securityJsCode: '' }))
  assert.throws(() => settings.validateMapSettings({ ...proxy, serviceHost: 'javascript:bad' }))
  assert.throws(() => settings.validateMapSettings({ ...proxy, serviceHost: 'http://proxy.example' }))
})

test('proxy takes precedence and empty configuration clears previous security', () => {
  security.configureAmapSecurity(proxy)
  assert.deepEqual(globalThis._AMapSecurityConfig, { serviceHost: proxy.serviceHost })
  security.configureAmapSecurity(direct)
  assert.deepEqual(globalThis._AMapSecurityConfig, { securityJsCode: direct.securityJsCode })
  security.configureAmapSecurity({ key: '', securityJsCode: '', serviceHost: '' })
  assert.equal(globalThis._AMapSecurityConfig, undefined)
})

test('SDK failures are sanitized and retry starts a fresh attempt', async () => {
  const failed = loader.loadAmap(direct)
  assert.strictEqual(loader.loadAmap(direct), failed)
  scripts.at(-1).onerror(new Error('sensitive provider response'))
  await assert.rejects(failed, { message: loader.MAP_LOAD_ERROR })
  const retry = loader.loadAmap(direct)
  const script = scripts.at(-1)
  assert.equal(new URL(script.src).searchParams.get('key'), direct.key)
  const api = complete(script)
  assert.strictEqual(await retry, api)
  assert.ok(script.removed)
})

test('configuration changes cancel stale requests and use unique callbacks', async () => {
  const first = loader.loadAmap(proxy)
  const oldScript = scripts.at(-1)
  const oldCallback = new URL(oldScript.src).searchParams.get('callback')
  const rejection = assert.rejects(first, { message: loader.MAP_LOAD_ERROR })
  const second = loader.loadAmap({ ...direct, key: 'another-fake-test-key' })
  await rejection
  assert.ok(oldScript.removed)
  assert.equal(globalThis[oldCallback], undefined)
  assert.notEqual(new URL(scripts.at(-1).src).searchParams.get('callback'), oldCallback)
  complete(scripts.at(-1))
  await second
})

test('SDK timeout surfaces a retryable error rather than hanging', async () => {
  const originalTimeout = globalThis.setTimeout
  let expire
  globalThis.setTimeout = (callback) => { expire = callback; return 0 }
  try {
    const timedOut = loader.loadAmap({ ...direct, key: 'fake-timeout-key' })
    expire()
    await assert.rejects(timedOut, { message: loader.MAP_LOAD_ERROR })
    assert.ok(scripts.at(-1).removed)
  } finally { globalThis.setTimeout = originalTimeout }
})

test.after(async () => { await rm(dir, { recursive: true, force: true }) })
