<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import MemoryCard from './components/MemoryCard.vue'
import MemoryComposer from './components/MemoryComposer.vue'
import MapView from './components/MapView.vue'
import SettingsView from './components/SettingsView.vue'
import { deleteMemory, deletePhotoIfUnused, getEntriesPage, getPhoto, getSettings, saveMemory, saveSettings, saveStoredPhoto } from './data/database'
import { downloadBlob } from './data/export'
import type { AppSettings, MemoryEntry, StoredPhoto } from './data/types'

type ViewName = 'wall' | 'map' | 'settings'
const view = ref<ViewName>('wall')
const mapMounted = ref(false)
const entries = ref<MemoryEntry[]>([])
const settings = ref<AppSettings>()
const ready = ref(false)
const composerOpen = ref(false)
const editingId = ref<string>()
const wallScroller = ref<HTMLElement>()
const historySentinel = ref<HTMLElement>()
const loadingOlder = ref(false)
const hasOlder = ref(true)
const notice = ref('')
const wallpaperUrl = ref('')
let observer: IntersectionObserver | undefined
let didSetInitialPosition = false
let wallpaperObjectUrl = ''

const visibleEntries = computed(() => entries.value)
const monthGroups = computed(() => {
  const groups: Array<{ key: string; label: string; entries: MemoryEntry[] }> = []
  for (const entry of visibleEntries.value) {
    const date = new Date(entry.createdAt)
    const key = `${date.getFullYear()}-${date.getMonth()}`
    let group = groups[groups.length - 1]
    if (!group || group.key !== key) {
      group = { key, label: new Intl.DateTimeFormat('zh-CN', { year: '2-digit', month: '2-digit' }).format(date).replace('/', ' / '), entries: [] }
      groups.push(group)
    }
    group.entries.push(entry)
  }
  if (!groups.length) {
    const date = new Date()
    groups.push({ key: 'now', label: new Intl.DateTimeFormat('zh-CN', { year: '2-digit', month: '2-digit' }).format(date).replace('/', ' / '), entries: [] })
  }
  return groups
})

const wallStyle = computed(() => ({
  '--glass-opacity': `${(settings.value?.glassOpacity ?? 69) / 100}`,
  '--glass-blur': `${settings.value?.glassBlur ?? 18}px`,
  '--card-radius': `${settings.value?.cornerRadius ?? 24}px`,
  '--background-dim': `${(settings.value?.backgroundDim ?? 8) / 100}`,
  '--background-blur': `${settings.value?.backgroundBlur ?? 0}px`,
}))

watch(() => settings.value?.backgroundPhotoId, async (id) => {
  if (wallpaperObjectUrl) URL.revokeObjectURL(wallpaperObjectUrl)
  wallpaperObjectUrl = ''
  wallpaperUrl.value = ''
  if (!id) return
  const photo = await getPhoto(id)
  if (!photo || settings.value?.backgroundPhotoId !== id) return
  wallpaperObjectUrl = URL.createObjectURL(photo.thumbnail)
  wallpaperUrl.value = wallpaperObjectUrl
})

watch(view, (current) => {
  if (current === 'map') mapMounted.value = true
})

onBeforeUnmount(() => {
  observer?.disconnect()
  if (wallpaperObjectUrl) URL.revokeObjectURL(wallpaperObjectUrl)
})

onMounted(async () => {
  try {
    const [page, savedSettings] = await Promise.all([getEntriesPage(undefined, 40), getSettings()])
    entries.value = page
    settings.value = savedSettings
    hasOlder.value = page.length === 40
    ready.value = true
    await nextTick()
    if (!didSetInitialPosition && wallScroller.value) {
      wallScroller.value.scrollTop = wallScroller.value.scrollHeight
      didSetInitialPosition = true
    }
    observer = new IntersectionObserver((changes) => {
      if (changes.some((item) => item.isIntersecting)) void loadOlder()
    }, { root: wallScroller.value, rootMargin: '400px 0px 0px' })
    if (historySentinel.value) observer.observe(historySentinel.value)
  } catch (error) {
    notice.value = error instanceof Error ? error.message : '无法读取本地记忆'
    ready.value = true
  }
})

async function loadOlder() {
  if (loadingOlder.value || !hasOlder.value || !entries.value.length) return
  loadingOlder.value = true
  const scroller = wallScroller.value
  const beforeHeight = scroller?.scrollHeight ?? 0
  const beforeTop = scroller?.scrollTop ?? 0
  try {
    const page = await getEntriesPage(entries.value[0].createdAt, 40)
    if (page.length) {
      entries.value = [...page, ...entries.value]
      await nextTick()
      if (scroller) scroller.scrollTop = beforeTop + (scroller.scrollHeight - beforeHeight)
    }
    hasOlder.value = page.length === 40
  } catch {
    notice.value = '暂时无法载入更早的记忆。'
  } finally {
    loadingOlder.value = false
  }
}

