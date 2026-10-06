<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getAllEntries, getPhoto } from '../data/database'
import { downloadBlob, exportBackup, importBackup } from '../data/export'
import { createId } from '../data/id'
import { checkForUpdates as requestUpdateCheck } from '../pwa'
import type { AppSettings, StoredPhoto } from '../data/types'
import IconGlyph from './IconGlyph.vue'
import appPackage from '../../package.json'
import { mapSettings, saveMapSettings, validateMapSettings } from '../map/settings'
import { AmapProvider } from '../map/amap-provider'
import { MAP_LOAD_ERROR } from '../map/amap-loader'

const props = defineProps<{ settings: AppSettings }>()
const emit = defineEmits<{
  change: [settings: AppSettings]
  background: [photo: StoredPhoto]
  restored: [count: number]
}>()
const draft = ref<AppSettings>({ ...props.settings })
const mapDraft = ref({ ...mapSettings.value })
const showMapKey = ref(false)
const showSecurityCode = ref(false)
const testingMap = ref(false)
const mapFeedback = ref('')
let settingsDisposed = false

watch(mapDraft, () => { mapFeedback.value = '' }, { deep: true, flush: 'sync' })

function persistMap(): boolean {
  try {
    saveMapSettings(mapDraft.value)
    mapDraft.value = { ...mapSettings.value }
    mapFeedback.value = '地图配置已保存在本机，地图将使用新配置重新初始化。'
    return true
  } catch {
    mapFeedback.value = '无法保存地图配置，请检查浏览器是否允许本地存储。'
    return false
  }
}

async function testMap() {
  if (testingMap.value) return
  try { validateMapSettings(mapDraft.value) }
  catch (error) { mapFeedback.value = (error as Error).message; return }
  if (!persistMap()) return
  testingMap.value = true
  mapFeedback.value = '正在测试地图加载…'
  const container = document.createElement('div')
  container.style.cssText = 'position:fixed;left:-10000px;top:0;width:256px;height:256px;'
  container.setAttribute('aria-hidden', 'true')
  document.body.appendChild(container)
  let testProvider: AmapProvider | undefined
  try {
    testProvider = await AmapProvider.create(container, { selectMemory: () => {}, selectCluster: () => {} }, { ...mapSettings.value })
    if (!settingsDisposed) mapFeedback.value = '测试成功：地图已加载。实际服务权限与配额以高德控制台为准。'
  } catch {
    if (!settingsDisposed) mapFeedback.value = MAP_LOAD_ERROR
  } finally {
    testProvider?.destroy()
    container.remove()
    testingMap.value = false
  }
}
const backgroundPicker = ref<HTMLInputElement>()
const restorePicker = ref<HTMLInputElement>()
const backgroundUrl = ref('')
const backgroundAspectRatio = ref(currentScreenAspectRatio())
const storageUsage = ref<{ usage?: number; quota?: number }>({})
const entryCount = ref(0)
const busy = ref('')
const feedback = ref('')
const updateMessage = ref('')
const isCheckingUpdate = ref(false)
const toastMessage = computed(() => busy.value || feedback.value)
const restoreArmed = ref(false)
let backgroundObjectUrl = ''
let feedbackTimer = 0
let updateTimer = 0

watch(() => props.settings, (settings) => {
  draft.value = { ...settings }
  void loadBackground()
}, { deep: true })

const usageText = computed(() => {
  if (storageUsage.value.usage === undefined) return '浏览器暂不提供存储占用信息'
  return `${formatBytes(storageUsage.value.usage)}${storageUsage.value.quota ? ` / ${formatBytes(storageUsage.value.quota)}` : ''}`
})

onMounted(async () => {
  window.addEventListener('resize', updateBackgroundAspectRatio)
  await refreshUsage()
  await loadBackground()
})
onBeforeUnmount(() => {
  settingsDisposed = true
  window.removeEventListener('resize', updateBackgroundAspectRatio)
  if (backgroundObjectUrl) URL.revokeObjectURL(backgroundObjectUrl)
  if (feedbackTimer) window.clearTimeout(feedbackTimer)
  if (updateTimer) window.clearTimeout(updateTimer)
})

