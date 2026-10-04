<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from 'vue'
import { getAllEntries, getPhoto } from '../data/database'
import type { AppSettings, MemoryEntry } from '../data/types'
import IconGlyph from './IconGlyph.vue'
import { AmapProvider } from '../map/amap-provider'
import type { MapMemory, MapProvider } from '../map/map-provider'

const props = defineProps<{ settings: AppSettings }>()
const mapElement = ref<HTMLElement>()
const provider = shallowRef<MapProvider | null>(null)
const memories = ref<MapMemory[]>([])
const mapError = ref('')
const searchOpen = ref(false)
const searchText = ref('')
const searchInput = ref<HTMLInputElement>()
const selectedMemory = ref<MapMemory>()
const selectedCluster = ref<MapMemory[]>([])
const timelineMode = ref<'moment' | 'range'>('moment')
const selectedTime = ref(Date.now())
const rangeStart = ref(Date.now())
const rangeEnd = ref(Date.now())
const loading = ref(true)
const noLocationCount = ref(0)
const allEntries = computed(() => memories.value.map((memory) => memory.entry))
const photoUrls = new Map<string, string>()
const photoLoads = new Map<string, Promise<void>>()
let updateFrame = 0

const minTime = computed(() => Math.min(...allEntries.value.map((entry) => entry.createdAt), Date.now()))
const maxTime = computed(() => Math.max(...allEntries.value.map((entry) => entry.createdAt), minTime.value + 1))
const usableMaxTime = computed(() => Math.max(maxTime.value, minTime.value + 1))
const sortedMemories = computed(() => [...memories.value].sort((a, b) => a.entry.createdAt - b.entry.createdAt))
const localSearchResults = computed(() => {
  const query = searchText.value.trim().toLocaleLowerCase()
  if (!query) return []
  return sortedMemories.value.filter(({ entry }) => {
    const date = new Date(entry.createdAt)
    const haystack = [entry.placeLabel, entry.text, date.toLocaleDateString('zh-CN'), date.toISOString().slice(0, 10), date.toLocaleString('zh-CN')]
      .filter(Boolean).join(' ').toLocaleLowerCase()
    return haystack.includes(query)
  }).slice(0, 12)
})

const timeFiltered = computed(() => memories.value.filter(({ entry }) => {
  if (timelineMode.value === 'moment') {
    const day = 24 * 60 * 60 * 1000
    return Math.abs(entry.createdAt - selectedTime.value) <= day
  }
  return entry.createdAt >= Math.min(rangeStart.value, rangeEnd.value) && entry.createdAt <= Math.max(rangeStart.value, rangeEnd.value)
}))

const visibleMemories = computed(() => {
  const query = searchText.value.trim().toLocaleLowerCase()
  if (!query) return timeFiltered.value
  const ids = new Set(localSearchResults.value.map((memory) => memory.entry.id))
  return timeFiltered.value.filter((memory) => ids.has(memory.entry.id))
})

const timeLabel = computed(() => {
  const formatter = new Intl.DateTimeFormat('zh-CN', { year: 'numeric', month: 'short', day: 'numeric' })
  return timelineMode.value === 'moment'
    ? formatter.format(selectedTime.value)
    : `${formatter.format(Math.min(rangeStart.value, rangeEnd.value))} — ${formatter.format(Math.max(rangeStart.value, rangeEnd.value))}`
})
const minLabel = computed(() => new Intl.DateTimeFormat('zh-CN', { year: '2-digit', month: '2-digit' }).format(minTime.value))
const maxLabel = computed(() => new Intl.DateTimeFormat('zh-CN', { year: '2-digit', month: '2-digit' }).format(maxTime.value))
const locationlessMatches = computed(() => localSearchResults.value.filter(({ entry }) => !entry.location).length)

watch(visibleMemories, (items) => {
  if (updateFrame) cancelAnimationFrame(updateFrame)
  updateFrame = requestAnimationFrame(() => provider.value?.setMemories(items))
}, { deep: false })

watch([visibleMemories, localSearchResults], ([visible, results]) => {
  const current = [...visible.slice(-88), ...results]
  const missing = new Map(current.filter((memory) => memory.entry.photo && !memory.thumbnailUrl).map((memory) => [memory.entry.id, memory]))
  for (const memory of missing.values()) void loadThumbnail(memory)
}, { deep: false })

onMounted(async () => {
  try {
    const entries = await getAllEntries()
    noLocationCount.value = entries.filter((entry) => !entry.location).length
    memories.value = entries.map((entry) => ({ entry }))
    if (entries.length) {
      selectedTime.value = entries[entries.length - 1].createdAt
      rangeStart.value = entries[0].createdAt
      rangeEnd.value = entries[entries.length - 1].createdAt
    }
    loading.value = false
    await nextTick()
    await initializeMap()
  } catch {
    mapError.value = '无法读取本地记忆，请稍后重试。'
    loading.value = false
  }
})