async function saveEntry(entry: MemoryEntry, photo?: StoredPhoto) {
  try {
    await saveMemory(entry, photo)
    const existing = entries.value.findIndex((item) => item.id === entry.id)
    if (existing >= 0) entries.value.splice(existing, 1, entry)
    else entries.value.push(entry)
    editingId.value = undefined
    composerOpen.value = false
    notice.value = '这段记忆，已经好好收下了。'
    window.setTimeout(() => { notice.value = '' }, 2600)
  } catch (error) {
    notice.value = error instanceof Error ? error.message : '保存失败，请稍后重试。'
  }
}

async function removeEntry(id: string) {
  try {
    await deleteMemory(id)
    entries.value = entries.value.filter((entry) => entry.id !== id)
    if (editingId.value === id) editingId.value = undefined
    notice.value = '这段记忆已移除。'
  } catch {
    notice.value = '删除失败，请稍后重试。'
  }
}

async function toggleFavorite(entry: MemoryEntry) {
  const updated = { ...entry, favorite: !entry.favorite, updatedAt: Date.now() }
  await saveEntry(updated)
}

async function updateSettings(updated: AppSettings) {
  const previousBackground = settings.value?.backgroundPhotoId
  try {
    await saveSettings(updated)
    settings.value = updated
    if (previousBackground && previousBackground !== updated.backgroundPhotoId) {
      await deletePhotoIfUnused(previousBackground)
    }
  } catch {
    notice.value = '设置暂时无法保存，请稍后重试。'
  }
}

async function updateBackground(photo: StoredPhoto) {
  try {
    await saveStoredPhoto(photo)
    await updateSettings({ ...settings.value!, backgroundPhotoId: photo.id })
  } catch {
    notice.value = '无法保存背景图片。'
  }
}

function afterRestore(count: number) {
  notice.value = `已从备份恢复 ${count} 段记忆，正在重新载入…`
  window.setTimeout(() => window.location.reload(), 900)
}

function editEntry(entry: MemoryEntry) {
  editingId.value = entry.id
  composerOpen.value = false
}

async function exportMemoryCard(entry: MemoryEntry) {
  const canvas = document.createElement('canvas')
  canvas.width = 1080
  canvas.height = 1350
  const context = canvas.getContext('2d')
  if (!context) return
  context.fillStyle = '#edf4f4'
  context.fillRect(0, 0, canvas.width, canvas.height)
  let textTop = 150
  if (entry.photo) {
    const photo = await getPhoto(entry.photo.id)
    if (photo) {
      const imageUrl = URL.createObjectURL(photo.thumbnail)
      const image = new Image()
      image.src = imageUrl
      await new Promise<void>((resolve) => { image.onload = () => resolve(); image.onerror = () => resolve() })
      const scale = Math.max(canvas.width / image.width, 850 / image.height)
      const width = image.width * scale
      const height = image.height * scale
      context.save()
      roundedRect(context, 76, 76, 928, 850, 36)
      context.clip()
      context.drawImage(image, 76 + (928 - width) / 2, 76 + (850 - height) / 2, width, height)
      context.restore()
      URL.revokeObjectURL(imageUrl)
      textTop = 1000
    }
  }
  context.fillStyle = '#385762'
  context.font = '500 28px sans-serif'
  context.fillText(new Intl.DateTimeFormat('zh-CN', { dateStyle: 'long' }).format(entry.createdAt), 84, textTop)
  textTop += 68
  context.fillStyle = '#263f48'
  context.font = '600 48px sans-serif'
  if (entry.placeLabel) { context.fillText(entry.placeLabel, 84, textTop); textTop += 72 }
  context.font = '400 36px sans-serif'
  const body = entry.text ?? '把这一刻，留给以后的自己。'
  for (const line of wrapText(context, body, 910)) {
    context.fillText(line, 84, textTop)
    textTop += 54
    if (textTop > 1200) break
  }
  context.fillStyle = '#839aa0'
  context.font = '500 25px sans-serif'
  context.fillText('MEMORI  ·  一段生活记忆', 84, 1280)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (blob) downloadBlob(blob, `memori-${new Date(entry.createdAt).toISOString().slice(0, 10)}.png`)
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, width: number, height: number, radius: number) {
  ctx.beginPath()
  ctx.roundRect(x, y, width, height, radius)
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const output: string[] = []
  let line = ''
  for (const char of text) {
    if (ctx.measureText(line + char).width > maxWidth && line) { output.push(line); line = char }
    else line += char
  }
  if (line) output.push(line)
  return output
}

function cardStyle(index: number) {
  return { '--card-order': index }
}
</script>