function showFeedback(message: string) {
  feedback.value = message
  if (feedbackTimer) window.clearTimeout(feedbackTimer)
  feedbackTimer = window.setTimeout(() => { feedback.value = '' }, 2400)
}

async function refreshUsage() {
  try {
    const [estimate, entries] = await Promise.all([navigator.storage?.estimate?.() ?? Promise.resolve({}), getAllEntries()])
    storageUsage.value = estimate
    entryCount.value = entries.length
  } catch { /* Local storage may be unavailable in a restricted browser context. */ }
}

async function loadBackground() {
  if (backgroundObjectUrl) URL.revokeObjectURL(backgroundObjectUrl)
  backgroundObjectUrl = ''
  backgroundUrl.value = ''
  const id = draft.value.backgroundPhotoId
  if (!id) return
  const photo = await getPhoto(id)
  if (!photo) return
  backgroundObjectUrl = URL.createObjectURL(photo.thumbnail)
  backgroundUrl.value = backgroundObjectUrl
}

function persist() {
  const updated = { ...draft.value }
  emit('change', updated)
  showFeedback('设置已保存')
}

async function chooseBackground(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  busy.value = '正在准备背景图片…'
  try {
    const mimeType = imageMimeType(file)
    const originalFile = file.type === mimeType ? file : file.slice(0, file.size, mimeType)
    const photo: StoredPhoto = {
      id: createId(),
      thumbnail: originalFile,
      mimeType,
      fileName: file.name,
      width: 0,
      height: 0,
      createdAt: Date.now(),
    }
    draft.value.backgroundPhotoId = photo.id
    emit('background', photo)
    busy.value = ''
    showFeedback('背景图片已更新')
  } catch (error) {
    busy.value = ''
    showFeedback(error instanceof Error ? error.message : '无法使用这张图片')
  } finally {
    if (backgroundPicker.value) backgroundPicker.value.value = ''
  }
}

function imageMimeType(file: File): string {
  if (file.type) return file.type
  const extension = file.name.split('.').pop()?.toLowerCase()
  const mimeTypes: Record<string, string> = {
    avif: 'image/avif', bmp: 'image/bmp', gif: 'image/gif', heic: 'image/heic', heif: 'image/heif',
    jpeg: 'image/jpeg', jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp',
  }
  return mimeTypes[extension ?? ''] ?? 'application/octet-stream'
}

function currentScreenAspectRatio(): string {
  const width = window.innerWidth || document.documentElement.clientWidth
  const height = window.innerHeight || document.documentElement.clientHeight
  if (!width || !height) return '9:16'
  const landscape = width > height
  const shortSide = Math.min(width, height)
  const longSide = Math.round((Math.max(width, height) / shortSide) * 9 * 2) / 2
  const longLabel = Number.isInteger(longSide) ? `${longSide}` : longSide.toFixed(1)
  return landscape ? `${longLabel}:9` : `9:${longLabel}`
}

function updateBackgroundAspectRatio() {
  backgroundAspectRatio.value = currentScreenAspectRatio()
}

async function checkForUpdates(): Promise<void> {
  if (isCheckingUpdate.value) return
  isCheckingUpdate.value = true
  updateMessage.value = '正在检查更新…'
  try {
    await requestUpdateCheck()
    updateMessage.value = `已检查，当前已是最新版本 v${appPackage.version}`
  } catch (error) {
    updateMessage.value = error instanceof Error ? error.message : '检查更新失败，请稍后重试'
  } finally {
    isCheckingUpdate.value = false
    if (updateTimer) window.clearTimeout(updateTimer)
    updateTimer = window.setTimeout(() => {
      if (!isCheckingUpdate.value) updateMessage.value = ''
      updateTimer = 0
    }, 3500)
  }
}

function clearBackground() {
  draft.value.backgroundPhotoId = undefined
  persist()
}