onBeforeUnmount(() => {
  if (updateFrame) cancelAnimationFrame(updateFrame)
  provider.value?.destroy()
  photoUrls.forEach((url) => URL.revokeObjectURL(url))
  photoUrls.clear()
})

async function initializeMap() {
  if (!mapElement.value) return
  provider.value?.destroy()
  provider.value = null
  mapError.value = ''
  try {
    provider.value = await AmapProvider.create(mapElement.value, {
      selectMemory: openMemory,
      selectCluster: openCluster,
    })
    provider.value.setMemories(visibleMemories.value)
    const newestWithLocation = [...memories.value].reverse().find(({ entry }) => entry.location)
    if (newestWithLocation?.entry.location) {
      provider.value.setCenter(newestWithLocation.entry.location.latitude, newestWithLocation.entry.location.longitude)
    }
  } catch (error) {
    mapError.value = error instanceof Error ? error.message : '地图暂时无法加载。'
  }
}

async function loadThumbnail(memory: MapMemory) {
  const id = memory.entry.photo?.id
  if (!id || photoLoads.has(memory.entry.id)) return
  const loading = (async () => {
    const photo = await getPhoto(id)
    if (!photo) return
    const url = URL.createObjectURL(photo.thumbnail)
    photoUrls.set(memory.entry.id, url)
    memories.value = memories.value.map((item) => item.entry.id === memory.entry.id ? { ...item, thumbnailUrl: url } : item)
  })()
  photoLoads.set(memory.entry.id, loading)
  try { await loading } catch { /* Missing or evicted thumbnails fall back to a plain marker. */ }
}

function openMemory(memory: MapMemory) {
  selectedCluster.value = []
  selectedMemory.value = memory
}

function openCluster(group: MapMemory[]) {
  selectedMemory.value = undefined
  selectedCluster.value = group
}

function selectSearchResult(memory: MapMemory) {
  openMemory(memory)
  if (timelineMode.value === 'moment') selectedTime.value = memory.entry.createdAt
  else if (memory.entry.createdAt < rangeStart.value || memory.entry.createdAt > rangeEnd.value) {
    rangeStart.value = memory.entry.createdAt
    rangeEnd.value = memory.entry.createdAt
  }
  if (memory.entry.location) provider.value?.setCenter(memory.entry.location.latitude, memory.entry.location.longitude)
  searchOpen.value = false
  searchText.value = ''
}

function chooseClusterItem(memory: MapMemory) {
  selectedCluster.value = []
  openMemory(memory)
  if (memory.entry.location) provider.value?.focusMemory(memory.entry.id)
}

function formatDate(timestamp: number): string {
  return new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(timestamp)
}

function clearSearch() {
  searchText.value = ''
  searchOpen.value = false
}
</script>