<template>
  <div class="app-frame" :class="{ 'has-wallpaper': wallpaperUrl }" :data-theme="settings?.theme ?? 'light'" :style="wallStyle">
    <div v-if="wallpaperUrl" class="wallpaper-layer" :style="{ backgroundImage: `linear-gradient(rgb(237 244 244 / var(--background-dim)), rgb(237 244 244 / var(--background-dim))), url(${wallpaperUrl})` }" aria-hidden="true"></div>
    <header class="app-header">
      <a class="brand" href="#wall" @click.prevent="view = 'wall'">
        <span class="brand-mark">m</span>
        <span><strong>memori</strong><small>life, softly remembered</small></span>
      </a>
      <nav class="main-nav" aria-label="主要导航">
        <button :class="{ active: view === 'wall' }" @click="view = 'wall'">记忆墙</button>
        <button :class="{ active: view === 'map' }" @click="view = 'map'">记忆地图</button>
        <button :class="{ active: view === 'settings' }" @click="view = 'settings'">设置</button>
      </nav>
      <div class="header-side"><span class="local-status"><i></i> 仅保存在此设备</span><button class="avatar-button" aria-label="打开设置" @click="view = 'settings'">☼</button></div>
    </header>

    <main v-show="view === 'wall'" class="wall-view">
      <div class="wall-intro">
        <div>
          <p class="eyebrow">YOUR DAYS, GENTLY GATHERED</p>
          <h1>日子有痕，<em>记忆有处。</em></h1>
          <p class="intro-copy">每个时刻都值得被轻轻收好。</p>
        </div>
        <div class="today-note"><span class="today-sparkle">✳</span><span><small>今天</small><strong>{{ new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(Date.now()) }}</strong></span></div>
      </div>

      <div ref="wallScroller" class="wall-scroller">
        <div ref="historySentinel" class="history-sentinel" aria-hidden="true"></div>
        <div v-if="loadingOlder" class="history-loading">正在把更早的日子翻出来…</div>
        <template v-for="(group, groupIndex) in monthGroups" :key="group.key">
          <section class="month-group">
            <div class="month-divider"><span class="month-badge">{{ group.label }}</span><span class="month-line"></span><span class="month-count">{{ group.entries.length ? `${group.entries.length} 段记忆` : '从这里开始' }}</span></div>
            <div class="memory-grid">
              <template v-for="(entry, index) in group.entries" :key="entry.id">
                <MemoryComposer
                  v-if="editingId === entry.id"
                  :settings="settings!"
                  :existing="entry"
                  class="grid-card"
                  @save="saveEntry"
                  @cancel="editingId = undefined"
                />
                <MemoryCard
                  v-else
                  :entry="entry"
                  class="grid-card"
                  :style="cardStyle(index)"
                  @edit="editEntry"
                  @remove="removeEntry"
                  @favorite="toggleFavorite"
                  @share="exportMemoryCard"
                />
              </template>
              <MemoryComposer
                v-if="groupIndex === monthGroups.length - 1 && composerOpen && settings"
                class="grid-card"
                :settings="settings"
                @save="saveEntry"
                @cancel="composerOpen = false"
              />
              <button
                v-else-if="groupIndex === monthGroups.length - 1 && !editingId"
                class="new-memory-card glass-card grid-card"
                type="button"
                @click="composerOpen = true"
              >
                <span class="new-memory-plus">+</span>
                <strong>留下一段记忆</strong>
                <small>此刻，或任何你想记住的时刻</small>
              </button>
            </div>
          </section>
        </template>
        <div v-if="!ready" class="wall-loading"><span class="loading-orbit"></span>正在拾起你的记忆…</div>
        <div v-else-if="!entries.length" class="empty-note">这里还很安静。<br />给生活留一个柔软的开始吧。</div>
        <footer class="wall-endnote"><span>✳</span> 慢慢生活，慢慢记起 <span>✳</span></footer>
      </div>
    </main>

    <MapView v-if="mapMounted && settings" v-show="view === 'map'" :settings="settings" />
    <SettingsView v-if="view === 'settings' && settings" :settings="settings" @change="updateSettings" @background="updateBackground" @restored="afterRestore" />

    <footer class="app-footer"><span>Made for the moments you want to keep</span><span>你的生活，只在你的设备里。</span></footer>
    <Transition name="toast"><div v-if="notice" class="toast-message">{{ notice }}</div></Transition>
    <div v-if="notice && !ready" class="startup-error">{{ notice }}</div>
    <nav class="mobile-nav" aria-label="底部导航">
      <button :class="{ active: view === 'wall' }" @click="view = 'wall'"><span>▦</span>记忆墙</button>
      <button :class="{ active: view === 'map' }" @click="view = 'map'"><span>⌖</span>地图</button>
      <button :class="{ active: view === 'settings' }" @click="view = 'settings'"><span>☼</span>设置</button>
    </nav>
  </div>
</template>
