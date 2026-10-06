import assert from 'node:assert/strict'
import { after, test } from 'node:test'
import { File } from 'node:buffer'
import { mkdtemp, mkdir, readFile, writeFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import ts from 'typescript'

const dir = await mkdtemp(join(tmpdir(), 'memori-record-test-'))
await mkdir(join(dir, 'data'))
await mkdir(join(dir, 'composables'))
for (const name of ['data/types', 'data/settings', 'data/location', 'data/photos', 'composables/useMemoryLocation']) {
  const source = await readFile(`src/${name}.ts`, 'utf8')
  const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } }).outputText
    .replace(/from '([.][^']+)'/g, "from '$1.mjs'")
    .replace(/from '(vue|exifr)'/g, (_, pkg) => `from '${import.meta.resolve(pkg)}'`)
  await writeFile(join(dir, `${name}.mjs`), compiled)
}
after(() => rm(dir, { recursive: true, force: true }))
const { DEFAULT_SETTINGS } = await import(pathToFileURL(join(dir, 'data/types.mjs')))
const { normalizeSettings } = await import(pathToFileURL(join(dir, 'data/settings.mjs')))
const { thumbnailDimensions, preparePhoto } = await import(pathToFileURL(join(dir, 'data/photos.mjs')))
const { useMemoryLocation } = await import(pathToFileURL(join(dir, 'composables/useMemoryLocation.mjs')))

test('legacy photo settings migrate without losing the old original/compression choice', () => {
  assert.equal(normalizeSettings().compressPhotos, false)
  assert.equal(normalizeSettings(null).compressionQuality, 'balanced')
  const legacy = { preserveOriginal: false, imageQuality: 60, maxImageDimension: 2400, locationEnabled: false, preferExifLocation: true, currentLocationFallback: true, glassOpacity: 40 }
  const result = normalizeSettings(legacy)
  assert.equal(result.compressPhotos, true)
  assert.equal(result.compressionQuality, 'compact')
  assert.equal(result.glassOpacity, 40)
  for (const key of ['preserveOriginal', 'imageQuality', 'maxImageDimension', 'locationEnabled', 'preferExifLocation', 'currentLocationFallback']) assert.equal(key in result, false)
  assert.equal(normalizeSettings({ preserveOriginal: true, imageQuality: 95 }).compressPhotos, false)
  assert.equal(normalizeSettings({ imageQuality: 95 }).compressionQuality, 'clear')
  assert.equal(normalizeSettings({ compressPhotos: false, preserveOriginal: false, compressionQuality: 'clear', imageQuality: 50 }).compressionQuality, 'clear')
  assert.equal(normalizeSettings({ compressPhotos: false, preserveOriginal: false }).compressPhotos, false)
})

test('thumbnail resolution follows visible area and pixel density without upscaling', () => {
  assert.deepEqual(thumbnailDimensions(4000, 3000, { width: 320, height: 640, pixelRatio: 2 }), { width: 1280, height: 960 })
  assert.deepEqual(thumbnailDimensions(4000, 3000, { width: 400, height: 700, pixelRatio: 1 }), { width: 700, height: 525 })
  assert.deepEqual(thumbnailDimensions(200, 100, { width: 400, height: 700, pixelRatio: 3 }), { width: 200, height: 100 })
})

test('disabled compression preserves file bytes; enabled presets encode the full photo separately', async () => {
  const calls = []
  let closed = 0
  globalThis.createImageBitmap = async () => ({ width: 4000, height: 3000, close() { closed++ } })
  globalThis.document = { createElement() {
    return {
      width: 0, height: 0, getContext: () => ({ drawImage() {} }),
      toBlob(callback, type, quality) {
        calls.push({ width: this.width, height: this.height, quality })
        callback(new Blob([new Uint8Array(this.width === 4000 ? 100 + Math.round(quality * 100) : 30)], { type }))
      },
    }
  } }
  const file = new File([new Uint8Array(1024).fill(7)], 'test.jpg', { type: 'image/jpeg' })
  const display = { width: 320, height: 640, pixelRatio: 2 }
  const original = await preparePhoto(file, { ...DEFAULT_SETTINGS, readExif: false }, display)
  assert.deepEqual(await original.original.arrayBuffer(), await file.arrayBuffer())
  assert.equal(original.width, 4000)
  assert.equal(original.height, 3000)
  assert.deepEqual(calls, [{ width: 1280, height: 960, quality: .82 }])
  for (const [preset, quality] of [['compact', .65], ['balanced', .82], ['clear', .92]]) {
    calls.length = 0
    const result = await preparePhoto(file, { ...DEFAULT_SETTINGS, compressPhotos: true, compressionQuality: preset, readExif: false }, display)
    assert.equal(result.original.type, 'image/webp')
    assert.ok(result.original.size < file.size)
    assert.deepEqual(calls, [{ width: 1280, height: 960, quality }, { width: 4000, height: 3000, quality }])
  }
  assert.equal(closed, 4)
})

