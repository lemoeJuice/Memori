<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { getAllEntries, getPhoto } from '../data/database'
import { downloadBlob, exportBackup, importBackup } from '../data/export'
import { preparePhoto } from '../data/photos'
import { createId } from '../data/id'
import type { AppSettings, StoredPhoto } from '../data/types'
import IconGlyph from './IconGlyph.vue'

const props = defineProps<{ settings: AppSettings }>()
const emit = defineEmits<{
  change: [settings: AppSettings]
  background: [photo: StoredPhoto]
  restored: [count: number]
}>()
const draft = ref<AppSettings>({ ...props.settings })
const backgroundPicker = ref<HTMLInputElement>()
const restorePicker = ref<HTMLInputElement>()
const backgroundUrl = ref('')
const storageUsage = ref<{ usage?: number; quota?: number }>({})
const entryCount = ref(0)
const busy = ref('')
const feedback = ref('')
const restoreArmed = ref(false)
let backgroundObjectUrl = ''

watch(() => props.settings, (settings) => {
  draft.value = { ...settings }
  void loadBackground()
}, { deep: true })

const usageText = computed(() => {
  if (storageUsage.value.usage === undefined) return '浏览器暂不提供存储占用信息'
  return `${formatBytes(storageUsage.value.usage)}${storageUsage.value.quota ? ` / ${formatBytes(storageUsage.value.quota)}` : ''}`
})

onMounted(async () => {
  await refreshUsage()
  await loadBackground()
})
onBeforeUnmount(() => { if (backgroundObjectUrl) URL.revokeObjectURL(backgroundObjectUrl) })

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
  feedback.value = '设置已保存'
  window.setTimeout(() => { feedback.value = '' }, 1800)
}

