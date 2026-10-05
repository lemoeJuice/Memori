import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { test } from 'node:test'

const css = await readFile(new URL('../src/styles/base.css', import.meta.url), 'utf8')
const rule = (selector) => {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return css.match(new RegExp(`${escaped}\\s*\\{([^}]+)\\}`))?.[1] ?? ''
}

// These are structural guards. Actual snapping still needs browser tests.
test('native edge scrolling uses separate start/end targets, not an oversized start target', () => {
  assert.match(rule('.native-edge-scroller'), /scroll-snap-type:\s*y proximity/)
  assert.doesNotMatch(rule('.native-edge-content'), /scroll-snap-align/)
  assert.match(rule('.native-edge-content'), /min-height:\s*100%/)
  assert.match(rule('.native-edge-boundary--top'), /scroll-snap-align:\s*start/)
  assert.match(rule('.native-edge-boundary--bottom'), /scroll-snap-align:\s*end/)
  assert.match(rule('.native-edge-boundary'), /position:\s*absolute/)
})

test('reveal zone scales down with the scrollport to stay near its boundary target', () => {
  assert.match(rule('.native-edge-panel'), /height:\s*min\(152px, 20%\)/)
})

for (const path of ['../src/App.vue', '../src/components/SettingsView.vue']) {
  test(`${path} has two persistent boundary targets inside its content`, async () => {
    const source = await readFile(new URL(path, import.meta.url), 'utf8')
    const template = source.slice(source.indexOf('<template>'))
    const content = template.indexOf('native-edge-content')
    const top = template.indexOf('native-edge-boundary--top')
    const bottom = template.indexOf('native-edge-boundary--bottom')
    const footer = template.indexOf('<footer')
    assert.ok(content > 0 && top > content && bottom > top && footer > bottom)
    assert.equal(template.match(/native-edge-boundary--top/g)?.length, 1)
    assert.equal(template.match(/native-edge-boundary--bottom/g)?.length, 1)
    assert.doesNotMatch(source, /useEdgePull|@touchmove/)
  })
}