const current = { latitude: 10, longitude: 20, source: 'current', accuracy: 5 }
const photo = { latitude: 31.25, longitude: 121.5 }

test('new entries default to current GPS; turning it off selects only photo EXIF', async () => {
  const state = useMemoryLocation(undefined, async () => current)
  assert.equal(state.recordCurrentLocation.value, true)
  state.setPhotoLocation(photo)
  await state.setRecordCurrentLocation(true)
  assert.deepEqual(state.location.value, current)
  assert.equal(state.locationStatus.value, '已记录当前位置')
  await state.setRecordCurrentLocation(false)
  assert.deepEqual(state.location.value, { ...photo, source: 'exif' })
  assert.equal(state.locationStatus.value, '正在使用照片位置')
  state.setPhotoLocation(undefined)
  assert.equal(state.location.value, undefined)
  assert.equal(state.locationStatus.value, '记录中将不包含位置信息')
})

test('late GPS responses cannot overwrite a disabled current-location choice', async () => {
  let complete
  const state = useMemoryLocation(undefined, () => new Promise(resolve => { complete = resolve }))
  const pending = state.setRecordCurrentLocation(true)
  state.setPhotoLocation(photo)
  await state.setRecordCurrentLocation(false)
  complete(current)
  await pending
  assert.equal(state.locationBusy.value, false)
  assert.deepEqual(state.location.value, { ...photo, source: 'exif' })
  state.setPhotoLocation(undefined)
  assert.equal(state.location.value, undefined)
})

test('editing keeps saved GPS and can switch to stored photo metadata after compression', async () => {
  let calls = 0
  const entry = { id: 'edit', createdAt: 1, updatedAt: 1, location: current, photo: { id: 'photo', exifLocation: photo } }
  const state = useMemoryLocation(entry, async () => { calls++; return current })
  state.start()
  assert.equal(calls, 0)
  assert.deepEqual(state.location.value, current)
  await state.setRecordCurrentLocation(false)
  assert.deepEqual(state.location.value, { ...photo, source: 'exif' })
  const empty = useMemoryLocation({ id: 'empty', createdAt: 1, updatedAt: 1 })
  assert.equal(empty.recordCurrentLocation.value, false)
  assert.equal(empty.location.value, undefined)
})

test('failed GPS does not silently replace a current-location choice with photo GPS', async () => {
  const state = useMemoryLocation(undefined, async () => { throw new Error('denied') })
  state.setPhotoLocation(photo)
  await state.setRecordCurrentLocation(true)
  assert.equal(state.location.value, undefined)
  assert.equal(state.locationBusy.value, false)
  assert.match(state.locationStatus.value, /记录中将不包含位置信息/)
})

test('disposing during a GPS request prevents late coordinate updates', async () => {
  let complete
  const state = useMemoryLocation(undefined, () => new Promise(resolve => { complete = resolve }))
  const pending = state.setRecordCurrentLocation(true)
  state.dispose()
  complete(current)
  await pending
  assert.equal(state.location.value, undefined)
})

test('settings disable overridden visuals and compression presets without exposing old policies', async () => {
  const source = await readFile('src/components/SettingsView.vue', 'utf8')
  for (const field of ['backgroundBlur', 'glassOpacity', 'glassBlur']) {
    assert.match(source, new RegExp(`v-model.number="draft\\.${field}" :disabled="limitedVisuals"`))
    assert.ok(source.includes(`<output>{{ draft.${field} }}`))
  }
  assert.doesNotMatch(source, /visualRange|(?:backgroundBlur|glassOpacity|glassBlur)Setting/)
  assert.match(source, /draft\.value\.performanceMode \|\| props\.reducedTransparency/)
  assert.equal(source.match(/:disabled="!draft\.compressPhotos"/g)?.length, 3)
  assert.doesNotMatch(source, /draft\.(?:preserveOriginal|imageQuality|maxImageDimension|locationEnabled|preferExifLocation|currentLocationFallback|showCoordinates)/)
})

test('text-only cards have no photo placeholder or invented place name', async () => {
  const source = await readFile('src/components/MemoryCard.vue', 'utf8')
  assert.match(source, /v-else-if="entry.photo" class="memory-card__no-photo"/)
  assert.match(source, /v-if="displayPlace" class="memory-card__place"/)
  assert.match(source, /props\.entry\.placeLabel\?\.trim\(\) \|\| \(props\.entry\.location \? '请在地图页面查看' : ''\)/)
})