async function chooseBackground(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0]
  if (!file) return
  busy.value = '正在准备背景图片…'
  try {
    const prepared = await preparePhoto(file, {
      ...draft.value,
      preserveOriginal: false,
      maxImageDimension: Math.min(draft.value.maxImageDimension, 1800),
      imageQuality: Math.min(draft.value.imageQuality, 76),
    })
    const photo: StoredPhoto = {
      id: createId(),
      thumbnail: prepared.thumbnail,
      original: prepared.original,
      mimeType: prepared.original?.type || prepared.thumbnail.type,
      fileName: file.name,
      width: prepared.width,
      height: prepared.height,
      createdAt: Date.now(),
    }
    draft.value.backgroundPhotoId = photo.id
    emit('background', photo)
    busy.value = ''
    feedback.value = '背景图片已更新'
  } catch (error) {
    busy.value = ''
    feedback.value = error instanceof Error ? error.message : '无法使用这张图片'
  } finally {
    if (backgroundPicker.value) backgroundPicker.value.value = ''
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
    feedback.value = '备份已准备好，包含记录与照片。'
  } catch (error) {
    feedback.value = error instanceof Error ? error.message : '导出失败，请稍后重试。'
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
    feedback.value = error instanceof Error ? error.message : '无法恢复这个备份。'
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
  <main class="settings-view">
    <div class="settings-heading">
      <div><p class="eyebrow">A LITTLE SPACE OF YOUR OWN</p><h1>让这里更像你。</h1><p>安静地记录，也安心地保存。</p></div>
      <div class="settings-head-mark"><IconGlyph name="settings" :size="22" /></div>
    </div>

    <section class="settings-section glass-card">
      <div class="settings-section-title"><span class="settings-icon"><IconGlyph name="sparkle" :size="17" /></span><div><h2>记忆墙的样子</h2><p>选一张喜欢的背景，调出柔和的质感。</p></div></div>
      <div class="setting-row setting-background-row">
        <div class="setting-copy"><strong>背景图片</strong><small>只保存在此设备</small></div>
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
      <label class="setting-row range-row"><span class="setting-copy"><strong>卡片背景模糊</strong><small>调整卡片后的柔焦程度</small></span><span class="range-control"><input v-model.number="draft.glassBlur" type="range" min="0" max="32" step="1" @change="persist" /><output>{{ draft.glassBlur }} px</output></span></label>
      <label class="setting-row range-row"><span class="setting-copy"><strong>卡片圆角</strong><small>柔软或更利落一点</small></span><span class="range-control"><input v-model.number="draft.cornerRadius" type="range" min="14" max="34" step="1" @change="persist" /><output>{{ draft.cornerRadius }} px</output></span></label>
      <div class="setting-row"><span class="setting-copy"><strong>主题模式</strong><small>保持明亮，或跟随设备</small></span><div class="segmented-control"><button :class="{ selected: draft.theme === 'light' }" @click="draft.theme = 'light'; persist()">浅色</button><button :class="{ selected: draft.theme === 'system' }" @click="draft.theme = 'system'; persist()">跟随设备</button></div></div>
    </section>

    <section class="settings-section glass-card">
      <div class="settings-section-title"><span class="settings-icon"><IconGlyph name="image" :size="17" /></span><div><h2>照片与位置</h2><p>让照片和地点一起，帮你记起那一天。</p></div></div>
      <label class="setting-row range-row"><span class="setting-copy"><strong>照片压缩质量</strong><small>较低体积，更省本地空间</small></span><span class="range-control"><input v-model.number="draft.imageQuality" type="range" min="45" max="100" step="1" @change="persist" /><output>{{ draft.imageQuality }}%</output></span></label>
      <label class="setting-row range-row"><span class="setting-copy"><strong>照片最长边</strong><small>首页优先使用轻量缩略图</small></span><span class="range-control"><input v-model.number="draft.maxImageDimension" type="range" min="1200" max="4000" step="200" @change="persist" /><output>{{ draft.maxImageDimension }} px</output></span></label>
      <label class="setting-row"><span class="setting-copy"><strong>保留原始照片</strong><small>保留完整原图，可占用更多空间</small></span><input class="toggle-input" v-model="draft.preserveOriginal" type="checkbox" @change="persist" /></label>
      <label class="setting-row"><span class="setting-copy"><strong>读取照片 EXIF 信息</strong><small>可用于拍摄时间与照片中的 GPS 位置</small></span><input class="toggle-input" v-model="draft.readExif" type="checkbox" @change="persist" /></label>
      <label class="setting-row"><span class="setting-copy"><strong>记录当前位置</strong><small>定位失败时，仍可以保存记忆</small></span><input class="toggle-input" v-model="draft.locationEnabled" type="checkbox" @change="persist" /></label>
      <label class="setting-row sub-setting"><span class="setting-copy"><strong>优先使用照片位置</strong><small>照片带有 GPS 时优先采用 EXIF</small></span><input class="toggle-input" v-model="draft.preferExifLocation" type="checkbox" @change="persist" /></label>
      <label class="setting-row sub-setting"><span class="setting-copy"><strong>照片无位置时使用当前定位</strong><small>只在允许记录位置时生效</small></span><input class="toggle-input" v-model="draft.currentLocationFallback" type="checkbox" @change="persist" /></label>
      <label class="setting-row"><span class="setting-copy"><strong>在界面显示精确坐标</strong><small>默认隐藏，不影响地图使用</small></span><input class="toggle-input" v-model="draft.showCoordinates" type="checkbox" @change="persist" /></label>
    </section>

    <section class="settings-section glass-card">
      <div class="settings-section-title"><span class="settings-icon"><IconGlyph name="database" :size="17" /></span><div><h2>你的数据</h2><p>记忆与照片都留在本地，不会上传到云端。</p></div></div>
      <div class="settings-footer glass-card">
        <small>Made for the moments you want to keep</small>
        <p>把日常轻轻收好，让想起的时刻有处可寻。</p>
      </div>
      <div class="storage-summary"><span class="storage-symbol"><IconGlyph name="archive" :size="16" /></span><span><strong>{{ entryCount }} 段记忆</strong><small>设备存储占用 · {{ usageText }}</small></span><button class="text-button" type="button" @click="refreshUsage">刷新</button></div>
      <div class="backup-actions"><button class="soft-button primary-soft" :disabled="!!busy" @click="exportData">导出全部记忆</button><button class="soft-button" :disabled="!!busy" @click="confirmRestore">从备份恢复</button><input ref="restorePicker" class="visually-hidden" type="file" accept=".zip,application/zip" @change="restoreData" /></div>
      <div v-if="restoreArmed" class="restore-confirm"><span>恢复会替换此设备上的记录和设置。</span><button class="text-button" @click="restoreArmed = false">取消</button><button class="soft-button" @click="restorePicker?.click()">选择备份文件</button></div>
      <p v-else class="backup-hint">备份包含 JSON 记录与相关照片。恢复操作会替换此设备上的现有数据。</p>
    </section>

    <div class="settings-feedback" aria-live="polite">{{ busy || feedback }}</div>
  </main>
</template>