async function exportData() {
  busy.value = '正在整理你的记忆…'
  try {
    const blob = await exportBackup()
    downloadBlob(blob, `memori-backup-${new Date().toISOString().slice(0, 10)}.zip`)
    showFeedback('备份已准备好，包含记录与照片。')
  } catch (error) {
    showFeedback(error instanceof Error ? error.message : '导出失败，请稍后重试。')
  } finally { busy.value = '' }
}

async function restoreData(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  busy.value = '正在恢复本地备份…'
  try {
    const count = await importBackup(file)
    emit('restored', count)
  } catch (error) {
    showFeedback(error instanceof Error ? error.message : '无法恢复这个备份。')
  } finally {
    busy.value = ''
    if (restorePicker.value) restorePicker.value.value = ''
  }
}

function confirmRestore() {
  if (busy.value) return
  restoreArmed.value = !restoreArmed.value
}

function formatBytes(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<template>
  <div class="settings-shell">
    <main class="settings-view native-edge-scroller">
      <div class="settings-edge settings-edge--top native-edge-panel" aria-hidden="true">
        <div class="settings-heading">
          <div><p class="eyebrow">A LITTLE SPACE OF YOUR OWN</p><h1>让这里更像你。</h1><p>安静地记录，也安心地保存。</p></div>
          <div class="settings-head-mark"><IconGlyph name="settings" :size="22" /></div>
        </div>
      </div>

      <div class="settings-content native-edge-content">
        <div class="native-edge-boundary native-edge-boundary--top" aria-hidden="true"></div>
        <section class="settings-section glass-card">
      <div class="settings-section-title"><span class="settings-icon"><IconGlyph name="sparkle" :size="17" /></span><div><h2>记忆墙的样子</h2><p>选一张喜欢的背景，调出柔和的质感。</p></div></div>
      <div class="setting-row setting-background-row">
        <div class="setting-copy"><strong>背景图片</strong><small class="background-ratio-hint">建议比例 {{ backgroundAspectRatio }}，图片边缘可能被裁切</small></div>
        <div class="background-actions">
          <div v-if="backgroundUrl" class="background-preview" :style="{ backgroundImage: `url(${backgroundUrl})` }"></div>
          <button class="soft-button" type="button" @click="backgroundPicker?.click()">{{ backgroundUrl ? '更换' : '选择图片' }}</button>
          <button v-if="backgroundUrl" class="text-button" type="button" @click="clearBackground">移除</button>
          <input ref="backgroundPicker" class="visually-hidden" type="file" accept="image/*" @change="chooseBackground" />
        </div>
      </div>
      <label class="setting-row range-row"><span class="setting-copy"><strong>背景柔和度</strong><small>让照片背景更轻盈</small></span><span class="range-control"><input v-model.number="draft.backgroundBlur" type="range" min="0" max="18" step="1" @change="persist" /><output>{{ draft.backgroundBlur }} px</output></span></label>
      <label class="setting-row range-row"><span class="setting-copy"><strong>背景明度</strong><small>调整背景上的柔光</small></span><span class="range-control"><input v-model.number="draft.backgroundDim" type="range" min="0" max="55" step="1" @change="persist" /><output>{{ draft.backgroundDim }}%</output></span></label>
      <label class="setting-row range-row"><span class="setting-copy"><strong>卡片透明度</strong><small>调节卡片与背景的融合感</small></span><span class="range-control"><input v-model.number="draft.glassOpacity" type="range" min="40" max="96" step="1" @change="persist" /><output>{{ draft.glassOpacity }}%</output></span></label>
      <label class="setting-row range-row"><span class="setting-copy"><strong>卡片模糊度</strong><small>调整卡片后的柔焦程度</small></span><span class="range-control"><input v-model.number="draft.glassBlur" type="range" min="0" max="32" step="1" @change="persist" /><output>{{ draft.glassBlur }} px</output></span></label>
      <label class="setting-row range-row"><span class="setting-copy"><strong>卡片圆角</strong><small>柔软或更利落一点</small></span><span class="range-control"><input v-model.number="draft.cornerRadius" type="range" min="14" max="34" step="1" @change="persist" /><output>{{ draft.cornerRadius }} px</output></span></label>
      <div class="setting-row"><span class="setting-copy"><strong>主题模式</strong><small>保持明亮，或跟随设备</small></span><div class="segmented-control"><button :class="{ selected: draft.theme === 'light' }" @click="draft.theme = 'light'; persist()">浅色</button><button :class="{ selected: draft.theme === 'system' }" @click="draft.theme = 'system'; persist()">跟随设备</button></div></div>
      <label class="setting-row"><span class="setting-copy"><strong>性能模式</strong><small>减少模糊和动态效果，在性能较弱的设备上提升流畅度</small></span><input class="toggle-input" v-model="draft.performanceMode" type="checkbox" @change="persist" /></label>
        </section>

        <section class="settings-section glass-card">
      <div class="settings-section-title"><span class="settings-icon"><IconGlyph name="image" :size="17" /></span><div><h2>照片与位置</h2><p>让照片和地点一起，帮你记起那一天。</p></div></div>
      <label class="setting-row range-row"><span class="setting-copy"><strong>照片压缩质量</strong><small>较低体积，更省本地空间</small></span><span class="range-control"><input v-model.number="draft.imageQuality" type="range" min="45" max="100" step="1" @change="persist" /><output>{{ draft.imageQuality }}%</output></span></label>
      <label class="setting-row range-row"><span class="setting-copy"><strong>照片最长边</strong><small>首页优先使用轻量缩略图</small></span><span class="range-control"><input v-model.number="draft.maxImageDimension" type="range" min="1200" max="4000" step="200" @change="persist" /><output>{{ draft.maxImageDimension }} px</output></span></label>
      <label class="setting-row"><span class="setting-copy"><strong>保留原始照片</strong><small>保留完整原图，但会占用更多空间</small></span><input class="toggle-input" v-model="draft.preserveOriginal" type="checkbox" @change="persist" /></label>
      <label class="setting-row"><span class="setting-copy"><strong>读取照片 EXIF 信息</strong><small>可用于拍摄时间与照片中的 GPS 位置</small></span><input class="toggle-input" v-model="draft.readExif" type="checkbox" @change="persist" /></label>
      <label class="setting-row"><span class="setting-copy"><strong>记录当前位置</strong><small>定位失败时，仍可以保存记忆</small></span><input class="toggle-input" v-model="draft.locationEnabled" type="checkbox" @change="persist" /></label>
      <label class="setting-row sub-setting"><span class="setting-copy"><strong>优先使用照片位置</strong><small>照片带有 GPS 时优先采用 EXIF</small></span><input class="toggle-input" v-model="draft.preferExifLocation" type="checkbox" @change="persist" /></label>
      <label class="setting-row sub-setting"><span class="setting-copy"><strong>照片无位置时使用当前定位</strong><small>只在允许记录位置时生效</small></span><input class="toggle-input" v-model="draft.currentLocationFallback" type="checkbox" @change="persist" /></label>
      <label class="setting-row"><span class="setting-copy"><strong>在界面显示精确坐标</strong><small>默认隐藏，不影响地图使用</small></span><input class="toggle-input" v-model="draft.showCoordinates" type="checkbox" @change="persist" /></label>
        </section>

        <section class="settings-section glass-card" id="map-service">
          <div class="settings-section-title"><span class="settings-icon"><IconGlyph name="map" :size="17" /></span><div><h2>地图服务</h2><p>使用你自己的高德 Web JS API 凭据（BYOK）。</p></div></div>
          <form autocomplete="off" @submit.prevent="persistMap">
            <div class="map-credential-row">
              <label for="amap-key">高德 Web Key</label>
              <div class="map-credential-input"><input id="amap-key" v-model="mapDraft.key" :type="showMapKey ? 'text' : 'password'" autocomplete="off" spellcheck="false" :disabled="testingMap" /><button class="soft-button" type="button" :aria-pressed="showMapKey" @click="showMapKey = !showMapKey">{{ showMapKey ? '隐藏' : '显示' }}</button></div>
            </div>
            <div class="map-credential-row">
              <label for="amap-security">securityJsCode</label>
              <div class="map-credential-input"><input id="amap-security" v-model="mapDraft.securityJsCode" :type="showSecurityCode ? 'text' : 'password'" autocomplete="off" spellcheck="false" :disabled="testingMap" /><button class="soft-button" type="button" :aria-pressed="showSecurityCode" @click="showSecurityCode = !showSecurityCode">{{ showSecurityCode ? '隐藏' : '显示' }}</button></div>
            </div>
            <div class="map-credential-row">
              <label for="amap-host">serviceHost（可选，优先使用代理）</label>
              <div class="map-credential-input"><input id="amap-host" v-model="mapDraft.serviceHost" type="url" placeholder="https://your-proxy.example.com/_AMapService" spellcheck="false" :disabled="testingMap" /></div>
            </div>
            <p class="backup-hint">配置仅保存在当前浏览器，不上传到 Memori，也不随记忆备份导出或恢复。测试和使用地图时，凭据会用于向高德或你配置的代理发起请求。</p>
            <p class="backup-hint">securityJsCode 是高德 Web JS API 安全校验密钥。直接使用时可在 DevTools 中看到；serviceHost 代理可隐藏该密钥。当前无需自行部署后端，未填代理时使用本地密钥。</p>
            <div class="backup-actions"><button class="soft-button primary-soft" type="submit" :disabled="testingMap">保存配置</button><button class="soft-button" type="button" :disabled="testingMap" @click="testMap">{{ testingMap ? '测试中…' : '测试配置' }}</button></div>
            <p v-if="mapFeedback" class="version-status" role="status" aria-live="polite">{{ mapFeedback }}</p>
          </form>
        </section>

        <section class="settings-section glass-card">
      <div class="settings-section-title"><span class="settings-icon"><IconGlyph name="database" :size="17" /></span><div><h2>你的数据</h2><p>记忆与照片都留在本地，不会上传到云端。你的记忆属于你，也只属于你。</p></div></div>
      <div class="storage-summary"><span class="storage-symbol"><IconGlyph name="archive" :size="16" /></span><span><strong>{{ entryCount }} 段记忆</strong><small>设备存储占用 · {{ usageText }}</small></span><button class="soft-button refresh-button" type="button" @click="refreshUsage">刷新</button></div>
      <div class="backup-actions"><button class="soft-button primary-soft" :disabled="!!busy" @click="exportData">导出全部记忆</button><button class="soft-button" :disabled="!!busy" @click="confirmRestore">从备份恢复</button><input ref="restorePicker" class="visually-hidden" type="file" accept=".zip,application/zip" @change="restoreData" /></div>
      <div v-if="restoreArmed" class="restore-confirm"><span>恢复会替换此设备上的记录和设置。</span><button class="text-button" @click="restoreArmed = false">取消</button><button class="soft-button" @click="restorePicker?.click()">选择备份文件</button></div>
      <p v-else class="backup-hint">备份包含 JSON 记录与相关照片。恢复操作会替换此设备上的现有数据。</p>
        </section>

        <section class="settings-section glass-card">
          <div class="settings-section-title">
            <span class="settings-icon"><IconGlyph name="sparkle" :size="17" /></span>
            <div><h2>版本</h2><p>当前版本 v{{ appPackage.version }}</p></div>
            <button class="soft-button" type="button" :disabled="isCheckingUpdate" @click="checkForUpdates">{{ isCheckingUpdate ? '检查中…' : '检查更新' }}</button>
          </div>
          <p v-if="updateMessage" class="version-status" role="status" aria-live="polite">{{ updateMessage }}</p>
        </section>

        <div class="native-edge-boundary native-edge-boundary--bottom" aria-hidden="true"></div>
      </div>
      <footer class="settings-edge settings-edge--bottom native-edge-panel" aria-hidden="true">
        <div class="settings-footer settings-section glass-card">
          <small>Made for the moments you want to keep</small>
          <p>把日常轻轻收好，让想起的时刻有处可寻。</p>
        </div>
      </footer>
    </main>
    <Transition name="settings-toast">
      <div v-if="toastMessage" class="settings-toast" role="status" aria-live="polite">{{ toastMessage }}</div>
    </Transition>
  </div>
</template>