<template>
  <main class="map-view">
    <div ref="mapElement" class="map-canvas" aria-label="记忆地图"></div>
    <div class="map-wash" aria-hidden="true"></div>
    <div class="map-map-error" v-if="mapError">
      <span class="map-error-symbol"><IconGlyph name="pin" :size="22" /></span>
      <strong>{{ mapError.includes('VITE_AMAP_KEY') ? '为记忆地图接入一张底图' : '地图暂时没有展开' }}</strong>
      <p>{{ mapError.includes('VITE_AMAP_KEY') ? '地图服务需要一个高德 Web JS API Key。你仍可以在上方搜索自己的记录。' : mapError }}</p>
      <button v-if="!mapError.includes('VITE_AMAP_KEY')" type="button" @click="initializeMap">再试一次</button>
    </div>

    <div class="map-overlay map-search-area">
      <button v-if="!searchOpen" class="map-search-icon glass-card" type="button" aria-label="搜索记忆" @click="searchOpen = true; nextTick(() => searchInput?.focus())"><IconGlyph name="search" :size="20" /></button>
      <div v-else class="map-search-box glass-card">
        <span><IconGlyph name="search" :size="17" /></span>
        <input ref="searchInput" v-model="searchText" type="search" placeholder="搜索地点、文字、日期…" @keydown.esc="clearSearch" />
        <button type="button" aria-label="关闭搜索" @click="clearSearch"><IconGlyph name="close" :size="13" /></button>
      </div>
      <div v-if="searchOpen && searchText.trim()" class="map-search-results glass-card">
        <button v-for="memory in localSearchResults" :key="memory.entry.id" class="search-result-row" type="button" @click="selectSearchResult(memory)">
          <img v-if="memory.thumbnailUrl" :src="memory.thumbnailUrl" alt="" />
          <span v-else class="search-result-placeholder"><IconGlyph name="pin" :size="16" /></span>
          <span class="search-result-copy"><strong>{{ memory.entry.placeLabel || memory.entry.text || '一段记忆' }}</strong><small>{{ formatDate(memory.entry.createdAt) }}<i v-if="!memory.entry.location"> · 无位置</i></small></span>
          <span v-if="memory.entry.location" class="result-location"><IconGlyph name="pin" :size="13" /></span>
        </button>
        <p v-if="!localSearchResults.length" class="no-search-results">还没有找到这段记忆。</p>
        <p v-else-if="locationlessMatches" class="search-footnote">{{ locationlessMatches }} 段记忆没有位置，无法标在地图上。</p>
      </div>
    </div>

    <div class="map-status-pill glass-card"><span class="map-pulse"></span>{{ loading ? '拾起记忆…' : `${visibleMemories.length} 个记忆点` }}</div>

    <Transition name="map-panel">
      <article v-if="selectedMemory" class="map-memory-panel glass-card">
        <button class="map-panel-close" type="button" aria-label="关闭记忆" @click="selectedMemory = undefined"><IconGlyph name="close" :size="14" /></button>
        <img v-if="selectedMemory.thumbnailUrl" class="map-panel-photo" :src="selectedMemory.thumbnailUrl" alt="记忆照片" />
        <div class="map-panel-content">
          <small>{{ formatDate(selectedMemory.entry.createdAt) }}</small>
          <h3>{{ selectedMemory.entry.placeLabel || '一段记忆' }}</h3>
          <p v-if="selectedMemory.entry.text">{{ selectedMemory.entry.text }}</p>
          <span v-if="props.settings.showCoordinates && selectedMemory.entry.location" class="exact-coordinate">{{ selectedMemory.entry.location.latitude.toFixed(5) }}, {{ selectedMemory.entry.location.longitude.toFixed(5) }} · WGS84</span>
        </div>
      </article>
    </Transition>

    <Transition name="map-panel">
      <section v-if="selectedCluster.length" class="map-cluster-panel glass-card">
        <div class="cluster-heading"><div><small>这个地方</small><h3>{{ selectedCluster.length }} 段记忆</h3></div><button class="map-panel-close" type="button" aria-label="关闭列表" @click="selectedCluster = []"><IconGlyph name="close" :size="14" /></button></div>
        <button v-for="memory in [...selectedCluster].sort((a, b) => b.entry.createdAt - a.entry.createdAt)" :key="memory.entry.id" class="cluster-memory-row" type="button" @click="chooseClusterItem(memory)">
          <img v-if="memory.thumbnailUrl" :src="memory.thumbnailUrl" alt="" />
          <span v-else class="cluster-photo-empty"><IconGlyph name="sparkle" :size="15" /></span>
          <span><strong>{{ memory.entry.placeLabel || memory.entry.text || '一段生活' }}</strong><small>{{ formatDate(memory.entry.createdAt) }}</small></span>
          <i><IconGlyph name="chevron-right" :size="14" /></i>
        </button>
      </section>
    </Transition>

    <div class="map-empty-note" v-if="!loading && !allEntries.length && !mapError"><span><IconGlyph name="map" :size="21" /></span><strong>地图还在等第一段记忆</strong><small>带有位置的记忆，会在这里慢慢亮起来。</small></div>
    <div class="map-empty-note map-no-location" v-else-if="!loading && !visibleMemories.length && !mapError"><span><IconGlyph name="pin" :size="19" /></span><strong>这个时间里没有带位置的记忆</strong><small>没有坐标的记忆依然会留在时间墙。</small></div>

    <section class="map-timeline glass-card">
      <div class="timeline-topline"><div><small>沿着时间回望</small><strong>{{ timeLabel }}</strong></div><button type="button" @click="timelineMode = timelineMode === 'moment' ? 'range' : 'moment'">{{ timelineMode === 'moment' ? '选择范围' : '单日回看' }}</button></div>
      <div v-if="timelineMode === 'moment'" class="timeline-slider"><span>{{ minLabel }}</span><input v-model.number="selectedTime" type="range" :min="minTime" :max="usableMaxTime" :step="86400000" /><span>{{ maxLabel }}</span></div>
      <div v-else class="timeline-slider timeline-range-slider"><span>{{ minLabel }}</span><input v-model.number="rangeStart" type="range" :min="minTime" :max="usableMaxTime" :step="86400000" /><input v-model.number="rangeEnd" type="range" :min="minTime" :max="usableMaxTime" :step="86400000" /><span>{{ maxLabel }}</span></div>
      <div class="timeline-legend"><span><i class="legend-dot"></i>{{ visibleMemories.length }} 段记忆</span><span v-if="noLocationCount">{{ noLocationCount }} 段没有位置</span></div>
    </section>
  </main>
</template>
