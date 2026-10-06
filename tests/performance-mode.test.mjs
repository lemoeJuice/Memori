import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'
import ts from 'typescript'

const types = await readFile(new URL('../src/data/types.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(types, { compilerOptions: { module: ts.ModuleKind.ESNext } }).outputText
const { DEFAULT_SETTINGS } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`)
const app = await readFile(new URL('../src/App.vue', import.meta.url), 'utf8')
const settings = await readFile(new URL('../src/components/SettingsView.vue', import.meta.url), 'utf8')
const base = await readFile(new URL('../src/styles/base.css', import.meta.url), 'utf8')
const performance = await readFile(new URL('../src/styles/performance.css', import.meta.url), 'utf8')

test('performance mode defaults off and old settings retain their glass configuration', () => {
  assert.equal(DEFAULT_SETTINGS.performanceMode, false)
  const oldSettings = { glassOpacity: 40, glassBlur: 28, backgroundBlur: 12, backgroundDim: 35 }
  const merged = { ...DEFAULT_SETTINGS, ...oldSettings }
  assert.equal(merged.performanceMode, false)
  for (const [key, value] of Object.entries(oldSettings)) assert.equal(merged[key], value)
})

test('the switch uses the ordinary settings path and system transparency is independent', () => {
  assert.match(settings, /v-model="draft\.performanceMode"[^>]+@change="persist"/)
  assert.match(app, /'performance-mode': settings\?\.performanceMode/)
  assert.match(app, /'reduced-transparency': reducedTransparency/)
  assert.match(app, /matchMedia\('\(prefers-reduced-transparency: reduce\)'\)/)
  assert.match(app, /transparencyPreference\.removeEventListener/)
})

test('transparency overrides are centralized and do not mutate saved variables or snapping', () => {
  assert.match(performance, /:is\(\.performance-mode, \.reduced-transparency\)/)
  assert.match(performance, /backdrop-filter: none/)
  assert.match(performance, /-webkit-backdrop-filter: none/)
  assert.match(performance, /max\(\.9, var\(--glass-opacity\)\)/)
  assert.match(performance, /min\(var\(--background-blur\), 4px\)/)
  assert.doesNotMatch(performance, /--(?:glass-opacity|glass-blur|background-dim|background-blur)\s*:/)
  assert.doesNotMatch(performance, /scroll-snap|overscroll-behavior|touch-action/)
})

test('viewport width no longer disables card blur or entry animations', () => {
  assert.doesNotMatch(base, /backdrop-filter:\s*none/)
  assert.doesNotMatch(base, /\.memory-card\s*\{\s*animation:\s*none/)
  assert.match(performance, /\.app-frame\.performance-mode \.memory-card \{ animation: none; \}/)
})

test('reduced motion affects animations only, leaving transparency independent', () => {
  const motion = performance.slice(performance.indexOf('@media (prefers-reduced-motion: reduce)'))
  assert.match(motion, /animation: none/)
  assert.doesNotMatch(motion, /backdrop-filter|background-color|--glass-opacity|filter:/)
})

test('disabled visual controls keep showing their saved draft values', () => {
  for (const key of ['backgroundBlur', 'glassOpacity', 'glassBlur']) {
    assert.ok(settings.includes(`v-model.number="draft.${key}" :disabled="limitedVisuals"`))
    assert.ok(settings.includes(`<output>{{ draft.${key} }}`))
  }
  assert.doesNotMatch(settings, /visualRange|(?:backgroundBlur|glassOpacity|glassBlur)Setting/)
})
